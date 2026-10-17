import { FeeGateway, FeeTxnStatus, Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { env } from '../../config/env';
import { logger } from '../../utils/logger';
import { BadRequestError, ForbiddenError, NotFoundError, ValidationError } from '../../utils/AppError';
import { notifySafe } from '../notifications/notifications.service';
import { FeeRepository } from '../fees/fee.repository';
import { isReceiptNoCollision, nextReceiptNumber } from '../fees/receipts/receiptNumber';
import { getSslCommerzConfig, isDemoPaymentsAllowed, isGatewayLive } from '../fees/gateways/config';
import { SslCommerzFeeAdapter } from '../fees/gateways/sslcommerz.adapter';
import { BkashFeeAdapter } from '../fees/gateways/bkash.adapter';
import { NagadFeeAdapter } from '../fees/gateways/nagad.adapter';
import { decideVerification, generateFeeTranId, verifySslCommerzSignature } from '../fees/gateways/verify';
import type { FeeGatewayAdapter, FeeGatewayName, GatewayVerifyResult } from '../fees/gateways/types';
import { allocateOldestFirst, allocationProblem, consecutiveReceipts, fromPaisa, isPayable, toPaisa } from './families.logic';
import { familyAccess, type FamilyCtx } from './families.service';
import type { OfflinePaymentDtoType, PayOnlineDtoType } from './families.dto';

// =============================================================================
// Family "pay all" (T3).
//
// ONLINE: a guardian pays every outstanding invoice of every child in one
// gateway checkout. One FamilyPayment (+ one FamilyPaymentAllocation per
// invoice) is created up front. Crediting (creditFamilyPayment) happens only
// after the gateway re-verifies tran id + amount + currency (or, in demo
// mode, after the guardian presses "Simulate success"), and is idempotent:
// an atomic INITIATED/PENDING → SUCCESS claim in the same DB transaction as
// the Payment inserts, so duplicate callbacks/IPNs create nothing twice; a
// gateway reference can credit only one payment (unique index + check).
// Each allocation becomes an ordinary Payment (with its own receipt number)
// on its invoice, through FeeRepository.applyPaymentToInvoice — the same
// rule offline and single-invoice online payments use.
//
// OFFLINE: staff record one cash/bank payment split across the children's
// invoices (explicit split, or oldest due first) in one transaction.
//
// Callbacks: /api/v1/fees/gateway/family/:gateway/:kind (inherits the fee
// gateway CORS + rate-limit exemptions).
// =============================================================================

const ADAPTERS: Record<FeeGatewayName, FeeGatewayAdapter> = { SSLCOMMERZ: SslCommerzFeeAdapter, BKASH: BkashFeeAdapter, NAGAD: NagadFeeAdapter };
const LABEL: Record<FeeGatewayName, string> = { SSLCOMMERZ: 'SSLCommerz', BKASH: 'bKash', NAGAD: 'Nagad' };
const SLUG: Record<FeeGatewayName, string> = { SSLCOMMERZ: 'sslcommerz', BKASH: 'bkash', NAGAD: 'nagad' };
const num = (v: Prisma.Decimal | number | null | undefined) => (v == null ? 0 : Number(v));

export function familyGatewayFromSlug(slug: string): FeeGatewayName | null {
  return (Object.keys(SLUG) as FeeGatewayName[]).find((g) => SLUG[g] === slug.toLowerCase()) ?? null;
}

const demoCheckoutPath = (id: string) => `/family/pay/demo?payment=${encodeURIComponent(id)}`;
const resultRedirect = (status: string, id?: string) =>
  `${env.FRONTEND_URL}/family/mine?${new URLSearchParams({ payment: status, ...(id ? { ref: id } : {}) }).toString()}`;
const redirectStatus = (s: FeeTxnStatus | undefined) => (s === 'SUCCESS' ? 'success' : s === 'CANCELLED' ? 'cancelled' : s === 'FAILED' ? 'failed' : 'pending');

// ── Receipt numbers for several payments at once ────────────────────────────

async function reserveReceipts(institutionId: string, n: number, attempt: number): Promise<string[]> {
  if (attempt === 0) {
    const nums: string[] = [];
    for (let i = 0; i < n; i++) nums.push(await nextReceiptNumber(institutionId, 0));
    // Redis INCR gives distinct numbers; the DB fallback repeats the max + 1.
    if (new Set(nums).size === n) return nums;
    return consecutiveReceipts(nums[0], n);
  }
  return consecutiveReceipts(await nextReceiptNumber(institutionId, attempt), n);
}

/** Runs `create(receiptNos)`, retrying on a receipt-number collision. */
export async function withReceiptNumbers<T>(institutionId: string, n: number, create: (receiptNos: string[]) => Promise<T>): Promise<T> {
  let last: unknown;
  for (let attempt = 0; attempt < 6; attempt++) {
    const nums = await reserveReceipts(institutionId, n, attempt);
    try {
      return await create(nums);
    } catch (error) {
      if (!isReceiptNoCollision(error)) throw error;
      last = error;
    }
  }
  throw last;
}

// ── Family invoices ──────────────────────────────────────────────────────────

async function familyInvoices(institutionId: string, familyId: string) {
  const members = await prisma.familyStudent.findMany({ where: { familyId, institutionId }, select: { studentId: true } });
  if (members.length === 0) return [];
  const rows = await prisma.invoice.findMany({
    where: { institutionId, studentId: { in: members.map((m) => m.studentId) }, status: { notIn: ['PAID', 'CANCELLED'] } },
    select: { id: true, invoiceNo: true, studentId: true, dueAmount: true, dueDate: true, status: true, student: { select: { firstName: true, lastName: true, userId: true } } },
    orderBy: [{ dueDate: 'asc' }, { id: 'asc' }],
  });
  return rows.map((r) => ({ ...r, dueAmount: num(r.dueAmount) })).filter((r) => isPayable(r));
}

function notifyPayments(institutionId: string, rows: Array<{ paymentId: string; invoiceId: string; invoiceNo: string; studentName: string; studentUserId: string | null; amount: number; dueAfter: number }>) {
  for (const r of rows) {
    notifySafe({
      institutionId,
      type: 'PAYMENT_RECEIVED',
      recipientUserIds: r.studentUserId ? [r.studentUserId] : [],
      contextId: r.paymentId,
      data: { link: '/fees', invoiceId: r.invoiceId },
      vars: { invoiceNo: r.invoiceNo, studentName: r.studentName, amount: r.amount.toFixed(2), dueAmount: Math.max(r.dueAfter, 0).toFixed(2) },
    });
  }
}

// ── Online: initiate ─────────────────────────────────────────────────────────

export async function initiateFamilyOnline(ctx: FamilyCtx, familyId: string, dto: PayOnlineDtoType) {
  const view = await familyAccess(ctx, familyId);
  if (view !== 'guardian') throw new ForbiddenError('Only a guardian of this family can pay online');
  const gateway = dto.method as FeeGatewayName;

  let invoices = await familyInvoices(ctx.institutionId, familyId);
  if (dto.invoiceIds?.length) {
    const wanted = new Set(dto.invoiceIds);
    if ([...wanted].some((id) => !invoices.some((i) => i.id === id))) throw new BadRequestError('An invoice is not payable or not in this family');
    invoices = invoices.filter((i) => wanted.has(i.id));
  }
  if (invoices.length === 0) throw new BadRequestError('Nothing to pay — every invoice is already paid');
  const totalPaisa = invoices.reduce((s, i) => s + toPaisa(i.dueAmount), 0);
  const amount = fromPaisa(totalPaisa);

  const live = isGatewayLive(gateway);
  if (!live && !isDemoPaymentsAllowed()) throw new BadRequestError(`${LABEL[gateway]} online payment is not configured for this school yet`);
  const tranId = generateFeeTranId();

  const fp = await prisma.familyPayment.create({
    data: {
      institutionId: ctx.institutionId,
      familyId,
      source: 'ONLINE',
      gateway: gateway as FeeGateway,
      method: gateway,
      amount: new Prisma.Decimal(amount.toFixed(2)),
      status: 'INITIATED',
      gatewayTransactionId: tranId,
      isDemo: !live,
      initiatedByUserId: ctx.userId,
      allocations: { create: invoices.map((i) => ({ invoiceId: i.id, amount: new Prisma.Decimal(i.dueAmount.toFixed(2)) })) },
    },
  });
  const base = { paymentId: fp.id, transactionId: tranId, gateway, amount, currency: 'BDT', invoiceCount: invoices.length };

  if (!live) {
    const checkoutPath = demoCheckoutPath(fp.id);
    return { ...base, demo: true, message: `${LABEL[gateway]} is not configured — opening the demo checkout. No real money will be charged.`, paymentUrl: `${env.FRONTEND_URL}${checkoutPath}`, checkoutPath };
  }

  const payer = await prisma.user.findFirst({ where: { id: ctx.userId }, select: { firstName: true, lastName: true, email: true, phone: true } });
  const result = await ADAPTERS[gateway].initiate({
    tranId,
    amount,
    currency: 'BDT',
    invoiceNo: `FAMILY-${invoices.length}-${tranId.slice(-6)}`,
    customerName: payer ? `${payer.firstName} ${payer.lastName}`.trim() : 'Guardian',
    customerEmail: payer?.email,
    customerPhone: payer?.phone,
    callbackBase: `${env.APP_URL}/api/v1/fees/gateway/family/${SLUG[gateway]}`,
  });
  if (!result.ok || !result.paymentUrl) {
    await prisma.familyPayment.update({ where: { id: fp.id }, data: { status: 'FAILED', rawResponse: (result.raw ?? { message: result.message }) as Prisma.InputJsonValue } });
    throw new BadRequestError(result.message || `Failed to start ${LABEL[gateway]} checkout`);
  }
  await prisma.familyPayment.update({
    where: { id: fp.id },
    data: { status: 'PENDING', gatewayPaymentId: result.gatewayPaymentId ?? null, rawResponse: (result.raw ?? null) as Prisma.InputJsonValue },
  });
  return { ...base, demo: false, message: result.message, paymentUrl: result.paymentUrl };
}

// ── Status (guardian return page / staff) ────────────────────────────────────

export async function getFamilyPayment(ctx: FamilyCtx, paymentId: string) {
  const fp = await prisma.familyPayment.findFirst({
    where: { id: paymentId, institutionId: ctx.institutionId },
    include: {
      allocations: {
        include: {
          invoice: { select: { invoiceNo: true, student: { select: { firstName: true, lastName: true } } } },
          payment: { select: { id: true, receiptNo: true } },
        },
      },
    },
  });
  if (!fp || !fp.familyId) throw new NotFoundError('Payment not found');
  await familyAccess(ctx, fp.familyId);
  return {
    id: fp.id,
    familyId: fp.familyId,
    source: fp.source,
    gateway: fp.gateway,
    method: fp.method,
    amount: num(fp.amount),
    status: fp.status,
    isDemo: fp.isDemo,
    createdAt: fp.createdAt,
    completedAt: fp.completedAt,
    allocations: fp.allocations.map((a) => ({
      invoiceId: a.invoiceId,
      invoiceNo: a.invoice.invoiceNo,
      studentName: `${a.invoice.student.firstName} ${a.invoice.student.lastName}`.trim(),
      amount: num(a.amount),
      receiptNo: a.payment?.receiptNo ?? null,
      paymentId: a.payment?.id ?? null,
    })),
  };
}

// ── Crediting (idempotent) ───────────────────────────────────────────────────

async function markFamilyPayment(id: string, status: 'FAILED' | 'CANCELLED', raw: unknown) {
  await prisma.familyPayment.updateMany({ where: { id, status: { in: ['INITIATED', 'PENDING'] } }, data: { status, rawResponse: (raw ?? null) as Prisma.InputJsonValue } });
}

function isUniqueOn(error: unknown, field: string): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') return false;
  const target = (error.meta as { target?: unknown } | undefined)?.target;
  return (Array.isArray(target) ? target.join(',') : String(target ?? '')).includes(field);
}

export async function creditFamilyPayment(
  familyPaymentId: string,
  verified: { gatewayRef: string; gatewayPaymentId?: string | null; raw: unknown },
): Promise<{ credited: boolean; paymentIds?: string[] }> {
  const fp = await prisma.familyPayment.findUnique({
    where: { id: familyPaymentId },
    include: {
      allocations: {
        include: { invoice: { select: { id: true, invoiceNo: true, dueAmount: true, student: { select: { firstName: true, lastName: true, userId: true } } } } },
        orderBy: { id: 'asc' },
      },
    },
  });
  if (!fp || fp.source !== 'ONLINE') return { credited: false };
  if (fp.status === 'SUCCESS') return { credited: false, paymentIds: fp.allocations.map((a) => a.paymentId).filter((x): x is string => Boolean(x)) };

  // Replay protection: a gateway reference may credit exactly one payment —
  // across family payments AND single-invoice fee transactions.
  const [reusedFamily, reusedFee] = await Promise.all([
    prisma.familyPayment.findFirst({ where: { gatewayValId: verified.gatewayRef, id: { not: fp.id } }, select: { id: true } }),
    prisma.feePaymentTransaction.findFirst({ where: { gatewayValId: verified.gatewayRef }, select: { id: true } }),
  ]);
  if (reusedFamily || reusedFee) {
    logger.error('Family payment gateway reference already used — rejecting replay', { familyPaymentId, gatewayRef: verified.gatewayRef });
    return { credited: false };
  }

  const recordedBy = fp.initiatedByUserId ?? 'SYSTEM';
  const label = fp.gateway ? LABEL[fp.gateway as FeeGatewayName] : fp.method;
  let created: Array<{ paymentId: string; allocationIndex: number }> | null = null;
  try {
    created = await withReceiptNumbers(fp.institutionId, fp.allocations.length, (receiptNos) =>
      prisma.$transaction(async (tx) => {
        const claim = await tx.familyPayment.updateMany({
          where: { id: fp.id, status: { not: 'SUCCESS' } },
          data: {
            status: 'SUCCESS',
            gatewayValId: verified.gatewayRef,
            completedAt: new Date(),
            ...(verified.gatewayPaymentId ? { gatewayPaymentId: verified.gatewayPaymentId } : {}),
            rawResponse: (verified.raw ?? null) as Prisma.InputJsonValue,
          },
        });
        if (claim.count !== 1) return null; // lost the race to a concurrent callback
        const out: Array<{ paymentId: string; allocationIndex: number }> = [];
        for (const [i, a] of fp.allocations.entries()) {
          const amount = num(a.amount);
          if (amount > num(a.invoice.dueAmount) + 0.001) {
            logger.warn('Family payment allocation exceeds the invoice due at credit time (possible double payment)', { familyPaymentId: fp.id, invoiceId: a.invoiceId, amount });
          }
          const p = await tx.payment.create({
            data: {
              invoiceId: a.invoiceId,
              amount: a.amount,
              method: fp.method,
              transactionRef: verified.gatewayRef,
              recordedBy,
              status: 'COMPLETED',
              receiptNo: receiptNos[i],
              notes: fp.isDemo
                ? `DEMO MODE — simulated ${label} family payment, no money was charged (${fp.gatewayTransactionId})`
                : `Family payment via ${label} (${fp.gatewayTransactionId})`,
            },
            select: { id: true },
          });
          await FeeRepository.applyPaymentToInvoice(tx, a.invoiceId, amount);
          await tx.familyPaymentAllocation.update({ where: { id: a.id }, data: { paymentId: p.id } });
          out.push({ paymentId: p.id, allocationIndex: i });
        }
        return out;
      }),
    );
  } catch (error) {
    if (isUniqueOn(error, 'gatewayValId')) {
      logger.error('Family payment gateway reference replay blocked by unique constraint', { familyPaymentId, gatewayRef: verified.gatewayRef });
      return { credited: false };
    }
    throw error;
  }
  if (!created) return { credited: false };

  logger.info('Family payment credited', { familyPaymentId: fp.id, invoices: created.length, isDemo: fp.isDemo });
  notifyPayments(
    fp.institutionId,
    created.map(({ paymentId, allocationIndex }) => {
      const a = fp.allocations[allocationIndex];
      return {
        paymentId,
        invoiceId: a.invoiceId,
        invoiceNo: a.invoice.invoiceNo,
        studentName: `${a.invoice.student.firstName} ${a.invoice.student.lastName}`.trim(),
        studentUserId: a.invoice.student.userId,
        amount: num(a.amount),
        dueAfter: num(a.invoice.dueAmount) - num(a.amount),
      };
    }),
  );
  return { credited: true, paymentIds: created.map((c) => c.paymentId) };
}

// ── Demo confirmation (guardian presses "Simulate success/failure") ─────────

export async function confirmFamilyDemo(ctx: FamilyCtx, paymentId: string, outcome: 'success' | 'failure') {
  const fp = await prisma.familyPayment.findFirst({ where: { id: paymentId, institutionId: ctx.institutionId } });
  if (!fp || !fp.familyId) throw new NotFoundError('Payment not found');
  const view = await familyAccess(ctx, fp.familyId);
  if (view !== 'guardian') throw new ForbiddenError('Only a guardian of this family can confirm this payment');
  if (fp.source !== 'ONLINE' || !fp.isDemo || !fp.gateway || isGatewayLive(fp.gateway as FeeGatewayName) || !isDemoPaymentsAllowed()) {
    throw new ForbiddenError('Demo confirmation is disabled — this gateway is configured for real payments');
  }
  if (fp.status === 'SUCCESS') return { status: 'SUCCESS' as const, alreadyProcessed: true };
  if (fp.status === 'FAILED' || fp.status === 'CANCELLED') throw new BadRequestError('This demo payment is already closed — start a new payment');
  if (outcome === 'failure') {
    await markFamilyPayment(fp.id, 'FAILED', { demo: true, simulated: 'failure', at: new Date().toISOString() });
    return { status: 'FAILED' as const };
  }
  const r = await creditFamilyPayment(fp.id, {
    gatewayRef: `DEMO-${fp.gatewayTransactionId}`,
    raw: { demo: true, simulated: 'success', confirmedBy: ctx.userId, at: new Date().toISOString() },
  });
  return { status: r.credited || r.paymentIds?.length ? ('SUCCESS' as const) : fp.status, paymentIds: r.paymentIds ?? [] };
}

// ── Gateway callbacks (public; payload is only a pointer, always re-verified)

export type FamilyCallbackKind = 'ipn' | 'success' | 'fail' | 'cancel' | 'callback';
const str = (v: unknown) => (typeof v === 'string' && v.length > 0 ? v : undefined);

async function applyVerification(fp: { id: string; gatewayTransactionId: string | null; amount: Prisma.Decimal; currency: string }, verification: GatewayVerifyResult) {
  const decision = decideVerification({ tranId: fp.gatewayTransactionId ?? '', amount: num(fp.amount), currency: fp.currency }, verification);
  if (decision.action === 'credit') {
    await creditFamilyPayment(fp.id, { gatewayRef: verification.gatewayRef!, gatewayPaymentId: verification.gatewayPaymentId ?? null, raw: verification.raw });
  } else if (decision.action === 'fail') {
    logger.error('Family payment verification failed — marking FAILED', { familyPaymentId: fp.id, reason: decision.reason });
    await markFamilyPayment(fp.id, 'FAILED', { reason: decision.reason, gateway: verification.raw ?? null });
  } else {
    logger.warn('Family payment callback ignored', { familyPaymentId: fp.id, reason: decision.reason });
  }
}

const findReal = (where: Prisma.FamilyPaymentWhereInput) => prisma.familyPayment.findFirst({ where: { ...where, source: 'ONLINE', isDemo: false } });

async function freshRedirect(id: string) {
  const fresh = await prisma.familyPayment.findUnique({ where: { id }, select: { status: true } });
  return resultRedirect(redirectStatus(fresh?.status), id);
}

export async function handleFamilyGatewayCallback(gateway: FeeGatewayName, kind: FamilyCallbackKind, payload: Record<string, unknown>): Promise<string> {
  if (!isGatewayLive(gateway)) {
    logger.warn('Family payment callback while the gateway is in demo mode — ignored', { gateway, kind });
    return resultRedirect('failed');
  }
  if (gateway === 'SSLCOMMERZ') {
    const tranId = str(payload.tran_id);
    const valId = str(payload.val_id);
    if (!tranId) return resultRedirect('failed');
    const fp = await findReal({ gateway: 'SSLCOMMERZ', gatewayTransactionId: tranId });
    if (!fp) return resultRedirect('failed');
    const cfg = getSslCommerzConfig();
    if (cfg && verifySslCommerzSignature(payload, cfg.storePassword) === false) {
      logger.error('SSLCommerz family callback signature mismatch — ignored', { kind, tranId });
      return resultRedirect(redirectStatus(fp.status), fp.id);
    }
    if (fp.status !== 'SUCCESS') {
      if (valId && (kind === 'ipn' || kind === 'success')) await applyVerification(fp, await SslCommerzFeeAdapter.validateByValId(valId));
      else if (kind === 'fail' || (kind === 'ipn' && str(payload.status) === 'FAILED')) await markFamilyPayment(fp.id, 'FAILED', { callback: kind, status: payload.status ?? null });
      else if (kind === 'cancel' || (kind === 'ipn' && str(payload.status) === 'CANCELLED')) await markFamilyPayment(fp.id, 'CANCELLED', { callback: kind });
    }
    return freshRedirect(fp.id);
  }
  if (gateway === 'BKASH') {
    const paymentID = str(payload.paymentID);
    const status = str(payload.status)?.toLowerCase();
    if (!paymentID) return resultRedirect('failed');
    const fp = await findReal({ gateway: 'BKASH', gatewayPaymentId: paymentID });
    if (!fp) return resultRedirect('failed');
    if (fp.status !== 'SUCCESS') {
      if (status === 'success') await applyVerification(fp, await BkashFeeAdapter.executeOrQuery(paymentID));
      else if (status === 'cancel' || kind === 'cancel') await markFamilyPayment(fp.id, 'CANCELLED', { callback: kind, status });
      else await markFamilyPayment(fp.id, 'FAILED', { callback: kind, status: status ?? null });
    }
    return freshRedirect(fp.id);
  }
  const orderId = str(payload.order_id);
  const paymentRefId = str(payload.payment_ref_id);
  if (!orderId || !paymentRefId) return resultRedirect('failed');
  const fp = await findReal({ gateway: 'NAGAD', gatewayTransactionId: orderId });
  if (!fp) return resultRedirect('failed');
  if (fp.gatewayPaymentId && fp.gatewayPaymentId !== paymentRefId) return resultRedirect(redirectStatus(fp.status), fp.id);
  if (fp.status !== 'SUCCESS') {
    const verification = await NagadFeeAdapter.verifyByReference(paymentRefId);
    const cb = str(payload.status)?.toLowerCase();
    if (verification.reachable && !verification.success && (cb === 'aborted' || cb === 'cancelled' || kind === 'cancel')) {
      await markFamilyPayment(fp.id, 'CANCELLED', { callback: kind, status: cb ?? null });
    } else {
      await applyVerification(fp, verification);
    }
  }
  return freshRedirect(fp.id);
}

// ── Offline: one payment split across children (staff) ───────────────────────

export async function recordFamilyOffline(ctx: FamilyCtx, familyId: string, dto: OfflinePaymentDtoType) {
  await familyAccess(ctx, familyId);
  const invoices = await familyInvoices(ctx.institutionId, familyId);
  const byId = new Map(invoices.map((i) => [i.id, i]));
  let allocations: Array<{ invoiceId: string; amount: number }>;
  if (dto.allocations?.length) {
    const problem = allocationProblem(dto.amount, dto.allocations, byId);
    if (problem) throw new ValidationError(problem);
    allocations = dto.allocations;
  } else {
    try {
      allocations = allocateOldestFirst(dto.amount, invoices);
    } catch (e) {
      throw new ValidationError((e as Error).message);
    }
  }

  const result = await withReceiptNumbers(ctx.institutionId, allocations.length, (receiptNos) =>
    prisma.$transaction(async (tx) => {
      const fp = await tx.familyPayment.create({
        data: {
          institutionId: ctx.institutionId,
          familyId,
          source: 'OFFLINE',
          method: dto.method,
          amount: new Prisma.Decimal(dto.amount.toFixed(2)),
          status: 'SUCCESS',
          transactionRef: dto.transactionRef ?? null,
          notes: dto.notes ?? null,
          initiatedByUserId: ctx.userId,
          completedAt: new Date(),
        },
      });
      const out: Array<{ paymentId: string; receiptNo: string; invoiceId: string; amount: number; dueAfter: number }> = [];
      for (const [i, a] of allocations.entries()) {
        // Re-check inside the transaction: another payment may have landed meanwhile.
        const inv = await tx.invoice.findFirst({ where: { id: a.invoiceId, institutionId: ctx.institutionId }, select: { dueAmount: true, status: true } });
        if (!inv || !isPayable({ dueAmount: num(inv.dueAmount), status: inv.status }) || toPaisa(a.amount) > toPaisa(num(inv.dueAmount))) {
          throw new BadRequestError('An invoice changed while recording — reload and try again');
        }
        const p = await tx.payment.create({
          data: {
            invoiceId: a.invoiceId,
            amount: new Prisma.Decimal(a.amount.toFixed(2)),
            method: dto.method,
            transactionRef: dto.transactionRef,
            notes: dto.notes ? `Family payment: ${dto.notes}` : 'Family payment',
            recordedBy: ctx.userId,
            status: 'COMPLETED',
            receiptNo: receiptNos[i],
          },
          select: { id: true, receiptNo: true },
        });
        await FeeRepository.applyPaymentToInvoice(tx, a.invoiceId, a.amount);
        await tx.familyPaymentAllocation.create({ data: { familyPaymentId: fp.id, invoiceId: a.invoiceId, amount: new Prisma.Decimal(a.amount.toFixed(2)), paymentId: p.id } });
        out.push({ paymentId: p.id, receiptNo: p.receiptNo as string, invoiceId: a.invoiceId, amount: a.amount, dueAfter: num(inv.dueAmount) - a.amount });
      }
      return { familyPaymentId: fp.id, payments: out };
    }),
  );

  notifyPayments(
    ctx.institutionId,
    result.payments.map((p) => {
      const inv = byId.get(p.invoiceId)!;
      return { ...p, invoiceNo: inv.invoiceNo, studentName: `${inv.student.firstName} ${inv.student.lastName}`.trim(), studentUserId: inv.student.userId };
    }),
  );
  return result;
}
