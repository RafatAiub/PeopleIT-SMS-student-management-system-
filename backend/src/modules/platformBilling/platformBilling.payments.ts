import { Prisma, type PlatformPaymentMethod } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { env } from '../../config/env';
import { logger } from '../../utils/logger';
import { BadRequestError, ForbiddenError, NotFoundError } from '../../utils/AppError';
import { SslCommerzClient } from '../billing/gateways/sslcommerz.client';
import { createBkashClient } from '../fees/gateways/bkash.adapter';
import { getPlatformBkashConfig, isDemoPaymentsAllowed } from '../fees/gateways/config';
import { decideVerification, verifySslCommerzSignature } from '../fees/gateways/verify';
import type { GatewayVerifyResult } from '../fees/gateways/types';
import {
  dhakaMidnight,
  duePaisa,
  generatePlatformTranId,
  nextSequence,
  paisaToDecimalString,
  paisaToNumber,
  periodOf,
  receiptNumberFor,
  statusAfterPayment,
  toPaisa,
  UNPAID_STATUSES,
  verifyPayToken,
} from './platformBilling.logic';
import { afterSettlement } from './platformBilling.service';
import { actorName, isUniqueViolation, payLinkSecret, writeAudit, type Tx } from './platformBilling.shared';
import { sendPaymentReceipt } from './platformBilling.reminders';
import type { CheckoutDtoType, ManualPaymentDtoType } from './platformBilling.dto';

// =============================================================================
// P1 platform billing payments — schools pay PeopleNIT's own merchant.
//
//  - Online (school ADMIN): SSLCommerz (existing billing client) or bKash
//    tokenized checkout (shared adapter, PLATFORM_BKASH_* credentials). No
//    partial online payments: one invoice's full due, or every unpaid invoice
//    in one checkout ("pay all").
//  - Demo checkout when the gateway has no keys and demo payments are allowed
//    (never in production unless FEE_DEMO_PAYMENTS_ENABLED=true).
//  - Manual (SUPER_ADMIN): cash, bank transfer, personal bKash/Nagad, other —
//    partial allowed, never more than the due.
//
// Crediting (the only place money lands on an invoice) is idempotent: an
// atomic status claim, invoices locked FOR UPDATE, the applied amount capped
// at what is due (any excess flagged on the payment, as P0 does for fees),
// gatewayValId unique (replay of a val_id/trxID is rejected), and a unique
// receipt number allocated inside the same transaction.
// =============================================================================

export type OnlineGateway = 'BKASH' | 'SSLCOMMERZ';

const LABEL: Record<OnlineGateway, string> = { BKASH: 'bKash', SSLCOMMERZ: 'SSLCommerz' };
const SLUG: Record<OnlineGateway, string> = { BKASH: 'bkash', SSLCOMMERZ: 'sslcommerz' };

const platformBkash = createBkashClient(getPlatformBkashConfig, 'bKash platform billing');

export function isPlatformGatewayLive(gateway: OnlineGateway): boolean {
  if (gateway === 'SSLCOMMERZ') return env.SSLCOMMERZ_ENABLED && !!env.SSLCOMMERZ_STORE_ID && !!env.SSLCOMMERZ_STORE_PASSWORD;
  return getPlatformBkashConfig() !== null;
}

export function listPlatformGateways() {
  const demo = isDemoPaymentsAllowed();
  return (['BKASH', 'SSLCOMMERZ'] as OnlineGateway[]).map((gateway) => {
    const live = isPlatformGatewayLive(gateway);
    return { gateway, label: LABEL[gateway], live, demo: !live && demo, available: live || demo };
  });
}

function resultRedirect(status: string, paymentId?: string) {
  const qs = new URLSearchParams({ payment: status, ...(paymentId ? { pid: paymentId } : {}) });
  return `${env.FRONTEND_URL}/billing?${qs.toString()}`;
}

const MONEY = (p: number) => new Prisma.Decimal(paisaToDecimalString(p));

// ── Online checkout ─────────────────────────────────────────────────────────

export async function startCheckout(tenantId: string, user: { sub: string; email: string }, dto: CheckoutDtoType) {
  const gateway = dto.gateway as OnlineGateway;
  const invoices = await prisma.platformInvoice.findMany({
    where: dto.payAll
      ? { institutionId: tenantId, status: { in: UNPAID_STATUSES } }
      : { institutionId: tenantId, id: dto.invoiceId },
    orderBy: { dueDate: 'asc' },
  });
  if (!dto.payAll && invoices.length === 0) throw new NotFoundError('Invoice not found');
  const payable = invoices.map((inv) => ({ inv, due: duePaisa(inv) })).filter((x) => x.due > 0 && UNPAID_STATUSES.includes(x.inv.status));
  if (payable.length === 0) throw new BadRequestError('Nothing is due on this bill');
  const amount = payable.reduce((s, x) => s + x.due, 0);

  const live = isPlatformGatewayLive(gateway);
  if (!live && !isDemoPaymentsAllowed()) {
    throw new BadRequestError(`${LABEL[gateway]} payment is not available yet — please contact PeopleNIT`);
  }

  const tranId = generatePlatformTranId();
  const payment = await prisma.platformPayment.create({
    data: {
      institutionId: tenantId,
      method: gateway,
      status: 'INITIATED',
      amount: MONEY(amount),
      gatewayTransactionId: tranId,
      isDemo: !live,
      initiatedByUserId: user.sub,
      allocations: { create: payable.map((x) => ({ invoiceId: x.inv.id, amount: MONEY(x.due) })) },
    },
  });

  const base = { paymentId: payment.id, amount: paisaToNumber(amount), gateway, invoices: payable.map((x) => x.inv.invoiceNumber) };

  if (!live) {
    const checkoutPath = `/billing/demo-checkout?payment=${encodeURIComponent(payment.id)}`;
    return {
      ...base,
      demo: true,
      message: `${LABEL[gateway]} is not configured — opening the demo checkout. No real money will be charged.`,
      checkoutPath,
      paymentUrl: `${env.FRONTEND_URL}${checkoutPath}`,
    };
  }

  const institution = await prisma.institution.findUnique({ where: { id: tenantId }, select: { name: true, phone: true, contactPhone: true } });
  const callbackBase = `${env.APP_URL}/api/v1/billing/platform-gateway/${SLUG[gateway]}`;
  let paymentUrl: string | undefined;
  let gatewayPaymentId: string | undefined;
  let message = '';

  if (gateway === 'SSLCOMMERZ') {
    const r = await SslCommerzClient.initiateSession({
      tranId,
      amount: paisaToNumber(amount),
      currency: 'BDT',
      successUrl: `${callbackBase}/success`,
      failUrl: `${callbackBase}/fail`,
      cancelUrl: `${callbackBase}/cancel`,
      ipnUrl: `${callbackBase}/ipn`,
      customerName: institution?.name ?? 'School',
      customerEmail: user.email,
      customerPhone: institution?.contactPhone ?? institution?.phone ?? undefined,
      productName: 'PeopleNIT monthly bill',
    });
    if (r.success && r.paymentUrl) paymentUrl = r.paymentUrl;
    message = r.message;
  } else {
    const r = await platformBkash.initiate({
      tranId,
      amount: paisaToNumber(amount),
      currency: 'BDT',
      invoiceNo: payable[0].inv.invoiceNumber,
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
    await prisma.platformPayment.update({ where: { id: payment.id }, data: { status: 'FAILED', rawResponse: { message } } });
    throw new BadRequestError(message || `Could not start ${LABEL[gateway]} checkout`);
  }
  await prisma.platformPayment.update({
    where: { id: payment.id },
    data: { status: 'PENDING', gatewayPaymentId: gatewayPaymentId ?? null },
  });
  return { ...base, demo: false, message, paymentUrl };
}

/** A school's own payment (result page / demo checkout). */
export async function getMyPayment(tenantId: string, paymentId: string) {
  const p = await prisma.platformPayment.findFirst({
    where: { id: paymentId, institutionId: tenantId },
    include: { allocations: { include: { invoice: { select: { id: true, invoiceNumber: true, period: true } } } } },
  });
  if (!p) throw new NotFoundError('Payment not found');
  return {
    id: p.id,
    method: p.method,
    status: p.status,
    amount: Number(p.amount),
    isDemo: p.isDemo,
    receiptNumber: p.receiptNumber,
    paidAt: p.paidAt,
    createdAt: p.createdAt,
    demoAllowed: p.isDemo && !isPlatformGatewayLive(p.method as OnlineGateway) && isDemoPaymentsAllowed(),
    invoices: p.allocations.map((a) => ({ ...a.invoice, amount: Number(a.amount) })),
  };
}

export async function confirmDemoPayment(tenantId: string, paymentId: string, outcome: 'success' | 'failure', userId: string) {
  const p = await prisma.platformPayment.findFirst({ where: { id: paymentId, institutionId: tenantId } });
  if (!p) throw new NotFoundError('Payment not found');
  if (!p.isDemo || !['BKASH', 'SSLCOMMERZ'].includes(p.method) || isPlatformGatewayLive(p.method as OnlineGateway) || !isDemoPaymentsAllowed()) {
    throw new ForbiddenError('Demo confirmation is disabled — this gateway takes real payments');
  }
  if (p.status === 'SUCCESS') return { status: 'SUCCESS', receiptNumber: p.receiptNumber, alreadyProcessed: true };
  if (p.status === 'FAILED' || p.status === 'CANCELLED') throw new BadRequestError('This demo payment is closed — start a new one');
  if (outcome === 'failure') {
    await markPayment(p.id, 'FAILED', { demo: true, simulated: 'failure' });
    return { status: 'FAILED', receiptNumber: null };
  }
  const r = await creditPlatformPayment(p.id, {
    gatewayRef: `DEMO-${p.gatewayTransactionId}`,
    raw: { demo: true, simulated: 'success', confirmedBy: userId, at: new Date().toISOString() },
  });
  return { status: r.credited || r.alreadyCredited ? 'SUCCESS' : p.status, receiptNumber: r.receiptNumber ?? null };
}

/** Pay link from SMS/email → the invoice id, only for the signed-in school. */
export async function resolvePayLink(tenantId: string, token: string) {
  const invoiceId = verifyPayToken(token, tenantId, payLinkSecret());
  if (!invoiceId) throw new BadRequestError('This payment link is invalid or has expired — open Billing to pay');
  const inv = await prisma.platformInvoice.findFirst({ where: { id: invoiceId, institutionId: tenantId }, select: { id: true } });
  if (!inv) throw new NotFoundError('Invoice not found');
  return { invoiceId };
}

// ── Crediting ───────────────────────────────────────────────────────────────

async function markPayment(id: string, status: 'FAILED' | 'CANCELLED', raw: unknown) {
  await prisma.platformPayment.updateMany({
    where: { id, status: { in: ['INITIATED', 'PENDING'] } },
    data: { status, rawResponse: (raw ?? null) as Prisma.InputJsonValue },
  });
}

async function nextReceiptNumber(tx: Tx, now: Date): Promise<string> {
  const period = periodOf(now);
  const prefix = receiptNumberFor(period, 0).replace(/0000$/, '');
  const last = await tx.platformPayment.findFirst({
    where: { receiptNumber: { startsWith: prefix } },
    orderBy: { receiptNumber: 'desc' },
    select: { receiptNumber: true },
  });
  return receiptNumberFor(period, nextSequence(last?.receiptNumber));
}

interface LockedInvoice {
  id: string;
  total: Prisma.Decimal;
  paidAmount: Prisma.Decimal;
  waivedAmount: Prisma.Decimal;
  status: string;
  dueDate: Date;
}

async function lockInvoice(tx: Tx, id: string): Promise<LockedInvoice | null> {
  const rows = await tx.$queryRaw<LockedInvoice[]>`
    SELECT "id", "total", "paidAmount", "waivedAmount", "status"::text AS "status", "dueDate"
    FROM "PlatformInvoice" WHERE "id" = ${id} FOR UPDATE`;
  return rows[0] ?? null;
}

/** Applies `amount` paisa to a locked invoice; returns what was applied. */
async function applyToInvoice(tx: Tx, inv: LockedInvoice, amount: number, now: Date): Promise<number> {
  if (!UNPAID_STATUSES.includes(inv.status as never)) return 0;
  const due = duePaisa({ total: inv.total, paidAmount: inv.paidAmount, waivedAmount: inv.waivedAmount });
  const applied = Math.min(amount, due);
  if (applied <= 0) return 0;
  const paid = toPaisa(inv.paidAmount) + applied;
  const status = statusAfterPayment(toPaisa(inv.total), paid, toPaisa(inv.waivedAmount), inv.dueDate, now);
  await tx.platformInvoice.update({
    where: { id: inv.id },
    data: { paidAmount: MONEY(paid), status, paidAt: status === 'PAID' ? now : null },
  });
  return applied;
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
  excess?: number;
}

/**
 * Credits a verified online payment. Safe to call any number of times and
 * concurrently (IPN + redirect + duplicate callbacks): exactly one caller
 * wins the status claim; the rest are no-ops.
 */
export async function creditPlatformPayment(
  paymentId: string,
  verified: { gatewayRef: string; gatewayPaymentId?: string | null; raw: unknown },
  now: Date = new Date(),
): Promise<CreditResult> {
  const payment = await prisma.platformPayment.findUnique({ where: { id: paymentId } });
  if (!payment) return { credited: false };
  if (payment.status === 'SUCCESS') return { credited: false, alreadyCredited: true, receiptNumber: payment.receiptNumber };

  const reusedBy = await prisma.platformPayment.findFirst({
    where: { gatewayValId: verified.gatewayRef, id: { not: payment.id } },
    select: { id: true },
  });
  if (reusedBy) {
    logger.error('Platform billing: gateway reference already used by another payment — replay rejected', {
      paymentId,
      gatewayRef: verified.gatewayRef,
      reusedBy: reusedBy.id,
    });
    return { credited: false };
  }

  let result: CreditResult;
  try {
    result = await withReceiptRetry(() =>
      prisma.$transaction(async (tx) => {
        const receiptNumber = await nextReceiptNumber(tx, now);
        const claim = await tx.platformPayment.updateMany({
          where: { id: payment.id, status: { not: 'SUCCESS' } },
          data: {
            status: 'SUCCESS',
            gatewayValId: verified.gatewayRef,
            ...(verified.gatewayPaymentId ? { gatewayPaymentId: verified.gatewayPaymentId } : {}),
            rawResponse: (verified.raw ?? null) as Prisma.InputJsonValue,
            paidAt: now,
            receiptNumber,
          },
        });
        if (claim.count !== 1) return { credited: false, alreadyCredited: true } as CreditResult;

        const allocations = await tx.platformPaymentAllocation.findMany({ where: { paymentId: payment.id }, orderBy: { invoiceId: 'asc' } });
        let applied = 0;
        for (const a of allocations) {
          const inv = await lockInvoice(tx, a.invoiceId);
          const got = inv ? await applyToInvoice(tx, inv, toPaisa(a.amount), now) : 0;
          applied += got;
          await tx.platformPaymentAllocation.update({ where: { id: a.id }, data: { appliedAmount: MONEY(got) } });
        }
        const excess = toPaisa(payment.amount) - applied;
        const label = payment.isDemo ? `DEMO — simulated ${payment.method} payment, no money moved` : `Online payment via ${payment.method}`;
        await tx.platformPayment.update({
          where: { id: payment.id },
          data: { note: excess > 0 ? `${label} [OVERPAYMENT ${paisaToDecimalString(excess)}]` : label },
        });
        await tx.platformCollectionActivity.create({
          data: {
            institutionId: payment.institutionId,
            invoiceId: allocations[0]?.invoiceId ?? null,
            type: 'PAYMENT',
            body: `Paid ৳${paisaToNumber(toPaisa(payment.amount))} online (${payment.method}${payment.isDemo ? ', demo' : ''}), receipt ${receiptNumber}`,
            metadata: { paymentId: payment.id, receiptNumber, excess: paisaToNumber(excess) },
            actorUserId: payment.initiatedByUserId,
            actorName: 'School admin',
          },
        });
        await writeAudit(tx, {
          institutionId: payment.institutionId,
          userId: payment.initiatedByUserId,
          action: 'PLATFORM_PAYMENT_ONLINE',
          resource: 'PlatformPayment',
          resourceId: payment.id,
          metadata: { method: payment.method, amount: payment.amount.toString(), receiptNumber, gatewayRef: verified.gatewayRef, isDemo: payment.isDemo, excess: paisaToNumber(excess) },
        });
        return { credited: true, receiptNumber, excess: paisaToNumber(excess) } as CreditResult;
      }),
    );
  } catch (error) {
    if (isUniqueViolation(error, 'gatewayValId')) {
      logger.error('Platform billing: gateway reference replay blocked by unique constraint', { paymentId, gatewayRef: verified.gatewayRef });
      return { credited: false };
    }
    throw error;
  }

  if (result.credited) {
    if ((result.excess ?? 0) > 0) {
      logger.error('OVERPAYMENT: platform billing payment exceeded the invoices due — refund or adjust by hand', {
        institutionId: payment.institutionId,
        paymentId,
        excess: result.excess,
      });
    }
    logger.info('Platform billing payment credited', { paymentId, institutionId: payment.institutionId, receiptNumber: result.receiptNumber });
    await afterSettlement(payment.institutionId, payment.initiatedByUserId, `payment ${result.receiptNumber}`, now).catch((e) =>
      logger.error('afterSettlement failed', { error: (e as Error).message }),
    );
    sendPaymentReceipt(payment.id).catch((e) => logger.error('Platform billing receipt notice failed', { paymentId, error: (e as Error).message }));
  }
  return result;
}

// ── Manual payments (super-admin) ───────────────────────────────────────────

export async function recordManualPayment(actorUserId: string, invoiceId: string, dto: ManualPaymentDtoType, now: Date = new Date()) {
  const amount = toPaisa(dto.amount);
  const paidAt = dto.paidAt ? (() => {
    const [y, m, d] = dto.paidAt.split('-').map(Number);
    return new Date(dhakaMidnight(y, m, d).getTime() + 12 * 60 * 60 * 1000);
  })() : now;
  if (paidAt.getTime() > now.getTime() + 24 * 60 * 60 * 1000) throw new BadRequestError('The payment date cannot be in the future');
  const name = await actorName(actorUserId);

  const created = await withReceiptRetry(() =>
    prisma.$transaction(async (tx) => {
      const inv = await lockInvoice(tx, invoiceId);
      if (!inv) throw new NotFoundError('Invoice not found');
      if (!UNPAID_STATUSES.includes(inv.status as never)) throw new BadRequestError(`This invoice is ${inv.status} — nothing to pay`);
      const due = duePaisa({ total: inv.total, paidAmount: inv.paidAmount, waivedAmount: inv.waivedAmount });
      if (amount > due) throw new BadRequestError(`Amount exceeds the due of ৳${paisaToNumber(due)}`);
      const meta = await tx.platformInvoice.findUnique({ where: { id: invoiceId }, select: { institutionId: true, invoiceNumber: true } });
      const receiptNumber = await nextReceiptNumber(tx, now);
      const payment = await tx.platformPayment.create({
        data: {
          institutionId: meta!.institutionId,
          receiptNumber,
          method: dto.method as PlatformPaymentMethod,
          status: 'SUCCESS',
          amount: MONEY(amount),
          reference: dto.reference ?? null,
          note: dto.note ?? null,
          paidAt,
          recordedByUserId: actorUserId,
          allocations: { create: [{ invoiceId, amount: MONEY(amount), appliedAmount: MONEY(amount) }] },
        },
      });
      await applyToInvoice(tx, inv, amount, now);
      await tx.platformCollectionActivity.create({
        data: {
          institutionId: meta!.institutionId,
          invoiceId,
          type: 'PAYMENT',
          body: `Manual payment ৳${paisaToNumber(amount)} (${dto.method}${dto.reference ? `, ref ${dto.reference}` : ''}), receipt ${receiptNumber}`,
          metadata: { paymentId: payment.id, receiptNumber },
          actorUserId,
          actorName: name,
        },
      });
      await writeAudit(tx, {
        institutionId: meta!.institutionId,
        userId: actorUserId,
        action: 'PLATFORM_PAYMENT_MANUAL',
        resource: 'PlatformPayment',
        resourceId: payment.id,
        metadata: { invoiceNumber: meta!.invoiceNumber, method: dto.method, amount: paisaToNumber(amount), reference: dto.reference ?? null, note: dto.note ?? null, receiptNumber },
      });
      return payment;
    }),
  );

  await afterSettlement(created.institutionId, actorUserId, `manual payment ${created.receiptNumber}`, now);
  if (dto.notify) {
    sendPaymentReceipt(created.id).catch((e) => logger.error('Platform billing receipt notice failed', { paymentId: created.id, error: (e as Error).message }));
  }
  return { id: created.id, receiptNumber: created.receiptNumber, amount: paisaToNumber(amount) };
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

async function applyVerification(payment: { id: string; gatewayTransactionId: string | null; amount: Prisma.Decimal; currency: string }, v: GatewayVerifyResult) {
  const decision = decideVerification(
    { tranId: payment.gatewayTransactionId ?? '', amount: Number(payment.amount), currency: payment.currency },
    v,
  );
  if (decision.action === 'credit') {
    await creditPlatformPayment(payment.id, { gatewayRef: v.gatewayRef!, gatewayPaymentId: v.gatewayPaymentId ?? null, raw: v.raw });
  } else if (decision.action === 'fail') {
    logger.error('Platform billing verification failed — payment marked FAILED', { paymentId: payment.id, reason: decision.reason });
    await markPayment(payment.id, 'FAILED', { reason: decision.reason, gateway: v.raw ?? null });
  } else {
    logger.warn('Platform billing callback ignored', { paymentId: payment.id, reason: decision.reason });
  }
}

/** Never throws for bad input — returns the browser redirect. The payload is only a pointer; crediting re-verifies with the gateway. */
export async function handlePlatformGatewayCallback(gateway: OnlineGateway, kind: CallbackKind, payload: Record<string, unknown>): Promise<string> {
  if (!isPlatformGatewayLive(gateway)) {
    logger.warn('Platform billing callback while the gateway is not live — ignored', { gateway, kind });
    return resultRedirect('failed');
  }
  if (gateway === 'SSLCOMMERZ') return handleSslCommerz(kind, payload);
  return handleBkash(kind, payload);
}

async function handleSslCommerz(kind: CallbackKind, payload: Record<string, unknown>) {
  const tranId = str(payload.tran_id);
  const valId = str(payload.val_id);
  if (!tranId) return resultRedirect('failed');
  const payment = await prisma.platformPayment.findFirst({ where: { gatewayTransactionId: tranId, method: 'SSLCOMMERZ', isDemo: false } });
  if (!payment) {
    logger.warn('Platform billing SSLCommerz callback for unknown tran_id', { kind, tranId });
    return resultRedirect('failed');
  }
  // verify_sign (md5 over verify_key fields + md5(store password)): a
  // mismatch means forged/corrupted — ignore. Absent = rely on validation API.
  if (verifySslCommerzSignature(payload, env.SSLCOMMERZ_STORE_PASSWORD ?? '') === false) {
    logger.error('Platform billing SSLCommerz signature mismatch — ignored', { kind, tranId });
    return resultRedirect(statusSlug(payment.status), payment.id);
  }

  if (payment.status !== 'SUCCESS') {
    if (valId && (kind === 'ipn' || kind === 'success')) {
      const v = await SslCommerzClient.validateTransaction(valId);
      const raw = v.raw as Record<string, unknown> | null;
      await applyVerification(payment, {
        reachable: v.raw !== null,
        success: v.valid,
        amount: v.amount,
        currency: v.currency,
        tranId: v.tranId,
        gatewayRef: (raw && typeof raw.val_id === 'string' ? raw.val_id : undefined) ?? (v.valid ? valId : undefined),
        raw: v.raw,
      });
    } else if (kind === 'fail' || (kind === 'ipn' && str(payload.status) === 'FAILED')) {
      await markPayment(payment.id, 'FAILED', { callback: kind, status: payload.status ?? null });
    } else if (kind === 'cancel' || (kind === 'ipn' && str(payload.status) === 'CANCELLED')) {
      await markPayment(payment.id, 'CANCELLED', { callback: kind, status: payload.status ?? null });
    }
  }
  const fresh = await prisma.platformPayment.findUnique({ where: { id: payment.id }, select: { status: true } });
  return resultRedirect(statusSlug(fresh?.status), payment.id);
}

async function handleBkash(kind: CallbackKind, payload: Record<string, unknown>) {
  const paymentID = str(payload.paymentID);
  const status = str(payload.status)?.toLowerCase();
  if (!paymentID) return resultRedirect('failed');
  const payment = await prisma.platformPayment.findFirst({ where: { gatewayPaymentId: paymentID, method: 'BKASH', isDemo: false } });
  if (!payment) {
    logger.warn('Platform billing bKash callback for unknown paymentID', { kind, paymentID });
    return resultRedirect('failed');
  }
  if (payment.status !== 'SUCCESS') {
    if (status === 'success') {
      await applyVerification(payment, await platformBkash.executeOrQuery(paymentID));
    } else if (status === 'cancel' || kind === 'cancel') {
      await markPayment(payment.id, 'CANCELLED', { callback: kind, status });
    } else {
      await markPayment(payment.id, 'FAILED', { callback: kind, status: status ?? null });
    }
  }
  const fresh = await prisma.platformPayment.findUnique({ where: { id: payment.id }, select: { status: true } });
  return resultRedirect(statusSlug(fresh?.status), payment.id);
}

export function gatewayFromSlug(slug: string): OnlineGateway | null {
  const s = slug.toLowerCase();
  if (s === 'bkash') return 'BKASH';
  if (s === 'sslcommerz') return 'SSLCOMMERZ';
  return null;
}
