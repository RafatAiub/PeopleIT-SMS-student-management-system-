import { Prisma } from '@prisma/client';
import { prisma } from '../../../config/prisma';
import { BadRequestError, ConflictError, NotFoundError } from '../../../utils/AppError';
import { FeeRepository } from '../fee.repository';
import { appliedAmountOf, fromPaisa, refundableAmount, statusFor, toPaisa } from './studentFees.logic';
import { dec, isUniqueViolation, num, writeAudit, type FeeCtx, type Tx } from './studentFees.shared';
import type { RefundDtoType } from './studentFees.dto';
import { storedMethod } from './studentFees.counter';

// =============================================================================
// Cancel an unpaid invoice, reverse a payment (ADMIN), record a refund, waive
// a late fine (ADMIN). Each runs in one transaction with the invoice (and
// payment) rows locked, writes a history row and an audit entry.
// =============================================================================

// ── Cancel ──────────────────────────────────────────────────────────────────

export async function cancelInvoice(ctx: FeeCtx, invoiceId: string, reason: string) {
  return prisma.$transaction(async (tx) => {
    const locked = await FeeRepository.lockInvoiceForUpdate(tx, ctx.institutionId, invoiceId);
    if (!locked) throw new NotFoundError('Invoice not found');
    if (locked.status === 'CANCELLED') throw new BadRequestError('Invoice is already cancelled');
    if (toPaisa(num(locked.paidAmount as number)) > 0 || locked.status === 'PAID') {
      throw new BadRequestError('This invoice has payments — reverse them first, then cancel');
    }
    const pending = await tx.feePaymentTransaction.count({ where: { invoiceId, status: { in: ['INITIATED', 'PENDING'] } } });
    if (pending > 0) throw new ConflictError('An online payment for this invoice is still in progress');

    const inv = await tx.invoice.findUniqueOrThrow({ where: { id: invoiceId }, select: { studentId: true, notes: true, dueAmount: true, invoiceNo: true } });
    const updated = await tx.invoice.update({
      where: { id: invoiceId },
      data: {
        status: 'CANCELLED',
        dueAmount: dec(0),
        notes: `${inv.notes ? `${inv.notes}\n` : ''}Cancelled: ${reason}`.slice(0, 2000),
      },
    });
    // Release the billing month so it can be generated again.
    await tx.invoicePeriod.updateMany({ where: { invoiceId }, data: { activeKey: null } });
    await tx.feeAdjustment.create({
      data: { institutionId: ctx.institutionId, invoiceId, studentId: inv.studentId, kind: 'CANCEL', amount: inv.dueAmount, reason, actorUserId: ctx.userId },
    });
    await writeAudit(tx, {
      institutionId: ctx.institutionId,
      userId: ctx.userId,
      action: 'UPDATE',
      resource: 'Invoice',
      resourceId: invoiceId,
      metadata: { cancel: true, invoiceNo: inv.invoiceNo, due: num(inv.dueAmount), reason },
    });
    return { id: updated.id, status: updated.status };
  });
}

// ── Reverse a payment ───────────────────────────────────────────────────────

async function lockPayment(tx: Tx, institutionId: string, paymentId: string) {
  const rows = await tx.$queryRaw<Array<{ id: string; invoiceId: string; amount: Prisma.Decimal; status: string; notes: string | null; method: string }>>`
    SELECT p."id", p."invoiceId", p."amount", p."status", p."notes", p."method"
    FROM "Payment" p JOIN "Invoice" i ON i."id" = p."invoiceId"
    WHERE p."id" = ${paymentId} AND i."institutionId" = ${institutionId}
    FOR UPDATE OF p`;
  return rows[0] ?? null;
}

export async function reversePayment(ctx: FeeCtx, paymentId: string, reason: string, now: Date = new Date()) {
  try {
    return await prisma.$transaction(async (tx) => {
      const pay = await lockPayment(tx, ctx.institutionId, paymentId);
      if (!pay) throw new NotFoundError('Payment not found');
      if (pay.status === 'REVERSED') throw new BadRequestError('This payment is already reversed');
      if (pay.status !== 'COMPLETED') throw new BadRequestError('Only a completed payment can be reversed');
      const locked = await FeeRepository.lockInvoiceForUpdate(tx, ctx.institutionId, pay.invoiceId);
      if (!locked) throw new NotFoundError('Invoice not found');
      const inv = await tx.invoice.findUniqueOrThrow({ where: { id: pay.invoiceId }, select: { studentId: true, invoiceNo: true, dueDate: true } });

      const applied = appliedAmountOf({ amount: num(pay.amount), notes: pay.notes }, num(locked.paidAmount as number));
      const paid = fromPaisa(toPaisa(num(locked.paidAmount as number)) - toPaisa(applied));
      const next = statusFor({
        status: locked.status === 'CANCELLED' ? 'CANCELLED' : 'UNPAID',
        totalAmount: num(locked.totalAmount as number),
        paidAmount: paid,
        dueDate: inv.dueDate,
      }, now);

      await tx.payment.update({ where: { id: paymentId }, data: { status: 'REVERSED', notes: `${pay.notes ? `${pay.notes} ` : ''}[REVERSED: ${reason}]`.slice(0, 2000) } });
      await tx.invoice.update({ where: { id: pay.invoiceId }, data: { paidAmount: dec(paid), dueAmount: dec(next.dueAmount), status: next.status } });
      const reversal = await tx.paymentReversal.create({
        data: {
          institutionId: ctx.institutionId,
          paymentId,
          invoiceId: pay.invoiceId,
          studentId: inv.studentId,
          amount: pay.amount,
          appliedAmount: dec(applied),
          reason,
          reversedByUserId: ctx.userId,
        },
      });
      await writeAudit(tx, {
        institutionId: ctx.institutionId,
        userId: ctx.userId,
        action: 'UPDATE',
        resource: 'Payment',
        resourceId: paymentId,
        metadata: { reverse: true, invoiceNo: inv.invoiceNo, amount: num(pay.amount), applied, reason },
      });
      return {
        reversalId: reversal.id,
        paymentId,
        invoiceId: pay.invoiceId,
        invoiceStatus: next.status,
        dueAmount: next.dueAmount,
        refundable: num(pay.amount),
        gateway: ['BKASH', 'NAGAD', 'SSLCOMMERZ'].includes(pay.method),
      };
    });
  } catch (error) {
    if (isUniqueViolation(error, 'paymentId')) throw new BadRequestError('This payment is already reversed');
    throw error;
  }
}

// ── Refunds ─────────────────────────────────────────────────────────────────

async function refundedSoFar(db: Tx | typeof prisma, paymentId: string) {
  const agg = await db.feeRefund.aggregate({ where: { paymentId }, _sum: { amount: true } });
  return num(agg._sum.amount);
}

/** What can still be refunded on a payment, plus the refunds already made. */
export async function refundInfo(institutionId: string, paymentId: string) {
  const pay = await prisma.payment.findFirst({
    where: { id: paymentId, invoice: { institutionId } },
    select: { id: true, amount: true, status: true, notes: true, method: true, receiptNo: true, invoiceId: true, reversal: { select: { reason: true, createdAt: true, appliedAmount: true } } },
  });
  if (!pay) throw new NotFoundError('Payment not found');
  const refunds = await prisma.feeRefund.findMany({ where: { institutionId, paymentId }, orderBy: { createdAt: 'desc' } });
  const sum = refunds.reduce((a, r) => a + toPaisa(num(r.amount)), 0);
  return {
    paymentId,
    receiptNo: pay.receiptNo,
    status: pay.status,
    amount: num(pay.amount),
    gateway: ['BKASH', 'NAGAD', 'SSLCOMMERZ'].includes(pay.method),
    reversal: pay.reversal ? { ...pay.reversal, appliedAmount: num(pay.reversal.appliedAmount) } : null,
    refundable: refundableAmount({ amount: num(pay.amount), status: pay.status, notes: pay.notes }, fromPaisa(sum)),
    refunds: refunds.map((r) => ({ ...r, amount: num(r.amount) })),
  };
}

export async function recordRefund(ctx: FeeCtx, paymentId: string, dto: RefundDtoType) {
  return prisma.$transaction(async (tx) => {
    const pay = await lockPayment(tx, ctx.institutionId, paymentId);
    if (!pay) throw new NotFoundError('Payment not found');
    const already = await refundedSoFar(tx, paymentId);
    const refundable = refundableAmount({ amount: num(pay.amount), status: pay.status, notes: pay.notes }, already);
    if (toPaisa(refundable) <= 0) {
      throw new BadRequestError(pay.status === 'REVERSED' ? 'This payment is already fully refunded' : 'Nothing to refund — reverse the payment first, or it has no overpayment');
    }
    if (toPaisa(dto.amount) > toPaisa(refundable)) throw new BadRequestError(`You can refund at most ${refundable.toFixed(2)}`);
    const inv = await tx.invoice.findUniqueOrThrow({ where: { id: pay.invoiceId }, select: { studentId: true, invoiceNo: true } });
    const refund = await tx.feeRefund.create({
      data: {
        institutionId: ctx.institutionId,
        studentId: inv.studentId,
        invoiceId: pay.invoiceId,
        paymentId,
        source: pay.status === 'REVERSED' ? 'REVERSAL' : 'OVERPAYMENT',
        amount: dec(dto.amount),
        method: storedMethod(dto.method),
        reference: dto.reference ?? null,
        reason: dto.reason,
        recordedByUserId: ctx.userId,
      },
    });
    await writeAudit(tx, {
      institutionId: ctx.institutionId,
      userId: ctx.userId,
      action: 'PAYMENT',
      resource: 'FeeRefund',
      resourceId: refund.id,
      metadata: { paymentId, invoiceNo: inv.invoiceNo, amount: dto.amount, method: dto.method, reference: dto.reference ?? null, reason: dto.reason },
    });
    return { ...refund, amount: num(refund.amount), remaining: fromPaisa(toPaisa(refundable) - toPaisa(dto.amount)) };
  });
}

// ── Fine waiver ─────────────────────────────────────────────────────────────

export async function waiveFine(ctx: FeeCtx, invoiceId: string, fineId: string, dto: { reason: string; stopFuture: boolean }, now: Date = new Date()) {
  return prisma.$transaction(async (tx) => {
    const locked = await FeeRepository.lockInvoiceForUpdate(tx, ctx.institutionId, invoiceId);
    if (!locked) throw new NotFoundError('Invoice not found');
    const fine = await tx.invoiceFine.findFirst({ where: { id: fineId, invoiceId, institutionId: ctx.institutionId } });
    if (!fine || fine.fineKey === 'STOP') throw new NotFoundError('Fine not found');
    const open = toPaisa(num(fine.amount)) - toPaisa(num(fine.waivedAmount));
    const due = toPaisa(num(locked.totalAmount as number)) - toPaisa(num(locked.paidAmount as number));
    const waive = Math.max(0, Math.min(open, due));
    if (waive <= 0 && !dto.stopFuture) throw new BadRequestError('Nothing left to waive on this fine (it is already paid or waived)');

    if (waive > 0) {
      if (fine.invoiceItemId) {
        const item = await tx.invoiceItem.findUnique({ where: { id: fine.invoiceItemId } });
        if (item) {
          const discount = toPaisa(num(item.discount)) + waive;
          await tx.invoiceItem.update({
            where: { id: item.id },
            data: { discount: dec(fromPaisa(discount)), netAmount: dec(fromPaisa(toPaisa(num(item.amount)) - discount)), description: item.description.includes('(waived)') ? item.description : `${item.description} (waived)` },
          });
        }
      }
      const inv = await tx.invoice.findUniqueOrThrow({ where: { id: invoiceId }, select: { dueDate: true } });
      const total = fromPaisa(toPaisa(num(locked.totalAmount as number)) - waive);
      const next = statusFor({ status: locked.status, totalAmount: total, paidAmount: num(locked.paidAmount as number), dueDate: inv.dueDate }, now);
      await tx.invoice.update({ where: { id: invoiceId }, data: { totalAmount: dec(total), dueAmount: dec(next.dueAmount), status: next.status } });
      await tx.invoiceFine.update({
        where: { id: fineId },
        data: { waivedAmount: dec(fromPaisa(toPaisa(num(fine.waivedAmount)) + waive)), waivedAt: new Date(), waivedByUserId: ctx.userId, waiveReason: dto.reason },
      });
    }
    if (dto.stopFuture) {
      await tx.invoiceFine.upsert({
        where: { invoiceId_fineKey: { invoiceId, fineKey: 'STOP' } },
        create: { institutionId: ctx.institutionId, invoiceId, fineKey: 'STOP', amount: dec(0), waivedAt: new Date(), waivedByUserId: ctx.userId, waiveReason: dto.reason },
        update: {},
      });
    }
    const student = await tx.invoice.findUniqueOrThrow({ where: { id: invoiceId }, select: { studentId: true } });
    await tx.feeAdjustment.create({
      data: { institutionId: ctx.institutionId, invoiceId, studentId: student.studentId, kind: 'FINE_WAIVER', amount: dec(fromPaisa(waive)), reason: dto.reason, actorUserId: ctx.userId },
    });
    await writeAudit(tx, {
      institutionId: ctx.institutionId,
      userId: ctx.userId,
      action: 'UPDATE',
      resource: 'InvoiceFine',
      resourceId: fineId,
      metadata: { invoiceId, waived: fromPaisa(waive), stopFuture: dto.stopFuture, reason: dto.reason },
    });
    return { waived: fromPaisa(waive), stopFuture: dto.stopFuture };
  });
}

/** Staff view of an invoice's money history: fines, adjustments, reversals, refunds. */
export async function invoiceHistory(institutionId: string, invoiceId: string) {
  const inv = await prisma.invoice.findFirst({ where: { id: invoiceId, institutionId }, select: { id: true } });
  if (!inv) throw new NotFoundError('Invoice not found');
  const [fines, adjustments, reversals, refunds] = await Promise.all([
    prisma.invoiceFine.findMany({ where: { invoiceId }, orderBy: { createdAt: 'asc' } }),
    prisma.feeAdjustment.findMany({ where: { invoiceId, institutionId }, orderBy: { createdAt: 'asc' } }),
    prisma.paymentReversal.findMany({ where: { invoiceId, institutionId }, orderBy: { createdAt: 'asc' } }),
    prisma.feeRefund.findMany({ where: { invoiceId, institutionId }, orderBy: { createdAt: 'asc' } }),
  ]);
  const n = <T extends { amount: Prisma.Decimal }>(r: T) => ({ ...r, amount: num(r.amount) });
  return {
    fines: fines.filter((f) => f.fineKey !== 'STOP').map((f) => ({ ...n(f), waivedAmount: num(f.waivedAmount) })),
    finesStopped: fines.some((f) => f.fineKey === 'STOP'),
    adjustments: adjustments.map(n),
    reversals: reversals.map((r) => ({ ...n(r), appliedAmount: num(r.appliedAmount) })),
    refunds: refunds.map(n),
  };
}
