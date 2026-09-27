import { FeeGateway, FeeTxnStatus, Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../../config/prisma';

export const ReconciliationQueryDto = z.object({
  from: z.string().refine((v) => !Number.isNaN(Date.parse(v)), 'Invalid from date').optional(),
  to: z.string().refine((v) => !Number.isNaN(Date.parse(v)), 'Invalid to date').optional(),
  gateway: z.enum(['BKASH', 'NAGAD', 'SSLCOMMERZ']).optional(),
  status: z.enum(['INITIATED', 'PENDING', 'SUCCESS', 'FAILED', 'CANCELLED']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type ReconciliationQuery = z.infer<typeof ReconciliationQueryDto>;

export type ReconciliationFlag = 'AMOUNT_MISMATCH' | 'SUCCESS_WITHOUT_PAYMENT' | 'PAYMENT_WITHOUT_SUCCESS' | 'STALE_PENDING';

const STALE_MS = 24 * 60 * 60 * 1000;

/** Pure: reconciliation flags for one transaction row. */
export function reconciliationFlags(
  row: { status: FeeTxnStatus | string; amount: number; createdAt: Date; payment: { amount: number } | null },
  now: Date = new Date(),
): ReconciliationFlag[] {
  const flags: ReconciliationFlag[] = [];
  if (row.payment && Math.abs(row.payment.amount - row.amount) >= 0.01) flags.push('AMOUNT_MISMATCH');
  if (row.status === 'SUCCESS' && !row.payment) flags.push('SUCCESS_WITHOUT_PAYMENT');
  if (row.status !== 'SUCCESS' && row.payment) flags.push('PAYMENT_WITHOUT_SUCCESS');
  if ((row.status === 'INITIATED' || row.status === 'PENDING') && now.getTime() - row.createdAt.getTime() > STALE_MS) {
    flags.push('STALE_PENDING');
  }
  return flags;
}

function dayBoundary(value: string, edge: 'start' | 'end') {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return new Date(`${value}T${edge === 'start' ? '00:00:00.000' : '23:59:59.999'}+06:00`);
  }
  return new Date(value);
}

export async function listReconciliation(tenantId: string, q: ReconciliationQuery) {
  const where: Prisma.FeePaymentTransactionWhereInput = {
    institutionId: tenantId,
    ...(q.gateway ? { gateway: q.gateway as FeeGateway } : {}),
    ...(q.status ? { status: q.status as FeeTxnStatus } : {}),
    ...(q.from || q.to
      ? {
          createdAt: {
            ...(q.from ? { gte: dayBoundary(q.from, 'start') } : {}),
            ...(q.to ? { lte: dayBoundary(q.to, 'end') } : {}),
          },
        }
      : {}),
  };
  const [total, rows, byStatus] = await prisma.$transaction([
    prisma.feePaymentTransaction.count({ where }),
    prisma.feePaymentTransaction.findMany({
      where,
      include: {
        invoice: { select: { id: true, invoiceNo: true, status: true } },
        student: { select: { id: true, firstName: true, lastName: true, studentId: true } },
        payment: { select: { id: true, amount: true, receiptNo: true, paidAt: true, method: true } },
        initiatedBy: { select: { firstName: true, lastName: true, role: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
    }),
    prisma.feePaymentTransaction.groupBy({
      by: ['status', 'isDemo'],
      where,
      orderBy: { status: 'asc' },
      _count: { _all: true },
      _sum: { amount: true },
    }),
  ]);

  const now = new Date();
  const items = rows.map((r) => {
    const payment = r.payment ? { ...r.payment, amount: Number(r.payment.amount) } : null;
    const amount = Number(r.amount);
    return {
      id: r.id,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      gateway: r.gateway,
      status: r.status,
      amount,
      currency: r.currency,
      isDemo: r.isDemo,
      gatewayTransactionId: r.gatewayTransactionId,
      gatewayPaymentId: r.gatewayPaymentId,
      gatewayValId: r.gatewayValId,
      invoice: r.invoice,
      student: r.student,
      payment,
      initiatedBy: r.initiatedBy ? `${r.initiatedBy.firstName} ${r.initiatedBy.lastName}`.trim() : null,
      flags: reconciliationFlags({ status: r.status, amount, createdAt: r.createdAt, payment }, now),
    };
  });

  const summary = {
    total,
    successCount: 0,
    successAmount: 0,
    failedCount: 0,
    pendingCount: 0,
    cancelledCount: 0,
    demoCount: 0,
    issuesOnPage: items.filter((i) => i.flags.length > 0).length,
  };
  for (const g of byStatus) {
    const count = typeof g._count === 'object' && g._count ? (g._count as { _all?: number })._all ?? 0 : 0;
    if (g.isDemo) summary.demoCount += count;
    if (g.status === 'SUCCESS') {
      summary.successCount += count;
      summary.successAmount += Number(g._sum?.amount ?? 0);
    } else if (g.status === 'FAILED') summary.failedCount += count;
    else if (g.status === 'CANCELLED') summary.cancelledCount += count;
    else summary.pendingCount += count;
  }

  return { items, meta: { total, page: q.page, pageSize: q.pageSize }, summary };
}
