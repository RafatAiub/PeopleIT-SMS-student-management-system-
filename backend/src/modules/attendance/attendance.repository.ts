import { prisma } from '../../config/prisma';
import type { BulkSubmitAttendanceDtoType, AttendanceQueryDtoType } from './attendance.dto';
import { NotFoundError } from '../../utils/AppError';

export async function upsertBulkAttendance(
  institutionId: string,
  date: Date,
  records: BulkSubmitAttendanceDtoType['records'],
) {
  // Normalize date to YYYY-MM-DD at 00:00:00 UTC
  const normalizedDate = new Date(date.toISOString().split('T')[0] + 'T00:00:00.000Z');

  const operations = records.map((record) => {
    const data = {
      institutionId,
      studentId: record.studentId,
      date: normalizedDate,
      status: record.status,
      notes: record.notes || null,
    };
    return prisma.attendance.upsert({
      where: {
        institutionId_studentId_date: {
          institutionId,
          studentId: record.studentId,
          date: normalizedDate,
        },
      },
      update: {
        status: record.status,
        notes: record.notes || null,
      },
      create: data,
    });
  });

  return prisma.$transaction(operations);
}

export async function findAll(
  institutionId: string,
  query: AttendanceQueryDtoType,
) {
  const { page, pageSize, date, startDate, endDate, studentId, status, classId, sectionId } = query;
  const skip = (page - 1) * pageSize;

  const dateFilter: any = {};
  if (date) {
    const normalizedDate = new Date(date.toISOString().split('T')[0] + 'T00:00:00.000Z');
    dateFilter.equals = normalizedDate;
  } else if (startDate || endDate) {
    if (startDate) {
      dateFilter.gte = new Date(startDate.toISOString().split('T')[0] + 'T00:00:00.000Z');
    }
    if (endDate) {
      dateFilter.lte = new Date(endDate.toISOString().split('T')[0] + 'T23:59:59.999Z');
    }
  }

  const where = {
    institutionId,
    ...(Object.keys(dateFilter).length > 0 ? { date: dateFilter } : {}),
    ...(studentId ? { studentId } : {}),
    ...(status ? { status } : {}),
    ...(classId || sectionId
      ? {
          student: {
            ...(classId ? { classId } : {}),
            ...(sectionId ? { sectionId } : {}),
          },
        }
      : {}),
  };

  const [records, total] = await prisma.$transaction([
    prisma.attendance.findMany({
      where,
      include: {
        student: {
          select: {
            id: true,
            studentId: true,
            firstName: true,
            lastName: true,
            rollNumber: true,
            class: { select: { id: true, name: true } },
            section: { select: { id: true, name: true } },
          },
        },
      },
      skip,
      take: pageSize,
      orderBy: [
        { date: 'desc' },
        { student: { firstName: 'asc' } },
      ],
    }),
    prisma.attendance.count({ where }),
  ]);

  return { records, total };
}

export async function assignTeacherToSection(
  institutionId: string,
  teacherId: string,
  sectionId: string,
) {
  // Confirm the section belongs to this institution
  const section = await prisma.section.findFirst({
    where: {
      id: sectionId,
      class: { branch: { institutionId } },
    },
  });

  if (!section) {
    throw new NotFoundError('Section not found in this institution');
  }

  // Confirm the teacher belongs to this institution
  let teacher = await prisma.teacher.findFirst({
    where: {
      OR: [
        { id: teacherId },
        { userId: teacherId },
      ],
      user: { institutionId },
    },
  });

  if (!teacher) {
    // Attempt auto-healing: check if user exists with role: 'TEACHER'
    const teacherUser = await prisma.user.findFirst({
      where: {
        id: teacherId,
        role: 'TEACHER',
        institutionId,
      },
    });

    if (teacherUser) {
      teacher = await prisma.teacher.create({
        data: {
          userId: teacherUser.id,
          employeeId: `TCH-${Date.now()}`,
        },
      });
    } else {
      throw new NotFoundError('Teacher not found in this institution');
    }
  }

  return prisma.section.update({
    where: { id: sectionId },
    data: { classTeacherId: teacher.id },
  });
}

export async function getAssignments(institutionId: string) {
  return prisma.section.findMany({
    where: {
      class: { branch: { institutionId } },
      classTeacherId: { not: null },
    },
    include: {
      class: { select: { name: true } },
      classTeacher: {
        include: {
          user: {
            select: {
              firstName: true,
              lastName: true,
              email: true,
            },
          },
        },
      },
    },
  });
}

export async function getTeacherSections(userId: string, institutionId: string) {
  return prisma.section.findMany({
    where: {
      class: { branch: { institutionId } },
      classTeacher: { userId },
    },
    include: {
      class: { select: { name: true } },
    },
  });
}

export async function getAttendanceSheet(
  institutionId: string,
  className: string,
  sectionName: string,
  date: Date,
) {
  const normalizedDate = new Date(date.toISOString().split('T')[0] + 'T00:00:00.000Z');

  // 1. Fetch students in the specified class & section for this institution
  const students = await prisma.student.findMany({
    where: {
      institutionId,
      class: { name: className },
      section: { name: sectionName },
      status: 'ACTIVE',
    },
    select: {
      id: true,
      studentId: true,
      firstName: true,
      lastName: true,
      rollNumber: true,
    },
    orderBy: { rollNumber: 'asc' },
  });

  // 2. Fetch existing attendance records for these students on that date
  const studentIds = students.map((s) => s.id);
  const attendanceRecords = await prisma.attendance.findMany({
    where: {
      institutionId,
      date: normalizedDate,
      studentId: { in: studentIds },
    },
  });

  // 3. Merge student profiles with attendance status (defaulting to PRESENT)
  return students.map((student) => {
    const record = attendanceRecords.find((r) => r.studentId === student.id);
    return {
      ...student,
      status: record ? record.status : 'PRESENT',
      notes: record ? record.notes : null,
    };
  });
}

export async function getStudentAttendanceHistory(userId: string, institutionId: string) {
  const student = await prisma.student.findFirst({
    where: { userId, institutionId },
  });

  if (!student) {
    throw new NotFoundError('Student profile not found');
  }

  return getAttendanceHistoryByStudentId(institutionId, student.id, student);
}

// Shared by both the STUDENT self-service route (resolved via userId above)
// and the GUARDIAN "my child's attendance" route, which already knows the
// studentId (ownership-checked in the service layer before this is called).
export async function getAttendanceHistoryByStudentId(
  institutionId: string,
  studentId: string,
  preloadedStudent?: NonNullable<Awaited<ReturnType<typeof prisma.student.findFirst>>>,
) {
  const student =
    preloadedStudent ?? (await prisma.student.findFirst({ where: { id: studentId, institutionId } }));
  if (!student) {
    throw new NotFoundError('Student profile not found');
  }

  const attendance = await prisma.attendance.findMany({
    where: { studentId: student.id, institutionId },
    orderBy: { date: 'desc' },
  });

  const totals = {
    present: 0,
    absent: 0,
    late: 0,
    halfDay: 0,
  };

  attendance.forEach((r) => {
    if (r.status === 'PRESENT') totals.present++;
    else if (r.status === 'ABSENT') totals.absent++;
    else if (r.status === 'LATE') totals.late++;
    else if (r.status === 'HALF_DAY') totals.halfDay++;
  });

  // Smart Absent Fine logic: BDT 100 per day absent
  const finePerAbsent = 100;
  const finesDue = totals.absent * finePerAbsent;

  return {
    student,
    attendance,
    statistics: {
      ...totals,
      totalDays: attendance.length,
      attendancePercentage: attendance.length
        ? Math.round(((totals.present + totals.late + totals.halfDay * 0.5) / attendance.length) * 100)
        : 100,
    },
    finesDue,
  };
}
