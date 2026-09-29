import { FeeGateway, FeeTxnStatus, Prisma } from '@prisma/client';
import { prisma } from '../../../config/prisma';
import { env } from '../../../config/env';
import { logger } from '../../../utils/logger';
import { BadRequestError, ForbiddenError, NotFoundError } from '../../../utils/AppError';
import { notifySafe } from '../../notifications/notifications.service';
import * as studentRepository from '../../students/student.repository';
import { FeeRepository } from '../fee.repository';
import { withReceiptNumber } from '../receipts/receiptNumber';
import { isGatewayLive, getSslCommerzConfig, isDemoPaymentsAllowed } from '../gateways/config';
import { SslCommerzFeeAdapter } from '../gateways/sslcommerz.adapter';
import { BkashFeeAdapter } from '../gateways/bkash.adapter';
import { NagadFeeAdapter } from '../gateways/nagad.adapter';
import { decideVerification, generateFeeTranId, verifySslCommerzSignature } from '../gateways/verify';
import { FEE_GATEWAYS, type FeeGatewayAdapter, type FeeGatewayName, type GatewayVerifyResult } from '../gateways/types';

// =============================================================================
// Online fee payments: initiation, demo checkout, gateway callbacks, crediting.
//
// Every attempt is a FeePaymentTransaction. A Payment row is created ONLY by
// creditTransaction(), which is idempotent (an atomic status claim inside the
// same DB transaction as the Payment insert + invoice update) and is reached
// only after the gateway itself confirmed the payment (or, in demo mode, after
// an authenticated user pressed "Simulate success" on a demo transaction).
// =============================================================================

export type RequestingUser = { sub: string; role: string };
export type AccessCheck = (tenantId: string, invoice: { studentId: string }, requester: RequestingUser) => Promise<void>;

const ADAPTERS: Record<FeeGatewayName, FeeGatewayAdapter> = {
  SSLCOMMERZ: SslCommerzFeeAdapter,
  BKASH: BkashFeeAdapter,
  NAGAD: NagadFeeAdapter,
};

const GATEWAY_LABEL: Record<FeeGatewayName, string> = { SSLCOMMERZ: 'SSLCommerz', BKASH: 'bKash', NAGAD: 'Nagad' };
const SLUG: Record<FeeGatewayName, string> = { SSLCOMMERZ: 'sslcommerz', BKASH: 'bkash', NAGAD: 'nagad' };

export function gatewayFromSlug(slug: string): FeeGatewayName | null {
  const found = FEE_GATEWAYS.find((g) => SLUG[g] === slug.toLowerCase());
  return found ?? null;
}

export function listGatewayModes() {
  const demoAllowed = isDemoPaymentsAllowed();
  return FEE_GATEWAYS.map((gateway) => {
    const live = isGatewayLive(gateway);
    return { gateway, label: GATEWAY_LABEL[gateway], live, demo: !live, available: live || demoAllowed };
  });
}

function demoCheckoutPath(txnId: string) {
  return `/fees/demo-checkout?txn=${encodeURIComponent(txnId)}`;
}

function resultRedirect(status: string, txnId?: string) {
  const qs = new URLSearchParams({ payment: status, ...(txnId ? { txn: txnId } : {}) });
  return `${env.FRONTEND_URL}/fees?${qs.toString()}`;
}

function redirectStatusFor(status: FeeTxnStatus | undefined): string {
  switch (status) {
    case 'SUCCESS':
      return 'success';
    case 'CANCELLED':
      return 'cancelled';
    case 'FAILED':
      return 'failed';
    default:
      return 'pending';
  }
}

// ── Initiation ──────────────────────────────────────────────────────────────

export async function initiateOnlinePayment(
  tenantId: string,
  invoiceId: string,
  input: { method: string; callbackUrl?: string; amount?: number },
  requester: RequestingUser,
  assertAccess: AccessCheck,
) {
  const gateway = FEE_GATEWAYS.find((g) => g === input.method);
  if (!gateway) throw new BadRequestError('Invalid online payment method');

  const invoice = await prisma.invoice.findFirst({
    where: { id: invoiceId, institutionId: tenantId },
    include: { student: { select: { id: true, firstName: true, lastName: true, email: true, phone: true } } },
  });
  if (!invoice) throw new NotFoundError('Invoice not found');
  await assertAccess(tenantId, invoice, requester);

  const due = Number(invoice.dueAmount);
  if (due <= 0 || invoice.status === 'PAID') throw new BadRequestError('Invoice is already fully paid');
  if (invoice.status === 'CANCELLED') throw new BadRequestError('This invoice has been cancelled');

  const amount = input.amount !== undefined ? Math.round(input.amount * 100) / 100 : due;
  if (amount <= 0) throw new BadRequestError('Payment amount must be greater than zero');
  if (amount > due + 0.001) throw new BadRequestError('Payment amount exceeds invoice due amount');

  const live = isGatewayLive(gateway);
  if (!live && !isDemoPaymentsAllowed()) {
    throw new BadRequestError(`${GATEWAY_LABEL[gateway]} online payment is not configured for this school yet`);
  }
  const tranId = generateFeeTranId();

  const txn = await prisma.feePaymentTransaction.create({
    data: {
      institutionId: tenantId,
      invoiceId: invoice.id,
      studentId: invoice.studentId,
      gateway: gateway as FeeGateway,
      amount: new Prisma.Decimal(amount),
      currency: 'BDT',
      status: 'INITIATED',
      gatewayTransactionId: tranId,
      initiatedByUserId: requester.sub,
      isDemo: !live,
      rawResponse: input.callbackUrl ? { clientReturnUrl: input.callbackUrl } : undefined,
    },
  });

  const base = {
    txnId: txn.id,
    transactionId: tranId,
    gateway,
    amount,
    currency: 'BDT',
    invoiceId: invoice.id,
    invoiceNo: invoice.invoiceNo,
  };

  if (!live) {
    const checkoutPath = demoCheckoutPath(txn.id);
    return {
      ...base,
      success: true,
      demo: true,
      message: `${GATEWAY_LABEL[gateway]} is not configured — opening the demo checkout. No real money will be charged.`,
      paymentUrl: `${env.FRONTEND_URL}${checkoutPath}`,
      checkoutPath,
    };
  }

  const studentName = invoice.student ? `${invoice.student.firstName} ${invoice.student.lastName}`.trim() : 'Student';
  const result = await ADAPTERS[gateway].initiate({
    tranId,
    amount,
    currency: 'BDT',
    invoiceNo: invoice.invoiceNo,
    customerName: studentName,
    customerEmail: invoice.student?.email,
    customerPhone: invoice.student?.phone,
    callbackBase: `${env.APP_URL}/api/v1/fees/gateway/${SLUG[gateway]}`,
  });

  if (!result.ok || !result.paymentUrl) {
    await prisma.feePaymentTransaction.update({
      where: { id: txn.id },
      data: { status: 'FAILED', rawResponse: (result.raw ?? { message: result.message }) as Prisma.InputJsonValue },
    });
    throw new BadRequestError(result.message || `Failed to start ${GATEWAY_LABEL[gateway]} checkout`);
  }

  await prisma.feePaymentTransaction.update({
    where: { id: txn.id },
    data: {
      status: 'PENDING',
      gatewayPaymentId: result.gatewayPaymentId ?? null,
      rawResponse: (result.raw ?? null) as Prisma.InputJsonValue,
    },
  });

  return { ...base, success: true, demo: false, message: result.message, paymentUrl: result.paymentUrl };
}

// ── Transaction lookup (demo checkout page / status polling) ────────────────

export async function getTransaction(tenantId: string, txnId: string, requester: RequestingUser, assertAccess: AccessCheck) {
  const txn = await prisma.feePaymentTransaction.findFirst({
    where: { id: txnId, institutionId: tenantId },
    include: {
      invoice: {
        select: {
          id: true,
          invoiceNo: true,
          studentId: true,
          totalAmount: true,
          dueAmount: true,
          status: true,
          student: { select: { firstName: true, lastName: true, studentId: true } },
        },
      },
      payment: { select: { id: true, receiptNo: true, amount: true, paidAt: true } },
    },
  });
  if (!txn) throw new NotFoundError('Payment transaction not found');
  await assertAccess(tenantId, txn.invoice, requester);

  return {
    id: txn.id,
    transactionId: txn.gatewayTransactionId,
    gateway: txn.gateway,
    amount: Number(txn.amount),
    currency: txn.currency,
    status: txn.status,
    isDemo: txn.isDemo,
    demo: txn.isDemo,
    createdAt: txn.createdAt,
    invoice: {
      id: txn.invoice.id,
      invoiceNo: txn.invoice.invoiceNo,
      totalAmount: Number(txn.invoice.totalAmount),
      dueAmount: Number(txn.invoice.dueAmount),
      status: txn.invoice.status,
      student: txn.invoice.student,
    },
    payment: txn.payment ? { ...txn.payment, amount: Number(txn.payment.amount) } : null,
  };
}

// ── Demo confirmation ───────────────────────────────────────────────────────

export async function confirmDemoTransaction(
  tenantId: string,
  txnId: string,
  outcome: 'success' | 'failure',
  requester: RequestingUser,
  assertAccess: AccessCheck,
) {
  const txn = await prisma.feePaymentTransaction.findFirst({
    where: { id: txnId, institutionId: tenantId },
    include: { invoice: { select: { studentId: true } } },
  });
  if (!txn) throw new NotFoundError('Payment transaction not found');
  await assertAccess(tenantId, txn.invoice, requester);

  // Hard guard: the demo shortcut must never be able to credit money once a
  // real gateway is configured, nor touch a transaction that went to a real
  // gateway.
  if (!txn.isDemo || isGatewayLive(txn.gateway as FeeGatewayName) || !isDemoPaymentsAllowed()) {
    throw new ForbiddenError('Demo confirmation is disabled — this gateway is configured for real payments');
  }
  if (txn.status === 'SUCCESS') {
    const payment = txn.paymentId
      ? await prisma.payment.findUnique({ where: { id: txn.paymentId }, select: { id: true, receiptNo: true } })
      : null;
    return { status: txn.status, demo: true, alreadyProcessed: true, paymentId: payment?.id ?? null, receiptNo: payment?.receiptNo ?? null, invoiceId: txn.invoiceId };
  }
  if (txn.status === 'FAILED' || txn.status === 'CANCELLED') {
    throw new BadRequestError('This demo transaction is already closed — start a new payment');
  }

  if (outcome === 'failure') {
    await markTransaction(txn.id, 'FAILED', { demo: true, simulated: 'failure', at: new Date().toISOString() });
    return { status: 'FAILED' as const, demo: true, paymentId: null, receiptNo: null, invoiceId: txn.invoiceId };
  }

  const credited = await creditTransaction(txn.id, {
    gatewayRef: `DEMO-${txn.gatewayTransactionId}`,
    gatewayPaymentId: null,
    raw: { demo: true, simulated: 'success', confirmedBy: requester.sub, at: new Date().toISOString() },
  });
  return {
    status: credited.paymentId ? ('SUCCESS' as const) : txn.status,
    demo: true,
    paymentId: credited.paymentId ?? null,
    receiptNo: credited.receiptNo ?? null,
    invoiceId: txn.invoiceId,
  };
}

// ── Crediting (the only place an online Payment is created) ─────────────────

async function markTransaction(txnId: string, status: 'FAILED' | 'CANCELLED', raw: unknown) {
  // Never downgrade SUCCESS.
  await prisma.feePaymentTransaction.updateMany({
    where: { id: txnId, status: { in: ['INITIATED', 'PENDING'] } },
    data: { status, rawResponse: (raw ?? null) as Prisma.InputJsonValue },
  });
}

function isUniqueOn(error: unknown, field: string): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') return false;
  const target = (error.meta as { target?: unknown } | undefined)?.target;
  return (Array.isArray(target) ? target.join(',') : String(target ?? '')).includes(field);
}

export async function creditTransaction(
  txnId: string,
  verified: { gatewayRef: string; gatewayPaymentId?: string | null; raw: unknown },
): Promise<{ credited: boolean; paymentId?: string; receiptNo?: string | null }> {
  const txn = await prisma.feePaymentTransaction.findUnique({
    where: { id: txnId },
    include: {
      invoice: {
        select: {
          id: true,
          invoiceNo: true,
          studentId: true,
          dueAmount: true,
          student: { select: { firstName: true, lastName: true, userId: true } },
        },
      },
    },
  });
  if (!txn) return { credited: false };
  if (txn.status === 'SUCCESS' && txn.paymentId) return { credited: false, paymentId: txn.paymentId };

  // Replay protection: a gateway reference (val_id / trxID / issuer ref) may
  // only ever credit ONE transaction. Also enforced by the unique index on
  // gatewayValId (caught below).
  const reusedBy = await prisma.feePaymentTransaction.findFirst({
    where: { gatewayValId: verified.gatewayRef, id: { not: txn.id } },
    select: { id: true },
  });
  if (reusedBy) {
    logger.error('Fee gateway reference already used by another transaction — rejecting replay', {
      txnId: txn.id,
      gatewayRef: verified.gatewayRef,
      reusedByTxnId: reusedBy.id,
    });
    return { credited: false };
  }

  const amount = Number(txn.amount);
  if (amount > Number(txn.invoice.dueAmount) + 0.001) {
    // Money was really taken — record it, but flag it for reconciliation.
    logger.warn('Online fee payment exceeds the invoice due amount at credit time (possible double payment)', {
      txnId: txn.id,
      invoiceId: txn.invoiceId,
      amount,
      dueAmount: Number(txn.invoice.dueAmount),
    });
  }

  const recordedBy = txn.initiatedByUserId ?? txn.invoice.student?.userId ?? 'SYSTEM';

  let payment: { id: string; receiptNo: string | null } | null = null;
  try {
    payment = await withReceiptNumber(txn.institutionId, (receiptNo) =>
      prisma.$transaction(async (tx) => {
        const claim = await tx.feePaymentTransaction.updateMany({
          where: { id: txn.id, status: { not: 'SUCCESS' }, paymentId: null },
          data: {
            status: 'SUCCESS',
            gatewayValId: verified.gatewayRef,
            ...(verified.gatewayPaymentId ? { gatewayPaymentId: verified.gatewayPaymentId } : {}),
            rawResponse: (verified.raw ?? null) as Prisma.InputJsonValue,
          },
        });
        // Lost the race to a concurrent callback for the same transaction.
        if (claim.count !== 1) return null;

        const created = await tx.payment.create({
          data: {
            invoiceId: txn.invoiceId,
            amount: txn.amount,
            method: txn.gateway,
            transactionRef: verified.gatewayRef,
            recordedBy,
            status: 'COMPLETED',
            receiptNo,
            notes: txn.isDemo
              ? `DEMO MODE — simulated ${GATEWAY_LABEL[txn.gateway as FeeGatewayName]} payment, no money was charged (${txn.gatewayTransactionId})`
              : `Online payment via ${GATEWAY_LABEL[txn.gateway as FeeGatewayName]} (${txn.gatewayTransactionId})`,
          },
          select: { id: true, receiptNo: true },
        });

        await FeeRepository.applyPaymentToInvoice(tx, txn.invoiceId, amount);
        await tx.feePaymentTransaction.update({ where: { id: txn.id }, data: { paymentId: created.id } });
        return created;
      }),
    );
  } catch (error) {
    if (isUniqueOn(error, 'gatewayValId')) {
      logger.error('Fee gateway reference replay blocked by unique constraint', { txnId: txn.id, gatewayRef: verified.gatewayRef });
      return { credited: false };
    }
    throw error;
  }

  if (!payment) {
    const current = await prisma.feePaymentTransaction.findUnique({ where: { id: txn.id }, select: { paymentId: true } });
    return { credited: false, paymentId: current?.paymentId ?? undefined };
  }

  logger.info('Online fee payment credited', {
    txnId: txn.id,
    paymentId: payment.id,
    invoiceId: txn.invoiceId,
    gateway: txn.gateway,
    isDemo: txn.isDemo,
  });

  // Same PAYMENT_RECEIVED path as offline payments; contextId = payment id so
  // a duplicate callback can never send a second receipt.
  const studentUserId = txn.invoice.student?.userId ?? (await studentRepository.findUserIdForStudent(txn.institutionId, txn.invoice.studentId));
  const newDue = Math.max(Number(txn.invoice.dueAmount) - amount, 0);
  notifySafe({
    institutionId: txn.institutionId,
    type: 'PAYMENT_RECEIVED',
    recipientUserIds: studentUserId ? [studentUserId] : [],
    contextId: payment.id,
    data: { link: '/fees', invoiceId: txn.invoiceId },
    vars: {
      invoiceNo: txn.invoice.invoiceNo,
      studentName: `${txn.invoice.student?.firstName ?? ''} ${txn.invoice.student?.lastName ?? ''}`.trim(),
      amount: amount.toFixed(2),
      dueAmount: newDue.toFixed(2),
    },
  });

  return { credited: true, paymentId: payment.id, receiptNo: payment.receiptNo };
}

async function applyVerification(
  txn: { id: string; gatewayTransactionId: string; amount: Prisma.Decimal; currency: string },
  verification: GatewayVerifyResult,
) {
  const decision = decideVerification(
    { tranId: txn.gatewayTransactionId, amount: Number(txn.amount), currency: txn.currency },
    verification,
  );
  if (decision.action === 'credit') {
    await creditTransaction(txn.id, {
      gatewayRef: verification.gatewayRef!,
      gatewayPaymentId: verification.gatewayPaymentId ?? null,
      raw: verification.raw,
    });
  } else if (decision.action === 'fail') {
    logger.error('Fee gateway verification failed — marking transaction FAILED', { txnId: txn.id, reason: decision.reason });
    await markTransaction(txn.id, 'FAILED', { reason: decision.reason, gateway: verification.raw ?? null });
  } else {
    logger.warn('Fee gateway callback ignored', { txnId: txn.id, reason: decision.reason });
  }
}

// ── Public gateway callbacks ────────────────────────────────────────────────

export type CallbackKind = 'ipn' | 'success' | 'fail' | 'cancel' | 'callback';

const str = (v: unknown) => (typeof v === 'string' && v.length > 0 ? v : undefined);

/**
 * Handles an unauthenticated gateway callback/IPN. Never throws for "bad"
 * input — it logs and returns the browser redirect target. The payload is
 * only a pointer to a transaction; crediting always re-verifies server-side.
 */
export async function handleGatewayCallback(
  gateway: FeeGatewayName,
  kind: CallbackKind,
  payload: Record<string, unknown>,
): Promise<string> {
  if (!isGatewayLive(gateway)) {
    logger.warn('Fee gateway callback received while the gateway is in demo mode — ignored', { gateway, kind });
    return resultRedirect('failed');
  }

  if (gateway === 'SSLCOMMERZ') return handleSslCommerz(kind, payload);
  if (gateway === 'BKASH') return handleBkash(kind, payload);
  return handleNagad(kind, payload);
}

async function findRealTxn(where: Prisma.FeePaymentTransactionWhereInput) {
  const txn = await prisma.feePaymentTransaction.findFirst({ where: { ...where, isDemo: false } });
  return txn;
}

async function handleSslCommerz(kind: CallbackKind, payload: Record<string, unknown>) {
  const tranId = str(payload.tran_id);
  const valId = str(payload.val_id);
  if (!tranId) {
    logger.warn('SSLCommerz fee callback without tran_id', { kind });
    return resultRedirect('failed');
  }
  const txn = await findRealTxn({ gateway: 'SSLCOMMERZ', gatewayTransactionId: tranId });
  if (!txn) {
    logger.warn('SSLCommerz fee callback for unknown tran_id', { kind, tranId });
    return resultRedirect('failed');
  }

  const cfg = getSslCommerzConfig();
  const signatureOk = cfg ? verifySslCommerzSignature(payload, cfg.storePassword) : null;
  if (signatureOk === false) {
    logger.error('SSLCommerz fee callback signature mismatch — ignored', { kind, tranId });
    return resultRedirect(redirectStatusFor(txn.status), txn.id);
  }

  if (txn.status !== 'SUCCESS') {
    if (valId && (kind === 'ipn' || kind === 'success')) {
      const verification = await SslCommerzFeeAdapter.validateByValId(valId);
      await applyVerification(txn, verification);
    } else if (kind === 'fail' || (kind === 'ipn' && str(payload.status) === 'FAILED')) {
      await markTransaction(txn.id, 'FAILED', { callback: kind, status: payload.status ?? null, error: payload.error ?? null });
    } else if (kind === 'cancel' || (kind === 'ipn' && str(payload.status) === 'CANCELLED')) {
      await markTransaction(txn.id, 'CANCELLED', { callback: kind, status: payload.status ?? null });
    }
  }

  const fresh = await prisma.feePaymentTransaction.findUnique({ where: { id: txn.id }, select: { status: true } });
  return resultRedirect(redirectStatusFor(fresh?.status), txn.id);
}

async function handleBkash(kind: CallbackKind, payload: Record<string, unknown>) {
  const paymentId = str(payload.paymentID);
  const status = str(payload.status)?.toLowerCase();
  if (!paymentId) {
    logger.warn('bKash fee callback without paymentID', { kind });
    return resultRedirect('failed');
  }
  const txn = await findRealTxn({ gateway: 'BKASH', gatewayPaymentId: paymentId });
  if (!txn) {
    logger.warn('bKash fee callback for unknown paymentID', { kind, paymentId });
    return resultRedirect('failed');
  }

  if (txn.status !== 'SUCCESS') {
    if (status === 'success') {
      const verification = await BkashFeeAdapter.executeOrQuery(paymentId);
      await applyVerification(txn, verification);
    } else if (status === 'cancel' || kind === 'cancel') {
      await markTransaction(txn.id, 'CANCELLED', { callback: kind, status });
    } else {
      await markTransaction(txn.id, 'FAILED', { callback: kind, status: status ?? null });
    }
  }

  const fresh = await prisma.feePaymentTransaction.findUnique({ where: { id: txn.id }, select: { status: true } });
  return resultRedirect(redirectStatusFor(fresh?.status), txn.id);
}

async function handleNagad(kind: CallbackKind, payload: Record<string, unknown>) {
  const orderId = str(payload.order_id);
  const paymentRefId = str(payload.payment_ref_id);
  if (!orderId || !paymentRefId) {
    logger.warn('Nagad fee callback missing order_id/payment_ref_id', { kind });
    return resultRedirect('failed');
  }
  const txn = await findRealTxn({ gateway: 'NAGAD', gatewayTransactionId: orderId });
  if (!txn) {
    logger.warn('Nagad fee callback for unknown order_id', { kind, orderId });
    return resultRedirect('failed');
  }
  if (txn.gatewayPaymentId && txn.gatewayPaymentId !== paymentRefId) {
    logger.error('Nagad callback payment_ref_id does not match the transaction — ignored', { txnId: txn.id, paymentRefId });
    return resultRedirect(redirectStatusFor(txn.status), txn.id);
  }

  if (txn.status !== 'SUCCESS') {
    const verification = await NagadFeeAdapter.verifyByReference(paymentRefId);
    const cbStatus = str(payload.status)?.toLowerCase();
    if (verification.reachable && !verification.success && (cbStatus === 'aborted' || cbStatus === 'cancelled' || kind === 'cancel')) {
      await markTransaction(txn.id, 'CANCELLED', { callback: kind, status: cbStatus ?? null, gateway: verification.raw ?? null });
    } else {
      await applyVerification(txn, verification);
    }
  }

  const fresh = await prisma.feePaymentTransaction.findUnique({ where: { id: txn.id }, select: { status: true } });
  return resultRedirect(redirectStatusFor(fresh?.status), txn.id);
}
