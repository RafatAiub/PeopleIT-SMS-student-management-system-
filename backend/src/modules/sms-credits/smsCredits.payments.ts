import { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { env } from '../../config/env';
import { logger } from '../../utils/logger';
import { BadRequestError, ForbiddenError, NotFoundError } from '../../utils/AppError';
import { SslCommerzClient } from '../billing/gateways/sslcommerz.client';
import { createBkashClient } from '../fees/gateways/bkash.adapter';
import { getPlatformBkashConfig, isDemoPaymentsAllowed } from '../fees/gateways/config';
import { decideVerification, verifySslCommerzSignature } from '../fees/gateways/verify';
import type { GatewayVerifyResult } from '../fees/gateways/types';
import { dhakaMonthKey, generateSmsTranId, nextSequence, receiptNumberFor } from './smsCredits.logic';
import { changeBalance, ensureWallet } from './smsWallet.service';
import { isUniqueViolation, writeAudit, type Tx } from './smsCredits.shared';

// =============================================================================
// P5 SMS credit packs — schools pay PeopleNIT's own merchant (the same
// SSLCommerz client and PLATFORM_BKASH_* bKash merchant platform billing uses;
// both imported read-only). Demo checkout when a gateway has no keys and demo
// payments are allowed (never in production unless FEE_DEMO_PAYMENTS_ENABLED).
//
// Crediting is idempotent: an atomic status claim (only one caller moves a
// purchase to SUCCESS), gatewayValId unique (a val_id/trxID can't be replayed
// onto another purchase), receipt number allocated in the same transaction,
// and the wallet credited in that same transaction.
// =============================================================================

export type CreditGateway = 'BKASH' | 'SSLCOMMERZ';
const LABEL: Record<CreditGateway, string> = { BKASH: 'bKash', SSLCOMMERZ: 'SSLCommerz' };
const SLUG: Record<CreditGateway, string> = { BKASH: 'bkash', SSLCOMMERZ: 'sslcommerz' };

const platformBkash = createBkashClient(getPlatformBkashConfig, 'bKash SMS credits');

export function isCreditGatewayLive(gateway: CreditGateway): boolean {
  if (gateway === 'SSLCOMMERZ') return env.SSLCOMMERZ_ENABLED && !!env.SSLCOMMERZ_STORE_ID && !!env.SSLCOMMERZ_STORE_PASSWORD;
  return getPlatformBkashConfig() !== null;
}

export function listCreditGateways() {
  const demo = isDemoPaymentsAllowed();
  return (['BKASH', 'SSLCOMMERZ'] as CreditGateway[]).map((gateway) => {
    const live = isCreditGatewayLive(gateway);
    return { gateway, label: LABEL[gateway], live, demo: !live && demo, available: live || demo };
  });
}

function resultRedirect(status: string, purchaseId?: string) {
  const qs = new URLSearchParams({ purchase: status, ...(purchaseId ? { pid: purchaseId } : {}) });
  return `${env.FRONTEND_URL}/sms?${qs.toString()}`;
}

// ── Checkout ────────────────────────────────────────────────────────────────

export async function startCheckout(tenantId: string, user: { sub: string; email: string }, dto: { packId: string; gateway: CreditGateway }) {
  const pack = await prisma.smsCreditPack.findFirst({ where: { id: dto.packId, isActive: true } });
  if (!pack) throw new NotFoundError('This SMS pack is not available');
  const live = isCreditGatewayLive(dto.gateway);
  if (!live && !isDemoPaymentsAllowed()) {
    throw new BadRequestError(`${LABEL[dto.gateway]} payment is not available yet — please contact PeopleNIT`);
  }

  const tranId = generateSmsTranId();
  const amount = Number(pack.priceBdt);
  const purchase = await prisma.smsCreditPurchase.create({
    data: {
      institutionId: tenantId,
      packId: pack.id,
      units: pack.units,
      amount: pack.priceBdt,
      method: dto.gateway,
      status: 'INITIATED',
      gatewayTransactionId: tranId,
      isDemo: !live,
      initiatedByUserId: user.sub,
    },
  });
  const base = { purchaseId: purchase.id, amount, units: pack.units, gateway: dto.gateway };

  if (!live) {
    const checkoutPath = `/sms/demo-checkout?purchase=${encodeURIComponent(purchase.id)}`;
    return {
      ...base,
      demo: true,
      message: `${LABEL[dto.gateway]} is not configured — opening the demo checkout. No real money will be charged.`,
      checkoutPath,
      paymentUrl: `${env.FRONTEND_URL}${checkoutPath}`,
    };
  }

  const institution = await prisma.institution.findUnique({ where: { id: tenantId }, select: { name: true, phone: true, contactPhone: true } });
  const callbackBase = `${env.APP_URL}/api/v1/sms-credits/gateway/${SLUG[dto.gateway]}`;
  let paymentUrl: string | undefined;
  let gatewayPaymentId: string | undefined;
  let message = '';
  if (dto.gateway === 'SSLCOMMERZ') {
    const r = await SslCommerzClient.initiateSession({
      tranId,
      amount,
      currency: 'BDT',
      successUrl: `${callbackBase}/success`,
      failUrl: `${callbackBase}/fail`,
      cancelUrl: `${callbackBase}/cancel`,
      ipnUrl: `${callbackBase}/ipn`,
      customerName: institution?.name ?? 'School',
      customerEmail: user.email,
      customerPhone: institution?.contactPhone ?? institution?.phone ?? undefined,
      productName: `PeopleNIT SMS pack (${pack.units} SMS)`,
    });
    if (r.success && r.paymentUrl) paymentUrl = r.paymentUrl;
    message = r.message;
  } else {
    const r = await platformBkash.initiate({
      tranId,
      amount,
      currency: 'BDT',
      invoiceNo: tranId,
      customerName: institution?.name ?? 'School',
      callbackBase,
    });
    if (r.ok && r.paymentUrl) {
      paymentUrl = r.paymentUrl;
      gatewayPaymentId = r.gatewayPaymentId;
    }
    message = r.message;
  }

  if (!paymentUrl) {
    await prisma.smsCreditPurchase.update({ where: { id: purchase.id }, data: { status: 'FAILED', rawResponse: { message } } });
    throw new BadRequestError(message || `Could not start ${LABEL[dto.gateway]} checkout`);
  }
  await prisma.smsCreditPurchase.update({ where: { id: purchase.id }, data: { status: 'PENDING', gatewayPaymentId: gatewayPaymentId ?? null } });
  return { ...base, demo: false, message, paymentUrl };
}

function purchaseView(p: Prisma.SmsCreditPurchaseGetPayload<{ include: { pack: { select: { name: true; nameBn: true } }; institution: { select: { name: true } } } }>) {
  return {
    id: p.id,
    institutionId: p.institutionId,
    institutionName: p.institution.name,
    packName: p.pack?.name ?? null,
    packNameBn: p.pack?.nameBn ?? null,
    units: p.units,
    amount: Number(p.amount),
    currency: p.currency,
    method: p.method,
    status: p.status,
    receiptNumber: p.receiptNumber,
    reference: p.reference,
    note: p.note,
    isDemo: p.isDemo,
    paidAt: p.paidAt,
    createdAt: p.createdAt,
    demoAllowed: p.isDemo && p.method !== 'MANUAL' && !isCreditGatewayLive(p.method as CreditGateway) && isDemoPaymentsAllowed(),
  };
}

const PURCHASE_INCLUDE = { pack: { select: { name: true, nameBn: true } }, institution: { select: { name: true } } } as const;

/** One purchase (receipt / result page). institutionId null = super-admin. */
export async function getPurchase(institutionId: string | null, id: string) {
  const p = await prisma.smsCreditPurchase.findFirst({ where: { id, ...(institutionId ? { institutionId } : {}) }, include: PURCHASE_INCLUDE });
  if (!p) throw new NotFoundError('Purchase not found');
  return purchaseView(p);
}

export async function listPurchases(institutionId: string | null, take = 100) {
  const rows = await prisma.smsCreditPurchase.findMany({
    where: institutionId ? { institutionId } : { status: { in: ['SUCCESS', 'PENDING', 'FAILED'] } },
    orderBy: { createdAt: 'desc' },
    take,
    include: PURCHASE_INCLUDE,
  });
  return rows.map(purchaseView);
}

export async function confirmDemoPurchase(tenantId: string, purchaseId: string, outcome: 'success' | 'failure', userId: string) {
  const p = await prisma.smsCreditPurchase.findFirst({ where: { id: purchaseId, institutionId: tenantId } });
  if (!p) throw new NotFoundError('Purchase not found');
  if (!p.isDemo || p.method === 'MANUAL' || isCreditGatewayLive(p.method as CreditGateway) || !isDemoPaymentsAllowed()) {
    throw new ForbiddenError('Demo confirmation is disabled — this gateway takes real payments');
  }
  if (p.status === 'SUCCESS') return { status: 'SUCCESS', receiptNumber: p.receiptNumber, alreadyProcessed: true };
  if (p.status === 'FAILED' || p.status === 'CANCELLED') throw new BadRequestError('This demo payment is closed — start a new one');
  if (outcome === 'failure') {
    await markPurchase(p.id, 'FAILED', { demo: true, simulated: 'failure' });
    return { status: 'FAILED', receiptNumber: null };
  }
  const r = await creditPurchase(p.id, { gatewayRef: `DEMO-${p.gatewayTransactionId}`, raw: { demo: true, simulated: 'success', confirmedBy: userId, at: new Date().toISOString() } });
  return { status: r.credited || r.alreadyCredited ? 'SUCCESS' : p.status, receiptNumber: r.receiptNumber ?? null };
}

// ── Crediting ───────────────────────────────────────────────────────────────

async function markPurchase(id: string, status: 'FAILED' | 'CANCELLED', raw: unknown) {
  await prisma.smsCreditPurchase.updateMany({
    where: { id, status: { in: ['INITIATED', 'PENDING'] } },
    data: { status, rawResponse: (raw ?? null) as Prisma.InputJsonValue },
  });
}

async function nextReceiptNumber(tx: Tx, now: Date): Promise<string> {
  const month = dhakaMonthKey(now);
  const prefix = receiptNumberFor(month, 0).replace(/0000$/, '');
  const last = await tx.smsCreditPurchase.findFirst({
    where: { receiptNumber: { startsWith: prefix } },
    orderBy: { receiptNumber: 'desc' },
    select: { receiptNumber: true },
  });
  return receiptNumberFor(month, nextSequence(last?.receiptNumber));
}

async function withReceiptRetry<T>(fn: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      if (attempt < 5 && isUniqueViolation(error, 'receiptNumber')) continue;
      throw error;
    }
  }
}

export interface CreditResult {
  credited: boolean;
  alreadyCredited?: boolean;
  receiptNumber?: string | null;
  balance?: number;
}

/**
 * Credits a verified purchase to the school's wallet. Safe to call any
 * number of times and concurrently (IPN + redirect + duplicate callbacks):
 * exactly one caller wins the status claim; the rest are no-ops.
 */
export async function creditPurchase(
  purchaseId: string,
  verified: { gatewayRef: string; gatewayPaymentId?: string | null; raw: unknown },
  now: Date = new Date(),
): Promise<CreditResult> {
  const purchase = await prisma.smsCreditPurchase.findUnique({ where: { id: purchaseId } });
  if (!purchase) return { credited: false };
  if (purchase.status === 'SUCCESS') return { credited: false, alreadyCredited: true, receiptNumber: purchase.receiptNumber };

  const reusedBy = await prisma.smsCreditPurchase.findFirst({ where: { gatewayValId: verified.gatewayRef, id: { not: purchase.id } }, select: { id: true } });
  if (reusedBy) {
    logger.error('SMS credits: gateway reference already used by another purchase — replay rejected', { purchaseId, reusedBy: reusedBy.id });
    return { credited: false };
  }
  await ensureWallet(purchase.institutionId);

  try {
    return await withReceiptRetry(() =>
      prisma.$transaction(async (tx) => {
        const receiptNumber = await nextReceiptNumber(tx, now);
        const claim = await tx.smsCreditPurchase.updateMany({
          where: { id: purchase.id, status: { not: 'SUCCESS' } },
          data: {
            status: 'SUCCESS',
            gatewayValId: verified.gatewayRef,
            ...(verified.gatewayPaymentId ? { gatewayPaymentId: verified.gatewayPaymentId } : {}),
            rawResponse: (verified.raw ?? null) as Prisma.InputJsonValue,
            paidAt: now,
            receiptNumber,
            note: purchase.isDemo ? `DEMO — simulated ${purchase.method} payment, no money moved` : `Online payment via ${purchase.method}`,
          },
        });
        if (claim.count !== 1) return { credited: false, alreadyCredited: true } as CreditResult;
        const balance = await changeBalance(tx, {
          institutionId: purchase.institutionId,
          type: 'PURCHASE',
          units: purchase.units,
          reason: `${purchase.isDemo ? 'DEMO ' : ''}SMS pack ${purchase.units} via ${purchase.method}, receipt ${receiptNumber}`,
          purchaseId: purchase.id,
          actorUserId: purchase.initiatedByUserId,
        });
        await writeAudit(tx, {
          institutionId: purchase.institutionId,
          userId: purchase.initiatedByUserId,
          action: 'SMS_CREDITS_PURCHASE',
          resource: 'SmsCreditPurchase',
          resourceId: purchase.id,
          metadata: { units: purchase.units, amount: purchase.amount.toString(), method: purchase.method, receiptNumber, isDemo: purchase.isDemo },
        });
        logger.info('SMS credit purchase credited', { purchaseId, institutionId: purchase.institutionId, units: purchase.units, receiptNumber });
        return { credited: true, receiptNumber, balance } as CreditResult;
      }),
    );
  } catch (error) {
    if (isUniqueViolation(error, 'gatewayValId')) {
      logger.error('SMS credits: gateway reference replay blocked by unique constraint', { purchaseId });
      return { credited: false };
    }
    throw error;
  }
}

/** Super-admin: credits paid offline (cash / bank / personal bKash), with a receipt. */
export async function recordManualCredit(
  actorUserId: string,
  institutionId: string,
  dto: { units: number; amount: number; packId?: string | null; reference?: string | null; reason: string },
  now: Date = new Date(),
) {
  const inst = await prisma.institution.findUnique({ where: { id: institutionId }, select: { id: true } });
  if (!inst) throw new NotFoundError('School not found');
  await ensureWallet(institutionId);
  return withReceiptRetry(() =>
    prisma.$transaction(async (tx) => {
      const receiptNumber = await nextReceiptNumber(tx, now);
      const purchase = await tx.smsCreditPurchase.create({
        data: {
          institutionId,
          packId: dto.packId ?? null,
          units: dto.units,
          amount: new Prisma.Decimal(dto.amount.toFixed(2)),
          method: 'MANUAL',
          status: 'SUCCESS',
          receiptNumber,
          reference: dto.reference ?? null,
          note: dto.reason,
          paidAt: now,
          recordedByUserId: actorUserId,
        },
      });
      const balance = await changeBalance(tx, {
        institutionId,
        type: 'PURCHASE',
        units: dto.units,
        reason: `Manual: ${dto.reason}${dto.reference ? ` (ref ${dto.reference})` : ''}, receipt ${receiptNumber}`,
        purchaseId: purchase.id,
        actorUserId,
      });
      await writeAudit(tx, {
        institutionId,
        userId: actorUserId,
        action: 'SMS_CREDITS_MANUAL',
        resource: 'SmsCreditPurchase',
        resourceId: purchase.id,
        metadata: { units: dto.units, amount: dto.amount, reference: dto.reference ?? null, reason: dto.reason, receiptNumber },
      });
      return { id: purchase.id, receiptNumber, balance };
    }),
  );
}

// ── Public gateway callbacks ────────────────────────────────────────────────

export type CallbackKind = 'ipn' | 'success' | 'fail' | 'cancel' | 'callback';
const str = (v: unknown) => (typeof v === 'string' && v.length > 0 ? v : undefined);

function statusSlug(s: string | undefined) {
  if (s === 'SUCCESS') return 'success';
  if (s === 'CANCELLED') return 'cancelled';
  if (s === 'FAILED') return 'failed';
  return 'pending';
}

async function applyVerification(p: { id: string; gatewayTransactionId: string | null; amount: Prisma.Decimal; currency: string }, v: GatewayVerifyResult) {
  const decision = decideVerification({ tranId: p.gatewayTransactionId ?? '', amount: Number(p.amount), currency: p.currency }, v);
  if (decision.action === 'credit') {
    await creditPurchase(p.id, { gatewayRef: v.gatewayRef!, gatewayPaymentId: v.gatewayPaymentId ?? null, raw: v.raw });
  } else if (decision.action === 'fail') {
    logger.error('SMS credits verification failed — purchase marked FAILED', { purchaseId: p.id, reason: decision.reason });
    await markPurchase(p.id, 'FAILED', { reason: decision.reason, gateway: v.raw ?? null });
  } else {
    logger.warn('SMS credits callback ignored', { purchaseId: p.id, reason: decision.reason });
  }
}

/** Never throws for bad input — returns the browser redirect. The payload is only a pointer; crediting re-verifies with the gateway. */
export async function handleCreditGatewayCallback(gateway: CreditGateway, kind: CallbackKind, payload: Record<string, unknown>): Promise<string> {
  if (!isCreditGatewayLive(gateway)) {
    logger.warn('SMS credits callback while the gateway is not live — ignored', { gateway, kind });
    return resultRedirect('failed');
  }
  return gateway === 'SSLCOMMERZ' ? handleSslCommerz(kind, payload) : handleBkash(kind, payload);
}

async function handleSslCommerz(kind: CallbackKind, payload: Record<string, unknown>) {
  const tranId = str(payload.tran_id);
  const valId = str(payload.val_id);
  if (!tranId) return resultRedirect('failed');
  const p = await prisma.smsCreditPurchase.findFirst({ where: { gatewayTransactionId: tranId, method: 'SSLCOMMERZ', isDemo: false } });
  if (!p) {
    logger.warn('SMS credits SSLCommerz callback for unknown tran_id', { kind, tranId });
    return resultRedirect('failed');
  }
  if (verifySslCommerzSignature(payload, env.SSLCOMMERZ_STORE_PASSWORD ?? '') === false) {
    logger.error('SMS credits SSLCommerz signature mismatch — ignored', { kind, tranId });
    return resultRedirect(statusSlug(p.status), p.id);
  }
  if (p.status !== 'SUCCESS') {
    if (valId && (kind === 'ipn' || kind === 'success')) {
      const v = await SslCommerzClient.validateTransaction(valId);
      const raw = v.raw as Record<string, unknown> | null;
      await applyVerification(p, {
        reachable: v.raw !== null,
        success: v.valid,
        amount: v.amount,
        currency: v.currency,
        tranId: v.tranId,
        gatewayRef: (raw && typeof raw.val_id === 'string' ? raw.val_id : undefined) ?? (v.valid ? valId : undefined),
        raw: v.raw,
      });
    } else if (kind === 'fail' || (kind === 'ipn' && str(payload.status) === 'FAILED')) {
      await markPurchase(p.id, 'FAILED', { callback: kind, status: payload.status ?? null });
    } else if (kind === 'cancel' || (kind === 'ipn' && str(payload.status) === 'CANCELLED')) {
      await markPurchase(p.id, 'CANCELLED', { callback: kind, status: payload.status ?? null });
    }
  }
  const fresh = await prisma.smsCreditPurchase.findUnique({ where: { id: p.id }, select: { status: true } });
  return resultRedirect(statusSlug(fresh?.status), p.id);
}

async function handleBkash(kind: CallbackKind, payload: Record<string, unknown>) {
  const paymentID = str(payload.paymentID);
  const status = str(payload.status)?.toLowerCase();
  if (!paymentID) return resultRedirect('failed');
  const p = await prisma.smsCreditPurchase.findFirst({ where: { gatewayPaymentId: paymentID, method: 'BKASH', isDemo: false } });
  if (!p) {
    logger.warn('SMS credits bKash callback for unknown paymentID', { kind, paymentID });
    return resultRedirect('failed');
  }
  if (p.status !== 'SUCCESS') {
    if (status === 'success') await applyVerification(p, await platformBkash.executeOrQuery(paymentID));
    else if (status === 'cancel' || kind === 'cancel') await markPurchase(p.id, 'CANCELLED', { callback: kind, status });
    else await markPurchase(p.id, 'FAILED', { callback: kind, status: status ?? null });
  }
  const fresh = await prisma.smsCreditPurchase.findUnique({ where: { id: p.id }, select: { status: true } });
  return resultRedirect(statusSlug(fresh?.status), p.id);
}

export function gatewayFromSlug(slug: string): CreditGateway | null {
  const s = slug.toLowerCase();
  if (s === 'bkash') return 'BKASH';
  if (s === 'sslcommerz') return 'SSLCOMMERZ';
  return null;
}
