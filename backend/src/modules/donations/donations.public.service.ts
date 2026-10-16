import { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { env } from '../../config/env';
import { logger } from '../../utils/logger';
import { BadRequestError, ForbiddenError, NotFoundError, ValidationError } from '../../utils/AppError';
import { visibleSite } from '../sites/sites.public.service';
import { resolveOrderReturnUrl } from '../sites/sites.commerce.service';
import { isModuleEnabled } from '../institution/modules.service';
import { getSslCommerzConfig, isDemoPaymentsAllowed, isGatewayLive } from '../fees/gateways/config';
import { decideVerification, generateFeeTranId, verifySslCommerzSignature } from '../fees/gateways/verify';
import { SslCommerzFeeAdapter } from '../fees/gateways/sslcommerz.adapter';
import { BkashFeeAdapter } from '../fees/gateways/bkash.adapter';
import { NagadFeeAdapter } from '../fees/gateways/nagad.adapter';
import type { FeeGatewayAdapter, FeeGatewayName, GatewayVerifyResult } from '../fees/gateways/types';
import { listGatewayModes, type CallbackKind } from '../fees/online/onlinePayment.service';
import { progressPercent } from './donations.logic';
import { nextReceiptNo, sendReceiptEmail, uniqueReference, withReceiptRetry } from './donations.service';
import type { PublicCreateDonationDtoType } from './donations.dto';

// =============================================================================
// Donations (T1) — public website giving. Mounted under the public sites
// router (/api/v1/public/sites/:siteId/donations/...), so it inherits the
// site's visibility rules (published, or a valid preview token).
//
// Payment uses the SAME gateway adapters and verification rules as the shop
// and student fees: the platform's configured bKash/Nagad/SSLCommerz
// accounts, or the demo checkout when a gateway isn't configured (never in
// production unless FEE_DEMO_PAYMENTS_ENABLED=true). A callback is only a
// hint — a donation becomes PAID only after the adapter re-verifies with the
// gateway, via one atomic PENDING → PAID claim (idempotent: replays and
// duplicate IPNs are no-ops).
// =============================================================================

const MODULE = 'islamic.donations' as const;
const NOT_AVAILABLE = 'Online donations are not available on this site';

const GATEWAY_LABEL: Record<FeeGatewayName, string> = { SSLCOMMERZ: 'SSLCommerz', BKASH: 'bKash', NAGAD: 'Nagad' };
const GATEWAY_SLUG: Record<FeeGatewayName, string> = { SSLCOMMERZ: 'sslcommerz', BKASH: 'bkash', NAGAD: 'nagad' };
const GATEWAY_BY_SLUG: Record<string, FeeGatewayName> = { sslcommerz: 'SSLCOMMERZ', bkash: 'BKASH', nagad: 'NAGAD' };
const ADAPTERS: Record<FeeGatewayName, FeeGatewayAdapter> = {
  SSLCOMMERZ: SslCommerzFeeAdapter,
  BKASH: BkashFeeAdapter,
  NAGAD: NagadFeeAdapter,
};

/** Callback base for donations — inside the limiter/CORS-exempt /public/sites/pay/ prefix. */
export function donationCallbackBase(gateway: FeeGatewayName): string {
  return `${env.APP_URL}/api/v1/public/sites/pay/donation/${GATEWAY_SLUG[gateway]}`;
}

/** The site, if it is visible AND its school has the donations module on; otherwise 404. */
async function donationSite(siteId: string, preview?: string | null) {
  const { site } = await visibleSite(siteId, preview ?? null);
  if (!(await isModuleEnabled(site.institutionId, MODULE))) throw new NotFoundError(NOT_AVAILABLE);
  return site;
}

async function raisedBy(institutionId: string, by: 'fundId' | 'campaignId', ids: string[]): Promise<Map<string, number>> {
  if (!ids.length) return new Map();
  const rows =
    by === 'fundId'
      ? await prisma.donation.groupBy({ by: ['fundId'], where: { institutionId, status: 'PAID', fundId: { in: ids } }, _sum: { amount: true } })
      : await prisma.donation.groupBy({ by: ['campaignId'], where: { institutionId, status: 'PAID', campaignId: { in: ids } }, _sum: { amount: true } });
  return new Map(rows.map((r) => [String((r as Record<string, unknown>)[by]), Number(r._sum.amount ?? 0)]));
}

export async function donationOptions(siteId: string, preview?: string | null) {
  const site = await donationSite(siteId, preview);
  const inst = site.institutionId;
  const now = new Date();
  const [funds, campaigns] = await Promise.all([
    prisma.donationFund.findMany({
      where: { institutionId: inst, active: true, showOnWebsite: true },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, nameBn: true, type: true, description: true, goalAmount: true },
    }),
    prisma.donationCampaign.findMany({
      where: { institutionId: inst, isPublic: true, fund: { active: true } },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true, title: true, titleBn: true, description: true, goalAmount: true, startDate: true, endDate: true, coverImageUrl: true,
        fund: { select: { id: true, name: true, nameBn: true, type: true } },
      },
    }),
  ]);
  const [fundRaised, campaignRaised] = await Promise.all([
    raisedBy(inst, 'fundId', funds.map((f) => f.id)),
    raisedBy(inst, 'campaignId', campaigns.map((c) => c.id)),
  ]);
  const gateways = listGatewayModes()
    .filter((m) => m.available)
    .map((m) => ({ gateway: m.gateway, label: m.label, live: m.live, demo: m.demo }));
  return {
    currency: 'BDT',
    funds: funds.map((f) => {
      const goal = f.goalAmount == null ? null : Number(f.goalAmount);
      const raised = fundRaised.get(f.id) ?? 0;
      return { ...f, goalAmount: goal, raised, progress: progressPercent(raised, goal) };
    }),
    campaigns: campaigns.map((c) => {
      const goal = c.goalAmount == null ? null : Number(c.goalAmount);
      const raised = campaignRaised.get(c.id) ?? 0;
      return {
        ...c,
        goalAmount: goal,
        raised,
        progress: progressPercent(raised, goal),
        ended: Boolean(c.endDate && c.endDate < now),
        upcoming: Boolean(c.startDate && c.startDate > now),
      };
    }),
    gateways,
  };
}

type PublicDonationRow = Prisma.DonationGetPayload<{ include: { fund: { select: { name: true; nameBn: true } }; campaign: { select: { title: true; titleBn: true } } } }>;

function toPublicDonation(d: PublicDonationRow) {
  return {
    reference: d.reference,
    status: d.status,
    amount: Number(d.amount),
    currency: d.currency,
    method: d.method,
    isDemo: d.isDemo,
    receiptNo: d.status === 'PAID' ? d.receiptNo : null,
    paidAt: d.paidAt,
    donorName: d.anonymous ? null : d.donorName,
    fund: d.fund,
    campaign: d.campaign,
    createdAt: d.createdAt,
  };
}

const PUBLIC_INCLUDE = { fund: { select: { name: true, nameBn: true } }, campaign: { select: { title: true, titleBn: true } } } as const;

/** Find-or-create the donor profile by phone, then email, within the school. */
async function upsertOnlineDonor(institutionId: string, body: PublicCreateDonationDtoType): Promise<string | null> {
  if (!body.name || (!body.phone && !body.email)) return null;
  const match = await prisma.donor.findFirst({
    where: {
      institutionId,
      OR: [...(body.phone ? [{ phone: body.phone }] : []), ...(body.email ? [{ email: body.email }] : [])],
    },
    select: { id: true },
  });
  if (match) return match.id;
  const created = await prisma.donor.create({
    data: { institutionId, name: body.name, phone: body.phone ?? null, email: body.email ?? null, anonymous: body.anonymous },
    select: { id: true },
  });
  return created.id;
}

export async function createPublicDonation(siteId: string, body: PublicCreateDonationDtoType) {
  const site = await donationSite(siteId);
  const inst = site.institutionId;

  const campaign = body.campaignId
    ? await prisma.donationCampaign.findFirst({ where: { id: body.campaignId, institutionId: inst, isPublic: true }, include: { fund: true } })
    : null;
  if (body.campaignId && !campaign) throw new NotFoundError('Campaign not found');
  if (campaign && body.fundId && body.fundId !== campaign.fundId) throw new ValidationError('That campaign belongs to a different fund');
  if (campaign?.endDate && campaign.endDate < new Date()) throw new BadRequestError('This campaign has ended');

  const fund = campaign
    ? campaign.fund
    : await prisma.donationFund.findFirst({ where: { id: body.fundId!, institutionId: inst, showOnWebsite: true } });
  if (!fund) throw new NotFoundError('Fund not found');
  if (!fund.active) throw new BadRequestError('This fund is not accepting donations right now');

  const gateway = body.paymentMethod as FeeGatewayName;
  const mode = listGatewayModes().find((m) => m.gateway === gateway);
  if (!mode || !mode.available) throw new BadRequestError(`${GATEWAY_LABEL[gateway]} is not available yet`);
  const live = mode.live;

  const donorId = await upsertOnlineDonor(inst, body);
  const reference = await uniqueReference();
  const tranId = generateFeeTranId();
  const returnUrl = await resolveOrderReturnUrl(site, body.returnUrl);

  const donation = await prisma.donation.create({
    data: {
      institutionId: inst,
      fundId: fund.id,
      campaignId: campaign?.id ?? null,
      donorId,
      reference,
      donorName: body.name ?? null,
      donorPhone: body.phone ?? null,
      donorEmail: body.email ?? null,
      anonymous: body.anonymous,
      amount: new Prisma.Decimal(body.amount.toFixed(2)),
      method: gateway,
      status: 'PENDING',
      note: body.note,
      source: 'ONLINE',
      siteId: site.id,
      gatewayTranId: tranId,
      isDemo: !live,
      returnUrl,
    },
    include: PUBLIC_INCLUDE,
  });

  if (!live) return { donation: toPublicDonation(donation), demo: true };

  const result = await ADAPTERS[gateway].initiate({
    tranId,
    amount: body.amount,
    currency: 'BDT',
    invoiceNo: reference,
    customerName: body.name || 'Donor',
    customerEmail: body.email ?? null,
    customerPhone: body.phone ?? null,
    callbackBase: donationCallbackBase(gateway),
  });
  if (!result.ok || !result.paymentUrl) {
    await prisma.donation.update({ where: { id: donation.id }, data: { status: 'FAILED', note: result.message ?? 'Gateway rejected the payment request' } });
    throw new BadRequestError(result.message || `Failed to start ${GATEWAY_LABEL[gateway]} checkout`);
  }
  await prisma.donation.update({ where: { id: donation.id }, data: { gatewayPaymentId: result.gatewayPaymentId ?? null } });
  return { donation: toPublicDonation(donation), paymentUrl: result.paymentUrl };
}

export async function getPublicDonation(siteId: string, reference: string) {
  const site = await donationSite(siteId);
  const d = await prisma.donation.findFirst({ where: { institutionId: site.institutionId, reference, source: 'ONLINE' }, include: PUBLIC_INCLUDE });
  if (!d) throw new NotFoundError('Donation not found');
  return { donation: toPublicDonation(d) };
}

export async function demoPayDonation(siteId: string, reference: string, outcome: 'success' | 'fail') {
  const site = await donationSite(siteId);
  const d = await prisma.donation.findFirst({ where: { institutionId: site.institutionId, reference, source: 'ONLINE' } });
  if (!d) throw new NotFoundError('Donation not found');
  if (!d.isDemo) throw new ForbiddenError('This donation is not a demo payment');
  if (!isDemoPaymentsAllowed()) throw new ForbiddenError('Demo payments are disabled');
  if (d.status === 'PENDING') {
    if (outcome === 'fail') await markDonationFailed(d.id);
    else await creditDonation(d.id, { gatewayRef: `DEMO-${d.gatewayTranId ?? d.id}`, gatewayPaymentId: null });
  }
  return getPublicDonation(siteId, reference);
}

// ── Idempotent crediting: the only place an online donation becomes PAID ──────

function isUniqueOnGatewayRef(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') return false;
  const target = (error.meta as { target?: unknown } | undefined)?.target;
  return (Array.isArray(target) ? target.join(',') : String(target ?? '')).includes('gatewayRef');
}

export async function creditDonation(donationId: string, verified: { gatewayRef: string; gatewayPaymentId?: string | null }): Promise<{ credited: boolean }> {
  const d = await prisma.donation.findUnique({ where: { id: donationId } });
  if (!d || d.status !== 'PENDING') return { credited: false };

  const reusedBy = await prisma.donation.findFirst({ where: { gatewayRef: verified.gatewayRef, id: { not: d.id } }, select: { id: true } });
  if (reusedBy) {
    logger.error('Donation gateway reference already used by another donation — rejecting replay', { donationId: d.id, gatewayRef: verified.gatewayRef });
    return { credited: false };
  }

  const paidAt = new Date();
  try {
    const claimed = await withReceiptRetry(() =>
      prisma.$transaction(async (tx) => {
        const receiptNo = await nextReceiptNo(tx, d.institutionId, paidAt);
        const claim = await tx.donation.updateMany({
          where: { id: d.id, status: 'PENDING' },
          data: {
            status: 'PAID',
            paidAt,
            receiptNo,
            gatewayRef: verified.gatewayRef,
            ...(verified.gatewayPaymentId ? { gatewayPaymentId: verified.gatewayPaymentId } : {}),
          },
        });
        return claim.count === 1;
      }),
    );
    if (!claimed) return { credited: false };
  } catch (error) {
    if (isUniqueOnGatewayRef(error)) {
      logger.error('Donation gateway reference replay blocked by unique constraint', { donationId: d.id, gatewayRef: verified.gatewayRef });
      return { credited: false };
    }
    throw error;
  }

  logger.info('Donation credited', { donationId: d.id, reference: d.reference });
  sendReceiptEmail(d.id).catch(() => undefined);
  return { credited: true };
}

async function markDonationFailed(donationId: string) {
  // Never downgrade a PAID/REFUNDED donation.
  await prisma.donation.updateMany({ where: { id: donationId, status: 'PENDING' }, data: { status: 'FAILED' } });
}

/** Same rules as fees/orders: amount, currency and our tranId must match what the gateway reports. */
export async function applyDonationVerification(
  d: { id: string; status: string; gatewayTranId: string | null; amount: Prisma.Decimal; currency: string },
  verification: GatewayVerifyResult,
) {
  if (d.status !== 'PENDING') return; // already settled — duplicate callback / IPN
  if (!d.gatewayTranId) return;
  const decision = decideVerification({ tranId: d.gatewayTranId, amount: Number(d.amount), currency: d.currency }, verification);
  if (decision.action === 'credit') {
    await creditDonation(d.id, { gatewayRef: verification.gatewayRef!, gatewayPaymentId: verification.gatewayPaymentId ?? null });
  } else if (decision.action === 'fail') {
    logger.error('Donation gateway verification failed — marking failed', { donationId: d.id, reason: decision.reason });
    await markDonationFailed(d.id);
  } else {
    logger.warn('Donation gateway callback ignored', { donationId: d.id, reason: decision.reason });
  }
}

// ── Gateway callbacks ────────────────────────────────────────────────────────

const str = (v: unknown) => (typeof v === 'string' && v.length > 0 ? v : undefined);

function fallbackRedirect(): string {
  return `${env.FRONTEND_URL}/?donation=failed`;
}

function redirectStatus(status: string | undefined): string {
  if (status === 'PAID') return 'success';
  if (status === 'FAILED') return 'failed';
  if (status === 'REFUNDED') return 'refunded';
  return 'pending';
}

/** `${returnUrl}/donation/<reference>?payment=<status>` — the site's donation status page. */
export function buildDonationRedirectUrl(returnUrl: string, reference: string, payment: string): string {
  const base = returnUrl.replace(/\/+$/, '');
  return `${base}/donation/${encodeURIComponent(reference)}?${new URLSearchParams({ payment }).toString()}`;
}

function redirectFor(d: { returnUrl: string | null; reference: string; status: string } | null | undefined): string {
  if (!d) return fallbackRedirect();
  return buildDonationRedirectUrl(d.returnUrl ?? env.FRONTEND_URL, d.reference, redirectStatus(d.status));
}

async function handleSslCommerz(kind: CallbackKind, payload: Record<string, unknown>): Promise<string> {
  const tranId = str(payload.tran_id);
  const valId = str(payload.val_id);
  if (!tranId) return fallbackRedirect();
  const d = await prisma.donation.findFirst({ where: { gatewayTranId: tranId, isDemo: false } });
  if (!d) return fallbackRedirect();
  const cfg = getSslCommerzConfig();
  const signatureOk = cfg ? verifySslCommerzSignature(payload, cfg.storePassword) : null;
  if (signatureOk === false) {
    logger.error('SSLCommerz donation callback signature mismatch — ignored', { kind, tranId, donationId: d.id });
    return redirectFor(d);
  }
  if (d.status === 'PENDING') {
    if (valId && (kind === 'ipn' || kind === 'success')) {
      await applyDonationVerification(d, await SslCommerzFeeAdapter.validateByValId(valId));
    } else if (kind === 'fail' || kind === 'cancel' || (kind === 'ipn' && (str(payload.status) === 'FAILED' || str(payload.status) === 'CANCELLED'))) {
      await markDonationFailed(d.id);
    }
  }
  return redirectFor(await prisma.donation.findUnique({ where: { id: d.id } }));
}

async function handleBkash(payload: Record<string, unknown>): Promise<string> {
  const paymentId = str(payload.paymentID);
  if (!paymentId) return fallbackRedirect();
  const d = await prisma.donation.findFirst({ where: { gatewayPaymentId: paymentId, isDemo: false } });
  if (!d) return fallbackRedirect();
  if (d.status === 'PENDING') {
    if (str(payload.status)?.toLowerCase() === 'success') {
      await applyDonationVerification(d, await BkashFeeAdapter.executeOrQuery(paymentId));
    } else {
      await markDonationFailed(d.id);
    }
  }
  return redirectFor(await prisma.donation.findUnique({ where: { id: d.id } }));
}

async function handleNagad(kind: CallbackKind, payload: Record<string, unknown>): Promise<string> {
  const orderId = str(payload.order_id);
  const paymentRefId = str(payload.payment_ref_id);
  if (!orderId || !paymentRefId) return fallbackRedirect();
  const d = await prisma.donation.findFirst({ where: { gatewayTranId: orderId, isDemo: false } });
  if (!d) return fallbackRedirect();
  if (d.gatewayPaymentId && d.gatewayPaymentId !== paymentRefId) {
    logger.error('Nagad donation callback payment_ref_id does not match — ignored', { donationId: d.id, paymentRefId });
    return redirectFor(d);
  }
  if (d.status === 'PENDING') {
    const verification = await NagadFeeAdapter.verifyByReference(paymentRefId);
    const cbStatus = str(payload.status)?.toLowerCase();
    if (verification.reachable && !verification.success && (cbStatus === 'aborted' || cbStatus === 'cancelled' || kind === 'cancel')) {
      await markDonationFailed(d.id);
    } else {
      await applyDonationVerification(d, verification);
    }
  }
  return redirectFor(await prisma.donation.findUnique({ where: { id: d.id } }));
}

export async function handleDonationGatewayCallback(gatewaySlug: string, kind: CallbackKind, payload: Record<string, unknown>): Promise<string> {
  const gateway = GATEWAY_BY_SLUG[gatewaySlug.toLowerCase()];
  if (!gateway) return fallbackRedirect();
  if (!isGatewayLive(gateway)) {
    logger.warn('Donations: gateway callback received while the gateway is in demo mode — ignored', { gateway, kind });
    return fallbackRedirect();
  }
  if (gateway === 'SSLCOMMERZ') return handleSslCommerz(kind, payload);
  if (gateway === 'BKASH') return handleBkash(payload);
  return handleNagad(kind, payload);
}
