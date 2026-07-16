import { prisma } from '../../config/prisma';
import { computeGrade } from '../../utils/grading';
import type {
  CreateExamDtoType,
  UpdateExamDtoType,
  ExamQueryDtoType,
  SubmitExamResultsDtoType,
  ExamResultQueryDtoType,
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

export async function findAllResults(institutionId: string, query: ExamResultQueryDtoType) {
  const { page, pageSize, examId, studentId, subject, classId, sectionId } = query;
  const skip = (page - 1) * pageSize;

  const where = {
    institutionId,
    ...(examId ? { examId } : {}),
    ...(studentId ? { studentId } : {}),
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
