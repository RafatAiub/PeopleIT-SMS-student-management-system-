import { prisma } from '../../config/prisma';
import { computeGrade } from '../../utils/grading';
import type {
  CreateExamDtoType,
  UpdateExamDtoType,
  ExamQueryDtoType,
  SubmitExamResultsDtoType,
  ExamResultQueryDtoType,
  MarksheetQueryDtoType,
} from './results.dto';

// ── Exam Repository ─────────────────────────────────────────────────────────

export async function createExam(institutionId: string, data: CreateExamDtoType) {
  return prisma.exam.create({
    data: {
      ...data,
      institutionId,
    },
  });
}

export async function updateExam(institutionId: string, id: string, data: UpdateExamDtoType) {
  return prisma.exam.updateMany({
    where: { id, institutionId },
    data,
  });
}

export async function findExamById(institutionId: string, id: string) {
  return prisma.exam.findFirst({
    where: { id, institutionId },
  });
}

export async function findAllExams(institutionId: string, query: ExamQueryDtoType) {
  const { page, pageSize, search, isActive } = query;
  const skip = (page - 1) * pageSize;

  const where = {
    institutionId,
    ...(isActive !== undefined ? { isActive } : {}),
    ...(search
      ? {
          name: { contains: search, mode: 'insensitive' as const },
        }
      : {}),
  };

  const [exams, total] = await prisma.$transaction([
    prisma.exam.findMany({
      where,
      skip,
      take: pageSize,
      orderBy: { startDate: 'desc' },
    }),
    prisma.exam.count({ where }),
  ]);

  return { exams, total };
}

export async function removeExam(institutionId: string, id: string) {
  return prisma.exam.deleteMany({
    where: { id, institutionId },
  });
}

// ── ExamResult Repository ───────────────────────────────────────────────────

export async function upsertBulkResults(
  institutionId: string,
  examId: string,
  results: SubmitExamResultsDtoType['results'],
) {
  const operations = results.map((res) => {
    const maxMarks = res.maxMarks ?? 100.0;
    // Grade is always server-computed from marks, never trusted from the
    // client — a client-supplied grade could drift from the actual marks
    // and corrupt report cards / transcripts.
    const grade = computeGrade(res.marksObtained, maxMarks);
    const data = {
      institutionId,
      examId,
      studentId: res.studentId,
      subject: res.subject,
      marksObtained: res.marksObtained,
      maxMarks,
      grade,
      remarks: res.remarks || null,
    };
    return prisma.examResult.upsert({
      where: {
        institutionId_examId_studentId_subject: {
          institutionId,
          examId,
          studentId: res.studentId,
          subject: res.subject,
        },
      },
      update: {
        marksObtained: res.marksObtained,
        maxMarks,
        grade,
        remarks: res.remarks || null,
      },
      create: data,
    });
  });

  return prisma.$transaction(operations);
}

// `studentIdIn` is an internal-only extension (not part of the Zod query
// schema exposed to callers via validate()) used by the STUDENT/GUARDIAN
// self-service "my results" path to fetch multiple linked children's
// results in one query — same extension pattern as library/transport's
// getIssues/getAssignments.
export async function findAllResults(
  institutionId: string,
  query: ExamResultQueryDtoType & { studentIdIn?: string[] },
) {
  const { page, pageSize, examId, studentId, studentIdIn, subject, classId, sectionId } = query;
  const skip = (page - 1) * pageSize;

  const where = {
    institutionId,
    ...(examId ? { examId } : {}),
    ...(studentId ? { studentId } : {}),
    ...(studentIdIn ? { studentId: { in: studentIdIn } } : {}),
    ...(subject ? { subject: { contains: subject, mode: 'insensitive' as const } } : {}),
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
    prisma.examResult.findMany({
      where,
      include: {
        exam: { select: { id: true, name: true } },
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
      orderBy: { updatedAt: 'desc' },
    }),
    prisma.examResult.count({ where }),
  ]);

  return { records, total };
}

export async function removeResult(institutionId: string, id: string) {
  return prisma.examResult.deleteMany({
    where: { id, institutionId },
  });
}

// Staff-facing class/section marksheet (GET /results/marksheet). Fetches the
// full institutionId+examId+classId(+sectionId)-scoped result set once; the
// per-subject "highest mark in class/section" aggregate is computed from
// this same row set in a second pass in the service layer, rather than a
// separate groupBy/_max query — one row set, one round trip.
export async function findMarksheetRows(institutionId: string, params: MarksheetQueryDtoType) {
  const { examId, classId, sectionId } = params;

  return prisma.examResult.findMany({
    where: {
      institutionId,
      examId,
      student: {
        classId,
        ...(sectionId ? { sectionId } : {}),
      },
    },
    select: {
      subject: true,
      marksObtained: true,
      maxMarks: true,
      grade: true,
      student: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          rollNumber: true,
        },
      },
    },
    orderBy: [{ studentId: 'asc' }, { subject: 'asc' }],
  });
}
