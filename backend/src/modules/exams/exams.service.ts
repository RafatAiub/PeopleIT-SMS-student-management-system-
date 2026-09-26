import * as examsRepository from './exams.repository';
import { NotFoundError, BadRequestError } from '../../utils/AppError';
import { logger } from '../../utils/logger';
import { gradeForPercentage } from '../../utils/grading';
import type {
  CreateExamDtoType,
  UpdateExamDtoType,
  ExamListQueryDtoType,
  CreateTimetableDtoType,
  TimetableEntryDtoType,
  TimetableQueryDtoType,
  SaveGradesDtoType,
  ExamResultQueryDtoType,
} from './exams.dto';

// ── Lookups ──────────────────────────────────────────────────────────────

// No Session Year admin page exists yet, so seed the current year the first
// time an institution has none — the Create Exam form requires one.
export async function listSessionYears(institutionId: string) {
  const years = await examsRepository.findAcademicYears(institutionId);
  if (years.length > 0) return years;
  await examsRepository.createDefaultAcademicYear(institutionId);
  return examsRepository.findAcademicYears(institutionId);
}

async function assertExamRefsBelongToTenant(institutionId: string, data: CreateExamDtoType) {
  const year = await examsRepository.findAcademicYearById(institutionId, data.academicYearId);
  if (!year) throw new BadRequestError('Invalid session year');

  if (data.semesterId) {
    const semester = await examsRepository.findSemesterById(institutionId, data.semesterId);
    if (!semester) throw new BadRequestError('Invalid semester');
  }

  const uniqueClassIds = Array.from(new Set(data.classIds));
  const classes = await examsRepository.findClassesByIds(institutionId, uniqueClassIds);
  if (classes.length !== uniqueClassIds.length) {
    throw new BadRequestError('Some classes are invalid or belong to another institution');
  }
  return { ...data, classIds: uniqueClassIds as [string, ...string[]] };
}

// ── Exams ────────────────────────────────────────────────────────────────

export async function listExams(institutionId: string, query: ExamListQueryDtoType) {
  return examsRepository.findExams(institutionId, query);
}

async function getExamOrThrow(institutionId: string, id: string) {
  const exam = await examsRepository.findExamById(institutionId, id);
  if (!exam) throw new NotFoundError(`Exam with ID '${id}' not found`);
  return exam;
}

export async function createExam(institutionId: string, data: CreateExamDtoType) {
  const clean = await assertExamRefsBelongToTenant(institutionId, data);
  const exam = await examsRepository.createExam(institutionId, clean);
  logger.info('Exam created', { examId: exam.id, institutionId });
  return exam;
}

export async function updateExam(institutionId: string, id: string, data: UpdateExamDtoType) {
  await getExamOrThrow(institutionId, id);
  const clean = await assertExamRefsBelongToTenant(institutionId, data);
  const exam = await examsRepository.updateExam(institutionId, id, clean);
  logger.info('Exam updated', { examId: id, institutionId });
  return exam;
}

export async function setExamPublished(institutionId: string, id: string, isPublished: boolean) {
  await getExamOrThrow(institutionId, id);
  const exam = await examsRepository.setExamPublished(id, isPublished);
  logger.info('Exam publish state changed', { examId: id, institutionId, isPublished });
  return exam;
}

export async function deleteExam(institutionId: string, id: string) {
  await getExamOrThrow(institutionId, id);
  const resultsCount = await examsRepository.countExamResults(institutionId, id);
  if (resultsCount > 0) {
    throw new BadRequestError('Cannot delete exam because it has results registered. Delete results first.');
  }
  await examsRepository.deleteExam(institutionId, id);
  logger.info('Exam deleted', { examId: id, institutionId });
}

// ── Exam Timetable ───────────────────────────────────────────────────────

export async function listTimetable(institutionId: string, query: TimetableQueryDtoType) {
  return examsRepository.findTimetable(institutionId, query);
}

// The class must be one the exam is held for (or the exam is open to all
// classes), and every subject must be the tenant's own.
async function assertTimetableRefs(institutionId: string, examId: string, classId: string, subjectIds: string[]) {
  const exam = await getExamOrThrow(institutionId, examId);
  const [cls] = await examsRepository.findClassesByIds(institutionId, [classId]);
  if (!cls) throw new BadRequestError('Invalid class');
  if (exam.classes.length > 0 && !exam.classes.some((c) => c.class.id === classId)) {
    throw new BadRequestError(`${cls.name} is not part of exam "${exam.name}"`);
  }

  const uniqueSubjectIds = Array.from(new Set(subjectIds));
  if (uniqueSubjectIds.length !== subjectIds.length) {
    throw new BadRequestError('Each subject can only appear once in a timetable');
  }
  const subjects = await examsRepository.findSubjectsByIds(institutionId, uniqueSubjectIds);
  if (subjects.length !== uniqueSubjectIds.length) {
    throw new BadRequestError('Some subjects are invalid or belong to another institution');
  }
}

export async function createTimetable(institutionId: string, data: CreateTimetableDtoType) {
  const { examId, classId, entries } = data;
  await assertTimetableRefs(institutionId, examId, classId, entries.map((e) => e.subjectId));
  const rows = await examsRepository.upsertTimetableEntries(institutionId, examId, classId, entries);
  await examsRepository.syncExamDatesFromTimetable(examId);
  logger.info('Exam timetable saved', { institutionId, examId, classId, count: rows.length });
  return rows;
}

export async function updateTimetableEntry(institutionId: string, id: string, entry: TimetableEntryDtoType) {
  const existing = await examsRepository.findTimetableEntry(institutionId, id);
  if (!existing) throw new NotFoundError('Timetable entry not found');

  if (entry.subjectId !== existing.subjectId) {
    const [subject] = await examsRepository.findSubjectsByIds(institutionId, [entry.subjectId]);
    if (!subject) throw new BadRequestError('Invalid subject');
    const clash = await examsRepository.findTimetable(institutionId, { examId: existing.examId, classId: existing.classId });
    if (clash.some((row) => row.subjectId === entry.subjectId)) {
      throw new BadRequestError('This subject is already scheduled for this exam and class');
    }
  }

  const row = await examsRepository.updateTimetableEntry(id, entry);
  await examsRepository.syncExamDatesFromTimetable(existing.examId);
  return row;
}

export async function deleteTimetableEntry(institutionId: string, id: string) {
  const existing = await examsRepository.findTimetableEntry(institutionId, id);
  if (!existing) throw new NotFoundError('Timetable entry not found');
  await examsRepository.deleteTimetableEntry(id);
  await examsRepository.syncExamDatesFromTimetable(existing.examId);
}

// ── Exam Grades ──────────────────────────────────────────────────────────

export async function listGrades(institutionId: string) {
  return examsRepository.findGrades(institutionId);
}

export async function saveGrades(institutionId: string, data: SaveGradesDtoType) {
  const sorted = [...data.grades].sort((a, b) => a.minPercent - b.minPercent);

  const seen = new Set<string>();
  for (const g of sorted) {
    const key = g.grade.toUpperCase();
    if (seen.has(key)) throw new BadRequestError(`Grade "${g.grade}" is defined more than once`);
    seen.add(key);
  }
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].minPercent <= sorted[i - 1].maxPercent) {
      throw new BadRequestError(
        `Range ${sorted[i].minPercent}-${sorted[i].maxPercent} overlaps ${sorted[i - 1].minPercent}-${sorted[i - 1].maxPercent}`,
      );
    }
  }

  await examsRepository.replaceGrades(institutionId, sorted);
  logger.info('Exam grades saved', { institutionId, count: sorted.length });
  return examsRepository.findGrades(institutionId);
}

// ── Exam Result (class summary) ──────────────────────────────────────────

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * One row per student in the class/section: totals across every subject
 * result recorded for the exam, percentage, grade (institution bands),
 * pass/fail against the exam timetable's passing marks where a subject can
 * be matched by name, and rank among students with results.
 */
export async function getClassResults(institutionId: string, query: ExamResultQueryDtoType) {
  const { examId, classId, sectionId } = query;
  await getExamOrThrow(institutionId, examId);
  const [cls] = await examsRepository.findClassesByIds(institutionId, [classId]);
  if (!cls) throw new BadRequestError('Invalid class');

  const students = await examsRepository.findClassStudents(institutionId, classId, sectionId);
  if (students.length === 0) return [];

  const [results, bands, timetable] = await Promise.all([
    examsRepository.findExamResultsForStudents(institutionId, examId, students.map((s) => s.id)),
    examsRepository.loadGradeBands(institutionId),
    examsRepository.findClassTimetableSubjects(institutionId, examId, classId),
  ]);

  const passingBySubject = new Map(
    timetable.map((t) => [t.subject.name.toLowerCase(), Number(t.passingMarks)] as const),
  );

  const byStudent = new Map<string, { total: number; obtained: number; subjects: number; failed: boolean }>();
  for (const r of results) {
    const acc = byStudent.get(r.studentId) ?? { total: 0, obtained: 0, subjects: 0, failed: false };
    const obtained = Number(r.marksObtained);
    acc.total += Number(r.maxMarks);
    acc.obtained += obtained;
    acc.subjects += 1;
    const passing = passingBySubject.get(r.subject.toLowerCase());
    if (passing !== undefined && obtained < passing) acc.failed = true;
    byStudent.set(r.studentId, acc);
  }

  const ranked = Array.from(byStudent.entries()).sort((a, b) => b[1].obtained - a[1].obtained);
  const rankByStudent = new Map<string, number>();
  ranked.forEach(([studentId, acc], i) => {
    // Ties share a rank (1, 2, 2, 4 ...).
    const prev = ranked[i - 1];
    const rank = prev && prev[1].obtained === acc.obtained ? rankByStudent.get(prev[0])! : i + 1;
    rankByStudent.set(studentId, rank);
  });

  return students.map((s) => {
    const acc = byStudent.get(s.id);
    const percentage = acc && acc.total > 0 ? round2((acc.obtained / acc.total) * 100) : null;
    return {
      id: s.id,
      studentId: s.studentId,
      firstName: s.firstName,
      lastName: s.lastName,
      rollNumber: s.rollNumber,
      avatarUrl: s.avatarUrl,
      section: s.section,
      subjectCount: acc?.subjects ?? 0,
      totalMarks: acc ? round2(acc.total) : null,
      obtainedMarks: acc ? round2(acc.obtained) : null,
      percentage,
      grade: percentage !== null ? gradeForPercentage(percentage, bands) : null,
      status: acc ? (acc.failed ? 'FAIL' : 'PASS') : null,
      rank: rankByStudent.get(s.id) ?? null,
    };
  });
}
