import { prisma } from '../../config/prisma';
import type { Prisma, AttendanceMark, AttendanceEntrySource, RegisterStatus, AssignmentRole } from '@prisma/client';
import { NotFoundError } from '../../utils/AppError';
import type {
  AdminRegisterQueryDtoType,
  AssignmentQueryDtoType,
  CorrectionRequestQueryDtoType,
  CreateAssignmentDtoType,
  UpdateAssignmentDtoType,
} from './attendance.dto';

export const DAILY_SUBJECT_SENTINEL = '__DAILY__';

// =============================================================================
// Institution settings
// =============================================================================

export async function getInstitutionSettings(institutionId: string) {
  const settings = await prisma.institutionSettings.findUnique({ where: { institutionId } });
  return settings ?? { attendanceMode: 'DAILY' as const, lockAfterDays: 3 };
}

// =============================================================================
// Teacher lookups
// =============================================================================

export async function getTeacherByUserId(institutionId: string, userId: string) {
  return prisma.teacher.findFirst({
    where: { userId, user: { institutionId } },
  });
}

export async function getTeacherById(institutionId: string, teacherId: string) {
  return prisma.teacher.findFirst({
    where: { id: teacherId, user: { institutionId } },
  });
}

// =============================================================================
// Assignments (effective-window queries used by attendance flows)
// =============================================================================

export async function findEffectiveAssignmentsForTeacher(
  institutionId: string,
  teacherId: string,
  date: Date,
) {
  return prisma.teacherSectionAssignment.findMany({
    where: {
      institutionId,
      teacherId,
      effectiveFrom: { lte: date },
      OR: [{ effectiveTo: null }, { effectiveTo: { gt: date } }],
    },
    include: {
      section: { include: { class: true } },
    },
  });
}

/** All effective assignments tenant-wide for a given date, optionally filtered by class/section/branch — used to
 * detect sections that have no AttendanceRegister row at all yet (truly NOT_OPENED, not just incomplete). */
export async function findEffectiveAssignmentsForTenant(
  institutionId: string,
  date: Date,
  filters: { classId?: string; sectionId?: string; branchId?: string } = {},
) {
  return prisma.teacherSectionAssignment.findMany({
    where: {
      institutionId,
      role: 'PRIMARY',
      effectiveFrom: { lte: date },
      OR: [{ effectiveTo: null }, { effectiveTo: { gt: date } }],
      section: {
        ...(filters.sectionId ? { id: filters.sectionId } : {}),
        ...(filters.classId ? { classId: filters.classId } : {}),
        ...(filters.branchId ? { class: { branchId: filters.branchId } } : {}),
      },
    },
    include: {
      section: { include: { class: true, students: { where: { status: 'ACTIVE' }, select: { id: true } } } },
      teacher: { include: { user: { select: { firstName: true, lastName: true } } } },
    },
  });
}

export async function findEffectiveAssignmentForSection(
  institutionId: string,
  sectionId: string,
  subject: string,
  date: Date,
) {
  return prisma.teacherSectionAssignment.findFirst({
    where: {
      institutionId,
      sectionId,
      subject: subject === DAILY_SUBJECT_SENTINEL ? null : subject,
      effectiveFrom: { lte: date },
      OR: [{ effectiveTo: null }, { effectiveTo: { gt: date } }],
    },
    orderBy: { role: 'asc' }, // PRIMARY before SUBSTITUTE
  });
}

/** Ownership check: does this teacher have an effective assignment covering this section+subject+date? */
export async function findOwnedAssignment(
  institutionId: string,
  teacherId: string,
  sectionId: string,
  subject: string,
  date: Date,
) {
  return prisma.teacherSectionAssignment.findFirst({
    where: {
      institutionId,
      teacherId,
      sectionId,
      subject: subject === DAILY_SUBJECT_SENTINEL ? null : subject,
      effectiveFrom: { lte: date },
      OR: [{ effectiveTo: null }, { effectiveTo: { gt: date } }],
    },
  });
}

export async function findEffectiveSectionsForTeacherInRange(
  institutionId: string,
  teacherId: string,
  startDate: Date,
  endDate: Date,
) {
  return prisma.teacherSectionAssignment.findMany({
    where: {
      institutionId,
      teacherId,
      effectiveFrom: { lte: endDate },
      OR: [{ effectiveTo: null }, { effectiveTo: { gt: startDate } }],
    },
    select: { sectionId: true },
  });
}

// =============================================================================
// Registers
// =============================================================================

export async function findRegisterBySectionDateSubject(
  institutionId: string,
  sectionId: string,
  date: Date,
  subject: string,
) {
  return prisma.attendanceRegister.findUnique({
    where: {
      institutionId_sectionId_date_subject: { institutionId, sectionId, date, subject },
    },
  });
}

export async function getOrCreateRegister(
  institutionId: string,
  sectionId: string,
  date: Date,
  subject: string,
  assignmentId?: string | null,
) {
  return prisma.attendanceRegister.upsert({
    where: {
      institutionId_sectionId_date_subject: { institutionId, sectionId, date, subject },
    },
    update: {},
    create: {
      institutionId,
      sectionId,
      date,
      subject,
      assignmentId: assignmentId ?? null,
      status: 'NOT_OPENED',
    },
  });
}

export async function findRegisterById(institutionId: string, registerId: string) {
  return prisma.attendanceRegister.findFirst({
    where: { id: registerId, institutionId },
    include: { section: { include: { class: true } }, assignment: true },
  });
}

export async function countActiveStudentsInSection(institutionId: string, sectionId: string) {
  return prisma.student.count({ where: { institutionId, sectionId, status: 'ACTIVE' } });
}

export async function countRecordsForRegister(registerId: string) {
  return prisma.attendanceRecord.count({ where: { registerId } });
}

export async function getActiveRoster(institutionId: string, sectionId: string) {
  return prisma.student.findMany({
    where: { institutionId, sectionId, status: 'ACTIVE' },
    select: { id: true, firstName: true, lastName: true, rollNumber: true },
    orderBy: { rollNumber: 'asc' },
  });
}

export async function getRecordsForRegister(registerId: string) {
  return prisma.attendanceRecord.findMany({ where: { registerId } });
}

// =============================================================================
// Draft save / submit / reopen / lock (all transactional, optimistic-locked)
// =============================================================================

interface DraftRecordInput {
  studentId: string;
  mark: AttendanceMark;
  reasonId?: string | null;
  note?: string | null;
  minutesLate?: number | null;
}

export async function saveDraftTx(params: {
  registerId: string;
  institutionId: string;
  expectedVersion: number;
  records: DraftRecordInput[];
  entrySource: AttendanceEntrySource;
  recordedByUserId: string;
  attributedTeacherId?: string | null;
}) {
  const { registerId, institutionId, expectedVersion, records, entrySource, recordedByUserId, attributedTeacherId } =
    params;

  return prisma.$transaction(async (tx) => {
    const register = await tx.attendanceRegister.findFirst({ where: { id: registerId, institutionId } });
    if (!register) throw new NotFoundError('Register not found');

    if (register.version !== expectedVersion) {
      return { conflict: true as const, register: null };
    }

    for (const r of records) {
      const existing = await tx.attendanceRecord.findUnique({
        where: { registerId_studentId: { registerId, studentId: r.studentId } },
      });
      if (existing) {
        await tx.attendanceRecord.update({
          where: { id: existing.id },
          data: {
            mark: r.mark,
            reasonId: r.reasonId ?? null,
            note: r.note ?? null,
            minutesLate: r.minutesLate ?? null,
            entrySource,
            recordedByUserId,
            attributedTeacherId: attributedTeacherId ?? null,
            updatedByUserId: recordedByUserId,
            version: { increment: 1 },
          },
        });
      } else {
        await tx.attendanceRecord.create({
          data: {
            institutionId,
            registerId,
            studentId: r.studentId,
            mark: r.mark,
            reasonId: r.reasonId ?? null,
            note: r.note ?? null,
            minutesLate: r.minutesLate ?? null,
            entrySource,
            recordedByUserId,
            attributedTeacherId: attributedTeacherId ?? null,
          },
        });
      }
    }

    const newStatus: RegisterStatus = register.status === 'NOT_OPENED' ? 'IN_PROGRESS' : register.status;

    const updated = await tx.attendanceRegister.update({
      where: { id: registerId },
      data: { status: newStatus, version: { increment: 1 } },
    });

    return { conflict: false as const, register: updated };
  });
}

export async function submitRegisterTx(params: {
  registerId: string;
  institutionId: string;
  expectedVersion: number;
  actorUserId: string;
}) {
  const { registerId, institutionId, expectedVersion, actorUserId } = params;

  return prisma.$transaction(async (tx) => {
    const register = await tx.attendanceRegister.findFirst({ where: { id: registerId, institutionId } });
    if (!register) throw new NotFoundError('Register not found');

    if (register.status === 'SUBMITTED' && register.version === expectedVersion) {
      return { outcome: 'noop' as const, register, missingStudentIds: [] as string[] };
    }

    if (register.version !== expectedVersion) {
      return { outcome: 'conflict' as const, register: null, missingStudentIds: [] as string[] };
    }

    if (register.status === 'LOCKED') {
      return { outcome: 'locked' as const, register: null, missingStudentIds: [] as string[] };
    }

    const activeStudents = await tx.student.findMany({
      where: { institutionId, sectionId: register.sectionId, status: 'ACTIVE' },
      select: { id: true },
    });
    const records = await tx.attendanceRecord.findMany({
      where: { registerId },
      select: { studentId: true, mark: true },
    });
    const recordedIds = new Set(records.filter((r) => r.mark !== null).map((r) => r.studentId));
    const missingStudentIds = activeStudents.map((s) => s.id).filter((id) => !recordedIds.has(id));

    if (missingStudentIds.length > 0) {
      return { outcome: 'incomplete' as const, register: null, missingStudentIds };
    }

    const now = new Date();
    const updated = await tx.attendanceRegister.update({
      where: { id: registerId },
      data: {
        status: 'SUBMITTED',
        submittedByUserId: actorUserId,
        submittedAt: now,
        version: { increment: 1 },
      },
    });

    await tx.attendanceAuditEvent.create({
      data: {
        institutionId,
        registerId,
        eventType: 'REGISTER_SUBMITTED',
        actorUserId,
      },
    });

    return { outcome: 'success' as const, register: updated, missingStudentIds: [] as string[] };
  });
}

export async function reopenRegisterTx(params: {
  registerId: string;
  institutionId: string;
  reason: string;
  actorUserId: string;
}) {
  const { registerId, institutionId, reason, actorUserId } = params;
  return prisma.$transaction(async (tx) => {
    const register = await tx.attendanceRegister.findFirst({ where: { id: registerId, institutionId } });
    if (!register) throw new NotFoundError('Register not found');
    if (register.status !== 'SUBMITTED' && register.status !== 'LOCKED') {
      return { invalidTransition: true as const, register: null };
    }
    const updated = await tx.attendanceRegister.update({
      where: { id: registerId },
      data: {
        status: 'REOPENED',
        reopenedByUserId: actorUserId,
        reopenReason: reason,
        version: { increment: 1 },
      },
    });
    await tx.attendanceAuditEvent.create({
      data: { institutionId, registerId, eventType: 'REGISTER_REOPENED', actorUserId, reason },
    });
    return { invalidTransition: false as const, register: updated };
  });
}

export async function lockRegisterTx(params: {
  registerId: string;
  institutionId: string;
  expectedVersion: number;
  actorUserId: string;
}) {
  const { registerId, institutionId, expectedVersion, actorUserId } = params;
  return prisma.$transaction(async (tx) => {
    const register = await tx.attendanceRegister.findFirst({ where: { id: registerId, institutionId } });
    if (!register) throw new NotFoundError('Register not found');
    if (register.status !== 'SUBMITTED' && register.status !== 'REOPENED') {
      return { invalidTransition: true as const, conflict: false as const, register: null };
    }
    if (register.version !== expectedVersion) {
      return { invalidTransition: false as const, conflict: true as const, register: null };
    }
    const updated = await tx.attendanceRegister.update({
      where: { id: registerId },
      data: { status: 'LOCKED', lockedByUserId: actorUserId, lockedAt: new Date(), version: { increment: 1 } },
    });
    await tx.attendanceAuditEvent.create({
      data: { institutionId, registerId, eventType: 'REGISTER_LOCKED', actorUserId },
    });
    return { invalidTransition: false as const, conflict: false as const, register: updated };
  });
}

export async function patchRecordTx(params: {
  institutionId: string;
  recordId: string;
  expectedVersion: number;
  data: { mark: AttendanceMark; reasonId?: string | null; note?: string | null; minutesLate?: number | null };
  correctionReason: string;
  actorUserId: string;
}) {
  const { institutionId, recordId, expectedVersion, data, correctionReason, actorUserId } = params;
  return prisma.$transaction(async (tx) => {
    const record = await tx.attendanceRecord.findFirst({ where: { id: recordId, institutionId } });
    if (!record) throw new NotFoundError('Attendance record not found');
    if (record.version !== expectedVersion) {
      return { conflict: true as const, record: null };
    }

    const register = await tx.attendanceRegister.findUnique({ where: { id: record.registerId } });
    if (!register) throw new NotFoundError('Register not found');

    if (register.status === 'LOCKED') {
      await tx.attendanceRegister.update({
        where: { id: register.id },
        data: {
          status: 'REOPENED',
          reopenedByUserId: actorUserId,
          reopenReason: `Auto-reopened for correction: ${correctionReason}`,
          version: { increment: 1 },
        },
      });
      await tx.attendanceAuditEvent.create({
        data: {
          institutionId,
          registerId: register.id,
          eventType: 'REGISTER_REOPENED',
          actorUserId,
          reason: `Auto-reopened for correction: ${correctionReason}`,
        },
      });
    }

    const before = { mark: record.mark, reasonId: record.reasonId, note: record.note, minutesLate: record.minutesLate };
    const updated = await tx.attendanceRecord.update({
      where: { id: recordId },
      data: {
        mark: data.mark,
        reasonId: data.reasonId ?? null,
        note: data.note ?? null,
        minutesLate: data.minutesLate ?? null,
        updatedByUserId: actorUserId,
        version: { increment: 1 },
      },
    });
    const after = { mark: updated.mark, reasonId: updated.reasonId, note: updated.note, minutesLate: updated.minutesLate };

    await tx.attendanceAuditEvent.create({
      data: {
        institutionId,
        registerId: register.id,
        recordId,
        eventType: 'RECORD_CHANGED',
        actorUserId,
        beforeValue: before,
        afterValue: after,
        reason: correctionReason,
      },
    });

    return { conflict: false as const, record: updated };
  });
}

// =============================================================================
// Admin register listing
// =============================================================================

export async function listAdminRegisters(institutionId: string, query: AdminRegisterQueryDtoType) {
  const { date, branchId, classId, sectionId, status, page, pageSize } = query;
  const skip = (page - 1) * pageSize;

  const where: Prisma.AttendanceRegisterWhereInput = {
    institutionId,
    ...(date ? { date } : {}),
    ...(status ? { status } : {}),
    ...(sectionId ? { sectionId } : {}),
    ...(classId || branchId
      ? {
          section: {
            ...(classId ? { classId } : {}),
            ...(branchId ? { class: { branchId } } : {}),
          },
        }
      : {}),
  };

  const [registers, total] = await prisma.$transaction([
    prisma.attendanceRegister.findMany({
      where,
      include: {
        section: { include: { class: true, students: { where: { status: 'ACTIVE' }, select: { id: true } } } },
        assignment: { include: { teacher: { include: { user: { select: { firstName: true, lastName: true } } } } } },
        records: { select: { mark: true } },
      },
      skip,
      take: pageSize,
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
    }),
    prisma.attendanceRegister.count({ where }),
  ]);

  const withCounts = registers.map((r) => {
    const studentCount = r.section.students.length;
    const recordedCount = r.records.length;
    const presentCount = r.records.filter((rec) => rec.mark === 'PRESENT').length;
    const lateCount = r.records.filter((rec) => rec.mark === 'LATE').length;
    const excusedAbsentCount = r.records.filter((rec) => rec.mark === 'ABSENT_EXCUSED').length;
    const unexcusedAbsentCount = r.records.filter((rec) => rec.mark === 'ABSENT_UNEXCUSED').length;
    return {
      ...r,
      studentCount,
      recordedCount,
      unmarkedCount: Math.max(studentCount - recordedCount, 0),
      presentCount,
      lateCount,
      excusedAbsentCount,
      unexcusedAbsentCount,
    };
  });

  return { registers: withCounts, total };
}

// =============================================================================
// Student / Guardian-facing
// =============================================================================

export async function getStudentByUserId(institutionId: string, userId: string) {
  return prisma.student.findFirst({ where: { userId, institutionId } });
}

export async function getStudentById(institutionId: string, studentId: string) {
  return prisma.student.findFirst({ where: { id: studentId, institutionId } });
}

export async function getAttendanceRecordsForStudent(
  institutionId: string,
  studentId: string,
  startDate?: Date,
  endDate?: Date,
  subject?: string,
) {
  return prisma.attendanceRecord.findMany({
    where: {
      institutionId,
      studentId,
      register: {
        institutionId,
        ...(startDate || endDate
          ? {
              date: {
                ...(startDate ? { gte: startDate } : {}),
                ...(endDate ? { lte: endDate } : {}),
              },
            }
          : {}),
        ...(subject ? { subject } : {}),
      },
    },
    include: { register: true, reason: true },
    orderBy: { createdAt: 'desc' },
  });
}

export async function getPenaltyPolicy(institutionId: string) {
  return prisma.attendancePenaltyPolicy.findUnique({ where: { institutionId } });
}

// =============================================================================
// Reports
// =============================================================================

export async function getRecordsForReport(
  institutionId: string,
  startDate: Date,
  endDate: Date,
  sectionIds?: string[],
) {
  return prisma.attendanceRecord.findMany({
    where: {
      institutionId,
      register: {
        institutionId,
        date: { gte: startDate, lte: endDate },
        ...(sectionIds ? { sectionId: { in: sectionIds } } : {}),
      },
    },
    include: {
      student: { select: { id: true, firstName: true, lastName: true, sectionId: true, section: { select: { name: true } } } },
    },
  });
}

export async function getSectionIdsForFilters(
  institutionId: string,
  branchId?: string,
  classId?: string,
  sectionId?: string,
) {
  if (sectionId) return [sectionId];
  const sections = await prisma.section.findMany({
    where: {
      ...(classId ? { classId } : {}),
      ...(branchId ? { class: { branchId } } : {}),
    },
    select: { id: true },
  });
  return sections.map((s) => s.id);
}

// =============================================================================
// Correction requests
// =============================================================================

export async function getRecordWithRegister(institutionId: string, recordId: string) {
  return prisma.attendanceRecord.findFirst({
    where: { id: recordId, institutionId },
    include: { register: true },
  });
}

export async function createCorrectionRequest(
  institutionId: string,
  data: { recordId: string; requestedByUserId: string; requestedMark: AttendanceMark; requestedReasonId?: string | null; requestNote: string },
) {
  return prisma.attendanceCorrectionRequest.create({ data: { institutionId, ...data } });
}

export async function listCorrectionRequests(
  institutionId: string,
  query: CorrectionRequestQueryDtoType,
  studentIdFilter?: string[],
) {
  const { status, studentId, page, pageSize } = query;
  const skip = (page - 1) * pageSize;

  const where: Prisma.AttendanceCorrectionRequestWhereInput = {
    institutionId,
    ...(status ? { status } : {}),
    ...(studentId ? { record: { studentId } } : {}),
    ...(studentIdFilter ? { record: { studentId: { in: studentIdFilter } } } : {}),
  };

  const [requests, total] = await prisma.$transaction([
    prisma.attendanceCorrectionRequest.findMany({
      where,
      include: { record: { include: { student: { select: { id: true, firstName: true, lastName: true } } } } },
      skip,
      take: pageSize,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.attendanceCorrectionRequest.count({ where }),
  ]);

  return { requests, total };
}

export async function getCorrectionRequestById(institutionId: string, id: string) {
  return prisma.attendanceCorrectionRequest.findFirst({
    where: { id, institutionId },
    include: { record: { include: { register: true } } },
  });
}

export async function resolveCorrectionRequestApprovedTx(params: {
  institutionId: string;
  id: string;
  actorUserId: string;
  resolutionNote: string;
}) {
  const { institutionId, id, actorUserId, resolutionNote } = params;
  return prisma.$transaction(async (tx) => {
    const request = await tx.attendanceCorrectionRequest.findFirst({
      where: { id, institutionId },
      include: { record: { include: { register: true } } },
    });
    if (!request) throw new NotFoundError('Correction request not found');

    const register = request.record.register;
    const wasLocked = register.status === 'LOCKED';

    if (wasLocked) {
      await tx.attendanceRegister.update({
        where: { id: register.id },
        data: { status: 'REOPENED', reopenedByUserId: actorUserId, reopenReason: 'Correction request approved', version: { increment: 1 } },
      });
      await tx.attendanceAuditEvent.create({
        data: { institutionId, registerId: register.id, eventType: 'REGISTER_REOPENED', actorUserId, reason: 'Correction request approved' },
      });
    }

    const before = {
      mark: request.record.mark,
      reasonId: request.record.reasonId,
      note: request.record.note,
    };

    const updatedRecord = await tx.attendanceRecord.update({
      where: { id: request.recordId },
      data: {
        mark: request.requestedMark,
        reasonId: request.requestedReasonId,
        updatedByUserId: actorUserId,
        version: { increment: 1 },
      },
    });

    await tx.attendanceAuditEvent.create({
      data: {
        institutionId,
        registerId: register.id,
        recordId: request.recordId,
        eventType: 'CORRECTION_APPLIED',
        actorUserId,
        beforeValue: before,
        afterValue: { mark: updatedRecord.mark, reasonId: updatedRecord.reasonId },
        reason: resolutionNote,
      },
    });

    if (wasLocked) {
      await tx.attendanceRegister.update({
        where: { id: register.id },
        data: { status: 'LOCKED', lockedByUserId: actorUserId, lockedAt: new Date(), version: { increment: 1 } },
      });
      await tx.attendanceAuditEvent.create({
        data: { institutionId, registerId: register.id, eventType: 'REGISTER_LOCKED', actorUserId, reason: 'Re-locked after correction' },
      });
    }

    const resolved = await tx.attendanceCorrectionRequest.update({
      where: { id },
      data: {
        status: 'APPROVED',
        resolvedByUserId: actorUserId,
        resolutionNote,
        resolvedAt: new Date(),
      },
    });

    return resolved;
  });
}

export async function resolveCorrectionRequestRejectedTx(params: {
  institutionId: string;
  id: string;
  actorUserId: string;
  resolutionNote: string;
}) {
  const { institutionId, id, actorUserId, resolutionNote } = params;
  const request = await prisma.attendanceCorrectionRequest.findFirst({ where: { id, institutionId } });
  if (!request) throw new NotFoundError('Correction request not found');
  return prisma.attendanceCorrectionRequest.update({
    where: { id },
    data: { status: 'REJECTED', resolvedByUserId: actorUserId, resolutionNote, resolvedAt: new Date() },
  });
}

// =============================================================================
// Teacher-assignment CRUD
// =============================================================================

export async function findSectionInTenant(institutionId: string, sectionId: string) {
  return prisma.section.findFirst({ where: { id: sectionId, class: { branch: { institutionId } } } });
}

export async function findOverlappingPrimaryAssignment(
  institutionId: string,
  sectionId: string,
  subject: string | null | undefined,
  effectiveFrom: Date,
  effectiveTo: Date | null | undefined,
  excludeId?: string,
) {
  const candidates = await prisma.teacherSectionAssignment.findMany({
    where: {
      institutionId,
      sectionId,
      subject: subject ?? null,
      role: 'PRIMARY',
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
  });

  const newStart = effectiveFrom.getTime();
  const newEnd = effectiveTo ? effectiveTo.getTime() : Infinity;

  return candidates.find((c) => {
    const existingStart = c.effectiveFrom.getTime();
    const existingEnd = c.effectiveTo ? c.effectiveTo.getTime() : Infinity;
    return newStart < existingEnd && existingStart < newEnd;
  });
}

export async function findExactDuplicateAssignment(
  institutionId: string,
  teacherId: string,
  sectionId: string,
  subject: string | null | undefined,
  effectiveFrom: Date,
  effectiveTo: Date | null | undefined,
) {
  return prisma.teacherSectionAssignment.findFirst({
    where: {
      institutionId,
      teacherId,
      sectionId,
      subject: subject ?? null,
      effectiveFrom,
      effectiveTo: effectiveTo ?? null,
    },
  });
}

export async function createAssignment(
  institutionId: string,
  data: CreateAssignmentDtoType,
  createdByUserId: string,
) {
  return prisma.teacherSectionAssignment.create({
    data: {
      institutionId,
      teacherId: data.teacherId,
      sectionId: data.sectionId,
      subject: data.subject ?? null,
      role: (data.role ?? 'PRIMARY') as AssignmentRole,
      effectiveFrom: data.effectiveFrom,
      effectiveTo: data.effectiveTo ?? null,
      createdByUserId,
    },
  });
}

export async function listAssignments(institutionId: string, query: AssignmentQueryDtoType) {
  const { sectionId, teacherId, activeOnly } = query;
  const now = new Date();
  return prisma.teacherSectionAssignment.findMany({
    where: {
      institutionId,
      ...(sectionId ? { sectionId } : {}),
      ...(teacherId ? { teacherId } : {}),
      ...(activeOnly ? { effectiveFrom: { lte: now }, OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }] } : {}),
    },
    include: {
      teacher: { include: { user: { select: { firstName: true, lastName: true, email: true } } } },
      section: { include: { class: true } },
    },
    orderBy: { effectiveFrom: 'desc' },
  });
}

export async function findAssignmentById(institutionId: string, id: string) {
  return prisma.teacherSectionAssignment.findFirst({ where: { id, institutionId } });
}

export async function updateAssignment(id: string, data: UpdateAssignmentDtoType) {
  return prisma.teacherSectionAssignment.update({ where: { id }, data });
}

export async function isAssignmentReferencedByRegister(assignmentId: string) {
  const count = await prisma.attendanceRegister.count({ where: { assignmentId } });
  return count > 0;
}

export async function deleteAssignment(id: string) {
  return prisma.teacherSectionAssignment.delete({ where: { id } });
}
