import * as repo from './attendance.repository';
import * as guardianRepository from '../guardians/guardian.repository';
import { feeReminderQueue } from '../../queues/reminderQueue';
import { logger } from '../../utils/logger';
import type { AttendanceMark } from '@prisma/client';
import {
  AppError,
  BadRequestError,
  ConflictError,
  NotFoundError,
  ValidationError,
} from '../../utils/AppError';
import type {
  AdminRegisterQueryDtoType,
  AssignmentQueryDtoType,
  CorrectionRequestQueryDtoType,
  CreateAssignmentDtoType,
  CreateCorrectionRequestDtoType,
  DraftSaveDtoType,
  LockRegisterDtoType,
  MyAttendanceQueryDtoType,
  PatchRecordDtoType,
  ReopenRegisterDtoType,
  ReportsSummaryQueryDtoType,
  ResolveCorrectionRequestDtoType,
  SubmitRegisterDtoType,
  TakeOnBehalfDtoType,
  UpdateAssignmentDtoType,
} from './attendance.dto';

const { DAILY_SUBJECT_SENTINEL } = repo;

function todayAtMidnight(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
}

function assertNotFuture(date: Date) {
  if (date.getTime() > todayAtMidnight().getTime()) {
    throw new AppError('Attendance cannot be recorded or viewed for a future date', 400, true, 'FUTURE_ATTENDANCE_NOT_ALLOWED');
  }
}

function computeSummary(records: { mark: AttendanceMark }[]) {
  const counts: Record<AttendanceMark, number> = {
    PRESENT: 0,
    LATE: 0,
    ABSENT_EXCUSED: 0,
    ABSENT_UNEXCUSED: 0,
    LEAVE: 0,
    NOT_REQUIRED: 0,
  };
  for (const r of records) counts[r.mark]++;
  const countedDays = counts.PRESENT + counts.LATE + counts.ABSENT_UNEXCUSED;
  const presentEquivalentDays = counts.PRESENT + counts.LATE;
  const percentage = countedDays === 0 ? null : Math.round((presentEquivalentDays / countedDays) * 100);
  return { counts, countedDays, presentEquivalentDays, percentage };
}

// =============================================================================
// Teacher-facing
// =============================================================================

export async function getRegistersToday(institutionId: string, userId: string, dateInput?: Date) {
  const date = dateInput ?? todayAtMidnight();
  assertNotFuture(date);

  const teacher = await repo.getTeacherByUserId(institutionId, userId);
  if (!teacher) return [];

  const settings = await repo.getInstitutionSettings(institutionId);
  const assignments = await repo.findEffectiveAssignmentsForTeacher(institutionId, teacher.id, date);

  const results = [];
  for (const assignment of assignments) {
    const subject = settings.attendanceMode === 'DAILY' ? DAILY_SUBJECT_SENTINEL : assignment.subject ?? DAILY_SUBJECT_SENTINEL;
    const register = await repo.findRegisterBySectionDateSubject(institutionId, assignment.sectionId, date, subject);
    const studentCount = await repo.countActiveStudentsInSection(institutionId, assignment.sectionId);
    const recordedCount = register ? await repo.countRecordsForRegister(register.id) : 0;

    results.push({
      registerId: register?.id ?? null,
      sectionId: assignment.sectionId,
      sectionName: assignment.section.name,
      className: assignment.section.class.name,
      subject: subject === DAILY_SUBJECT_SENTINEL ? null : subject,
      status: register?.status ?? 'NOT_OPENED',
      studentCount,
      recordedCount,
    });
  }
  return results;
}

async function checkTeacherOwnership(
  institutionId: string,
  userRole: string,
  userId: string,
  sectionId: string,
  subject: string,
  date: Date,
) {
  if (userRole === 'ADMIN' || userRole === 'SUPER_ADMIN') return;
  const teacher = await repo.getTeacherByUserId(institutionId, userId);
  if (!teacher) {
    throw new AppError('You are not assigned to this register', 403, true, 'REGISTER_NOT_ASSIGNED');
  }
  const owned = await repo.findOwnedAssignment(institutionId, teacher.id, sectionId, subject, date);
  if (!owned) {
    throw new AppError('You are not assigned to this register', 403, true, 'REGISTER_NOT_ASSIGNED');
  }
}

export async function getRosterBySectionDate(
  institutionId: string,
  userRole: string,
  userId: string,
  sectionId: string,
  date: Date,
  subjectInput?: string,
) {
  assertNotFuture(date);
  const settings = await repo.getInstitutionSettings(institutionId);
  const subject = settings.attendanceMode === 'DAILY' ? DAILY_SUBJECT_SENTINEL : subjectInput ?? DAILY_SUBJECT_SENTINEL;

  await checkTeacherOwnership(institutionId, userRole, userId, sectionId, subject, date);

  let assignmentId: string | null = null;
  if (userRole === 'TEACHER') {
    const teacher = await repo.getTeacherByUserId(institutionId, userId);
    const owned = teacher ? await repo.findOwnedAssignment(institutionId, teacher.id, sectionId, subject, date) : null;
    assignmentId = owned?.id ?? null;
  } else {
    const owned = await repo.findEffectiveAssignmentForSection(institutionId, sectionId, subject, date);
    assignmentId = owned?.id ?? null;
  }

  const register = await repo.getOrCreateRegister(institutionId, sectionId, date, subject, assignmentId);

  const roster = await repo.getActiveRoster(institutionId, sectionId);
  const records = await repo.getRecordsForRegister(register.id);
  const recordByStudent = new Map(records.map((r) => [r.studentId, r]));

  return {
    registerId: register.id,
    status: register.status,
    version: register.version,
    subject: subject === DAILY_SUBJECT_SENTINEL ? null : subject,
    students: roster.map((s) => {
      const rec = recordByStudent.get(s.id);
      return {
        studentId: s.id,
        name: `${s.firstName} ${s.lastName}`,
        rollNumber: s.rollNumber,
        recordId: rec?.id ?? null,
        recordVersion: rec?.version ?? null,
        currentMark: rec?.mark ?? null,
        reasonId: rec?.reasonId ?? null,
        note: rec?.note ?? null,
        minutesLate: rec?.minutesLate ?? null,
      };
    }),
  };
}

export async function saveDraft(
  institutionId: string,
  userRole: string,
  userId: string,
  registerId: string,
  data: DraftSaveDtoType,
) {
  const register = await repo.findRegisterById(institutionId, registerId);
  if (!register) throw new NotFoundError('Register not found');

  assertNotFuture(register.date);
  await checkTeacherOwnership(institutionId, userRole, userId, register.sectionId, register.subject, register.date);

  if (register.status === 'LOCKED') {
    throw new AppError('Register is locked and cannot be edited', 409, true, 'REGISTER_LOCKED');
  }
  if (register.status === 'SUBMITTED') {
    throw new AppError('Register has already been submitted', 409, true, 'REGISTER_ALREADY_SUBMITTED');
  }

  const entrySource = userRole === 'TEACHER' ? 'TEACHER_WEB' : 'ADMIN_WEB';

  const result = await repo.saveDraftTx({
    registerId,
    institutionId,
    expectedVersion: data.version,
    records: data.records,
    entrySource: entrySource as any,
    recordedByUserId: userId,
  });

  if (result.conflict) {
    throw new AppError('Register was modified by someone else, please refresh', 409, true, 'ATTENDANCE_CONFLICT');
  }

  return result.register;
}

export async function takeOnBehalf(
  institutionId: string,
  registerId: string,
  data: TakeOnBehalfDtoType,
  actorUserId: string,
) {
  const register = await repo.findRegisterById(institutionId, registerId);
  if (!register) throw new NotFoundError('Register not found');
  assertNotFuture(register.date);

  if (register.status === 'LOCKED') {
    throw new AppError('Register is locked and cannot be edited', 409, true, 'REGISTER_LOCKED');
  }
  if (register.status === 'SUBMITTED') {
    throw new AppError('Register has already been submitted', 409, true, 'REGISTER_ALREADY_SUBMITTED');
  }

  const teacher = await repo.getTeacherById(institutionId, data.attributedTeacherId);
  if (!teacher) throw new NotFoundError('Teacher not found in this institution');

  const result = await repo.saveDraftTx({
    registerId,
    institutionId,
    expectedVersion: data.version,
    records: data.records,
    entrySource: 'ADMIN_ON_BEHALF',
    recordedByUserId: actorUserId,
    attributedTeacherId: data.attributedTeacherId,
  });

  if (result.conflict) {
    throw new AppError('Register was modified by someone else, please refresh', 409, true, 'ATTENDANCE_CONFLICT');
  }

  return result.register;
}

export async function submitRegister(
  institutionId: string,
  userRole: string,
  userId: string,
  registerId: string,
  data: SubmitRegisterDtoType,
) {
  const register = await repo.findRegisterById(institutionId, registerId);
  if (!register) throw new NotFoundError('Register not found');

  assertNotFuture(register.date);
  await checkTeacherOwnership(institutionId, userRole, userId, register.sectionId, register.subject, register.date);

  const result = await repo.submitRegisterTx({
    registerId,
    institutionId,
    expectedVersion: data.version,
    actorUserId: userId,
  });

  if (result.outcome === 'conflict') {
    throw new AppError('Register was modified by someone else, please refresh', 409, true, 'ATTENDANCE_CONFLICT');
  }
  if (result.outcome === 'locked') {
    throw new AppError('Register is locked and cannot be submitted', 409, true, 'REGISTER_LOCKED');
  }
  if (result.outcome === 'incomplete') {
    throw new ValidationError('Not all students have been marked', { missingStudentIds: result.missingStudentIds });
  }

  if (result.outcome === 'success') {
    // Fire-and-forget absence/late notifications, never block the response.
    try {
      const records = await repo.getRecordsForRegister(registerId);
      const notifiable = records.filter((r) =>
        ['ABSENT_EXCUSED', 'ABSENT_UNEXCUSED', 'LATE'].includes(r.mark),
      );
      for (const r of notifiable) {
        const jobId = `absence:${institutionId}:${r.studentId}:${register.date.toISOString().split('T')[0]}:${registerId}`;
        feeReminderQueue
          .add(
            'absence',
            { type: 'absence', institutionId, studentId: r.studentId, date: register.date },
            { jobId },
          )
          .catch((err) => logger.error('Failed to enqueue absence reminder', { studentId: r.studentId, error: err.message }));
      }
    } catch (err: any) {
      logger.error('Failed to enqueue absence reminders', { error: err.message });
    }
  }

  return result.register;
}

// =============================================================================
// Admin-facing
// =============================================================================

export async function listAdminRegisters(institutionId: string, query: AdminRegisterQueryDtoType) {
  const { registers, total } = await repo.listAdminRegisters(institutionId, query);

  // AttendanceRegister rows only exist once a teacher/admin has opened them (getOrCreateRegister
  // is called lazily from the roster endpoint). A section that has never been touched today has no
  // row at all, so a naive DB list can't surface it as "NOT_OPENED". To make incomplete/unopened
  // registers discoverable within seconds (acceptance criterion), synthesize virtual NOT_OPENED
  // entries for any effective assignment on the queried date that has no matching register yet.
  // Limitation: virtual rows are appended to page 1 only and are not themselves paginated — real
  // registers remain the source of truth for pagination; this is a best-effort surfacing, not a
  // fully paginated merge.
  if (query.date && query.page === 1 && (!query.status || query.status === 'NOT_OPENED')) {
    const assignments = await repo.findEffectiveAssignmentsForTenant(institutionId, query.date, {
      classId: query.classId,
      sectionId: query.sectionId,
      branchId: query.branchId,
    });
    const existingSectionIds = new Set(registers.map((r) => r.sectionId));
    const virtual = assignments
      .filter((a) => !existingSectionIds.has(a.sectionId))
      .map((a) => {
        const studentCount = a.section.students.length;
        return {
          id: null,
          institutionId,
          sectionId: a.sectionId,
          section: a.section,
          date: query.date!,
          subject: a.subject,
          status: 'NOT_OPENED' as const,
          assignment: a,
          assignmentId: a.id,
          version: 0,
          submittedByUserId: null,
          submittedAt: null,
          lockedByUserId: null,
          lockedAt: null,
          reopenedByUserId: null,
          reopenReason: null,
          createdAt: query.date!,
          updatedAt: query.date!,
          records: [],
          studentCount,
          recordedCount: 0,
          unmarkedCount: studentCount,
          presentCount: 0,
          lateCount: 0,
          excusedAbsentCount: 0,
          unexcusedAbsentCount: 0,
        };
      });
    return { registers: [...virtual, ...registers], total: total + virtual.length };
  }

  return { registers, total };
}

export async function reopenRegister(
  institutionId: string,
  registerId: string,
  data: ReopenRegisterDtoType,
  actorUserId: string,
) {
  if (!data.reason || data.reason.trim() === '') {
    throw new BadRequestError('reason is required');
  }
  const result = await repo.reopenRegisterTx({ registerId, institutionId, reason: data.reason, actorUserId });
  if (result.invalidTransition) {
    throw new ConflictError('Register can only be reopened from SUBMITTED or LOCKED status');
  }
  return result.register;
}

export async function lockRegister(
  institutionId: string,
  registerId: string,
  data: LockRegisterDtoType,
  actorUserId: string,
) {
  const result = await repo.lockRegisterTx({ registerId, institutionId, expectedVersion: data.version, actorUserId });
  if (result.invalidTransition) {
    throw new ConflictError('Register can only be locked from SUBMITTED or REOPENED status');
  }
  if (result.conflict) {
    throw new AppError('Register was modified by someone else, please refresh', 409, true, 'ATTENDANCE_CONFLICT');
  }
  return result.register;
}

export async function patchRecord(
  institutionId: string,
  recordId: string,
  data: PatchRecordDtoType,
  actorUserId: string,
) {
  const result = await repo.patchRecordTx({
    institutionId,
    recordId,
    expectedVersion: data.version,
    data: { mark: data.mark, reasonId: data.reasonId, note: data.note, minutesLate: data.minutesLate },
    correctionReason: data.correctionReason,
    actorUserId,
  });
  if (result.conflict) {
    throw new AppError('Record was modified by someone else, please refresh', 409, true, 'ATTENDANCE_CONFLICT');
  }
  return result.record;
}

// =============================================================================
// Student / Guardian-facing
// =============================================================================

async function buildMyAttendanceResponse(institutionId: string, studentId: string, query: MyAttendanceQueryDtoType) {
  const { startDate, endDate, subject } = query;
  const records = await repo.getAttendanceRecordsForStudent(institutionId, studentId, startDate, endDate, subject);
  const summary = computeSummary(records);

  const response: any = {
    records: records.map((r) => ({
      id: r.id,
      date: r.register.date,
      subject: r.register.subject === DAILY_SUBJECT_SENTINEL ? null : r.register.subject,
      mark: r.mark,
      reasonId: r.reasonId,
      note: r.note,
      minutesLate: r.minutesLate,
    })),
    summary,
  };

  const policy = await repo.getPenaltyPolicy(institutionId);
  if (policy?.isEnabled) {
    const matchingCount = records.filter((r) => r.mark === policy.countsMark).length;
    const amountPerAbsence = policy.amountPerAbsence ? Number(policy.amountPerAbsence) : 0;
    response.feeSummary = {
      countsMark: policy.countsMark,
      matchingCount,
      amountPerAbsence,
      totalDue: matchingCount * amountPerAbsence,
      billingFrequency: policy.billingFrequency,
    };
  }

  return response;
}

export async function getMyAttendance(institutionId: string, userId: string, query: MyAttendanceQueryDtoType) {
  const student = await repo.getStudentByUserId(institutionId, userId);
  if (!student) throw new NotFoundError('Student profile not found');
  return buildMyAttendanceResponse(institutionId, student.id, query);
}

export async function getChildAttendance(
  institutionId: string,
  studentId: string,
  guardianUserId: string,
  query: MyAttendanceQueryDtoType,
) {
  const linked = await guardianRepository.findLinkedStudentIdsByUserId(institutionId, guardianUserId);
  if (!linked.includes(studentId)) {
    throw new NotFoundError('Student not found');
  }
  return buildMyAttendanceResponse(institutionId, studentId, query);
}

export async function getReportsSummary(
  institutionId: string,
  userRole: string,
  userId: string,
  query: ReportsSummaryQueryDtoType,
) {
  const { branchId, classId, sectionId, startDate, endDate } = query;
  let sectionIds = await repo.getSectionIdsForFilters(institutionId, branchId, classId, sectionId);

  if (userRole === 'TEACHER') {
    const teacher = await repo.getTeacherByUserId(institutionId, userId);
    if (!teacher) return [];
    const assignments = await repo.findEffectiveSectionsForTeacherInRange(institutionId, teacher.id, startDate, endDate);
    const allowedSectionIds = new Set(assignments.map((a) => a.sectionId));
    sectionIds = sectionIds.filter((id) => allowedSectionIds.has(id));
  }

  const records = await repo.getRecordsForReport(institutionId, startDate, endDate, sectionIds);

  const bySection = new Map<string, Map<string, { studentId: string; name: string; sectionName: string; marks: AttendanceMark[] }>>();
  for (const r of records) {
    const sectionKey = r.student.sectionId ?? 'unknown';
    if (!bySection.has(sectionKey)) bySection.set(sectionKey, new Map());
    const studentsMap = bySection.get(sectionKey)!;
    if (!studentsMap.has(r.studentId)) {
      studentsMap.set(r.studentId, {
        studentId: r.studentId,
        name: `${r.student.firstName} ${r.student.lastName}`,
        sectionName: r.student.section?.name ?? '',
        marks: [],
      });
    }
    studentsMap.get(r.studentId)!.marks.push(r.mark);
  }

  const result = [];
  for (const [sectionId2, studentsMap] of bySection) {
    result.push({
      sectionId: sectionId2,
      students: Array.from(studentsMap.values()).map((s) => ({
        studentId: s.studentId,
        name: s.name,
        sectionName: s.sectionName,
        ...computeSummary(s.marks.map((mark) => ({ mark }))),
      })),
    });
  }
  return result;
}

// =============================================================================
// Correction requests
// =============================================================================

export async function createCorrectionRequest(
  institutionId: string,
  userRole: string,
  userId: string,
  data: CreateCorrectionRequestDtoType,
) {
  const record = await repo.getRecordWithRegister(institutionId, data.recordId);
  if (!record) throw new NotFoundError('Attendance record not found');

  if (userRole === 'STUDENT') {
    const student = await repo.getStudentByUserId(institutionId, userId);
    if (!student || student.id !== record.studentId) {
      throw new AppError('You may only request corrections for your own attendance', 403, true, 'PERMISSION_DENIED');
    }
  } else if (userRole === 'GUARDIAN') {
    const linked = await guardianRepository.findLinkedStudentIdsByUserId(institutionId, userId);
    if (!linked.includes(record.studentId)) {
      throw new AppError('You may only request corrections for a linked child', 403, true, 'PERMISSION_DENIED');
    }
  }

  return repo.createCorrectionRequest(institutionId, {
    recordId: data.recordId,
    requestedByUserId: userId,
    requestedMark: data.requestedMark,
    requestedReasonId: data.requestedReasonId,
    requestNote: data.requestNote,
  });
}

export async function listCorrectionRequests(
  institutionId: string,
  userRole: string,
  userId: string,
  query: CorrectionRequestQueryDtoType,
) {
  if (userRole === 'ADMIN' || userRole === 'SUPER_ADMIN') {
    return repo.listCorrectionRequests(institutionId, query);
  }

  if (userRole === 'STUDENT') {
    const student = await repo.getStudentByUserId(institutionId, userId);
    if (!student) return { requests: [], total: 0 };
    return repo.listCorrectionRequests(institutionId, { ...query, studentId: undefined }, [student.id]);
  }

  if (userRole === 'GUARDIAN') {
    const linked = await guardianRepository.findLinkedStudentIdsByUserId(institutionId, userId);
    return repo.listCorrectionRequests(institutionId, { ...query, studentId: undefined }, linked);
  }

  return { requests: [], total: 0 };
}

export async function resolveCorrectionRequest(
  institutionId: string,
  id: string,
  data: ResolveCorrectionRequestDtoType,
  actorUserId: string,
) {
  if (data.decision === 'APPROVED') {
    return repo.resolveCorrectionRequestApprovedTx({
      institutionId,
      id,
      actorUserId,
      resolutionNote: data.resolutionNote,
    });
  }
  return repo.resolveCorrectionRequestRejectedTx({
    institutionId,
    id,
    actorUserId,
    resolutionNote: data.resolutionNote,
  });
}

// =============================================================================
// Teacher-assignment CRUD
// =============================================================================

export async function createAssignment(institutionId: string, data: CreateAssignmentDtoType, createdByUserId: string) {
  const section = await repo.findSectionInTenant(institutionId, data.sectionId);
  if (!section) throw new NotFoundError('Section not found in this institution');

  const teacher = await repo.getTeacherById(institutionId, data.teacherId);
  if (!teacher) {
    throw new AppError('Teacher profile not found — create the teacher profile before assigning them', 422);
  }

  const role = data.role ?? 'PRIMARY';

  if (role === 'PRIMARY') {
    const overlap = await repo.findOverlappingPrimaryAssignment(
      institutionId,
      data.sectionId,
      data.subject,
      data.effectiveFrom,
      data.effectiveTo,
    );
    if (overlap) {
      throw new AppError(
        'An overlapping primary assignment already exists for this section/subject/date range',
        409,
        true,
        'ATTENDANCE_CONFLICT',
      );
    }
  } else {
    const duplicate = await repo.findExactDuplicateAssignment(
      institutionId,
      data.teacherId,
      data.sectionId,
      data.subject,
      data.effectiveFrom,
      data.effectiveTo,
    );
    if (duplicate) {
      throw new AppError('An identical assignment already exists', 409, true, 'ATTENDANCE_CONFLICT');
    }
  }

  return repo.createAssignment(institutionId, data, createdByUserId);
}

export async function listAssignments(institutionId: string, query: AssignmentQueryDtoType) {
  return repo.listAssignments(institutionId, query);
}

export async function updateAssignment(institutionId: string, id: string, data: UpdateAssignmentDtoType) {
  const assignment = await repo.findAssignmentById(institutionId, id);
  if (!assignment) throw new NotFoundError('Assignment not found');
  return repo.updateAssignment(id, data);
}

export async function deleteAssignment(institutionId: string, id: string) {
  const assignment = await repo.findAssignmentById(institutionId, id);
  if (!assignment) throw new NotFoundError('Assignment not found');

  const referenced = await repo.isAssignmentReferencedByRegister(id);
  if (referenced) {
    throw new ConflictError('Assignment is referenced by attendance registers — end-date it instead of deleting');
  }

  return repo.deleteAssignment(id);
}
