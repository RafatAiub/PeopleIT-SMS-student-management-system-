import { Prisma } from '@prisma/client';
import { prisma } from '../../../config/prisma';
import { BadRequestError, NotFoundError } from '../../../utils/AppError';
import { notifySafe } from '../../notifications/notifications.service';
import { FeeRepository } from '../fee.repository';
import { withReceiptNumbers } from '../../families/families.payments';
import {
  allocateOldestFirst,
  dhakaDate,
  dhakaParts,
  fromPaisa,
  isPayable,
  periodLabel,
  periodOf,
  sortOldestFirst,
  spreadDiscount,
  statusFor,
  toPaisa,
} from './studentFees.logic';
import { dec, num, writeAudit, type FeeCtx, type Tx } from './studentFees.shared';
import type { CollectDtoType } from './studentFees.dto';

// =============================================================================
// Collect-fee counter: find a student fast, see every unpaid month, take one
// payment (split oldest-first or as picked) with an optional counter
// discount, all in ONE transaction with the invoice rows locked (P0 pattern),
// and hand back receipt numbers to print at once.
// =============================================================================

/** Counter method → stored Payment.method (BANK keeps the existing BANK_TRANSFER name). */
export const storedMethod = (m: string) => (m === 'BANK' ? 'BANK_TRANSFER' : m);

const OPEN = { notIn: ['PAID', 'CANCELLED'] };

async function dueByStudent(institutionId: string, studentIds: string[]) {
  if (studentIds.length === 0) return new Map<string, number>();
  const rows = await prisma.invoice.groupBy({
    by: ['studentId'],
    where: { institutionId, studentId: { in: studentIds }, status: OPEN, deletedAt: null },
    _sum: { dueAmount: true },
  });
  return new Map(rows.map((r) => [r.studentId, num(r._sum.dueAmount)]));
}

const studentSelect = {
  id: true,
  firstName: true,
  lastName: true,
  studentId: true,
  rollNumber: true,
  phone: true,
  status: true,
  avatarUrl: true,
  class: { select: { name: true } },
  section: { select: { name: true } },
} satisfies Prisma.StudentSelect;

type StudentHit = Prisma.StudentGetPayload<{ select: typeof studentSelect }>;

const hitView = (s: StudentHit, due: number, matchedBy: string, guardianName?: string) => ({
  id: s.id,
  name: `${s.firstName} ${s.lastName}`.trim(),
  studentId: s.studentId,
  rollNumber: s.rollNumber,
  className: s.class?.name ?? null,
  sectionName: s.section?.name ?? null,
  status: s.status,
  avatarUrl: s.avatarUrl,
  totalDue: due,
  matchedBy,
  guardianName: guardianName ?? null,
});

/** Name / student ID / roll / phone; a guardian phone returns all their children (siblings). */
export async function searchStudents(institutionId: string, q: string) {
  const text = q.trim();
  const digits = text.replace(/\D/g, '');
  const phoneFrag = digits.length >= 6 ? digits.slice(-10) : null;
  const tokens = text.split(/\s+/).filter(Boolean).slice(0, 4);

  const or: Prisma.StudentWhereInput[] = [
    { studentId: { contains: text, mode: 'insensitive' } },
    { rollNumber: text },
    {
      AND: tokens.map((t) => ({
        OR: [{ firstName: { contains: t, mode: 'insensitive' as const } }, { lastName: { contains: t, mode: 'insensitive' as const } }],
      })),
    },
  ];
  if (phoneFrag) or.push({ phone: { contains: phoneFrag } });

  const [direct, guardians] = await Promise.all([
    prisma.student.findMany({ where: { institutionId, OR: or }, select: studentSelect, take: 20, orderBy: [{ status: 'asc' }, { firstName: 'asc' }] }),
    phoneFrag
      ? prisma.guardian.findMany({
          where: { institutionId, OR: [{ phone: { contains: phoneFrag } }, { emergencyPhone: { contains: phoneFrag } }] },
          select: { firstName: true, lastName: true, students: { select: { student: { select: studentSelect } } } },
          take: 5,
        })
      : Promise.resolve([]),
  ]);

  const seen = new Set<string>();
  const hits: Array<{ s: StudentHit; matchedBy: string; guardianName?: string }> = [];
  for (const g of guardians) {
    for (const link of g.students) {
      if (!link.student || seen.has(link.student.id)) continue;
      seen.add(link.student.id);
      hits.push({ s: link.student, matchedBy: 'GUARDIAN_PHONE', guardianName: `${g.firstName} ${g.lastName}`.trim() });
    }
  }
  for (const s of direct) {
    if (seen.has(s.id)) continue;
    seen.add(s.id);
    hits.push({ s, matchedBy: phoneFrag && s.phone?.includes(phoneFrag) ? 'PHONE' : 'STUDENT' });
  }
  const dues = await dueByStudent(institutionId, hits.map((h) => h.s.id));
  return hits.slice(0, 25).map((h) => hitView(h.s, dues.get(h.s.id) ?? 0, h.matchedBy, h.guardianName));
}

/** Other students sharing a guardian or a family with this one. */
export async function siblingIds(institutionId: string, studentId: string): Promise<string[]> {
  const [links, fam] = await Promise.all([
    prisma.guardianStudent.findMany({ where: { studentId }, select: { guardianId: true } }),
    prisma.familyStudent.findFirst({ where: { studentId, institutionId }, select: { familyId: true } }),
  ]);
  const ids = new Set<string>();
  if (links.length) {
    const others = await prisma.guardianStudent.findMany({
      where: { guardianId: { in: links.map((l) => l.guardianId) }, studentId: { not: studentId } },
      select: { studentId: true },
    });
    others.forEach((o) => ids.add(o.studentId));
  }
  if (fam) {
    const others = await prisma.familyStudent.findMany({ where: { familyId: fam.familyId, studentId: { not: studentId } }, select: { studentId: true } });
    others.forEach((o) => ids.add(o.studentId));
  }
  if (ids.size === 0) return [];
  // Tenant check + hide trashed.
  const valid = await prisma.student.findMany({ where: { id: { in: [...ids] }, institutionId }, select: { id: true } });
  return valid.map((v) => v.id);
}

const invoiceSelect = {
  id: true,
  invoiceNo: true,
  studentId: true,
  totalAmount: true,
  paidAmount: true,
  dueAmount: true,
  dueDate: true,
  status: true,
  createdAt: true,
  notes: true,
  feePeriod: { select: { period: true, kind: true } },
  items: { select: { id: true, description: true, amount: true, discount: true, netAmount: true, feeCategoryId: true } },
  fines: { select: { id: true, fineKey: true, amount: true, waivedAmount: true } },
} satisfies Prisma.InvoiceSelect;

type InvoiceRow = Prisma.InvoiceGetPayload<{ select: typeof invoiceSelect }>;

export function invoiceView(i: InvoiceRow) {
  const period = i.feePeriod?.period ?? null;
  return {
    id: i.id,
    invoiceNo: i.invoiceNo,
    studentId: i.studentId,
    period,
    monthLabel: period ? periodLabel(period) : null,
    totalAmount: num(i.totalAmount),
    paidAmount: num(i.paidAmount),
    dueAmount: num(i.dueAmount),
    dueDate: i.dueDate,
    status: i.status,
    createdAt: i.createdAt,
    notes: i.notes,
    items: i.items.map((it) => ({ ...it, amount: num(it.amount), discount: num(it.discount), netAmount: num(it.netAmount) })),
    fineTotal: fromPaisa(i.fines.filter((f) => f.fineKey !== 'STOP').reduce((a, f) => a + toPaisa(num(f.amount)) - toPaisa(num(f.waivedAmount)), 0)),
  };
}

/** Everything the counter shows for one student: unpaid months, siblings, recent receipts. */
export async function studentDues(institutionId: string, studentId: string) {
  const student = await prisma.student.findFirst({
    where: { id: studentId, institutionId },
    select: {
      ...studentSelect,
      guardians: { select: { isPrimary: true, guardian: { select: { firstName: true, lastName: true, phone: true } } } },
    },
  });
  if (!student) throw new NotFoundError('Student not found');
  const sibIds = await siblingIds(institutionId, studentId);

  const [invoices, siblings, payments] = await Promise.all([
    prisma.invoice.findMany({ where: { institutionId, studentId, status: OPEN, dueAmount: { gt: 0 } }, select: invoiceSelect }),
    sibIds.length ? prisma.student.findMany({ where: { id: { in: sibIds }, institutionId }, select: studentSelect }) : Promise.resolve([]),
    prisma.payment.findMany({
      where: { invoice: { institutionId, studentId } },
      select: { id: true, invoiceId: true, amount: true, method: true, paidAt: true, receiptNo: true, status: true, transactionRef: true, invoice: { select: { invoiceNo: true } } },
      orderBy: { paidAt: 'desc' },
      take: 10,
    }),
  ]);
  const sibDues = await dueByStudent(institutionId, sibIds);
  const views = sortOldestFirst(invoices.map(invoiceView));
  const primary = student.guardians.find((g) => g.isPrimary) ?? student.guardians[0];

  return {
    student: {
      ...hitView(student, 0, 'STUDENT'),
      guardianName: primary ? `${primary.guardian.firstName} ${primary.guardian.lastName}`.trim() : null,
      guardianPhone: primary?.guardian.phone ?? null,
    },
    invoices: views,
    totalDue: fromPaisa(views.reduce((a, v) => a + toPaisa(v.dueAmount), 0)),
    siblings: siblings.map((s) => hitView(s, sibDues.get(s.id) ?? 0, 'SIBLING')),
    recentPayments: payments.map((p) => ({ ...p, amount: num(p.amount), invoiceNo: p.invoice.invoiceNo, invoice: undefined })),
  };
}

// ── Collect ─────────────────────────────────────────────────────────────────

/** Applies a counter discount to one LOCKED invoice: spread over its lines, total and due reduced. */
async function applyDiscountTx(tx: Tx, ctx: FeeCtx, invoiceId: string, amount: number, reason: string) {
  const inv = await tx.invoice.findUniqueOrThrow({ where: { id: invoiceId }, select: { id: true, studentId: true, status: true, totalAmount: true, paidAmount: true, dueDate: true } });
  if (!isPayable({ dueAmount: num(inv.totalAmount) - num(inv.paidAmount), status: inv.status })) {
    throw new BadRequestError('A discount can only be given on an unpaid invoice');
  }
  const due = toPaisa(num(inv.totalAmount)) - toPaisa(num(inv.paidAmount));
  if (toPaisa(amount) > due) throw new BadRequestError('The discount is more than the invoice due');
  const items = await tx.invoiceItem.findMany({ where: { invoiceId }, orderBy: { id: 'asc' } });
  const extra = spreadDiscount(items.map((i) => ({ amount: num(i.amount), discount: num(i.discount) })), amount);
  for (const [k, it] of items.entries()) {
    if (toPaisa(extra[k]) <= 0) continue;
    const discount = fromPaisa(toPaisa(num(it.discount)) + toPaisa(extra[k]));
    await tx.invoiceItem.update({
      where: { id: it.id },
      data: { discount: dec(discount), netAmount: dec(fromPaisa(toPaisa(num(it.amount)) - toPaisa(discount))) },
    });
  }
  const applied = fromPaisa(extra.reduce((a, e) => a + toPaisa(e), 0));
  const total = fromPaisa(toPaisa(num(inv.totalAmount)) - toPaisa(applied));
  const next = statusFor({ status: inv.status, totalAmount: total, paidAmount: num(inv.paidAmount), dueDate: inv.dueDate });
  await tx.invoice.update({ where: { id: invoiceId }, data: { totalAmount: dec(total), dueAmount: dec(next.dueAmount), status: next.status } });
  await tx.feeAdjustment.create({
    data: { institutionId: ctx.institutionId, invoiceId, studentId: inv.studentId, kind: 'COUNTER_DISCOUNT', amount: dec(applied), reason, actorUserId: ctx.userId },
  });
  await writeAudit(tx, {
    institutionId: ctx.institutionId,
    userId: ctx.userId,
    action: 'UPDATE',
    resource: 'Invoice',
    resourceId: invoiceId,
    metadata: { counterDiscount: applied, reason },
  });
  return applied;
}

/** Locks every touched invoice in id order (no deadlocks between two cashiers). */
async function lockAll(tx: Tx, institutionId: string, ids: string[]) {
  const sorted = [...new Set(ids)].sort();
  for (const id of sorted) {
    const row = await FeeRepository.lockInvoiceForUpdate(tx, institutionId, id);
    if (!row) throw new NotFoundError('Invoice not found');
  }
}

export async function collect(ctx: FeeCtx, dto: CollectDtoType) {
  const student = await prisma.student.findFirst({ where: { id: dto.studentId, institutionId: ctx.institutionId }, select: { id: true } });
  if (!student) throw new NotFoundError('Student not found');
  const allowed = new Set([dto.studentId, ...(await siblingIds(ctx.institutionId, dto.studentId))]);

  const explicit = dto.allocations ?? [];
  const discounts = dto.discounts ?? [];
  if (new Set(explicit.map((a) => a.invoiceId)).size !== explicit.length) throw new BadRequestError('An invoice appears twice');
  if (new Set(discounts.map((d) => d.invoiceId)).size !== discounts.length) throw new BadRequestError('An invoice has two discounts');

  const candidateIds = explicit.length
    ? explicit.map((a) => a.invoiceId)
    : dto.invoiceIds?.length
      ? dto.invoiceIds
      : null;
  const invoices = await prisma.invoice.findMany({
    where: {
      institutionId: ctx.institutionId,
      ...(candidateIds ? { id: { in: [...new Set([...candidateIds, ...discounts.map((d) => d.invoiceId)])] } } : { studentId: dto.studentId, status: OPEN }),
    },
    select: { id: true, invoiceNo: true, studentId: true, dueAmount: true, dueDate: true, status: true, feePeriod: { select: { period: true } }, student: { select: { firstName: true, lastName: true, userId: true } } },
  });
  if (candidateIds && invoices.length !== new Set([...candidateIds, ...discounts.map((d) => d.invoiceId)]).size) {
    throw new NotFoundError('Invoice not found');
  }
  if (invoices.some((i) => !allowed.has(i.studentId))) throw new BadRequestError('Invoices must belong to this student or a sibling');
  for (const d of discounts) {
    if (!invoices.some((i) => i.id === d.invoiceId)) throw new BadRequestError('A discounted invoice is not in this payment');
  }

  const discountOf = new Map(discounts.map((d) => [d.invoiceId, d.amount]));
  const plan = (rows: Array<{ id: string; dueAmount: number; dueDate: Date; status: string; period?: string | null }>) => {
    const effective = rows.map((r) => ({ ...r, dueAmount: fromPaisa(toPaisa(r.dueAmount) - toPaisa(discountOf.get(r.id) ?? 0)) }));
    if (explicit.length) {
      for (const a of explicit) {
        const inv = effective.find((r) => r.id === a.invoiceId);
        if (!inv || !isPayable(inv)) throw new BadRequestError('An invoice is already paid or cancelled');
        if (toPaisa(a.amount) > toPaisa(inv.dueAmount)) throw new BadRequestError('Payment amount exceeds invoice due amount');
      }
      return explicit.map((a) => ({ invoiceId: a.invoiceId, amount: fromPaisa(toPaisa(a.amount)) }));
    }
    if (dto.amount === undefined) return [];
    try {
      return allocateOldestFirst(dto.amount, effective);
    } catch (e) {
      throw new BadRequestError((e as Error).message);
    }
  };
  const pre = plan(invoices.map((i) => ({ id: i.id, dueAmount: num(i.dueAmount), dueDate: i.dueDate, status: i.status, period: i.feePeriod?.period ?? null })));
  if (pre.length === 0 && discounts.length === 0) throw new BadRequestError('Nothing to collect');
  const touched = [...new Set([...pre.map((p) => p.invoiceId), ...discounts.map((d) => d.invoiceId)])];
  const method = storedMethod(dto.method);

  const run = (receiptNos: string[]) =>
    prisma.$transaction(
      async (tx) => {
        await lockAll(tx, ctx.institutionId, touched);
        let discountTotal = 0;
        for (const d of discounts) {
          discountTotal += toPaisa(await applyDiscountTx(tx, ctx, d.invoiceId, d.amount, dto.discountReason ?? 'Counter discount'));
        }
        // Re-plan on the locked, discounted numbers; any change since the
        // cashier looked means a reload, never a silent different split.
        const fresh = await tx.invoice.findMany({
          where: { id: { in: invoices.map((i) => i.id) } },
          select: { id: true, totalAmount: true, paidAmount: true, dueDate: true, status: true, feePeriod: { select: { period: true } } },
        });
        discountOf.clear(); // discounts are now inside the totals
        const again = plan(
          fresh.map((f) => ({
            id: f.id,
            dueAmount: fromPaisa(Math.max(0, toPaisa(num(f.totalAmount)) - toPaisa(num(f.paidAmount)))),
            dueDate: f.dueDate,
            status: f.status,
            period: f.feePeriod?.period ?? null,
          })),
        );
        const same = again.length === pre.length && again.every((a, k) => a.invoiceId === pre[k].invoiceId && toPaisa(a.amount) === toPaisa(pre[k].amount));
        if (!same) throw new BadRequestError('The dues changed while you were collecting — reload and try again');

        const out: Array<{ paymentId: string; receiptNo: string | null; invoiceId: string; invoiceNo: string; amount: number; dueAfter: number }> = [];
        for (const [k, a] of pre.entries()) {
          const locked = await FeeRepository.lockInvoiceForUpdate(tx, ctx.institutionId, a.invoiceId);
          if (!locked) throw new NotFoundError('Invoice not found');
          FeeRepository.assertPaymentFits(locked, a.amount);
          const p = await tx.payment.create({
            data: {
              invoiceId: a.invoiceId,
              amount: dec(a.amount),
              method,
              transactionRef: dto.reference || null,
              notes: dto.notes ? `Counter: ${dto.notes}` : 'Counter',
              recordedBy: ctx.userId,
              status: 'COMPLETED',
              receiptNo: receiptNos[k],
            },
            select: { id: true, receiptNo: true },
          });
          const updated = await FeeRepository.applyPaymentToInvoice(tx, a.invoiceId, a.amount);
          const inv = invoices.find((i) => i.id === a.invoiceId)!;
          out.push({ paymentId: p.id, receiptNo: p.receiptNo, invoiceId: a.invoiceId, invoiceNo: inv.invoiceNo, amount: a.amount, dueAfter: num(updated.dueAmount) });
        }
        await writeAudit(tx, {
          institutionId: ctx.institutionId,
          userId: ctx.userId,
          action: 'PAYMENT',
          resource: 'FeeCounter',
          resourceId: dto.studentId,
          metadata: {
            method,
            reference: dto.reference ?? null,
            total: fromPaisa(pre.reduce((s, p) => s + toPaisa(p.amount), 0)),
            discount: fromPaisa(discountTotal),
            payments: out.map((o) => ({ paymentId: o.paymentId, invoiceId: o.invoiceId, amount: o.amount })),
          },
        });
        return { payments: out, discountTotal: fromPaisa(discountTotal) };
      },
      { timeout: 30_000, maxWait: 10_000 },
    );

  const result = pre.length > 0 ? await withReceiptNumbers(ctx.institutionId, pre.length, run) : await run([]);

  for (const p of result.payments) {
    const inv = invoices.find((i) => i.id === p.invoiceId)!;
    notifySafe({
      institutionId: ctx.institutionId,
      type: 'PAYMENT_RECEIVED',
      recipientUserIds: inv.student.userId ? [inv.student.userId] : [],
      contextId: p.paymentId,
      data: { link: '/fees', invoiceId: p.invoiceId },
      vars: {
        invoiceNo: inv.invoiceNo,
        studentName: `${inv.student.firstName} ${inv.student.lastName}`.trim(),
        amount: p.amount.toFixed(2),
        dueAmount: p.dueAfter.toFixed(2),
      },
    });
  }
  return {
    payments: result.payments,
    total: fromPaisa(result.payments.reduce((s, p) => s + toPaisa(p.amount), 0)),
    discountTotal: result.discountTotal,
  };
}

/** The cashier's own collections for today (Asia/Dhaka). */
export async function myCollectionsToday(ctx: FeeCtx, now: Date = new Date()) {
  const p = dhakaParts(now);
  const start = dhakaDate(periodOf(now), p.day);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  const where: Prisma.PaymentWhereInput = {
    recordedBy: ctx.userId,
    status: 'COMPLETED',
    paidAt: { gte: start, lt: end },
    invoice: { institutionId: ctx.institutionId },
  };
  const [agg, byMethod, recent] = await Promise.all([
    prisma.payment.aggregate({ where, _sum: { amount: true }, _count: true }),
    prisma.payment.groupBy({ by: ['method'], where, _sum: { amount: true }, _count: true }),
    prisma.payment.findMany({
      where,
      select: { id: true, amount: true, method: true, paidAt: true, receiptNo: true, invoice: { select: { id: true, invoiceNo: true, student: { select: { firstName: true, lastName: true, studentId: true } } } } },
      orderBy: { paidAt: 'desc' },
      take: 20,
    }),
  ]);
  return {
    date: start,
    total: num(agg._sum.amount),
    count: agg._count,
    byMethod: byMethod.map((m) => ({ method: m.method, total: num(m._sum.amount), count: m._count })),
    recent: recent.map((r) => ({
      id: r.id,
      amount: num(r.amount),
      method: r.method,
      paidAt: r.paidAt,
      receiptNo: r.receiptNo,
      invoiceId: r.invoice.id,
      invoiceNo: r.invoice.invoiceNo,
      studentName: `${r.invoice.student.firstName} ${r.invoice.student.lastName}`.trim(),
      studentCode: r.invoice.student.studentId,
    })),
  };
}
