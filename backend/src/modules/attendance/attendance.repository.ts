import { prisma } from '../../config/prisma';
import type { BulkSubmitAttendanceDtoType, AttendanceQueryDtoType } from './attendance.dto';
import { NotFoundError, BadRequestError } from '../../utils/AppError';
import { logger } from '../../utils/logger';

// Defensive model delegates resolution helper to handle runtime client differences safely
const getStudentModel = () => (prisma as any)?.student || (prisma as any)?.Student;
const getAttendanceModel = () => (prisma as any)?.attendance || (prisma as any)?.Attendance;
const getSectionModel = () => (prisma as any)?.section || (prisma as any)?.Section;
const getTeacherModel = () => (prisma as any)?.teacher || (prisma as any)?.Teacher;
const getUserModel = () => (prisma as any)?.user || (prisma as any)?.User;

export async function upsertBulkAttendance(
  institutionId: string | undefined,
  date: Date,
  records: BulkSubmitAttendanceDtoType['records'],
) {
  const attendanceModel = getAttendanceModel();
  if (!attendanceModel) {
    logger.error('Prisma attendance model delegate is unavailable');
    return [];
  }

  if (!institutionId) {
    throw new BadRequestError('An institution context is required to submit attendance');
  }

  const dateStr = isNaN(date.getTime()) ? new Date().toISOString().split('T')[0] : date.toISOString().split('T')[0];
  const normalizedDate = new Date(dateStr + 'T00:00:00.000Z');

  const operations = records.map((record) => {
    return attendanceModel.upsert({
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
      create: {
        institutionId,
        studentId: record.studentId,
        date: normalizedDate,
        status: record.status,
        notes: record.notes || null,
      },
    });
  });

  return prisma.$transaction(operations);
}

export async function findAll(
  institutionId: string | undefined,
  query: AttendanceQueryDtoType,
) {
  const attendanceModel = getAttendanceModel();
  if (!attendanceModel) {
    return { records: [], total: 0 };
  }

  const { page, pageSize, date, startDate, endDate, studentId, status, classId, sectionId } = query;
  const skip = (page - 1) * pageSize;

  const dateFilter: any = {};
  if (date) {
    const dateStr = isNaN(date.getTime()) ? new Date().toISOString().split('T')[0] : date.toISOString().split('T')[0];
    dateFilter.equals = new Date(dateStr + 'T00:00:00.000Z');
  } else if (startDate || endDate) {
    if (startDate) {
      const sStr = isNaN(startDate.getTime()) ? new Date().toISOString().split('T')[0] : startDate.toISOString().split('T')[0];
      dateFilter.gte = new Date(sStr + 'T00:00:00.000Z');
    }
    if (endDate) {
      const eStr = isNaN(endDate.getTime()) ? new Date().toISOString().split('T')[0] : endDate.toISOString().split('T')[0];
      dateFilter.lte = new Date(eStr + 'T23:59:59.999Z');
    }
  }

  const where: any = {
    ...(institutionId ? { institutionId } : {}),
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
    attendanceModel.findMany({
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
    attendanceModel.count({ where }),
  ]);

  return { records, total };
}

export async function assignTeacherToSection(
  institutionId: string | undefined,
  teacherId: string,
  sectionId: string,
) {
  const sectionModel = getSectionModel();
  const teacherModel = getTeacherModel();
  const userModel = getUserModel();

  if (!sectionModel || !teacherModel) {
    throw new NotFoundError('Database models unavailable');
  }

  const sectionWhere: any = { id: sectionId };
  if (institutionId) {
    sectionWhere.class = { branch: { institutionId } };
  }

  const section = await sectionModel.findFirst({ where: sectionWhere });

  if (!section) {
    throw new NotFoundError('Section not found in this institution');
  }

  const teacherWhere: any = {
    OR: [
      { id: teacherId },
      { userId: teacherId },
    ],
  };
  if (institutionId) {
    teacherWhere.user = { institutionId };
  }

  let teacher = await teacherModel.findFirst({ where: teacherWhere });

  if (!teacher && userModel) {
    const teacherUserWhere: any = { id: teacherId, role: 'TEACHER' };
    if (institutionId) teacherUserWhere.institutionId = institutionId;

    const teacherUser = await userModel.findFirst({ where: teacherUserWhere });

    if (teacherUser) {
      teacher = await teacherModel.create({
        data: {
          userId: teacherUser.id,
          employeeId: `TCH-${Date.now()}`,
        },
      });
    } else {
      throw new NotFoundError('Teacher not found in this institution');
    }
  }

  return sectionModel.update({
    where: { id: sectionId },
    data: { classTeacherId: teacher.id },
  });
}

export async function getAssignments(institutionId: string | undefined) {
  const sectionModel = getSectionModel();
  if (!sectionModel) return [];

  const where: any = { classTeacherId: { not: null } };
  if (institutionId) {
    where.class = { branch: { institutionId } };
  }

  return sectionModel.findMany({
    where,
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

export async function getTeacherSections(userId: string, institutionId: string | undefined) {
  const sectionModel = getSectionModel();
  if (!sectionModel) return [];

  const where: any = { classTeacher: { userId } };
  if (institutionId) {
    where.class = { branch: { institutionId } };
  }

  return sectionModel.findMany({
    where,
    include: {
      class: { select: { name: true } },
    },
  });
}

export async function getAttendanceSheet(
  institutionId: string | undefined,
  className: string,
  sectionName: string,
  date: Date,
) {
  const studentModel = getStudentModel();
  const attendanceModel = getAttendanceModel();

  if (!studentModel || !attendanceModel) {
    logger.error('Prisma student or attendance model delegate is unavailable');
    return [];
  }

  const dateStr = isNaN(date.getTime()) ? new Date().toISOString().split('T')[0] : date.toISOString().split('T')[0];
  const normalizedDate = new Date(dateStr + 'T00:00:00.000Z');

  const studentWhere: any = {
    class: { name: className },
    section: { name: sectionName },
    status: 'ACTIVE',
  };
  if (institutionId) {
    studentWhere.institutionId = institutionId;
  }

  const students = await studentModel.findMany({
    where: studentWhere,
    select: {
      id: true,
      studentId: true,
      firstName: true,
      lastName: true,
      rollNumber: true,
    },
    orderBy: { rollNumber: 'asc' },
  });

  if (!students || students.length === 0) {
    return [];
  }

  const studentIds = students.map((s: any) => s.id);
  const recordWhere: any = {
    date: normalizedDate,
    studentId: { in: studentIds },
  };
  if (institutionId) {
    recordWhere.institutionId = institutionId;
  }

  const attendanceRecords = await attendanceModel.findMany({
    where: recordWhere,
  });

  return students.map((student: any) => {
    const record = (attendanceRecords || []).find((r: any) => r.studentId === student.id);
    return {
      ...student,
      status: record ? record.status : 'PRESENT',
      notes: record ? record.notes : null,
    };
  });
}

export async function getWeeklyAttendanceSheet(
  institutionId: string | undefined,
  className: string,
  sectionName: string,
  startDate: Date,
  endDate: Date,
) {
  const studentModel = getStudentModel();
  const attendanceModel = getAttendanceModel();

  if (!studentModel || !attendanceModel) {
    logger.error('Prisma student or attendance model delegate is unavailable');
    return [];
  }

  const startStr = isNaN(startDate.getTime()) ? new Date().toISOString().split('T')[0] : startDate.toISOString().split('T')[0];
  const endStr = isNaN(endDate.getTime()) ? new Date().toISOString().split('T')[0] : endDate.toISOString().split('T')[0];

  const normalizedStart = new Date(startStr + 'T00:00:00.000Z');
  const normalizedEnd = new Date(endStr + 'T23:59:59.999Z');

  const studentWhere: any = {
    class: { name: className },
    section: { name: sectionName },
    status: 'ACTIVE',
  };
  if (institutionId) {
    studentWhere.institutionId = institutionId;
  }

  const students = await studentModel.findMany({
    where: studentWhere,
    select: {
      id: true,
      studentId: true,
      firstName: true,
      lastName: true,
      rollNumber: true,
    },
    orderBy: { rollNumber: 'asc' },
  });

  if (!students || students.length === 0) {
    return [];
  }

  const studentIds = students.map((s: any) => s.id);

  const recordWhere: any = {
    date: {
      gte: normalizedStart,
      lte: normalizedEnd,
    },
    studentId: { in: studentIds },
  };
  if (institutionId) {
    recordWhere.institutionId = institutionId;
  }

  const attendanceRecords = await attendanceModel.findMany({
    where: recordWhere,
  });

  return students.map((student: any) => {
    const studentRecords = (attendanceRecords || []).filter((r: any) => r.studentId === student.id);
    const attendanceMap: Record<string, { status: string; notes?: string | null }> = {};

    studentRecords.forEach((r: any) => {
      const dateKey = r.date.toISOString().split('T')[0];
      attendanceMap[dateKey] = {
        status: r.status,
        notes: r.notes,
      };
    });

    return {
      ...student,
      attendanceMap,
    };
  });
}

export async function getStudentAttendanceHistory(userId: string, institutionId: string | undefined) {
  const studentModel = getStudentModel();
  if (!studentModel) throw new NotFoundError('Student profile not found');

  const where: any = { userId };
  if (institutionId) where.institutionId = institutionId;

  const student = await studentModel.findFirst({ where });

  if (!student) {
    throw new NotFoundError('Student profile not found');
  }

  return getAttendanceHistoryByStudentId(institutionId, student.id, student);
}

export async function getAttendanceHistoryByStudentId(
  institutionId: string | undefined,
  studentId: string,
  preloadedStudent?: any,
) {
  const studentModel = getStudentModel();
  const attendanceModel = getAttendanceModel();

  const studentWhere: any = { id: studentId };
  if (institutionId) studentWhere.institutionId = institutionId;

  const student = preloadedStudent ?? (studentModel ? await studentModel.findFirst({ where: studentWhere }) : null);
  if (!student) {
    throw new NotFoundError('Student profile not found');
  }

  const recordWhere: any = { studentId: student.id };
  if (institutionId) recordWhere.institutionId = institutionId;

  const attendance = attendanceModel
    ? await attendanceModel.findMany({
        where: recordWhere,
        orderBy: { date: 'desc' },
      })
    : [];

  const totals = {
    present: 0,
    absent: 0,
    late: 0,
    halfDay: 0,
  };

  (attendance || []).forEach((r: any) => {
    if (r.status === 'PRESENT') totals.present++;
    else if (r.status === 'ABSENT') totals.absent++;
    else if (r.status === 'LATE') totals.late++;
    else if (r.status === 'HALF_DAY') totals.halfDay++;
  });

  const finePerAbsent = 100;
  const finesDue = totals.absent * finePerAbsent;

  return {
    student,
    attendance,
    statistics: {
      ...totals,
      totalDays: (attendance || []).length,
      attendancePercentage: (attendance || []).length
        ? Math.round(((totals.present + totals.late + totals.halfDay * 0.5) / (attendance || []).length) * 100)
        : 100,
    },
    finesDue,
  };
}
