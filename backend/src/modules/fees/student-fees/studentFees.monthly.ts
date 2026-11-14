import { Prisma } from '@prisma/client';
import { prisma } from '../../../config/prisma';
import { logger } from '../../../utils/logger';
import { NotFoundError } from '../../../utils/AppError';
import { notifySafe } from '../../notifications/notifications.service';
import { scheduleFeeDueReminders } from '../../../queues/reminderQueue';
import { FeeRepository } from '../fee.repository';
import { allocateInvoiceNumbers, isInvoiceNoCollision } from '../bulk/bulk.service';
import { applyConcessions, type ConcessionRule } from '../concessions/concession.calc';
import { getActiveConcessionRules } from '../concessions/concession.service';
import { chunk, existingKeysFromLines, bulkIdempotencyKey } from '../bulk/bulk.keys';
import {
  buildMonthlyLines,
  dhakaDate,
  dhakaParts,
  fromPaisa,
  monthlyLineDescription,
  monthsBetween,
  periodLabel,
  periodOf,
  periodTag,
  resolveBaseFees,
  toPaisa,
  type FeeProfileLite,
} from './studentFees.logic';
import { effectiveMonthlyCategories, getSettings, type MonthlySettings } from './studentFees.settings';
import { toLite } from './studentFees.profiles';
import { dec, isUniqueViolation, num } from './studentFees.shared';

// =============================================================================
// Monthly auto-invoices. One MONTHLY invoice per active student per billing
// month (YYYY-MM), built from the class fees / fee schedules, overridden by
// the student fee profile, with concessions applied. InvoicePeriod.activeKey
// (unique) makes it impossible to bill a month twice — even two runs at once.
// =============================================================================

const CHUNK_SIZE = 50;
export const MONTHLY = 'MONTHLY';

export const activeKeyOf = (studentId: string, period: string, kind = MONTHLY) => `${studentId}|${period}|${kind}`;

interface PlannedLine {
  feeCategoryId: string;
  description: string;
  amount: number;
  discount: number;
}

interface PlannedInvoice {
  studentId: string;
  studentName: string;
  userId: string | null;
  className: string | null;
  lines: PlannedLine[];
  gross: number;
  concession: number;
  total: number;
  custom: boolean;
}

export interface MonthlyPlan {
  period: string;
  label: string;
  dueDate: Date;
  settings: MonthlySettings;
  studentCount: number;
  invoices: PlannedInvoice[];
  skipped: { alreadyBilled: number; noFees: number; zeroTotal: number };
}

const toMap = (rows: Array<{ feeCategoryId: string; amount: Prisma.Decimal }>) => new Map(rows.map((r) => [r.feeCategoryId, num(r.amount)]));

function concessionDate(period: string, now: Date): Date {
  // Concession assignments valid "now" for the current month; otherwise the
  // middle of the billed month.
  return periodOf(now) === period ? now : dhakaDate(period, 15);
}

export async function buildMonthlyPlan(
  institutionId: string,
  period: string,
  opts: { classId?: string | null; now?: Date } = {},
): Promise<MonthlyPlan> {
  const now = opts.now ?? new Date();
  const settings = await getSettings(institutionId);
  const monthlyCats = await effectiveMonthlyCategories(institutionId, settings.monthlyCategoryIds);
  const monthlyCatIds = monthlyCats.map((c) => c.id);
  const allCats = await prisma.feeCategory.findMany({ where: { institutionId }, select: { id: true, name: true } });
  const categoryNames = new Map(allCats.map((c) => [c.id, c.name]));

  if (opts.classId) {
    const klass = await prisma.class.findFirst({ where: { id: opts.classId, branch: { institutionId } }, select: { id: true } });
    if (!klass) throw new NotFoundError('Class not found');
  }

  // Active students only — the soft-delete layer already hides trashed ones.
  const students = await prisma.student.findMany({
    where: { institutionId, status: 'ACTIVE', ...(opts.classId ? { classId: opts.classId } : {}) },
    select: { id: true, firstName: true, lastName: true, userId: true, classId: true, class: { select: { name: true } } },
    orderBy: [{ classId: 'asc' }, { rollNumber: 'asc' }, { firstName: 'asc' }],
  });
  const ids = students.map((s) => s.id);

  const [billed, taggedLines, classFees, schedules, profiles, rules] = await Promise.all([
    prisma.invoicePeriod.findMany({
      where: { institutionId, period, kind: MONTHLY, activeKey: { not: null }, studentId: { in: ids } },
      select: { studentId: true },
    }),
    // Lines billed for this month by the bulk wizard (same "[YYYY-MM]" tag).
    monthlyCatIds.length && ids.length
      ? prisma.invoiceItem.findMany({
          where: {
            feeCategoryId: { in: monthlyCatIds },
            description: { contains: periodTag(period) },
            invoice: { institutionId, studentId: { in: ids }, status: { not: 'CANCELLED' }, deletedAt: null },
          },
          select: { feeCategoryId: true, description: true, invoice: { select: { studentId: true } } },
        })
      : Promise.resolve([]),
    prisma.classFee.findMany({ where: { institutionId }, select: { classId: true, feeCategoryId: true, amount: true } }),
    prisma.feeSchedule.findMany({
      where: { institutionId, isActive: true, frequency: 'MONTHLY', feeCategory: { isActive: true } },
      select: { classId: true, feeCategoryId: true, amount: true },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.studentFeeProfile.findMany({ where: { institutionId, studentId: { in: ids }, endedAt: null } }),
    getActiveConcessionRules(institutionId, ids, concessionDate(period, now)).catch((error) => {
      logger.warn('Monthly invoices: concession lookup failed — continuing without concessions', {
        institutionId,
        error: error instanceof Error ? error.message : String(error),
      });
      return new Map<string, ConcessionRule[]>();
    }),
  ]);

  const billedSet = new Set(billed.map((b) => b.studentId));
  const tagged = existingKeysFromLines(
    taggedLines.map((l) => ({ studentId: l.invoice.studentId, feeCategoryId: l.feeCategoryId, description: l.description })),
    period,
  );
  const classFeeMap = new Map<string, Map<string, number>>();
  for (const cf of classFees) {
    const m = classFeeMap.get(cf.classId) ?? new Map<string, number>();
    m.set(cf.feeCategoryId, num(cf.amount));
    classFeeMap.set(cf.classId, m);
  }
  const globalSchedule = toMap(schedules.filter((s) => s.classId === null));
  const classScheduleMap = new Map<string, Map<string, number>>();
  for (const s of schedules.filter((x) => x.classId !== null)) {
    const m = classScheduleMap.get(s.classId!) ?? new Map<string, number>();
    m.set(s.feeCategoryId, num(s.amount));
    classScheduleMap.set(s.classId!, m);
  }
  const profilesByStudent = new Map<string, FeeProfileLite[]>();
  for (const p of profiles) {
    const list = profilesByStudent.get(p.studentId) ?? [];
    list.push(toLite(p));
    profilesByStudent.set(p.studentId, list);
  }

  const skipped = { alreadyBilled: 0, noFees: 0, zeroTotal: 0 };
  const invoices: PlannedInvoice[] = [];
  const fallback = monthlyCatIds[0] ?? null;
  const empty = new Map<string, number>();

  for (const s of students) {
    if (billedSet.has(s.id)) {
      skipped.alreadyBilled++;
      continue;
    }
    const base = resolveBaseFees(monthlyCatIds, categoryNames, {
      globalSchedule,
      classFees: (s.classId && classFeeMap.get(s.classId)) || empty,
      classSchedule: (s.classId && classScheduleMap.get(s.classId)) || empty,
    });
    const built = buildMonthlyLines(base, profilesByStudent.get(s.id) ?? [], period, categoryNames, fallback).filter(
      (l) => !tagged.has(bulkIdempotencyKey(s.id, l.feeCategoryId, period)),
    );
    if (built.length === 0) {
      if (tagged.size > 0 && base.some((b) => tagged.has(bulkIdempotencyKey(s.id, b.feeCategoryId, period)))) skipped.alreadyBilled++;
      else skipped.noFees++;
      continue;
    }
    let lines: PlannedLine[] = built.map((l) => ({
      feeCategoryId: l.feeCategoryId,
      description: monthlyLineDescription(l.categoryName, period, l.custom),
      amount: l.amount,
      discount: 0,
    }));
    const studentRules = rules.get(s.id) ?? [];
    let concession = 0;
    if (studentRules.length > 0) {
      const res = applyConcessions(lines, studentRules);
      lines = res.items.map((i) => ({ feeCategoryId: i.feeCategoryId, description: i.description, amount: i.amount, discount: i.discount }));
      concession = res.totalConcession;
    }
    const gross = fromPaisa(lines.reduce((a, l) => a + toPaisa(l.amount), 0));
    const total = fromPaisa(lines.reduce((a, l) => a + toPaisa(l.amount) - toPaisa(l.discount), 0));
    if (toPaisa(total) <= 0) {
      skipped.zeroTotal++;
      continue;
    }
    invoices.push({
      studentId: s.id,
      studentName: `${s.firstName} ${s.lastName}`.trim(),
      userId: s.userId,
      className: s.class?.name ?? null,
      lines,
      gross,
      concession,
      total,
      custom: built.some((l) => l.custom),
    });
  }

  return {
    period,
    label: periodLabel(period),
    dueDate: dhakaDate(period, settings.dueDay),
    settings,
    studentCount: students.length,
    invoices,
    skipped,
  };
}

export async function previewMonthly(institutionId: string, period: string, opts: { classId?: string | null } = {}) {
  const plan = await buildMonthlyPlan(institutionId, period, opts);
  const byClass = new Map<string, { className: string; count: number; total: number }>();
  for (const inv of plan.invoices) {
    const key = inv.className ?? '—';
    const row = byClass.get(key) ?? { className: key, count: 0, total: 0 };
    row.count += 1;
    row.total = fromPaisa(toPaisa(row.total) + toPaisa(inv.total));
    byClass.set(key, row);
  }
  return {
    period: plan.period,
    label: plan.label,
    dueDate: plan.dueDate,
    arrearsMode: plan.settings.arrearsMode,
    studentCount: plan.studentCount,
    invoiceCount: plan.invoices.length,
    customRateCount: plan.invoices.filter((i) => i.custom).length,
    grossAmount: fromPaisa(plan.invoices.reduce((a, i) => a + toPaisa(i.gross), 0)),
    concessionAmount: fromPaisa(plan.invoices.reduce((a, i) => a + toPaisa(i.concession), 0)),
    totalAmount: fromPaisa(plan.invoices.reduce((a, i) => a + toPaisa(i.total), 0)),
    skipped: plan.skipped,
    byClass: [...byClass.values()],
    sample: plan.invoices.slice(0, 5).map((i) => ({ studentName: i.studentName, className: i.className, total: i.total, lines: i.lines })),
  };
}

/** Older fully-unpaid MONTHLY invoices of a student (for ARREARS_LINE mode), locked. */
async function lockArrears(tx: Prisma.TransactionClient, institutionId: string, studentId: string, period: string) {
  const olds = await tx.invoicePeriod.findMany({
    where: { institutionId, studentId, kind: MONTHLY, period: { lt: period } },
    select: { invoiceId: true, period: true },
  });
  const out: Array<{ invoiceId: string; period: string; invoiceNo: string; items: Array<{ feeCategoryId: string; description: string; amount: number; discount: number }> }> = [];
  for (const o of olds.sort((a, b) => monthsBetween(b.period, a.period))) {
    const locked = await FeeRepository.lockInvoiceForUpdate(tx, institutionId, o.invoiceId);
    if (!locked) continue;
    if (!['UNPAID', 'OVERDUE'].includes(locked.status) || num(locked.paidAmount) > 0 || num(locked.dueAmount) <= 0) continue;
    const inv = await tx.invoice.findUnique({ where: { id: o.invoiceId }, select: { invoiceNo: true, items: true } });
    if (!inv) continue;
    out.push({
      invoiceId: o.invoiceId,
      period: o.period,
      invoiceNo: inv.invoiceNo,
      items: inv.items.map((it) => ({
        feeCategoryId: it.feeCategoryId,
        description: `Arrears ${periodLabel(o.period)}: ${it.description}`.slice(0, 500),
        amount: num(it.amount),
        discount: num(it.discount),
      })),
    });
  }
  return out;
}

async function batchOwner(institutionId: string, userId: string | null): Promise<string | null> {
  if (userId) return userId;
  const admin = await prisma.user.findFirst({ where: { institutionId, role: 'ADMIN' }, select: { id: true }, orderBy: { createdAt: 'asc' } });
  return admin?.id ?? null;
}

export interface GenerateResult {
  period: string;
  label: string;
  batchId: string | null;
  studentCount: number;
  createdCount: number;
  skippedCount: number;
  failedCount: number;
  carriedForward: number;
  totalAmount: number;
}

export async function generateMonthly(
  institutionId: string,
  period: string,
  opts: { classId?: string | null; userId?: string | null; source?: 'AUTO' | 'MANUAL'; now?: Date } = {},
): Promise<GenerateResult> {
  const now = opts.now ?? new Date();
  const source = opts.source ?? 'MANUAL';
  const plan = await buildMonthlyPlan(institutionId, period, { classId: opts.classId, now });
  const arrearsMode = plan.settings.arrearsMode;
  const label = `Monthly — ${plan.label}`;

  const owner = await batchOwner(institutionId, opts.userId ?? null);
  const batch = owner
    ? await prisma.invoiceBatch.create({
        data: { institutionId, label, classId: opts.classId ?? null, period, createdByUserId: owner, status: 'PROCESSING' },
      })
    : null;

  let createdCount = 0;
  let failedCount = 0;
  let raceSkipped = 0;
  let carriedForward = 0;
  let totalPaisa = 0;
  const created: Array<{ id: string; invoiceNo: string; studentId: string; userId: string | null; studentName: string; total: number }> = [];

  for (const group of chunk(plan.invoices, CHUNK_SIZE)) {
    const runChunk = async (forceDb: boolean) => {
      const numbers = await allocateInvoiceNumbers(institutionId, group.length, forceDb);
      return prisma.$transaction(
        async (tx) => {
          const taken = new Set(
            (
              await tx.invoicePeriod.findMany({
                where: { activeKey: { in: group.map((g) => activeKeyOf(g.studentId, period)) } },
                select: { studentId: true },
              })
            ).map((r) => r.studentId),
          );
          const out: typeof created = [];
          let skipped = 0;
          let carried = 0;
          for (let i = 0; i < group.length; i++) {
            const inv = group[i];
            if (taken.has(inv.studentId)) {
              skipped++;
              continue;
            }
            const arrears = arrearsMode === 'ARREARS_LINE' ? await lockArrears(tx, institutionId, inv.studentId, period) : [];
            const lines = [...inv.lines, ...arrears.flatMap((a) => a.items)];
            const total = fromPaisa(lines.reduce((a, l) => a + toPaisa(l.amount) - toPaisa(l.discount), 0));
            const row = await FeeRepository.createInvoiceTx(
              tx,
              institutionId,
              {
                studentId: inv.studentId,
                invoiceNo: numbers[i],
                totalAmount: total,
                dueDate: plan.dueDate,
                notes: `Monthly fees — ${plan.label}`,
              },
              lines,
            );
            if (!row) continue;
            await tx.invoicePeriod.create({
              data: { institutionId, invoiceId: row.id, studentId: inv.studentId, period, kind: MONTHLY, activeKey: activeKeyOf(inv.studentId, period), source },
            });
            for (const a of arrears) {
              const old = await tx.invoice.findUnique({ where: { id: a.invoiceId }, select: { notes: true, dueAmount: true } });
              await tx.invoice.update({
                where: { id: a.invoiceId },
                data: {
                  status: 'CANCELLED',
                  dueAmount: dec(0),
                  notes: `${old?.notes ? `${old.notes}\n` : ''}Carried forward to ${row.invoiceNo}`.slice(0, 2000),
                },
              });
              await tx.feeAdjustment.create({
                data: {
                  institutionId,
                  invoiceId: a.invoiceId,
                  studentId: inv.studentId,
                  kind: 'CARRIED_FORWARD',
                  amount: dec(num(old?.dueAmount)),
                  reason: `Carried forward to ${row.invoiceNo}`,
                  actorUserId: opts.userId ?? 'SYSTEM',
                },
              });
              carried++;
            }
            out.push({ id: row.id, invoiceNo: row.invoiceNo, studentId: inv.studentId, userId: inv.userId, studentName: inv.studentName, total });
          }
          return { out, skipped, carried };
        },
        { timeout: 120_000, maxWait: 15_000 },
      );
    };

    try {
      let result;
      try {
        result = await runChunk(false);
      } catch (error) {
        if (isInvoiceNoCollision(error) || isUniqueViolation(error, 'activeKey')) result = await runChunk(true);
        else throw error;
      }
      created.push(...result.out);
      createdCount += result.out.length;
      raceSkipped += result.skipped;
      carriedForward += result.carried;
      totalPaisa += result.out.reduce((s, r) => s + toPaisa(r.total), 0);
    } catch (error) {
      failedCount += group.length;
      logger.error('Monthly invoices: chunk failed — rolled back', {
        institutionId,
        period,
        size: group.length,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const status = failedCount === 0 ? 'COMPLETED' : createdCount > 0 ? 'PARTIAL' : 'FAILED';
  if (batch) {
    await prisma.invoiceBatch.update({
      where: { id: batch.id },
      data: { invoiceCount: createdCount, totalAmount: new Prisma.Decimal(fromPaisa(totalPaisa)), status },
    });
  }

  // Same notification path as single/bulk invoices (P0-fixed dedupe: one per invoice).
  scheduleFeeDueReminders(
    created.map((inv) => ({
      institutionId,
      invoiceId: inv.id,
      studentId: inv.studentId,
      invoiceNo: inv.invoiceNo,
      dueAmount: inv.total,
      dueDate: plan.dueDate,
    })),
  );
  for (const inv of created) {
    notifySafe({
      institutionId,
      type: 'INVOICE_ISSUED',
      recipientUserIds: inv.userId ? [inv.userId] : [],
      contextId: inv.id,
      data: { link: '/fees', invoiceId: inv.id },
      vars: {
        invoiceNo: inv.invoiceNo,
        studentName: inv.studentName,
        amount: inv.total.toFixed(2),
        dueDate: plan.dueDate.toDateString(),
      },
    });
  }

  const result: GenerateResult = {
    period,
    label: plan.label,
    batchId: batch?.id ?? null,
    studentCount: plan.studentCount,
    createdCount,
    skippedCount: plan.skipped.alreadyBilled + plan.skipped.noFees + plan.skipped.zeroTotal + raceSkipped,
    failedCount,
    carriedForward,
    totalAmount: fromPaisa(totalPaisa),
  };
  if (createdCount > 0 || failedCount > 0) logger.info('Monthly fee invoices generated', { institutionId, source, ...result });
  return result;
}

/**
 * Scheduled run (hourly tick, BACKGROUND_JOBS only): every school with
 * auto-generation on whose generation day (Dhaka) has come and that has not
 * run for this month yet.
 */
export async function runScheduledMonthly(now: Date = new Date()) {
  const period = periodOf(now);
  const { day } = dhakaParts(now);
  const due = await prisma.studentFeeSettings.findMany({
    where: { autoGenerate: true, generateDay: { lte: day }, OR: [{ lastAutoPeriod: null }, { lastAutoPeriod: { not: period } }], institution: { isActive: true } },
    select: { institutionId: true },
  });
  const results: Array<{ institutionId: string; created: number; error?: string }> = [];
  for (const s of due) {
    try {
      const r = await generateMonthly(s.institutionId, period, { source: 'AUTO', now });
      await prisma.studentFeeSettings.update({
        where: { institutionId: s.institutionId },
        data: { lastAutoPeriod: period, lastAutoRunAt: now, lastRunSummary: r as unknown as Prisma.InputJsonValue },
      });
      results.push({ institutionId: s.institutionId, created: r.createdCount });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.error('Scheduled monthly invoices failed for school', { institutionId: s.institutionId, period, error: msg });
      results.push({ institutionId: s.institutionId, created: 0, error: msg });
    }
  }
  return { period, schools: results };
}
