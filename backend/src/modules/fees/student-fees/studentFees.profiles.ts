import { Prisma } from '@prisma/client';
import { prisma } from '../../../config/prisma';
import { BadRequestError, NotFoundError } from '../../../utils/AppError';
import { addMonths, monthsBetween, periodOf, profileAmountForPeriod, type FeeProfileLite } from './studentFees.logic';
import { dec, num, writeAudit, type FeeCtx, type Tx } from './studentFees.shared';
import type { BulkProfileDtoType, ProfileDtoType } from './studentFees.dto';

// Student fee profile: a custom monthly fee / yearly total for one student.
// Rows are never edited: a new rate closes the previous one (effectiveTo =
// the month before) so the full history stays visible.

type ProfileInput = Omit<ProfileDtoType, 'studentId'>;

type ProfileRow = Prisma.StudentFeeProfileGetPayload<{ include: { feeCategory: { select: { name: true } } } }>;

export function toLite(r: {
  id: string;
  feeCategoryId: string | null;
  kind: string;
  monthlyAmount: Prisma.Decimal | null;
  yearlyAmount: Prisma.Decimal | null;
  yearlyMode: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  endedAt: Date | null;
  createdAt: Date;
}): FeeProfileLite {
  return {
    id: r.id,
    feeCategoryId: r.feeCategoryId,
    kind: r.kind,
    monthlyAmount: r.monthlyAmount === null ? null : num(r.monthlyAmount),
    yearlyAmount: r.yearlyAmount === null ? null : num(r.yearlyAmount),
    yearlyMode: r.yearlyMode,
    effectiveFrom: r.effectiveFrom,
    effectiveTo: r.effectiveTo,
    endedAt: r.endedAt,
    createdAt: r.createdAt,
  };
}

function view(r: ProfileRow, now = new Date()) {
  const lite = toLite(r);
  const period = periodOf(now);
  return {
    id: r.id,
    studentId: r.studentId,
    feeCategoryId: r.feeCategoryId,
    categoryName: r.feeCategory?.name ?? null,
    kind: r.kind,
    monthlyAmount: lite.monthlyAmount,
    yearlyAmount: lite.yearlyAmount,
    yearlyMode: r.yearlyMode,
    effectiveFrom: r.effectiveFrom,
    effectiveTo: r.effectiveTo,
    reason: r.reason,
    createdByUserId: r.createdByUserId,
    createdAt: r.createdAt,
    endedAt: r.endedAt,
    endReason: r.endReason,
    /** This month's amount from this profile, or null if not in force. */
    currentAmount: profileAmountForPeriod(lite, period),
    status: r.endedAt
      ? 'VOID'
      : monthsBetween(r.effectiveFrom, period) < 0
        ? 'UPCOMING'
        : r.effectiveTo && monthsBetween(period, r.effectiveTo) < 0
          ? 'ENDED'
          : 'ACTIVE',
  };
}

async function assertCategory(institutionId: string, feeCategoryId: string | null | undefined) {
  if (!feeCategoryId) return;
  const ok = await prisma.feeCategory.findFirst({ where: { id: feeCategoryId, institutionId }, select: { id: true } });
  if (!ok) throw new BadRequestError('Fee category not found');
}

/** Closes/voids the student's earlier profiles for the same category that overlap the new one. */
async function closeOverlapping(tx: Tx, ctx: FeeCtx, studentId: string, input: ProfileInput) {
  const existing = await tx.studentFeeProfile.findMany({
    where: { institutionId: ctx.institutionId, studentId, feeCategoryId: input.feeCategoryId ?? null, endedAt: null },
  });
  for (const p of existing) {
    const endsBefore = p.effectiveTo && monthsBetween(p.effectiveTo, input.effectiveFrom) > 0;
    if (endsBefore) continue; // no overlap
    const startsAfterNewEnd = input.effectiveTo && monthsBetween(input.effectiveTo, p.effectiveFrom) > 0;
    if (startsAfterNewEnd) continue; // later rate, untouched
    if (monthsBetween(p.effectiveFrom, input.effectiveFrom) > 0) {
      await tx.studentFeeProfile.update({ where: { id: p.id }, data: { effectiveTo: addMonths(input.effectiveFrom, -1) } });
    } else {
      await tx.studentFeeProfile.update({
        where: { id: p.id },
        data: { endedAt: new Date(), endedByUserId: ctx.userId, endReason: 'Replaced by a newer rate' },
      });
    }
  }
}

async function createOne(tx: Tx, ctx: FeeCtx, studentId: string, input: ProfileInput) {
  await closeOverlapping(tx, ctx, studentId, input);
  const isYearly = input.kind === 'YEARLY';
  return tx.studentFeeProfile.create({
    data: {
      institutionId: ctx.institutionId,
      studentId,
      feeCategoryId: input.feeCategoryId ?? null,
      kind: input.kind,
      monthlyAmount: !isYearly && input.monthlyAmount !== null && input.monthlyAmount !== undefined ? dec(input.monthlyAmount) : null,
      yearlyAmount: isYearly && input.yearlyAmount !== null && input.yearlyAmount !== undefined ? dec(input.yearlyAmount) : null,
      yearlyMode: input.yearlyMode ?? 'SPREAD',
      effectiveFrom: input.effectiveFrom,
      effectiveTo: input.effectiveTo ?? null,
      reason: input.reason,
      createdByUserId: ctx.userId,
    },
    include: { feeCategory: { select: { name: true } } },
  });
}

export async function createProfile(ctx: FeeCtx, dto: ProfileDtoType) {
  const student = await prisma.student.findFirst({ where: { id: dto.studentId, institutionId: ctx.institutionId }, select: { id: true } });
  if (!student) throw new NotFoundError('Student not found');
  await assertCategory(ctx.institutionId, dto.feeCategoryId);
  const { studentId, ...input } = dto;
  const row = await prisma.$transaction(async (tx) => {
    const r = await createOne(tx, ctx, studentId, input);
    await writeAudit(tx, {
      institutionId: ctx.institutionId,
      userId: ctx.userId,
      action: 'CREATE',
      resource: 'StudentFeeProfile',
      resourceId: r.id,
      metadata: { studentId, ...input },
    });
    return r;
  });
  return view(row);
}

/** Same rate for many students (e.g. a whole section). One transaction. */
export async function bulkCreateProfiles(ctx: FeeCtx, dto: BulkProfileDtoType) {
  const ids = [...new Set(dto.studentIds)];
  const found = await prisma.student.findMany({ where: { id: { in: ids }, institutionId: ctx.institutionId }, select: { id: true } });
  if (found.length !== ids.length) throw new BadRequestError('One or more students were not found');
  await assertCategory(ctx.institutionId, dto.feeCategoryId);
  const { studentIds: _ids, ...input } = dto;
  void _ids;
  const created = await prisma.$transaction(
    async (tx) => {
      const out: string[] = [];
      for (const sid of ids) out.push((await createOne(tx, ctx, sid, input)).id);
      await writeAudit(tx, {
        institutionId: ctx.institutionId,
        userId: ctx.userId,
        action: 'CREATE',
        resource: 'StudentFeeProfile',
        metadata: { bulk: true, studentCount: ids.length, ...input },
      });
      return out;
    },
    { timeout: 60_000, maxWait: 10_000 },
  );
  return { created: created.length };
}

/** End a rate after a month (effectiveTo), or void it entirely (no effectiveTo). */
export async function endProfile(ctx: FeeCtx, id: string, dto: { effectiveTo?: string | null; reason: string }) {
  const p = await prisma.studentFeeProfile.findFirst({ where: { id, institutionId: ctx.institutionId } });
  if (!p) throw new NotFoundError('Fee profile not found');
  if (p.endedAt) throw new BadRequestError('This fee profile is already void');
  if (dto.effectiveTo && monthsBetween(p.effectiveFrom, dto.effectiveTo) < 0) {
    throw new BadRequestError('The end month cannot be before the start month');
  }
  const row = await prisma.$transaction(async (tx) => {
    const r = await tx.studentFeeProfile.update({
      where: { id },
      data: dto.effectiveTo
        ? { effectiveTo: dto.effectiveTo, endReason: dto.reason }
        : { endedAt: new Date(), endedByUserId: ctx.userId, endReason: dto.reason },
      include: { feeCategory: { select: { name: true } } },
    });
    await writeAudit(tx, {
      institutionId: ctx.institutionId,
      userId: ctx.userId,
      action: 'UPDATE',
      resource: 'StudentFeeProfile',
      resourceId: id,
      metadata: { end: dto.effectiveTo ?? 'VOID', reason: dto.reason },
    });
    return r;
  });
  return view(row);
}

/** Full history for one student (newest first) + this month's effective amounts. */
export async function studentProfiles(institutionId: string, studentId: string) {
  const student = await prisma.student.findFirst({ where: { id: studentId, institutionId }, select: { id: true } });
  if (!student) throw new NotFoundError('Student not found');
  const rows = await prisma.studentFeeProfile.findMany({
    where: { institutionId, studentId },
    include: { feeCategory: { select: { name: true } } },
    orderBy: [{ createdAt: 'desc' }],
  });
  return { items: rows.map((r) => view(r)) };
}

/** Students with a custom rate in force or upcoming (Fees → Fee profiles). */
export async function listProfiles(
  institutionId: string,
  q: { classId?: string; sectionId?: string; search?: string; page: number; pageSize: number },
) {
  const period = periodOf(new Date());
  const where: Prisma.StudentFeeProfileWhereInput = {
    institutionId,
    endedAt: null,
    OR: [{ effectiveTo: null }, { effectiveTo: { gte: period } }],
    student: {
      ...(q.classId ? { classId: q.classId } : {}),
      ...(q.sectionId ? { sectionId: q.sectionId } : {}),
      ...(q.search
        ? {
            OR: [
              { firstName: { contains: q.search, mode: 'insensitive' } },
              { lastName: { contains: q.search, mode: 'insensitive' } },
              { studentId: { contains: q.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    },
  };
  const [total, rows] = await prisma.$transaction([
    prisma.studentFeeProfile.count({ where }),
    prisma.studentFeeProfile.findMany({
      where,
      include: {
        feeCategory: { select: { name: true } },
        student: { select: { firstName: true, lastName: true, studentId: true, rollNumber: true, class: { select: { name: true } }, section: { select: { name: true } } } },
      },
      orderBy: [{ createdAt: 'desc' }],
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
    }),
  ]);
  return {
    items: rows.map((r) => ({
      ...view(r),
      student: {
        firstName: r.student.firstName,
        lastName: r.student.lastName,
        studentId: r.student.studentId,
        rollNumber: r.student.rollNumber,
        className: r.student.class?.name ?? null,
        sectionName: r.student.section?.name ?? null,
      },
    })),
    meta: { total, page: q.page, pageSize: q.pageSize },
  };
}
