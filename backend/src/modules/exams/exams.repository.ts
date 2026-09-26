import { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import type { GradeBand } from '../../utils/grading';
import type {
  CreateExamDtoType,
  ExamListQueryDtoType,
  TimetableEntryDtoType,
  TimetableQueryDtoType,
  SaveGradesDtoType,
} from './exams.dto';

const classSummarySelect = {
  id: true,
  name: true,
  medium: { select: { name: true } },
  stream: { select: { name: true } },
} satisfies Prisma.ClassSelect;

const examInclude = {
  academicYear: { select: { id: true, label: true } },
  semester: { select: { id: true, name: true } },
  classes: { select: { class: { select: classSummarySelect } } },
  _count: { select: { results: true, timetable: true } },
} satisfies Prisma.ExamInclude;

// ── Lookups ──────────────────────────────────────────────────────────────

export async function findAcademicYears(institutionId: string) {
  return prisma.academicYear.findMany({
    where: { institutionId },
    select: { id: true, label: true, isCurrent: true, startDate: true, endDate: true },
    orderBy: { startDate: 'desc' },
  });
}

// Same default-year convention as students' /meta/classes self-heal: the
// calendar year as the label, marked current.
export async function createDefaultAcademicYear(institutionId: string) {
  const year = new Date().getFullYear().toString();
  return prisma.academicYear.create({
    data: {
      institutionId,
      label: year,
      startDate: new Date(`${year}-01-01`),
      endDate: new Date(`${year}-12-31`),
      isCurrent: true,
    },
  });
}

export async function findAcademicYearById(institutionId: string, id: string) {
  return prisma.academicYear.findFirst({ where: { id, institutionId }, select: { id: true } });
}

export async function findSemesterById(institutionId: string, id: string) {
  return prisma.semester.findFirst({ where: { id, institutionId }, select: { id: true } });
}

// Class has no institutionId of its own — tenancy is via its Branch.
export async function findClassesByIds(institutionId: string, ids: string[]) {
  return prisma.class.findMany({
    where: { id: { in: ids }, branch: { institutionId } },
    select: { id: true, name: true },
  });
}

export async function findSubjectsByIds(institutionId: string, ids: string[]) {
  return prisma.subject.findMany({
    where: { id: { in: ids }, institutionId },
    select: { id: true, name: true },
  });
}

// ── Exams ────────────────────────────────────────────────────────────────

export async function findExams(institutionId: string, query: ExamListQueryDtoType) {
  const { search, academicYearId, classId } = query;
  return prisma.exam.findMany({
    where: {
      institutionId,
      ...(academicYearId ? { academicYearId } : {}),
      ...(search ? { name: { contains: search, mode: 'insensitive' as const } } : {}),
      // An exam with no linked classes applies to every class.
      ...(classId ? { OR: [{ classes: { some: { classId } } }, { classes: { none: {} } }] } : {}),
    },
    include: examInclude,
    orderBy: { createdAt: 'desc' },
  });
}

export async function findExamById(institutionId: string, id: string) {
  return prisma.exam.findFirst({ where: { id, institutionId }, include: examInclude });
}

export async function createExam(institutionId: string, data: CreateExamDtoType) {
  const { classIds, ...fields } = data;
  return prisma.exam.create({
    data: {
      ...fields,
      institutionId,
      classes: { create: classIds.map((classId) => ({ classId })) },
    },
    include: examInclude,
  });
}

export async function updateExam(institutionId: string, id: string, data: CreateExamDtoType) {
  const { classIds, ...fields } = data;
  return prisma.$transaction(async (tx) => {
    await tx.examClass.deleteMany({ where: { examId: id } });
    // Timetable rows for classes no longer on the exam would be orphaned.
    await tx.examTimetable.deleteMany({ where: { examId: id, institutionId, classId: { notIn: classIds } } });
    return tx.exam.update({
      where: { id },
      data: {
        ...fields,
        classes: { create: classIds.map((classId) => ({ classId })) },
      },
      include: examInclude,
    });
  });
}

export async function setExamPublished(id: string, isPublished: boolean) {
  return prisma.exam.update({ where: { id }, data: { isPublished }, include: examInclude });
}

export async function countExamResults(institutionId: string, examId: string) {
  return prisma.examResult.count({ where: { institutionId, examId } });
}

export async function deleteExam(institutionId: string, id: string) {
  return prisma.exam.deleteMany({ where: { id, institutionId } });
}

// ── Exam Timetable ───────────────────────────────────────────────────────

const timetableInclude = {
  exam: { select: { id: true, name: true, academicYear: { select: { id: true, label: true } } } },
  class: { select: classSummarySelect },
  subject: { select: { id: true, name: true } },
} satisfies Prisma.ExamTimetableInclude;

export async function findTimetable(institutionId: string, query: TimetableQueryDtoType) {
  const { examId, classId, academicYearId } = query;
  return prisma.examTimetable.findMany({
    where: {
      institutionId,
      ...(examId ? { examId } : {}),
      ...(classId ? { classId } : {}),
      ...(academicYearId ? { exam: { academicYearId } } : {}),
    },
    include: timetableInclude,
    orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
  });
}

export async function findTimetableEntry(institutionId: string, id: string) {
  return prisma.examTimetable.findFirst({ where: { id, institutionId } });
}

// Re-submitting a subject for the same exam + class updates it in place.
export async function upsertTimetableEntries(
  institutionId: string,
  examId: string,
  classId: string,
  entries: TimetableEntryDtoType[],
) {
  return prisma.$transaction(
    entries.map((entry) =>
      prisma.examTimetable.upsert({
        where: { examId_classId_subjectId: { examId, classId, subjectId: entry.subjectId } },
        update: { ...entry },
        create: { ...entry, institutionId, examId, classId },
      }),
    ),
  );
}

export async function updateTimetableEntry(id: string, entry: TimetableEntryDtoType) {
  return prisma.examTimetable.update({ where: { id }, data: entry, include: timetableInclude });
}

export async function deleteTimetableEntry(id: string) {
  return prisma.examTimetable.delete({ where: { id } });
}

// Keeps Exam.startDate/endDate (used on report cards) in step with its
// timetable. Left untouched when the timetable is empty.
export async function syncExamDatesFromTimetable(examId: string) {
  const agg = await prisma.examTimetable.aggregate({
    where: { examId },
    _min: { date: true },
    _max: { date: true },
  });
  if (!agg._min.date || !agg._max.date) return;
  await prisma.exam.update({
    where: { id: examId },
    data: { startDate: agg._min.date, endDate: agg._max.date },
  });
}

// ── Exam Grades ──────────────────────────────────────────────────────────

export async function findGrades(institutionId: string) {
  return prisma.examGrade.findMany({
    where: { institutionId },
    orderBy: { minPercent: 'asc' },
  });
}

export async function replaceGrades(institutionId: string, grades: SaveGradesDtoType['grades'][number][]) {
  return prisma.$transaction([
    prisma.examGrade.deleteMany({ where: { institutionId } }),
    prisma.examGrade.createMany({ data: grades.map((g) => ({ ...g, institutionId })) }),
  ]);
}

export async function loadGradeBands(institutionId: string): Promise<GradeBand[]> {
  const rows = await findGrades(institutionId);
  return rows.map((r) => ({
    minPercent: Number(r.minPercent),
    maxPercent: Number(r.maxPercent),
    grade: r.grade,
  }));
}

// ── Exam Result (class summary) ──────────────────────────────────────────

export async function findClassStudents(institutionId: string, classId: string, sectionId?: string) {
  return prisma.student.findMany({
    where: { institutionId, classId, ...(sectionId ? { sectionId } : {}) },
    select: {
      id: true,
      studentId: true,
      firstName: true,
      lastName: true,
      rollNumber: true,
      avatarUrl: true,
      section: { select: { id: true, name: true } },
    },
    orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
  });
}

export async function findExamResultsForStudents(institutionId: string, examId: string, studentIds: string[]) {
  return prisma.examResult.findMany({
    where: { institutionId, examId, studentId: { in: studentIds } },
    select: { studentId: true, subject: true, marksObtained: true, maxMarks: true },
  });
}

export async function findClassTimetableSubjects(institutionId: string, examId: string, classId: string) {
  return prisma.examTimetable.findMany({
    where: { institutionId, examId, classId },
    select: { passingMarks: true, subject: { select: { name: true } } },
  });
}
