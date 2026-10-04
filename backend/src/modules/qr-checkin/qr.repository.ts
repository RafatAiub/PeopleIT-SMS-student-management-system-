import { Prisma, UserRole } from '@prisma/client';
import { prisma } from '../../config/prisma';

const NON_STAFF_ROLES: UserRole[] = [UserRole.STUDENT, UserRole.GUARDIAN, UserRole.SUPER_ADMIN];

export async function findActiveStudent(institutionId: string, id: string) {
  return prisma.student.findFirst({
    where: { id, institutionId, status: 'ACTIVE' },
    select: {
      id: true,
      userId: true,
      studentId: true,
      firstName: true,
      lastName: true,
      rollNumber: true,
      avatarUrl: true,
      class: { select: { name: true } },
      section: { select: { name: true } },
    },
  });
}

export async function findStudentByUserId(institutionId: string, userId: string) {
  return prisma.student.findFirst({ where: { userId, institutionId }, select: { id: true } });
}

export async function findActiveStaffUser(institutionId: string, userId: string) {
  return prisma.user.findFirst({
    where: { id: userId, institutionId, isActive: true, role: { notIn: NON_STAFF_ROLES } },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      role: true,
      avatarUrl: true,
      staffProfile: { select: { designation: true, department: true } },
    },
  });
}

export async function findIdCardByToken(institutionId: string, verifyToken: string) {
  return prisma.idCard.findFirst({
    where: { verifyToken, institutionId },
    select: {
      status: true,
      expiresAt: true,
      userType: true,
      studentId: true,
      staff: { select: { userId: true } },
    },
  });
}

export async function findInstitutionTimezone(institutionId: string): Promise<string | null> {
  try {
    const inst = await prisma.institution.findUnique({ where: { id: institutionId }, select: { timezone: true } });
    return inst?.timezone ?? null;
  } catch {
    // Column not migrated yet — fall back to the default zone.
    return null;
  }
}

export async function findLastScan(institutionId: string, subject: { studentId?: string; userId?: string }) {
  const where: Prisma.QrCheckInWhereInput = subject.studentId
    ? { institutionId, studentId: subject.studentId }
    : { institutionId, userId: subject.userId, studentId: null };
  return prisma.qrCheckIn.findFirst({ where, orderBy: { scannedAt: 'desc' }, select: { scannedAt: true } });
}

export async function createCheckIn(data: {
  institutionId: string;
  userId: string;
  studentId?: string | null;
  scannedAt: Date;
  method: string;
  deviceInfo?: string | null;
}) {
  return prisma.qrCheckIn.create({ data });
}

export async function findAttendance(institutionId: string, studentId: string, date: Date) {
  return prisma.attendance.findUnique({
    where: { institutionId_studentId_date: { institutionId, studentId, date } },
  });
}

export async function upsertAttendance(institutionId: string, studentId: string, date: Date, status: string, notes: string) {
  return prisma.attendance.upsert({
    where: { institutionId_studentId_date: { institutionId, studentId, date } },
    update: { status, notes },
    create: { institutionId, studentId, date, status, notes },
  });
}

export async function findStaffAttendance(institutionId: string, staffUserId: string, date: Date) {
  return prisma.staffAttendance.findUnique({
    where: { institutionId_staffUserId_date: { institutionId, staffUserId, date } },
  });
}

export async function upsertStaffAttendance(
  institutionId: string,
  staffUserId: string,
  date: Date,
  create: Prisma.StaffAttendanceUncheckedCreateInput,
  update: Prisma.StaffAttendanceUncheckedUpdateInput,
) {
  return prisma.staffAttendance.upsert({
    where: { institutionId_staffUserId_date: { institutionId, staffUserId, date } },
    create,
    update,
  });
}

export async function listStudents(
  institutionId: string,
  q: { className?: string; sectionName?: string; search?: string; skip: number; take: number },
) {
  const where: Prisma.StudentWhereInput = {
    institutionId,
    status: 'ACTIVE',
    ...(q.className ? { class: { name: q.className } } : {}),
    ...(q.sectionName ? { section: { name: q.sectionName } } : {}),
    ...(q.search
      ? {
          OR: [
            { firstName: { contains: q.search, mode: 'insensitive' } },
            { lastName: { contains: q.search, mode: 'insensitive' } },
            { studentId: { contains: q.search, mode: 'insensitive' } },
          ],
        }
      : {}),
  };
  const [items, total] = await prisma.$transaction([
    prisma.student.findMany({
      where,
      select: {
        id: true,
        studentId: true,
        firstName: true,
        lastName: true,
        rollNumber: true,
        class: { select: { name: true } },
        section: { select: { name: true } },
      },
      orderBy: [{ rollNumber: 'asc' }, { firstName: 'asc' }],
      skip: q.skip,
      take: q.take,
    }),
    prisma.student.count({ where }),
  ]);
  return { items, total };
}

export async function listStaffUsers(institutionId: string, q: { search?: string; skip: number; take: number }) {
  const where: Prisma.UserWhereInput = {
    institutionId,
    isActive: true,
    role: { notIn: NON_STAFF_ROLES },
    ...(q.search
      ? {
          OR: [
            { firstName: { contains: q.search, mode: 'insensitive' } },
            { lastName: { contains: q.search, mode: 'insensitive' } },
            { email: { contains: q.search, mode: 'insensitive' } },
          ],
        }
      : {}),
  };
  const [items, total] = await prisma.$transaction([
    prisma.user.findMany({
      where,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        role: true,
        staffProfile: { select: { designation: true, employeeId: true } },
      },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
      skip: q.skip,
      take: q.take,
    }),
    prisma.user.count({ where }),
  ]);
  return { items, total };
}

export async function listCheckIns(institutionId: string, q: { start?: Date; end?: Date; skip: number; take: number }) {
  const where: Prisma.QrCheckInWhereInput = {
    institutionId,
    ...(q.start && q.end ? { scannedAt: { gte: q.start, lt: q.end } } : {}),
  };
  const [items, total] = await prisma.$transaction([
    prisma.qrCheckIn.findMany({
      where,
      orderBy: { scannedAt: 'desc' },
      skip: q.skip,
      take: q.take,
      select: {
        id: true,
        scannedAt: true,
        method: true,
        deviceInfo: true,
        studentId: true,
        user: { select: { id: true, firstName: true, lastName: true, role: true } },
        student: {
          select: {
            firstName: true,
            lastName: true,
            studentId: true,
            class: { select: { name: true } },
            section: { select: { name: true } },
          },
        },
      },
    }),
    prisma.qrCheckIn.count({ where }),
  ]);
  return { items, total };
}
