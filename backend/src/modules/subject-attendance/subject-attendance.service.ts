import { BadRequestError, ForbiddenError, NotFoundError } from '../../utils/AppError';
import { logger } from '../../utils/logger';
import * as guardianRepository from '../guardians/guardian.repository';
import { addStatus, attendancePercentage, emptyCounts, type StatusCounts } from '../attendance/attendance.logic';
import * as repo from './subject-attendance.repository';
import {
  canTeacherMarkSubject,
  normalizeSubject,
  numberPeriods,
  sessionsBySubject,
  summarizeBySubject,
  type TeacherSubjectScope,
} from './subject-attendance.logic';
import type {
  SubjectBulkSubmitDtoType,
  SubjectMyQueryDtoType,
  SubjectReportQueryDtoType,
  SubjectSheetQueryDtoType,
} from './subject-attendance.dto';

export interface Actor {
  userId: string;
  role: string;
}

const day = (d: string) => new Date(`${d}T00:00:00.000Z`);

async function teacherScope(
  institutionId: string,
  userId: string,
  className: string,
  sectionName: string,
): Promise<TeacherSubjectScope & { teacherId: string | null }> {
  const teacher = await repo.findTeacherByUser(institutionId, userId);
  if (!teacher) return { teacherId: null, isClassTeacher: false, taughtSubjects: new Set() };
  const [classTeacher, slots] = await Promise.all([
    repo.isClassTeacher(institutionId, teacher.id, className, sectionName),
    repo.findSlots(institutionId, className, sectionName, teacher.id),
  ]);
  return {
    teacherId: teacher.id,
    isClassTeacher: classTeacher,
    taughtSubjects: new Set(slots.map((s) => normalizeSubject(s.subject))),
  };
}

/** Subjects (and timetable periods) a user can mark for a class/section. */
export async function getOptions(institutionId: string, actor: Actor, className: string, sectionName: string) {
  const [slots, curriculum] = await Promise.all([
    repo.findSlots(institutionId, className, sectionName),
    repo.findCurriculumSubjects(institutionId, className),
  ]);
  const numbered = numberPeriods(slots);

  let allowed: (name: string) => boolean = () => true;
  if (actor.role === 'TEACHER') {
    const scope = await teacherScope(institutionId, actor.userId, className, sectionName);
    if (!scope.isClassTeacher && scope.taughtSubjects.size === 0) {
      throw new ForbiddenError('You are not assigned to this class/section');
    }
    allowed = (name) => canTeacherMarkSubject(scope, name);
  }

  const subjects = new Map<
    string,
    { subjectName: string; subjectId: string | null; source: 'TIMETABLE' | 'CURRICULUM'; periods: { dayOfWeek: string; period: number; startTime: string; endTime: string }[] }
  >();
  for (const s of numbered) {
    const key = normalizeSubject(s.subject);
    const entry = subjects.get(key) ?? { subjectName: s.subject, subjectId: null, source: 'TIMETABLE' as const, periods: [] };
    entry.periods.push({ dayOfWeek: s.dayOfWeek, period: s.period, startTime: s.startTime, endTime: s.endTime });
    subjects.set(key, entry);
  }
  for (const o of curriculum) {
    const key = normalizeSubject(o.subject.name);
    const entry = subjects.get(key);
    if (entry) entry.subjectId = o.subject.id;
    else subjects.set(key, { subjectName: o.subject.name, subjectId: o.subject.id, source: 'CURRICULUM', periods: [] });
  }

  return {
    className,
    sectionName,
    subjects: [...subjects.values()].filter((s) => allowed(s.subjectName)),
  };
}

async function assertCanMark(institutionId: string, actor: Actor, className: string, sectionName: string, subjectName: string) {
  if (actor.role !== 'TEACHER') return;
  const scope = await teacherScope(institutionId, actor.userId, className, sectionName);
  if (!canTeacherMarkSubject(scope, subjectName)) {
    throw new ForbiddenError('You can only mark subjects you teach in this class/section');
  }
}

export async function getSheet(institutionId: string, actor: Actor, q: SubjectSheetQueryDtoType) {
  await assertCanMark(institutionId, actor, q.className, q.sectionName, q.subjectName);
  const students = await repo.findSectionStudents(institutionId, q.className, q.sectionName);
  const records = students.length
    ? await repo.findSessionRecords(institutionId, students.map((s) => s.id), q.subjectName, day(q.date), q.period ?? null)
    : [];
  const byStudent = new Map(records.map((r) => [r.studentId, r.status]));
  return {
    ...q,
    period: q.period ?? null,
    alreadyMarked: records.length > 0,
    students: students.map((s) => ({
      id: s.id,
      studentId: s.studentId,
      name: `${s.firstName} ${s.lastName}`.trim(),
      rollNumber: s.rollNumber,
      status: byStudent.get(s.id) ?? null,
    })),
  };
}

export async function submit(institutionId: string, actor: Actor, dto: SubjectBulkSubmitDtoType) {
  await assertCanMark(institutionId, actor, dto.className, dto.sectionName, dto.subjectName);

  // Every student must belong to this tenant AND the chosen class/section.
  const sectionStudents = await repo.findSectionStudents(institutionId, dto.className, dto.sectionName);
  const allowed = new Set(sectionStudents.map((s) => s.id));
  const invalid = dto.records.filter((r) => !allowed.has(r.studentId));
  if (invalid.length) throw new BadRequestError('Some students are not in this class/section');

  const subject = await repo.findSubjectByName(institutionId, dto.subjectName);
  const count = await repo.saveSession({
    institutionId,
    subjectId: subject?.id ?? null,
    subjectName: subject?.name ?? dto.subjectName,
    date: day(dto.date),
    period: dto.period ?? null,
    markedByUserId: actor.userId,
    records: dto.records,
  });
  logger.info('Subject attendance saved', { institutionId, subject: dto.subjectName, date: dto.date, count });
  return { count };
}

export async function getReport(institutionId: string, actor: Actor, q: SubjectReportQueryDtoType) {
  const start = day(q.from);
  const end = day(q.to);
  if (end < start) throw new BadRequestError('"to" must be on or after "from"');
  if (end.getTime() - start.getTime() > 366 * 86400000) throw new BadRequestError('Range cannot exceed one year');

  let allowed: (name: string) => boolean = () => true;
  if (actor.role === 'TEACHER') {
    const scope = await teacherScope(institutionId, actor.userId, q.className, q.sectionName);
    if (!scope.isClassTeacher && scope.taughtSubjects.size === 0) {
      throw new ForbiddenError('You are not assigned to this class/section');
    }
    allowed = (name) => canTeacherMarkSubject(scope, name);
  }

  const students = await repo.findSectionStudents(institutionId, q.className, q.sectionName);
  const records = students.length
    ? (await repo.findRecordsInRange(institutionId, students.map((s) => s.id), start, end)).filter((r) => allowed(r.subjectName))
    : [];

  const subjectSummary = summarizeBySubject(records);
  const sessions = sessionsBySubject(records);
  const subjects = subjectSummary.map((s) => s.subjectName);

  const perStudent = new Map<string, Map<string, StatusCounts>>();
  for (const r of records) {
    const m = perStudent.get(r.studentId) ?? new Map<string, StatusCounts>();
    const c = m.get(r.subjectName) ?? emptyCounts();
    addStatus(c, r.status);
    m.set(r.subjectName, c);
    perStudent.set(r.studentId, m);
  }

  return {
    ...q,
    subjects,
    subjectTotals: subjectSummary.map((s) => ({ ...s, sessions: sessions.get(s.subjectName) ?? 0 })),
    students: students.map((s) => {
      const m = perStudent.get(s.id) ?? new Map<string, StatusCounts>();
      const bySubject: Record<string, StatusCounts & { percentage: number | null }> = {};
      const overall = emptyCounts();
      for (const [name, c] of m) {
        bySubject[name] = { ...c, percentage: attendancePercentage(c) };
        overall.present += c.present;
        overall.absent += c.absent;
        overall.late += c.late;
        overall.halfDay += c.halfDay;
        overall.total += c.total;
      }
      return {
        id: s.id,
        studentId: s.studentId,
        name: `${s.firstName} ${s.lastName}`.trim(),
        rollNumber: s.rollNumber,
        bySubject,
        overall: { ...overall, percentage: attendancePercentage(overall) },
      };
    }),
  };
}

async function studentView(institutionId: string, student: { id: string; firstName: string; lastName: string }, q: SubjectMyQueryDtoType) {
  const records = await repo.findRecordsInRange(
    institutionId,
    [student.id],
    q.from ? day(q.from) : undefined,
    q.to ? day(q.to) : undefined,
  );
  return {
    student: { id: student.id, name: `${student.firstName} ${student.lastName}`.trim() },
    subjects: summarizeBySubject(records),
    recent: records.slice(0, 50).map((r) => ({
      date: r.date.toISOString().slice(0, 10),
      subjectName: r.subjectName,
      period: r.period,
      status: r.status,
    })),
  };
}

export async function getMine(institutionId: string, userId: string, q: SubjectMyQueryDtoType) {
  const student = await repo.findStudentByUser(institutionId, userId);
  if (!student) throw new NotFoundError('Student profile not found');
  return studentView(institutionId, student, q);
}

export async function getChild(institutionId: string, guardianUserId: string, studentId: string, q: SubjectMyQueryDtoType) {
  const linked = await guardianRepository.findLinkedStudentIdsByUserId(institutionId, guardianUserId);
  if (!linked.includes(studentId)) throw new NotFoundError('Student not found');
  const student = await repo.findStudent(institutionId, studentId);
  if (!student) throw new NotFoundError('Student not found');
  return studentView(institutionId, student, q);
}

/** Class/sections a TEACHER can take subject attendance for (class teacher or timetable). */
export async function getTeacherClasses(institutionId: string, userId: string) {
  const teacher = await repo.findTeacherByUser(institutionId, userId);
  if (!teacher) return [];
  const { sections, slots } = await repo.findTeacherClassSections(institutionId, teacher.id);
  const map = new Map<string, { className: string; sectionName: string; isClassTeacher: boolean }>();
  for (const s of sections) {
    map.set(`${s.class.name}::${s.name}`, { className: s.class.name, sectionName: s.name, isClassTeacher: true });
  }
  for (const s of slots) {
    const key = `${s.className}::${s.sectionName}`;
    if (!map.has(key)) map.set(key, { className: s.className, sectionName: s.sectionName, isClassTeacher: false });
  }
  return [...map.values()].sort((a, b) => a.className.localeCompare(b.className) || a.sectionName.localeCompare(b.sectionName));
}
