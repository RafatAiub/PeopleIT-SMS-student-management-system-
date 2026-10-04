// Merit list, class analytics, transcript and progress report — read-only
// aggregations over ExamResult, graded with the institution's default
// grading scale (fixed fallback when none is configured).
import { UserRole } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { NotFoundError, BadRequestError } from '../../utils/AppError';
import * as studentRepository from '../students/student.repository';
import * as guardianRepository from '../guardians/guardian.repository';
import { getDefaultScale } from '../grading/grading.resolver';
import { gradeFor, gradePointFor, summarizeMarks } from '../grading/grading.core';
import {
  buildClassAnalytics,
  buildProgress,
  buildTranscript,
  groupByStudent,
  rankEntries,
  type StudentResultRow,
} from './results.insights.logic';
import type { ClassAnalyticsQueryDtoType, MeritListQueryDtoType } from './results.dto';

export type Requester = { sub: string; role: string };

function scaleInfo(scale: Awaited<ReturnType<typeof getDefaultScale>>) {
  return scale
    ? { id: scale.id, name: scale.name, isFallback: false }
    : { id: null, name: 'Bangladesh standard (built-in)', isFallback: true };
}

// ── Scope helpers ───────────────────────────────────────────────────────────

interface ClassScopeInput {
  classId?: string;
  className?: string;
  sectionId?: string;
  sectionName?: string;
}

/**
 * Resolves a class (+ optional section) given either ids or names, verifying
 * everything belongs to the tenant. Names can match classes in more than one
 * branch — all matches are included, like the attendance sheet's
 * className/sectionName lookup.
 */
async function resolveClassScope(institutionId: string, input: ClassScopeInput) {
  if (!input.classId && !input.className) throw new BadRequestError('classId or className is required');

  const classes = await prisma.class.findMany({
    where: {
      branch: { institutionId },
      ...(input.classId ? { id: input.classId } : { name: input.className }),
    },
    select: { id: true, name: true },
  });
  if (classes.length === 0) throw new NotFoundError('Class not found');
  const classIds = classes.map((c) => c.id);

  let sectionIds: string[] | null = null;
  let sectionName: string | null = null;
  if (input.sectionId || input.sectionName) {
    const sections = await prisma.section.findMany({
      where: {
        classId: { in: classIds },
        ...(input.sectionId ? { id: input.sectionId } : { name: input.sectionName }),
      },
      select: { id: true, name: true },
    });
    if (sections.length === 0) throw new NotFoundError('Section not found');
    sectionIds = sections.map((s) => s.id);
    sectionName = sections[0].name;
  }

  return { classIds, className: classes[0].name, sectionIds, sectionName };
}

async function findExamOrThrow(institutionId: string, examId: string) {
  const exam = await prisma.exam.findFirst({
    where: { id: examId, institutionId },
    select: { id: true, name: true, startDate: true, endDate: true },
  });
  if (!exam) throw new NotFoundError(`Exam with ID '${examId}' not found`);
  return exam;
}

/**
 * Resolves the student a transcript/progress request is about.
 * STUDENT: only themselves (":studentId" may be "me").
 * GUARDIAN: only a linked child. Staff: any student in the tenant.
 * Mismatches look like "not found" so existence never leaks.
 */
export async function resolveStudentForRequester(institutionId: string, studentIdParam: string, requester: Requester) {
  if (requester.role === UserRole.STUDENT) {
    const own = await studentRepository.findByUserId(institutionId, requester.sub);
    if (!own || (studentIdParam !== 'me' && studentIdParam !== own.id)) throw new NotFoundError('Student not found');
    return own.id;
  }
  if (studentIdParam === 'me') throw new NotFoundError('Student not found');
  if (requester.role === UserRole.GUARDIAN) {
    const linked = await guardianRepository.findLinkedStudentIdsByUserId(institutionId, requester.sub);
    if (!linked.includes(studentIdParam)) throw new NotFoundError('Student not found');
  }
  return studentIdParam;
}

// ── Merit list ──────────────────────────────────────────────────────────────

export async function getMeritList(institutionId: string, query: MeritListQueryDtoType) {
  const exam = await findExamOrThrow(institutionId, query.examId);
  const scope = await resolveClassScope(institutionId, query);
  const scale = await getDefaultScale(institutionId);
  const bands = scale?.bands ?? null;

  const rows = await prisma.examResult.findMany({
    where: {
      institutionId,
      examId: exam.id,
      student: {
        classId: { in: scope.classIds },
        ...(scope.sectionIds ? { sectionId: { in: scope.sectionIds } } : {}),
      },
    },
    select: {
      studentId: true,
      subject: true,
      marksObtained: true,
      maxMarks: true,
      student: {
        select: {
          id: true,
          studentId: true,
          firstName: true,
          lastName: true,
          rollNumber: true,
          section: { select: { name: true } },
        },
      },
    },
    orderBy: [{ studentId: 'asc' }, { subject: 'asc' }],
  });

  const numeric = rows.map((r) => ({
    ...r,
    marksObtained: Number(r.marksObtained),
    maxMarks: Number(r.maxMarks),
  }));
  const subjects = Array.from(new Set(numeric.map((r) => r.subject))).sort((a, b) => a.localeCompare(b));

  const entries = Array.from(groupByStudent(numeric).values()).map((list) => {
    const s = list[0].student;
    const summary = summarizeMarks(list, bands);
    const name = `${s.firstName} ${s.lastName}`.trim();
    return {
      id: s.id,
      studentId: s.id,
      studentCode: s.studentId,
      name,
      rollNumber: s.rollNumber,
      sectionName: s.section?.name ?? null,
      sortName: `${(s.rollNumber ?? '').padStart(6, '0')} ${name}`,
      totalObtained: summary.totalObtained,
      totalMax: summary.totalMax,
      percent: summary.percent,
      gpa: summary.gpa,
      grade: summary.grade,
      passed: summary.passed,
      failedSubjects: summary.failedSubjects,
      subjectsCount: summary.subjects,
      marks: Object.fromEntries(
        list.map((r) => [
          r.subject,
          { marksObtained: r.marksObtained, maxMarks: r.maxMarks, grade: gradeFor(r.marksObtained, r.maxMarks, bands), gradePoint: gradePointFor(r.marksObtained, r.maxMarks, bands) },
        ]),
      ),
    };
  });

  const ranked = rankEntries(entries, query.rankBy).map(({ sortName: _sortName, ...rest }) => rest);

  return {
    exam,
    className: scope.className,
    sectionName: scope.sectionName,
    rankBy: query.rankBy,
    scale: scaleInfo(scale),
    subjects,
    items: ranked,
    stats: {
      students: ranked.length,
      passed: ranked.filter((r) => r.passed).length,
      highestPercent: ranked.length ? Math.max(...ranked.map((r) => r.percent)) : 0,
    },
  };
}

// ── Class analytics ─────────────────────────────────────────────────────────

export async function getClassAnalytics(institutionId: string, query: ClassAnalyticsQueryDtoType) {
  const exam = await findExamOrThrow(institutionId, query.examId);
  const scope = await resolveClassScope(institutionId, query);
  const scale = await getDefaultScale(institutionId);

  const studentWhere = {
    classId: { in: scope.classIds },
    ...(scope.sectionIds ? { sectionId: { in: scope.sectionIds } } : {}),
  };

  const [rows, enrolled] = await Promise.all([
    prisma.examResult.findMany({
      where: { institutionId, examId: exam.id, student: studentWhere },
      select: { studentId: true, subject: true, marksObtained: true, maxMarks: true },
    }),
    prisma.student.count({ where: { institutionId, status: 'ACTIVE', ...studentWhere } }),
  ]);

  const analytics = buildClassAnalytics(
    rows.map((r) => ({ ...r, marksObtained: Number(r.marksObtained), maxMarks: Number(r.maxMarks) })),
    scale?.bands ?? null,
  );

  return {
    exam,
    className: scope.className,
    sectionName: scope.sectionName,
    scale: scaleInfo(scale),
    enrolledActiveStudents: enrolled,
    ...analytics,
  };
}

// ── Transcript + progress ───────────────────────────────────────────────────

async function loadStudentHistory(institutionId: string, studentId: string) {
  const [student, results, sessions, institution] = await Promise.all([
    prisma.student.findFirst({
      where: { id: studentId, institutionId },
      select: {
        id: true,
        studentId: true,
        firstName: true,
        lastName: true,
        rollNumber: true,
        dateOfBirth: true,
        admissionDate: true,
        status: true,
        department: true,
        class: { select: { id: true, name: true } },
        section: { select: { id: true, name: true } },
        academicYear: { select: { id: true, label: true } },
        guardians: {
          where: { isPrimary: true },
          take: 1,
          select: { guardian: { select: { firstName: true, lastName: true } } },
        },
      },
    }),
    prisma.examResult.findMany({
      where: { institutionId, studentId },
      select: {
        examId: true,
        subject: true,
        marksObtained: true,
        maxMarks: true,
        grade: true,
        remarks: true,
        exam: { select: { id: true, name: true, startDate: true, endDate: true } },
      },
    }),
    prisma.academicYear.findMany({
      where: { institutionId },
      select: { id: true, label: true, startDate: true, endDate: true },
      orderBy: { startDate: 'asc' },
    }),
    prisma.institution.findUnique({
      where: { id: institutionId },
      select: { name: true, logoUrl: true, address: true, phone: true, email: true },
    }),
  ]);
  if (!student) throw new NotFoundError('Student not found');

  const examMap = new Map(results.map((r) => [r.exam.id, r.exam]));
  const rows: StudentResultRow[] = results.map((r) => ({
    examId: r.examId,
    subject: r.subject,
    marksObtained: Number(r.marksObtained),
    maxMarks: Number(r.maxMarks),
    storedGrade: r.grade,
    remarks: r.remarks,
  }));

  const primaryGuardian = student.guardians[0]?.guardian;
  const { guardians: _guardians, ...studentOut } = student;
  return {
    student: {
      ...studentOut,
      guardianName: primaryGuardian ? `${primaryGuardian.firstName} ${primaryGuardian.lastName}`.trim() : null,
    },
    rows,
    exams: Array.from(examMap.values()),
    sessions,
    institution,
  };
}

export async function getTranscript(institutionId: string, studentIdParam: string, requester: Requester) {
  const studentId = await resolveStudentForRequester(institutionId, studentIdParam, requester);
  const [history, scale] = await Promise.all([loadStudentHistory(institutionId, studentId), getDefaultScale(institutionId)]);
  const transcript = buildTranscript(history.rows, history.exams, history.sessions, scale?.bands ?? null);
  return {
    institution: history.institution,
    student: history.student,
    scale: scaleInfo(scale),
    ...transcript,
    generatedAt: new Date(),
  };
}

export async function getProgress(institutionId: string, studentIdParam: string, requester: Requester) {
  const studentId = await resolveStudentForRequester(institutionId, studentIdParam, requester);
  const [history, scale] = await Promise.all([loadStudentHistory(institutionId, studentId), getDefaultScale(institutionId)]);
  return {
    student: {
      id: history.student.id,
      studentId: history.student.studentId,
      firstName: history.student.firstName,
      lastName: history.student.lastName,
      class: history.student.class,
      section: history.student.section,
    },
    scale: scaleInfo(scale),
    ...buildProgress(history.rows, history.exams, scale?.bands ?? null),
  };
}
