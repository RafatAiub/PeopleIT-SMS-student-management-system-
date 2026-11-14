import { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { NotFoundError } from '../../utils/AppError';
import { logger } from '../../utils/logger';
import {
  DEFAULT_RESTRICTION_SETTINGS, DEFAULT_EMAIL_SUBJECT, DEFAULT_EMAIL_TEMPLATE, DEFAULT_SMS_TEMPLATE,
  daysOverdue, evaluateRestriction, featureBlocked, fromPaisa, toPaisa,
  type RestrictedFeature, type RestrictionSettings, type RestrictionVerdict,
} from './dues.logic';
import { institutionTz, invoiceMonthSql } from './dues.sql';

// =============================================================================
// P4 student restrictions for non-payment.
//
// StudentFeeStatus caches each student's past-due figures (months, amount,
// oldest due date). A check reads the cache and recomputes ONE student when it
// is stale: an invoice of theirs changed after computedAt (payments, cancels,
// trash all touch Invoice.updatedAt), or it is older than STALE_MS (an invoice
// may have become due since). The nightly job refreshes every school.
// Thresholds are applied at check time (evaluateRestriction), so changing the
// settings never needs a recompute. Staff roles are never checked.
// =============================================================================

const STALE_MS = 6 * 60 * 60 * 1000;
const CLOCK_MARGIN_MS = 60 * 1000;

export interface DuesSettingsView extends RestrictionSettings {
  restrictionMessage: string | null;
  smsTemplate: string;
  emailSubject: string;
  emailTemplate: string;
  /** Taka (minAmountDue is paisa in RestrictionSettings). */
  minAmountDueTaka: number | null;
  updatedAt: Date | null;
}

export async function getSettings(institutionId: string): Promise<DuesSettingsView> {
  const row = await prisma.feeDuesSettings.findUnique({ where: { institutionId } });
  const s: RestrictionSettings = row
    ? {
        restrictionsEnabled: row.restrictionsEnabled,
        minMonthsDue: row.minMonthsDue,
        minAmountDue: row.minAmountDue === null ? null : toPaisa(row.minAmountDue),
        overdueDays: row.overdueDays,
        blockResults: row.blockResults,
        blockAdmitCard: row.blockAdmitCard,
        blockIdCard: row.blockIdCard,
        blockPortalLogin: row.blockPortalLogin,
        blockOnlineExam: row.blockOnlineExam,
      }
    : { ...DEFAULT_RESTRICTION_SETTINGS };
  return {
    ...s,
    minAmountDueTaka: s.minAmountDue === null ? null : fromPaisa(s.minAmountDue),
    restrictionMessage: row?.restrictionMessage ?? null,
    smsTemplate: row?.smsTemplate || DEFAULT_SMS_TEMPLATE,
    emailSubject: row?.emailSubject || DEFAULT_EMAIL_SUBJECT,
    emailTemplate: row?.emailTemplate || DEFAULT_EMAIL_TEMPLATE,
    updatedAt: row?.updatedAt ?? null,
  };
}

export interface SettingsInput {
  restrictionsEnabled?: boolean;
  minMonthsDue?: number | null;
  minAmountDue?: number | null; // taka
  overdueDays?: number | null;
  blockResults?: boolean;
  blockAdmitCard?: boolean;
  blockIdCard?: boolean;
  blockPortalLogin?: boolean;
  blockOnlineExam?: boolean;
  restrictionMessage?: string | null;
  smsTemplate?: string | null;
  emailSubject?: string | null;
  emailTemplate?: string | null;
}

export async function updateSettings(institutionId: string, userId: string, input: SettingsInput) {
  const before = await prisma.feeDuesSettings.findUnique({ where: { institutionId } });
  const data = { ...input, updatedByUserId: userId };
  await prisma.feeDuesSettings.upsert({
    where: { institutionId },
    create: { institutionId, ...data },
    update: data,
  });
  await audit(institutionId, userId, 'UPDATE', 'FeeDuesSettings', institutionId, { before, after: input });
  return getSettings(institutionId);
}

// ── Cache refresh ────────────────────────────────────────────────────────

/**
 * Recomputes the cached figures. With `studentIds` only those students;
 * without, every non-trashed student of the school that has dues or already
 * has a row (one INSERT … ON CONFLICT statement).
 */
export async function refreshStatuses(institutionId: string, studentIds?: string[]): Promise<number> {
  if (studentIds && studentIds.length === 0) return 0;
  const { tz } = await institutionTz(institutionId);
  const { join, month } = await invoiceMonthSql(tz);
  const only = studentIds ? Prisma.sql`AND s.id IN (${Prisma.join(studentIds)})` : Prisma.empty;
  const onlyInv = studentIds ? Prisma.sql`AND i."studentId" IN (${Prisma.join(studentIds)})` : Prisma.empty;
  const n = await prisma.$executeRaw`
    WITH d AS (
      SELECT i."studentId" AS sid, COUNT(DISTINCT ${month})::int AS months_due, SUM(i."dueAmount") AS amount_due, MIN(i."dueDate") AS oldest
      FROM "Invoice" i ${join}
      WHERE i."institutionId" = ${institutionId} AND i."deletedAt" IS NULL AND i.status <> 'CANCELLED'
        AND i."dueAmount" > 0 AND i."dueDate" <= now() ${onlyInv}
      GROUP BY i."studentId"
    ),
    lp AS (
      SELECT i."studentId" AS sid, MAX(p."paidAt") AS last_paid
      FROM "Payment" p JOIN "Invoice" i ON i.id = p."invoiceId"
      WHERE i."institutionId" = ${institutionId} AND p.status = 'COMPLETED' ${onlyInv}
      GROUP BY i."studentId"
    )
    INSERT INTO "StudentFeeStatus" ("id", "institutionId", "studentId", "monthsDue", "amountDue", "oldestDueDate", "lastPaymentAt", "computedAt", "updatedAt")
    SELECT 'sfs' || md5(s.id || clock_timestamp()::text || random()::text), s."institutionId", s.id,
      COALESCE(d.months_due, 0), COALESCE(d.amount_due, 0), d.oldest, lp.last_paid, now(), now()
    FROM "Student" s
    LEFT JOIN d ON d.sid = s.id
    LEFT JOIN lp ON lp.sid = s.id
    WHERE s."institutionId" = ${institutionId} AND s."deletedAt" IS NULL ${only}
      AND (d.sid IS NOT NULL OR EXISTS (SELECT 1 FROM "StudentFeeStatus" x WHERE x."studentId" = s.id))
    ON CONFLICT ("studentId") DO UPDATE SET
      "monthsDue" = EXCLUDED."monthsDue", "amountDue" = EXCLUDED."amountDue", "oldestDueDate" = EXCLUDED."oldestDueDate",
      "lastPaymentAt" = EXCLUDED."lastPaymentAt", "computedAt" = EXCLUDED."computedAt", "updatedAt" = EXCLUDED."updatedAt"`;
  return n;
}

/** Nightly: every active school. Errors per school are logged, never thrown. */
export async function refreshAllInstitutions(): Promise<{ institutions: number; rows: number }> {
  const insts = await prisma.institution.findMany({ where: { isActive: true }, select: { id: true } });
  let rows = 0;
  for (const i of insts) {
    try {
      rows += await refreshStatuses(i.id);
    } catch (error) {
      logger.error('P4 dues status refresh failed', { institutionId: i.id, error: error instanceof Error ? error.message : String(error) });
    }
  }
  return { institutions: insts.length, rows };
}

interface StatusRow {
  monthsDue: number;
  amountDue: Prisma.Decimal;
  oldestDueDate: Date | null;
  lastPaymentAt: Date | null;
  computedAt: Date;
  manualState: string | null;
  manualReason: string | null;
  exempt: boolean;
  exemptReason: string | null;
}

/** Reads one student's cached row, recomputing it first when stale. */
async function freshStatus(institutionId: string, studentId: string): Promise<StatusRow | null> {
  const select = {
    monthsDue: true, amountDue: true, oldestDueDate: true, lastPaymentAt: true, computedAt: true,
    manualState: true, manualReason: true, exempt: true, exemptReason: true,
  } as const;
  let row = await prisma.studentFeeStatus.findUnique({ where: { studentId }, select });
  let stale = !row || Date.now() - row.computedAt.getTime() > STALE_MS;
  if (!stale && row) {
    // Raw on purpose: a trashed invoice's change must count too.
    const r = await prisma.$queryRaw<Array<{ changed: Date | null }>>`
      SELECT MAX("updatedAt") AS changed FROM "Invoice" WHERE "studentId" = ${studentId} AND "institutionId" = ${institutionId}`;
    const changed = r[0]?.changed;
    // A 60 s margin absorbs clock skew between the app (sets updatedAt) and
    // the database (sets computedAt with now()).
    stale = !!changed && changed.getTime() >= row.computedAt.getTime() - CLOCK_MARGIN_MS;
  }
  if (stale) {
    await refreshStatuses(institutionId, [studentId]);
    row = await prisma.studentFeeStatus.findUnique({ where: { studentId }, select });
  }
  return row;
}

export interface StudentRestriction extends RestrictionVerdict {
  studentId: string;
  monthsDue: number;
  amountDue: number;
  daysOverdue: number;
}

export async function evaluateStudent(institutionId: string, studentId: string, settings?: RestrictionSettings): Promise<StudentRestriction> {
  const s = settings ?? (await getSettings(institutionId));
  const row = await freshStatus(institutionId, studentId);
  const state = {
    monthsDue: row?.monthsDue ?? 0,
    amountDue: toPaisa(row?.amountDue ?? 0),
    oldestDueDate: row?.oldestDueDate ?? null,
    manualState: (row?.manualState as 'BLOCKED' | 'UNBLOCKED' | null) ?? null,
    exempt: row?.exempt ?? false,
  };
  const verdict = evaluateRestriction(s, state);
  return {
    ...verdict,
    studentId,
    monthsDue: state.monthsDue,
    amountDue: fromPaisa(state.amountDue),
    daysOverdue: daysOverdue(state.oldestDueDate, new Date()),
  };
}

export interface FeatureCheck {
  blocked: boolean;
  feature: RestrictedFeature;
  students: StudentRestriction[];
  message: string;
  contact: { school: string; phone: string | null; email: string | null; note: string | null };
}

/**
 * Is `feature` blocked for any of these students? Cheap path: a school with
 * restrictions off and no manual blocks returns without touching the cache.
 */
export async function checkFeature(institutionId: string, studentIds: string[], feature: RestrictedFeature): Promise<FeatureCheck> {
  const settings = await getSettings(institutionId);
  const base = { feature, students: [] as StudentRestriction[], message: '', contact: { school: '', phone: null, email: null, note: settings.restrictionMessage } };
  if (!studentIds.length || !featureBlocked(settings, feature)) return { ...base, blocked: false };
  if (!settings.restrictionsEnabled) {
    const manual = await prisma.studentFeeStatus.count({ where: { institutionId, studentId: { in: studentIds }, manualState: 'BLOCKED', exempt: false } });
    if (manual === 0) return { ...base, blocked: false };
  }
  const results = await Promise.all(studentIds.map((id) => evaluateStudent(institutionId, id, settings)));
  const restricted = results.filter((r) => r.restricted);
  if (!restricted.length) return { ...base, blocked: false };
  const inst = await institutionTz(institutionId);
  const contact = { school: inst.name, phone: inst.phone, email: inst.email, note: settings.restrictionMessage };
  const phonePart = contact.phone ? ` (${contact.phone})` : '';
  const message = `Fees are due. ${FEATURE_LABEL[feature]} is unavailable until the dues are cleared — please contact the school office${phonePart}.`;
  return { blocked: true, feature, students: restricted, message, contact };
}

export const FEATURE_LABEL: Record<RestrictedFeature, string> = {
  RESULTS: 'The result / report card',
  ADMIT_CARD: 'The admit card',
  ID_CARD: 'The ID card',
  PORTAL_LOGIN: 'Portal sign-in',
  ONLINE_EXAM: 'The online exam',
};

/** Student ids a STUDENT / GUARDIAN user stands for (tenant-scoped). */
export async function studentIdsForUser(institutionId: string, userId: string, role: string): Promise<string[]> {
  if (role === 'STUDENT') {
    const s = await prisma.student.findFirst({ where: { institutionId, userId }, select: { id: true } });
    return s ? [s.id] : [];
  }
  if (role === 'GUARDIAN') {
    const g = await prisma.guardian.findFirst({
      where: { institutionId, userId },
      select: { students: { select: { studentId: true } } },
    });
    return g?.students.map((s) => s.studentId) ?? [];
  }
  return [];
}

// ── Overrides ────────────────────────────────────────────────────────────

async function ensureRow(institutionId: string, studentId: string) {
  const student = await prisma.student.findFirst({ where: { id: studentId, institutionId }, select: { id: true } });
  if (!student) throw new NotFoundError('Student not found');
  await refreshStatuses(institutionId, [studentId]);
  const exists = await prisma.studentFeeStatus.findUnique({ where: { studentId }, select: { id: true } });
  if (!exists) {
    await prisma.studentFeeStatus.create({ data: { institutionId, studentId } });
  }
}

export async function setManualState(institutionId: string, userId: string, studentId: string, state: 'BLOCKED' | 'UNBLOCKED' | null, reason: string | null) {
  await ensureRow(institutionId, studentId);
  const before = await prisma.studentFeeStatus.findUnique({ where: { studentId }, select: { manualState: true, manualReason: true } });
  await prisma.studentFeeStatus.update({
    where: { studentId },
    data: { manualState: state, manualReason: state ? reason : null, manualByUserId: userId, manualAt: new Date() },
  });
  await audit(institutionId, userId, state === 'BLOCKED' ? 'FEE_BLOCK' : state === 'UNBLOCKED' ? 'FEE_UNBLOCK' : 'FEE_BLOCK_CLEAR', 'Student', studentId, {
    before, after: { manualState: state, reason },
  });
  return evaluateStudent(institutionId, studentId);
}

export async function setExempt(institutionId: string, userId: string, studentId: string, exempt: boolean, reason: string | null) {
  await ensureRow(institutionId, studentId);
  await prisma.studentFeeStatus.update({
    where: { studentId },
    data: { exempt, exemptReason: exempt ? reason : null, exemptByUserId: userId, exemptAt: new Date() },
  });
  await audit(institutionId, userId, exempt ? 'FEE_EXEMPT' : 'FEE_EXEMPT_CLEAR', 'Student', studentId, { exempt, reason });
  return evaluateStudent(institutionId, studentId);
}

// ── Restricted students list ─────────────────────────────────────────────

export type RestrictedView = 'RESTRICTED' | 'OVERRIDES';

export async function listRestricted(institutionId: string, q: { view?: RestrictedView; classId?: string; sectionId?: string; search?: string; page?: number; pageSize?: number }) {
  await refreshStatuses(institutionId);
  const settings = await getSettings(institutionId);
  const page = Math.max(1, q.page ?? 1);
  const pageSize = Math.min(200, Math.max(1, q.pageSize ?? 50));
  const now = new Date();

  const auto: Prisma.Sql[] = [];
  if (settings.minMonthsDue && settings.minMonthsDue > 0) auto.push(Prisma.sql`f."monthsDue" >= ${settings.minMonthsDue}`);
  if (settings.minAmountDue && settings.minAmountDue > 0) auto.push(Prisma.sql`f."amountDue" >= ${fromPaisa(settings.minAmountDue)}`);
  if (settings.overdueDays && settings.overdueDays > 0) {
    const cutoff = new Date(now.getTime() - (settings.overdueDays + 1) * 24 * 60 * 60 * 1000);
    auto.push(Prisma.sql`f."oldestDueDate" <= ${cutoff}`);
  }
  const autoCond = settings.restrictionsEnabled && auto.length
    ? Prisma.sql`(f."manualState" IS NULL AND f."amountDue" > 0 AND (${Prisma.join(auto, ' OR ')}))`
    : Prisma.sql`FALSE`;
  const viewCond = (q.view ?? 'RESTRICTED') === 'OVERRIDES'
    ? Prisma.sql`(f.exempt OR f."manualState" IS NOT NULL)`
    : Prisma.sql`(NOT f.exempt AND (f."manualState" = 'BLOCKED' OR ${autoCond}))`;

  const conds: Prisma.Sql[] = [Prisma.sql`f."institutionId" = ${institutionId}`, Prisma.sql`st."deletedAt" IS NULL`, viewCond];
  if (q.classId) conds.push(Prisma.sql`st."classId" = ${q.classId}`);
  if (q.sectionId) conds.push(Prisma.sql`st."sectionId" = ${q.sectionId}`);
  const s = q.search?.trim();
  if (s) {
    const like = `%${s.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    conds.push(Prisma.sql`((st."firstName" || ' ' || st."lastName") ILIKE ${like} OR st."studentId" ILIKE ${like})`);
  }

  const rows = await prisma.$queryRaw<Array<{
    id: string; code: string; firstName: string; lastName: string; className: string | null; sectionName: string | null;
    monthsDue: number; amountDue: unknown; oldestDueDate: Date | null; lastPaymentAt: Date | null;
    manualState: string | null; manualReason: string | null; manualAt: Date | null; exempt: boolean; exemptReason: string | null; total: bigint;
  }>>`
    SELECT st.id, st."studentId" AS code, st."firstName", st."lastName", c.name AS "className", sec.name AS "sectionName",
      f."monthsDue", f."amountDue", f."oldestDueDate", f."lastPaymentAt", f."manualState", f."manualReason", f."manualAt", f.exempt, f."exemptReason",
      COUNT(*) OVER () AS total
    FROM "StudentFeeStatus" f
    JOIN "Student" st ON st.id = f."studentId"
    LEFT JOIN "Class" c ON c.id = st."classId"
    LEFT JOIN "Section" sec ON sec.id = st."sectionId"
    WHERE ${Prisma.join(conds, ' AND ')}
    ORDER BY f."amountDue" DESC, st."firstName"
    LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`;

  return {
    items: rows.map((r) => {
      const verdict = evaluateRestriction(settings, {
        monthsDue: r.monthsDue, amountDue: toPaisa(r.amountDue), oldestDueDate: r.oldestDueDate,
        manualState: (r.manualState as 'BLOCKED' | 'UNBLOCKED' | null) ?? null, exempt: r.exempt,
      }, now);
      return {
        id: r.id, studentCode: r.code, name: `${r.firstName} ${r.lastName}`.trim(), className: r.className, sectionName: r.sectionName,
        monthsDue: r.monthsDue, amountDue: fromPaisa(toPaisa(r.amountDue)), oldestDueDate: r.oldestDueDate, daysOverdue: daysOverdue(r.oldestDueDate, now),
        lastPaymentAt: r.lastPaymentAt, manualState: r.manualState, manualReason: r.manualReason, manualAt: r.manualAt,
        exempt: r.exempt, exemptReason: r.exemptReason, restricted: verdict.restricted, source: verdict.source, reasons: verdict.reasons,
      };
    }),
    total: Number(rows[0]?.total ?? 0),
    page,
    pageSize,
    settings: { restrictionsEnabled: settings.restrictionsEnabled },
  };
}

// ── Audit ────────────────────────────────────────────────────────────────

async function audit(institutionId: string, userId: string, action: string, resource: string, resourceId: string, metadata: unknown) {
  try {
    await prisma.auditLog.create({
      data: { institutionId, userId, action, resource, resourceId, metadata: JSON.parse(JSON.stringify(metadata ?? null)) },
    });
  } catch (error) {
    logger.warn('P4 audit write failed', { action, resource, error: error instanceof Error ? error.message : String(error) });
  }
}

export { audit as writeDuesAudit };
