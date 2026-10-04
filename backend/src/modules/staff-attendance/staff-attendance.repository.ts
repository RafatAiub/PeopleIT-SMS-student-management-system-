import { UserRole } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { STAFF_ROLES } from './staff-attendance.logic';

const STAFF_ROLE_ENUMS = STAFF_ROLES as unknown as UserRole[];

/**
 * Active staff roster: every active user of the tenant with a staff role, plus
 * anyone (e.g. an ADMIN) with an HR StaffProfile. Staff whose HR profile is
 * INACTIVE/SUSPENDED are left out.
 */
export async function findStaffRoster(institutionId: string) {
  const users = await prisma.user.findMany({
    where: {
      institutionId,
      isActive: true,
      status: 'ACTIVE',
      OR: [{ role: { in: STAFF_ROLE_ENUMS } }, { staffProfile: { isNot: null } }],
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      role: true,
      staffProfile: { select: { id: true, department: true, designation: true, employeeId: true, status: true } },
    },
    orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
  });
  return users.filter((u) => !u.staffProfile || u.staffProfile.status === 'ACTIVE');
}

export async function findStaffUsersByIds(institutionId: string, userIds: string[]) {
  return prisma.user.findMany({
    where: {
      institutionId,
      id: { in: userIds },
      OR: [{ role: { in: STAFF_ROLE_ENUMS } }, { staffProfile: { isNot: null } }],
    },
    select: { id: true },
  });
}

export async function findRecordsForDay(institutionId: string, date: Date) {
  return prisma.staffAttendance.findMany({ where: { institutionId, date } });
}

export async function findRecordsInRange(institutionId: string, start: Date, end: Date, staffUserId?: string) {
  return prisma.staffAttendance.findMany({
    where: { institutionId, date: { gte: start, lte: end }, ...(staffUserId ? { staffUserId } : {}) },
    orderBy: { date: 'asc' },
  });
}

export async function findApprovedLeavesCovering(institutionId: string, start: Date, end: Date, userIds?: string[]) {
  return prisma.leaveRequest.findMany({
    where: {
      institutionId,
      status: 'APPROVED',
      startDate: { lte: end },
      endDate: { gte: start },
      ...(userIds ? { applicantUserId: { in: userIds } } : {}),
    },
    select: { applicantUserId: true, startDate: true, endDate: true, leaveType: { select: { name: true } } },
  });
}

export async function upsertMany(
  institutionId: string,
  date: Date,
  markedByUserId: string,
  records: { staffUserId: string; status: string; note?: string | null }[],
) {
  return prisma.$transaction(
    records.map((r) =>
      prisma.staffAttendance.upsert({
        where: { institutionId_staffUserId_date: { institutionId, staffUserId: r.staffUserId, date } },
        update: { status: r.status, note: r.note ?? null, markedByUserId },
        create: { institutionId, staffUserId: r.staffUserId, date, status: r.status, note: r.note ?? null, markedByUserId },
      }),
    ),
  );
}
