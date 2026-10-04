import { Prisma, type PromotionStatus } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { BadRequestError, ConflictError, NotFoundError, ValidationError } from '../../utils/AppError';
import { logger } from '../../utils/logger';
import { getDefaultScale } from '../grading/grading.resolver';
import { summarizeMarks } from '../grading/grading.core';
import {
  countByStatus,
  decodeBatchId,
  encodeBatchId,
  isWithinUndoWindow,
  planPromotion,
  planUndo,
  suggestStatus,
  type CandidateStudent,
  type PromotionPlan,
  type PromotionStatusValue,
} from './promotion.logic';
import type {
  BatchQueryDtoType,
  CandidatesQueryDtoType,
  PromotionHistoryQueryDtoType,
  PromotionRequestDtoType,
} from './promotion.dto';

// ── Tenant verification ─────────────────────────────────────────────────────

async function assertAcademicYears(institutionId: string, ids: string[]) {
  const unique = Array.from(new Set(ids));
  const found = await prisma.academicYear.findMany({
    where: { institutionId, id: { in: unique } },
    select: { id: true, label: true },
  });
  if (found.length !== unique.length) throw new NotFoundError('Session year not found');
  return new Map(found.map((y) => [y.id, y.label]));
}

async function assertClasses(institutionId: string, ids: string[]) {
  const unique = Array.from(new Set(ids));
  if (unique.length === 0) return new Map<string, string>();
  const found = await prisma.class.findMany({
    where: { id: { in: unique }, branch: { institutionId } },
    select: { id: true, name: true },
  });
  if (found.length !== unique.length) throw new NotFoundError('Class not found');
  return new Map(found.map((c) => [c.id, c.name]));
}

/** pairs = [sectionId, classId the section must belong to] */
async function assertSections(institutionId: string, pairs: Array<[string, string | null]>) {
  const ids = Array.from(new Set(pairs.map(([s]) => s)));
  if (ids.length === 0) return new Map<string, string>();
  const found = await prisma.section.findMany({
    where: { id: { in: ids }, class: { branch: { institutionId } } },
    select: { id: true, name: true, classId: true },
  });
  if (found.length !== ids.length) throw new NotFoundError('Section not found');
  const byId = new Map(found.map((s) => [s.id, s]));
  for (const [sectionId, classId] of pairs) {
    if (classId && byId.get(sectionId)!.classId !== classId) {
      throw new ValidationError('Section does not belong to the selected class');
    }
  }
  return new Map(found.map((s) => [s.id, s.name]));
}

function eligibleWhere(
  institutionId: string,
  q: { fromAcademicYearId: string; fromClassId: string; fromSectionId?: string | null; includeUnassignedYear?: boolean },
): Prisma.StudentWhereInput {
  return {
    institutionId,
    classId: q.fromClassId,
    ...(q.fromSectionId ? { sectionId: q.fromSectionId } : {}),
    OR: q.includeUnassignedYear === false
      ? [{ academicYearId: q.fromAcademicYearId }]
      : [{ academicYearId: q.fromAcademicYearId }, { academicYearId: null }],
  };
}

// ── Candidates ──────────────────────────────────────────────────────────────

export async function listCandidates(institutionId: string, q: CandidatesQueryDtoType) {
  const years = [q.fromAcademicYearId, ...(q.toAcademicYearId ? [q.toAcademicYearId] : [])];
  await assertAcademicYears(institutionId, years);
  await assertClasses(institutionId, [q.fromClassId]);
  if (q.fromSectionId) await assertSections(institutionId, [[q.fromSectionId, q.fromClassId]]);
  if (q.examId) {
    const exam = await prisma.exam.findFirst({ where: { id: q.examId, institutionId }, select: { id: true } });
    if (!exam) throw new NotFoundError('Exam not found');
  }

  const students = await prisma.student.findMany({
    where: { ...eligibleWhere(institutionId, q), status: 'ACTIVE' },
    select: {
      id: true,
      studentId: true,
      firstName: true,
      lastName: true,
      rollNumber: true,
      academicYearId: true,
      section: { select: { id: true, name: true } },
    },
    orderBy: [{ rollNumber: 'asc' }, { firstName: 'asc' }],
    take: 1000,
  });
  const ids = students.map((s) => s.id);

  const [results, processed, scale] = await Promise.all([
    q.examId && ids.length
      ? prisma.examResult.findMany({
          where: { institutionId, examId: q.examId, studentId: { in: ids } },
          select: { studentId: true, subject: true, marksObtained: true, maxMarks: true },
        })
      : Promise.resolve([]),
    q.toAcademicYearId && ids.length
      ? prisma.promotionRecord.findMany({
          where: { institutionId, toAcademicYearId: q.toAcademicYearId, studentId: { in: ids } },
          select: { studentId: true, status: true, createdAt: true },
        })
      : Promise.resolve([]),
    q.examId ? getDefaultScale(institutionId) : Promise.resolve(null),
  ]);

  const marksByStudent = new Map<string, Array<{ subject: string; marksObtained: number; maxMarks: number }>>();
  for (const r of results) {
    const list = marksByStudent.get(r.studentId) ?? [];
    list.push({ subject: r.subject, marksObtained: Number(r.marksObtained), maxMarks: Number(r.maxMarks) });
    marksByStudent.set(r.studentId, list);
  }
  const processedById = new Map(processed.map((p) => [p.studentId, p]));

  return {
    items: students.map((s) => {
      const marks = marksByStudent.get(s.id);
      const summary = marks ? summarizeMarks(marks, scale?.bands ?? null) : null;
      const done = processedById.get(s.id);
      return {
        id: s.id,
        studentCode: s.studentId,
        name: `${s.firstName} ${s.lastName}`.trim(),
        rollNumber: s.rollNumber,
        section: s.section,
        yearUnassigned: s.academicYearId === null,
        result: summary,
        suggestedStatus: suggestStatus(summary),
        alreadyProcessed: done ? { status: done.status, createdAt: done.createdAt } : null,
      };
    }),
    meta: { total: students.length, page: 1, pageSize: students.length },
  };
}

// ── Preview + execute ───────────────────────────────────────────────────────

async function buildPlan(institutionId: string, body: PromotionRequestDtoType, db: Prisma.TransactionClient | typeof prisma = prisma) {
  const eligible: CandidateStudent[] = await db.student.findMany({
    where: {
      ...eligibleWhere(institutionId, body),
      id: { in: body.decisions.map((d) => d.studentId) },
    },
    select: { id: true, status: true, classId: true, sectionId: true, academicYearId: true },
  });
  const processed = await db.promotionRecord.findMany({
    where: {
      institutionId,
      toAcademicYearId: body.toAcademicYearId,
      studentId: { in: body.decisions.map((d) => d.studentId) },
    },
    select: { studentId: true },
  });
  return planPromotion({
    eligible,
    alreadyProcessed: new Set(processed.map((p) => p.studentId)),
    decisions: body.decisions,
    target: {
      toAcademicYearId: body.toAcademicYearId,
      toClassId: body.toClassId,
      toSectionId: body.toSectionId,
      note: body.note,
    },
  });
}

/** Verifies every client-supplied id in the request belongs to the tenant. */
async function verifyRequest(institutionId: string, body: PromotionRequestDtoType) {
  const years = await assertAcademicYears(institutionId, [body.fromAcademicYearId, body.toAcademicYearId]);
  const classIds = [
    body.fromClassId,
    ...(body.toClassId ? [body.toClassId] : []),
    ...body.decisions.flatMap((d) => (d.toClassId ? [d.toClassId] : [])),
  ];
  const classes = await assertClasses(institutionId, classIds);
  const sectionPairs: Array<[string, string | null]> = [];
  if (body.fromSectionId) sectionPairs.push([body.fromSectionId, body.fromClassId]);
  if (body.toSectionId) sectionPairs.push([body.toSectionId, body.toClassId ?? null]);
  for (const d of body.decisions) {
    if (!d.toSectionId) continue;
    if (d.status === 'PROMOTED') sectionPairs.push([d.toSectionId, d.toClassId ?? body.toClassId ?? null]);
    else if (d.status === 'RETAINED') sectionPairs.push([d.toSectionId, body.fromClassId]);
  }
  const sections = await assertSections(institutionId, sectionPairs);
  return { years, classes, sections };
}

async function describePlan(institutionId: string, plan: PromotionPlan) {
  const classIds = new Set<string>();
  const sectionIds = new Set<string>();
  const studentIds = [...plan.actions.map((a) => a.studentId), ...plan.skipped.map((s) => s.studentId)];
  for (const a of plan.actions) {
    for (const p of [a.from, a.to]) {
      if (p.classId) classIds.add(p.classId);
      if (p.sectionId) sectionIds.add(p.sectionId);
    }
  }
  const [classes, sections, students] = await Promise.all([
    prisma.class.findMany({ where: { id: { in: [...classIds] }, branch: { institutionId } }, select: { id: true, name: true } }),
    prisma.section.findMany({ where: { id: { in: [...sectionIds] }, class: { branch: { institutionId } } }, select: { id: true, name: true } }),
    prisma.student.findMany({
      where: { institutionId, id: { in: studentIds } },
      select: { id: true, studentId: true, firstName: true, lastName: true, rollNumber: true },
    }),
  ]);
  const cn = new Map(classes.map((c) => [c.id, c.name]));
  const sn = new Map(sections.map((s) => [s.id, s.name]));
  const st = new Map(students.map((s) => [s.id, s]));
  const who = (id: string) => {
    const s = st.get(id);
    return s ? { studentCode: s.studentId, name: `${s.firstName} ${s.lastName}`.trim(), rollNumber: s.rollNumber } : { studentCode: null, name: 'Unknown student', rollNumber: null };
  };
  return {
    actions: plan.actions.map((a) => ({
      studentId: a.studentId,
      ...who(a.studentId),
      status: a.status,
      fromClass: a.from.classId ? cn.get(a.from.classId) ?? null : null,
      fromSection: a.from.sectionId ? sn.get(a.from.sectionId) ?? null : null,
      toClass: a.to.classId ? cn.get(a.to.classId) ?? null : null,
      toSection: a.to.sectionId ? sn.get(a.to.sectionId) ?? null : null,
      note: a.note,
    })),
    skipped: plan.skipped.map((s) => ({ ...s, ...who(s.studentId) })),
    counts: countByStatus(plan.actions),
  };
}

export async function previewPromotion(institutionId: string, body: PromotionRequestDtoType) {
  const { years } = await verifyRequest(institutionId, body);
  const plan = await buildPlan(institutionId, body);
  return {
    fromSession: years.get(body.fromAcademicYearId) ?? null,
    toSession: years.get(body.toAcademicYearId) ?? null,
    ...(await describePlan(institutionId, plan)),
  };
}

export async function executePromotion(institutionId: string, userId: string, body: PromotionRequestDtoType) {
  await verifyRequest(institutionId, body);
  const batchTime = new Date();

  // Serializable: two concurrent executes for the same students can't both
  // pass the "already processed for target session" check.
  const plan = await prisma.$transaction(
    async (tx) => {
      const p = await buildPlan(institutionId, body, tx);
      if (p.actions.length === 0) return p;
      await tx.promotionRecord.createMany({
        data: p.actions.map((a) => ({
          institutionId,
          studentId: a.studentId,
          status: a.status as PromotionStatus,
          fromAcademicYearId: a.from.academicYearId,
          toAcademicYearId: body.toAcademicYearId,
          fromClassId: a.from.classId,
          toClassId: a.to.classId,
          fromSectionId: a.from.sectionId,
          toSectionId: a.to.sectionId,
          promotedByUserId: userId,
          note: a.note,
          createdAt: batchTime,
        })),
      });
      for (const a of p.actions) {
        await tx.student.updateMany({
          where: { id: a.studentId, institutionId },
          data: a.studentUpdate,
        });
      }
      return p;
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 60_000 },
  );

  logger.info('Promotion batch executed', {
    institutionId,
    userId,
    processed: plan.actions.length,
    skipped: plan.skipped.length,
  });

  return {
    batchId: plan.actions.length > 0 ? encodeBatchId(batchTime, userId) : null,
    processed: plan.actions.length,
    ...(await describePlan(institutionId, plan)),
  };
}

// ── History + batches ───────────────────────────────────────────────────────

const recordSelect = {
  id: true,
  status: true,
  note: true,
  createdAt: true,
  promotedByUserId: true,
  student: { select: { id: true, studentId: true, firstName: true, lastName: true, rollNumber: true } },
  fromAcademicYear: { select: { id: true, label: true } },
  toAcademicYear: { select: { id: true, label: true } },
  fromClass: { select: { id: true, name: true } },
  toClass: { select: { id: true, name: true } },
  fromSection: { select: { id: true, name: true } },
  toSection: { select: { id: true, name: true } },
  promotedBy: { select: { firstName: true, lastName: true } },
} satisfies Prisma.PromotionRecordSelect;

export async function listHistory(institutionId: string, q: PromotionHistoryQueryDtoType) {
  const batch = q.batchId ? decodeBatchId(q.batchId) : null;
  if (q.batchId && !batch) throw new BadRequestError('Invalid batch id');
  const where: Prisma.PromotionRecordWhereInput = {
    institutionId,
    ...(q.studentId ? { studentId: q.studentId } : {}),
    ...(q.toAcademicYearId ? { toAcademicYearId: q.toAcademicYearId } : {}),
    ...(q.fromClassId ? { fromClassId: q.fromClassId } : {}),
    ...(q.status ? { status: q.status } : {}),
    ...(batch ? { createdAt: batch.createdAt, promotedByUserId: batch.userId } : {}),
  };
  const [items, total] = await prisma.$transaction([
    prisma.promotionRecord.findMany({
      where,
      select: recordSelect,
      orderBy: { createdAt: 'desc' },
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
    }),
    prisma.promotionRecord.count({ where }),
  ]);
  return {
    items: items.map((r) => ({ ...r, batchId: encodeBatchId(r.createdAt, r.promotedByUserId) })),
    meta: { total, page: q.page, pageSize: q.pageSize },
  };
}

export async function listBatches(institutionId: string, q: BatchQueryDtoType) {
  const allGroups = await prisma.promotionRecord.groupBy({
    by: ['createdAt', 'promotedByUserId'],
    where: { institutionId },
    orderBy: { createdAt: 'desc' },
  });
  const total = allGroups.length;
  const pageGroups = allGroups.slice((q.page - 1) * q.pageSize, q.page * q.pageSize);
  const latest = allGroups[0] ? encodeBatchId(allGroups[0].createdAt, allGroups[0].promotedByUserId) : null;

  const items = await Promise.all(
    pageGroups.map(async (g) => {
      const records = await prisma.promotionRecord.findMany({
        where: { institutionId, createdAt: g.createdAt, promotedByUserId: g.promotedByUserId },
        select: {
          status: true,
          fromClass: { select: { name: true } },
          toClass: { select: { name: true } },
          fromAcademicYear: { select: { label: true } },
          toAcademicYear: { select: { label: true } },
          promotedBy: { select: { firstName: true, lastName: true } },
        },
      });
      const first = records[0];
      const batchId = encodeBatchId(g.createdAt, g.promotedByUserId);
      return {
        id: batchId,
        batchId,
        createdAt: g.createdAt,
        promotedBy: first?.promotedBy ? `${first.promotedBy.firstName} ${first.promotedBy.lastName}`.trim() : null,
        fromClass: first?.fromClass?.name ?? null,
        toClasses: Array.from(new Set(records.map((r) => r.toClass?.name).filter(Boolean))),
        fromSession: first?.fromAcademicYear?.label ?? null,
        toSession: first?.toAcademicYear?.label ?? null,
        total: records.length,
        counts: countByStatus(records as Array<{ status: PromotionStatusValue }>),
        canUndo: batchId === latest && isWithinUndoWindow(g.createdAt),
      };
    }),
  );
  return { items, meta: { total, page: q.page, pageSize: q.pageSize } };
}

export async function undoBatch(institutionId: string, batchId: string) {
  const decoded = decodeBatchId(batchId);
  if (!decoded) throw new BadRequestError('Invalid batch id');

  const result = await prisma.$transaction(
    async (tx) => {
      const latest = await tx.promotionRecord.findFirst({
        where: { institutionId },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true, promotedByUserId: true },
      });
      if (!latest || encodeBatchId(latest.createdAt, latest.promotedByUserId) !== batchId) {
        throw new ConflictError('Only the most recent promotion batch can be undone');
      }
      if (!isWithinUndoWindow(latest.createdAt)) {
        throw new ConflictError('This batch is older than 24 hours and can no longer be undone');
      }
      const records = await tx.promotionRecord.findMany({
        where: { institutionId, createdAt: decoded.createdAt, promotedByUserId: decoded.userId },
        select: {
          id: true,
          studentId: true,
          status: true,
          fromAcademicYearId: true,
          toAcademicYearId: true,
          fromClassId: true,
          toClassId: true,
          fromSectionId: true,
          toSectionId: true,
        },
      });
      if (records.length === 0) throw new NotFoundError('Promotion batch not found');
      const current = await tx.student.findMany({
        where: { institutionId, id: { in: records.map((r) => r.studentId) } },
        select: { id: true, status: true, classId: true, sectionId: true, academicYearId: true },
      });
      const plan = planUndo(records, current);
      for (const r of plan.reverts) {
        await tx.student.updateMany({ where: { id: r.studentId, institutionId }, data: r.restore });
      }
      if (plan.reverts.length > 0) {
        await tx.promotionRecord.deleteMany({
          where: { institutionId, id: { in: plan.reverts.map((r) => r.recordId) } },
        });
      }
      return plan;
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 60_000 },
  );

  logger.info('Promotion batch undone', {
    institutionId,
    batchId,
    reverted: result.reverts.length,
    conflicts: result.conflicts.length,
  });
  return { reverted: result.reverts.length, conflicts: result.conflicts };
}
