// =============================================================================
// AI module — data access. Every query is scoped by institutionId (req.tenantId).
// Heavy lifting uses groupBy/aggregate so we never load every attendance row.
// =============================================================================

import { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';

export const ATTENDED_STATUSES = ['PRESENT', 'LATE', 'HALF_DAY'];

export interface StudentFilter {
  classId?: string;
  sectionId?: string;
  studentIds?: string[];
}

export async function findActiveStudents(institutionId: string, filter: StudentFilter = {}) {
  return prisma.student.findMany({
    where: {
      institutionId,
      status: 'ACTIVE',
      ...(filter.classId ? { classId: filter.classId } : {}),
      ...(filter.sectionId ? { sectionId: filter.sectionId } : {}),
      ...(filter.studentIds ? { id: { in: filter.studentIds } } : {}),
    },
    select: {
      id: true,
      studentId: true,
      firstName: true,
      lastName: true,
      userId: true,
      classId: true,
      sectionId: true,
      class: { select: { name: true } },
      section: { select: { name: true } },
    },
    orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
  });
}
export type StudentLite = Awaited<ReturnType<typeof findActiveStudents>>[number];

/** Attendance row counts per (student, status) in [from, to). */
export async function attendanceCountsByStudent(
  institutionId: string,
  from: Date,
  to: Date,
  studentIds?: string[],
): Promise<Map<string, { total: number; attended: number; late: number; absent: number }>> {
  const rows = await prisma.attendance.groupBy({
    by: ['studentId', 'status'],
    where: {
      institutionId,
      date: { gte: from, lt: to },
      ...(studentIds ? { studentId: { in: studentIds } } : {}),
    },
    _count: { _all: true },
  });
  const map = new Map<string, { total: number; attended: number; late: number; absent: number }>();
  for (const r of rows) {
    const m = map.get(r.studentId) ?? { total: 0, attended: 0, late: 0, absent: 0 };
    const n = r._count._all;
    m.total += n;
    if (ATTENDED_STATUSES.includes(r.status)) m.attended += n;
    if (r.status === 'LATE') m.late += n;
    if (r.status === 'ABSENT') m.absent += n;
    map.set(r.studentId, m);
  }
  return map;
}

/** Sum of marks / sum of max marks per student, as a percentage. */
export async function examPercentByStudent(institutionId: string, studentIds?: string[]): Promise<Map<string, number>> {
  const rows = await prisma.examResult.groupBy({
    by: ['studentId'],
    where: { institutionId, ...(studentIds ? { studentId: { in: studentIds } } : {}) },
    _sum: { marksObtained: true, maxMarks: true },
  });
  const map = new Map<string, number>();
  for (const r of rows) {
    const obtained = Number(r._sum.marksObtained ?? 0);
    const max = Number(r._sum.maxMarks ?? 0);
    if (max > 0) map.set(r.studentId, (obtained / max) * 100);
  }
  return map;
}

export const classSectionKey = (className?: string | null, sectionName?: string | null) =>
  `${(className ?? '').trim().toLowerCase()}|${(sectionName ?? '').trim().toLowerCase()}`;

/** Teacher-set assignments with a due date in [from, to], per class+section name. */
export async function dueAssignmentsByClassSection(institutionId: string, from: Date, to: Date): Promise<Map<string, number>> {
  const rows = await prisma.assignment.groupBy({
    by: ['className', 'sectionName'],
    where: { institutionId, parentAssignmentId: null, dueDate: { gte: from, lte: to } },
    _count: { _all: true },
  });
  return new Map(rows.map((r) => [classSectionKey(r.className, r.sectionName), r._count._all]));
}

/** Student submissions (by the student's userId) to assignments due in [from, to]. */
export async function submissionsByUser(institutionId: string, from: Date, to: Date): Promise<Map<string, number>> {
  const rows = await prisma.assignment.groupBy({
    by: ['createdByUserId'],
    where: {
      institutionId,
      parentAssignmentId: { not: null },
      parentAssignment: { dueDate: { gte: from, lte: to } },
    },
    _count: { _all: true },
  });
  return new Map(rows.map((r) => [r.createdByUserId, r._count._all]));
}

// ── Attendance patterns ─────────────────────────────────────────────────────

export async function absentCountsSince(institutionId: string, since: Date, studentIds?: string[]) {
  const rows = await prisma.attendance.groupBy({
    by: ['studentId'],
    where: { institutionId, status: 'ABSENT', date: { gte: since }, ...(studentIds ? { studentId: { in: studentIds } } : {}) },
    _count: { _all: true },
  });
  return new Map(rows.map((r) => [r.studentId, r._count._all]));
}

/** Full rows only for the (few) candidate students — bounded by window and candidates. */
export async function attendanceRowsFor(institutionId: string, studentIds: string[], since: Date) {
  if (studentIds.length === 0) return [];
  return prisma.attendance.findMany({
    where: { institutionId, studentId: { in: studentIds }, date: { gte: since } },
    select: { studentId: true, date: true, status: true },
    orderBy: { date: 'asc' },
  });
}

// ── Fees ────────────────────────────────────────────────────────────────────

export async function invoicesForRisk(institutionId: string, since: Date, studentIds?: string[]) {
  return prisma.invoice.findMany({
    where: {
      institutionId,
      status: { not: 'CANCELLED' },
      OR: [{ dueDate: { gte: since } }, { status: { in: ['UNPAID', 'PARTIAL', 'OVERDUE'] } }],
      ...(studentIds ? { studentId: { in: studentIds } } : {}),
    },
    select: {
      studentId: true,
      dueDate: true,
      status: true,
      totalAmount: true,
      paidAmount: true,
      dueAmount: true,
      payments: { select: { paidAt: true }, orderBy: { paidAt: 'desc' }, take: 1 },
    },
  });
}

// ── Institution ─────────────────────────────────────────────────────────────

export async function institutionName(institutionId: string): Promise<string> {
  const inst = await prisma.institution.findUnique({ where: { id: institutionId }, select: { name: true } });
  return inst?.name ?? 'School';
}

export async function institutionClasses(institutionId: string) {
  return prisma.class.findMany({
    where: { branch: { institutionId } },
    select: { id: true, name: true, level: true },
    orderBy: [{ level: 'asc' }, { name: 'asc' }],
  });
}

// ── Enrolment history (raw aggregate: year × class) ─────────────────────────

export async function admissionsByYearAndClass(institutionId: string) {
  return prisma.$queryRaw<{ classId: string | null; year: number; count: number }[]>(Prisma.sql`
    SELECT "classId", EXTRACT(YEAR FROM "admissionDate")::int AS year, COUNT(*)::int AS count
    FROM "Student"
    WHERE "institutionId" = ${institutionId}
    GROUP BY "classId", EXTRACT(YEAR FROM "admissionDate")
    ORDER BY year ASC
  `);
}
