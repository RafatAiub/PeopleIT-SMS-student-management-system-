import { prisma } from '../../config/prisma';
import { logger } from '../../utils/logger';
import type { BulkStaffAttendanceDtoType } from './staffAttendance.dto';

function dayRange(date: Date) {
  const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return { start, end };
}

/** Every active staff member, with that day's status (or null if unmarked). */
export async function getDailyAttendance(institutionId: string, date: Date) {
  const { start, end } = dayRange(date);

  const staff = await prisma.staffProfile.findMany({
    where: { institutionId, status: 'ACTIVE' },
    select: {
      id: true,
      designation: true,
      user: { select: { firstName: true, lastName: true, avatarUrl: true } },
    },
    orderBy: { createdAt: 'asc' },
  });

  const records = await prisma.staffAttendance.findMany({
    where: { institutionId, date: { gte: start, lt: end } },
    select: { staffId: true, status: true },
  });
  const statusByStaffId = new Map(records.map((r) => [r.staffId, r.status]));

  return staff.map((s) => ({ ...s, status: statusByStaffId.get(s.id) ?? null }));
}

export async function bulkMark(institutionId: string, data: BulkStaffAttendanceDtoType) {
  const staffIds = Array.from(new Set(data.records.map((r) => r.staffId)));
  const owned = await prisma.staffProfile.findMany({ where: { id: { in: staffIds }, institutionId }, select: { id: true } });
  const ownedIds = new Set(owned.map((s) => s.id));
  const missing = staffIds.filter((id) => !ownedIds.has(id));
  if (missing.length > 0) {
    throw new Error(`Staff member(s) not found in this institution: ${missing.join(', ')}`);
  }

  const { start } = dayRange(data.date);
  await prisma.$transaction(
    data.records.map((r) =>
      prisma.staffAttendance.upsert({
        where: { institutionId_staffId_date: { institutionId, staffId: r.staffId, date: start } },
        update: { status: r.status },
        create: { institutionId, staffId: r.staffId, date: start, status: r.status },
      }),
    ),
  );

  logger.info('Staff attendance marked', { institutionId, date: start.toISOString(), count: data.records.length });
  return { updatedCount: data.records.length };
}
