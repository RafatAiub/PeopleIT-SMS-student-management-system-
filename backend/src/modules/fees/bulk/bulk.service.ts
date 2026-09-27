import { Prisma } from '@prisma/client';
import { prisma } from '../../../config/prisma';
import { redis } from '../../../config/redis';
import { getInvoiceTenantTag } from '../../../utils/invoiceNumber';
import { logger } from '../../../utils/logger';
import { BadRequestError, NotFoundError } from '../../../utils/AppError';
import { notifySafe } from '../../notifications/notifications.service';
import { FeeRepository } from '../fee.repository';
import { applyConcessions, fromPaisa, toPaisa, type ConcessionRule } from '../concessions/concession.calc';
import { getActiveConcessionRulesSafe } from '../concessions/concession.service';
import {
  bulkIdempotencyKey,
  bulkPeriodTag,
  chunk,
  existingKeysFromLines,
  normalizePeriod,
  planBulkInvoices,
  type BulkItemInput,
  type PlannedLine,
} from './bulk.keys';
import type { BulkInvoiceDtoType } from './bulk.dto';

const CHUNK_SIZE = 50;
const INVOICE_COUNTER_PREFIX = 'invoice_counter';

interface ResolvedStudent {
  id: string;
  firstName: string;
  lastName: string;
  userId: string | null;
}

interface PreparedInvoice {
  studentId: string;
  items: PlannedLine[];
  total: number;
  concession: number;
}

async function resolveScope(tenantId: string, dto: BulkInvoiceDtoType) {
  const klass = await prisma.class.findFirst({
    where: { id: dto.classId, branch: { institutionId: tenantId } },
    select: { id: true, name: true },
  });
  if (!klass) throw new NotFoundError('Class not found');

  let sectionName: string | null = null;
  if (dto.sectionId) {
    const section = await prisma.section.findFirst({
      where: { id: dto.sectionId, classId: klass.id },
      select: { id: true, name: true },
    });
    if (!section) throw new NotFoundError('Section not found in this class');
    sectionName = section.name;
  }

  const students: ResolvedStudent[] = await prisma.student.findMany({
    where: {
      institutionId: tenantId,
      classId: klass.id,
      ...(dto.sectionId ? { sectionId: dto.sectionId } : {}),
      status: 'ACTIVE',
    },
    select: { id: true, firstName: true, lastName: true, userId: true },
    orderBy: [{ rollNumber: 'asc' }, { firstName: 'asc' }],
  });

  // Items: fee schedule (class-specific beats institution-wide), then
  // explicit items override the schedule for the same category.
  const itemMap = new Map<string, BulkItemInput>();
  if (dto.useFeeSchedule) {
    const schedules = await prisma.feeSchedule.findMany({
      where: {
        institutionId: tenantId,
        isActive: true,
        OR: [{ classId: klass.id }, { classId: null }],
        feeCategory: { isActive: true, institutionId: tenantId },
      },
      include: { feeCategory: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'asc' },
    });
    for (const s of schedules.filter((x) => x.classId === null)) {
      itemMap.set(s.feeCategoryId, { feeCategoryId: s.feeCategoryId, categoryName: s.feeCategory.name, amount: Number(s.amount), description: s.name });
    }
    for (const s of schedules.filter((x) => x.classId !== null)) {
      itemMap.set(s.feeCategoryId, { feeCategoryId: s.feeCategoryId, categoryName: s.feeCategory.name, amount: Number(s.amount), description: s.name });
    }
  }
  if (dto.items && dto.items.length > 0) {
    const ids = [...new Set(dto.items.map((i) => i.feeCategoryId))];
    const cats = await prisma.feeCategory.findMany({ where: { id: { in: ids }, institutionId: tenantId }, select: { id: true, name: true } });
    const byId = new Map(cats.map((c) => [c.id, c.name]));
    const invalid = ids.find((id) => !byId.has(id));
    if (invalid) throw new BadRequestError(`Fee category '${invalid}' does not belong to your institution`);
    for (const i of dto.items) {
      itemMap.set(i.feeCategoryId, { feeCategoryId: i.feeCategoryId, categoryName: byId.get(i.feeCategoryId)!, amount: i.amount, description: i.description });
    }
  }
  const items = [...itemMap.values()];
  if (items.length === 0) {
    throw new BadRequestError(dto.useFeeSchedule ? 'No active fee schedule entries apply to this class' : 'Add at least one fee item');
  }

  return { klass, sectionName, students, items };
}

async function findExistingKeys(
  client: Prisma.TransactionClient | typeof prisma,
  tenantId: string,
  studentIds: string[],
  categoryIds: string[],
  period: string,
) {
  if (studentIds.length === 0 || categoryIds.length === 0) return new Set<string>();
  const lines = await client.invoiceItem.findMany({
    where: {
      feeCategoryId: { in: categoryIds },
      description: { contains: bulkPeriodTag(period), mode: 'insensitive' },
      invoice: { institutionId: tenantId, studentId: { in: studentIds }, status: { not: 'CANCELLED' } },
    },
    select: { feeCategoryId: true, description: true, invoice: { select: { studentId: true } } },
  });
  return existingKeysFromLines(
    lines.map((l) => ({ studentId: l.invoice.studentId, feeCategoryId: l.feeCategoryId, description: l.description })),
    period,
  );
}

function prepare(
  plan: ReturnType<typeof planBulkInvoices>,
  rules: Map<string, ConcessionRule[]>,
): PreparedInvoice[] {
  return plan.toCreate.map(({ studentId, items }) => {
    const studentRules = rules.get(studentId) ?? [];
    const result = studentRules.length > 0 ? applyConcessions(items, studentRules) : null;
    const lines: PlannedLine[] = result
      ? result.items.map((i) => ({ feeCategoryId: i.feeCategoryId, description: i.description, amount: i.amount, discount: i.discount }))
      : items;
    const total = fromPaisa(lines.reduce((s, l) => s + toPaisa(l.amount) - toPaisa(l.discount), 0));
    return { studentId, items: lines, total, concession: result?.totalConcession ?? 0 };
  });
}

async function buildPlan(tenantId: string, dto: BulkInvoiceDtoType) {
  const period = normalizePeriod(dto.period);
  const scope = await resolveScope(tenantId, dto);
  const studentIds = scope.students.map((s) => s.id);
  const categoryIds = scope.items.map((i) => i.feeCategoryId);
  const existing = await findExistingKeys(prisma, tenantId, studentIds, categoryIds, period);
  const plan = planBulkInvoices(studentIds, scope.items, existing, period);
  const rules = dto.applyConcessions !== false
    ? await getActiveConcessionRulesSafe(tenantId, plan.toCreate.map((p) => p.studentId))
    : new Map<string, ConcessionRule[]>();
  const prepared = prepare(plan, rules).filter((p) => p.total > 0);
  return { period, scope, plan, prepared };
}

export async function previewBulkInvoices(tenantId: string, dto: BulkInvoiceDtoType) {
  const { period, scope, plan, prepared } = await buildPlan(tenantId, dto);
  const gross = fromPaisa(prepared.reduce((s, p) => s + p.items.reduce((a, l) => a + toPaisa(l.amount), 0), 0));
  const concession = fromPaisa(prepared.reduce((s, p) => s + toPaisa(p.concession), 0));
  return {
    classId: scope.klass.id,
    className: scope.klass.name,
    sectionName: scope.sectionName,
    period,
    items: scope.items.map((i) => ({ feeCategoryId: i.feeCategoryId, categoryName: i.categoryName, amount: i.amount, description: i.description ?? null })),
    studentCount: scope.students.length,
    invoiceCount: prepared.length,
    skippedStudentCount: scope.students.length - prepared.length,
    skippedItemCount: plan.skippedItemCount,
    grossAmount: gross,
    concessionAmount: concession,
    totalAmount: fromPaisa(toPaisa(gross) - toPaisa(concession)),
  };
}

// ── Invoice number allocation (a contiguous block per chunk) ────────────────

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([p, new Promise<never>((_, reject) => setTimeout(() => reject(new Error('redis timeout')), ms))]);
}

async function allocateInvoiceNumbers(tenantId: string, count: number, forceDb = false): Promise<string[]> {
  const year = new Date().getFullYear();
  const tag = await getInvoiceTenantTag(tenantId);
  const prefix = `INV-${tag}-${year}-`;
  const fmt = (n: number) => `${prefix}${String(n).padStart(6, '0')}`;

  if (!forceDb) {
    try {
      // Same Redis counter as utils/invoiceNumber.ts, reserved as one block.
      const end = await withTimeout(redis.incrby(`${INVOICE_COUNTER_PREFIX}:${tenantId}:${year}`, count), 1500);
      return Array.from({ length: count }, (_, i) => fmt(end - count + 1 + i));
    } catch (error) {
      logger.warn('Bulk invoicing: Redis invoice counter unavailable — using DB max', {
        tenantId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  const latest = await prisma.invoice.findFirst({
    where: { institutionId: tenantId, invoiceNo: { startsWith: prefix } },
    orderBy: { invoiceNo: 'desc' },
    select: { invoiceNo: true },
  });
  const last = latest ? parseInt(latest.invoiceNo.slice(prefix.length), 10) || 0 : 0;
  return Array.from({ length: count }, (_, i) => fmt(last + 1 + i));
}

function isInvoiceNoCollision(error: unknown) {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') return false;
  const target = (error.meta as { target?: unknown } | undefined)?.target;
  return (Array.isArray(target) ? target.join(',') : String(target ?? '')).includes('invoiceNo');
}

// ── Execute ─────────────────────────────────────────────────────────────────

export async function generateBulkInvoices(tenantId: string, userId: string, dto: BulkInvoiceDtoType) {
  const { period, scope, prepared } = await buildPlan(tenantId, dto);
  const dueDate = new Date(dto.dueDate);
  const categoryIds = scope.items.map((i) => i.feeCategoryId);
  const studentById = new Map(scope.students.map((s) => [s.id, s]));

  const label = `${scope.klass.name}${scope.sectionName ? ` - ${scope.sectionName}` : ''} — ${period}`;
  const batch = await prisma.invoiceBatch.create({
    data: {
      institutionId: tenantId,
      label,
      classId: scope.klass.id,
      sectionId: dto.sectionId ?? null,
      period,
      createdByUserId: userId,
      status: 'PROCESSING',
    },
  });

  let createdCount = 0;
  let failedCount = 0;
  let raceSkipped = 0;
  let totalPaisa = 0;
  const created: { id: string; invoiceNo: string; studentId: string; total: number }[] = [];

  for (const group of chunk(prepared, CHUNK_SIZE)) {
    const runChunk = async (forceDb: boolean) => {
      const numbers = await allocateInvoiceNumbers(tenantId, group.length, forceDb);
      return prisma.$transaction(
        async (tx) => {
          // Re-check inside the transaction so two concurrent runs of the
          // same batch don't double-bill (idempotency under concurrency).
          const existing = await findExistingKeys(tx, tenantId, group.map((g) => g.studentId), categoryIds, period);
          const out: typeof created = [];
          let skipped = 0;
          for (let i = 0; i < group.length; i++) {
            const inv = group[i];
            const items = inv.items.filter((l) => !existing.has(bulkIdempotencyKey(inv.studentId, l.feeCategoryId, period)));
            if (items.length === 0) {
              skipped++;
              continue;
            }
            const total = fromPaisa(items.reduce((s, l) => s + toPaisa(l.amount) - toPaisa(l.discount), 0));
            if (total <= 0) {
              skipped++;
              continue;
            }
            const row = await FeeRepository.createInvoiceTx(
              tx,
              tenantId,
              {
                studentId: inv.studentId,
                invoiceNo: numbers[i],
                totalAmount: total,
                dueDate,
                notes: dto.notes ? `${dto.notes} (Bulk: ${label})` : `Bulk: ${label}`,
              },
              items,
            );
            if (row) out.push({ id: row.id, invoiceNo: row.invoiceNo, studentId: inv.studentId, total });
          }
          return { out, skipped };
        },
        { timeout: 60_000, maxWait: 10_000 },
      );
    };

    try {
      let result;
      try {
        result = await runChunk(false);
      } catch (error) {
        if (!isInvoiceNoCollision(error)) throw error;
        result = await runChunk(true);
      }
      created.push(...result.out);
      createdCount += result.out.length;
      raceSkipped += result.skipped;
      totalPaisa += result.out.reduce((s, r) => s + toPaisa(r.total), 0);
    } catch (error) {
      failedCount += group.length;
      logger.error('Bulk invoicing chunk failed — rolled back', {
        tenantId,
        batchId: batch.id,
        size: group.length,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const status = failedCount === 0 ? 'COMPLETED' : createdCount > 0 ? 'PARTIAL' : 'FAILED';
  await prisma.invoiceBatch.update({
    where: { id: batch.id },
    data: { invoiceCount: createdCount, totalAmount: new Prisma.Decimal(fromPaisa(totalPaisa)), status },
  });

  for (const inv of created) {
    const s = studentById.get(inv.studentId);
    notifySafe({
      institutionId: tenantId,
      type: 'INVOICE_ISSUED',
      recipientUserIds: s?.userId ? [s.userId] : [],
      contextId: inv.id,
      data: { link: '/fees', invoiceId: inv.id },
      vars: {
        invoiceNo: inv.invoiceNo,
        studentName: s ? `${s.firstName} ${s.lastName}` : '',
        amount: inv.total.toFixed(2),
        dueDate: dueDate.toDateString(),
      },
    });
  }

  return {
    batchId: batch.id,
    label,
    status,
    studentCount: scope.students.length,
    createdCount,
    skippedCount: scope.students.length - prepared.length + raceSkipped,
    failedCount,
    totalAmount: fromPaisa(totalPaisa),
  };
}

export async function listBatches(tenantId: string, q: { page: number; pageSize: number }) {
  const where = { institutionId: tenantId };
  const [total, items] = await prisma.$transaction([
    prisma.invoiceBatch.count({ where }),
    prisma.invoiceBatch.findMany({
      where,
      include: {
        class: { select: { name: true } },
        section: { select: { name: true } },
        createdBy: { select: { firstName: true, lastName: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
    }),
  ]);
  return {
    items: items.map((b) => ({ ...b, totalAmount: Number(b.totalAmount) })),
    meta: { total, page: q.page, pageSize: q.pageSize },
  };
}
