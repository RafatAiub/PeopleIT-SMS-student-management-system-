import { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { BadRequestError } from '../../utils/AppError';
import type { PublicAttendanceSummaryQuery, PublicInvoicesQuery, PublicStudentsQuery } from './apiKeys.dto';

// =============================================================================
// Read-only public API data access. Every query is pinned to the API key's
// institution. Responses deliberately carry a minimal field set — no contact
// details, medical notes, addresses or credentials leave through a key.
// =============================================================================

export const MAX_ATTENDANCE_RANGE_DAYS = 92;

export async function listStudents(institutionId: string, q: PublicStudentsQuery) {
  const where: Prisma.StudentWhereInput = {
    institutionId,
    ...(q.classId ? { classId: q.classId } : {}),
    ...(q.sectionId ? { sectionId: q.sectionId } : {}),
    ...(q.status ? { status: q.status } : {}),
    ...(q.updatedSince ? { updatedAt: { gte: new Date(q.updatedSince) } } : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.student.findMany({
      where,
      select: {
        id: true,
        studentId: true,
        rollNumber: true,
        firstName: true,
        lastName: true,
        gender: true,
        status: true,
        admissionDate: true,
        updatedAt: true,
        classId: true,
        sectionId: true,
        class: { select: { name: true } },
        section: { select: { name: true } },
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
    }),
    prisma.student.count({ where }),
  ]);
  const items = rows.map(({ class: cls, section, ...rest }) => ({
    ...rest,
    className: cls?.name ?? null,
    sectionName: section?.name ?? null,
  }));
  return { items, meta: { total, page: q.page, pageSize: q.pageSize } };
}

export async function attendanceSummary(institutionId: string, q: PublicAttendanceSummaryQuery) {
  const from = new Date(`${q.from}T00:00:00.000Z`);
  const to = new Date(`${q.to}T23:59:59.999Z`);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from > to) {
    throw new BadRequestError('Invalid date range');
  }
  const days = Math.round((to.getTime() - from.getTime()) / 86_400_000);
  if (days > MAX_ATTENDANCE_RANGE_DAYS) {
    throw new BadRequestError(`Date range may span at most ${MAX_ATTENDANCE_RANGE_DAYS} days`);
  }
  const studentFilter: Prisma.StudentWhereInput | undefined =
    q.classId || q.sectionId
      ? { institutionId, ...(q.classId ? { classId: q.classId } : {}), ...(q.sectionId ? { sectionId: q.sectionId } : {}) }
      : undefined;
  const where: Prisma.AttendanceWhereInput = {
    institutionId,
    date: { gte: from, lte: to },
    ...(studentFilter ? { student: studentFilter } : {}),
  };

  const [byStatus, byDate] = await Promise.all([
    prisma.attendance.groupBy({ by: ['status'], where, _count: { _all: true } }),
    prisma.attendance.groupBy({ by: ['date', 'status'], where, _count: { _all: true }, orderBy: { date: 'asc' } }),
  ]);

  const totals: Record<string, number> = { PRESENT: 0, ABSENT: 0, LATE: 0, HALF_DAY: 0 };
  for (const row of byStatus) totals[row.status] = (totals[row.status] ?? 0) + row._count._all;
  const marked = Object.values(totals).reduce((a, b) => a + b, 0);
  const attended = (totals.PRESENT ?? 0) + (totals.LATE ?? 0) + (totals.HALF_DAY ?? 0);

  const dailyMap = new Map<string, Record<string, number>>();
  for (const row of byDate) {
    const key = row.date.toISOString().slice(0, 10);
    const bucket = dailyMap.get(key) ?? { PRESENT: 0, ABSENT: 0, LATE: 0, HALF_DAY: 0 };
    bucket[row.status] = (bucket[row.status] ?? 0) + row._count._all;
    dailyMap.set(key, bucket);
  }

  return {
    from: q.from,
    to: q.to,
    totals,
    marked,
    attendanceRate: marked ? Math.round((attended / marked) * 1000) / 10 : null,
    daily: Array.from(dailyMap.entries()).map(([date, counts]) => ({ date, ...counts })),
  };
}

export async function listInvoices(institutionId: string, q: PublicInvoicesQuery) {
  const dueDate: Prisma.DateTimeFilter | undefined =
    q.dueFrom || q.dueTo
      ? {
          ...(q.dueFrom ? { gte: new Date(`${q.dueFrom}T00:00:00.000Z`) } : {}),
          ...(q.dueTo ? { lte: new Date(`${q.dueTo}T23:59:59.999Z`) } : {}),
        }
      : undefined;
  const where: Prisma.InvoiceWhereInput = {
    institutionId,
    ...(q.status ? { status: q.status } : {}),
    ...(q.studentId ? { studentId: q.studentId } : {}),
    ...(dueDate ? { dueDate } : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.invoice.findMany({
      where,
      select: {
        id: true,
        invoiceNo: true,
        studentId: true,
        totalAmount: true,
        paidAmount: true,
        dueAmount: true,
        dueDate: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        student: { select: { studentId: true, firstName: true, lastName: true } },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
    }),
    prisma.invoice.count({ where }),
  ]);
  const items = rows.map((r) => ({
    ...r,
    totalAmount: Number(r.totalAmount),
    paidAmount: Number(r.paidAmount),
    dueAmount: Number(r.dueAmount),
  }));
  return { items, meta: { total, page: q.page, pageSize: q.pageSize } };
}
