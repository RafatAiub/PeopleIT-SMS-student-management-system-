import * as resultsRepository from './results.repository';
import { prisma } from '../../config/prisma';
import { NotFoundError, BadRequestError } from '../../utils/AppError';
import { logger } from '../../utils/logger';
import * as studentRepository from '../students/student.repository';
import * as guardianRepository from '../guardians/guardian.repository';
import { renderReportCardPdf } from './reportCard.pdf';
import type {
  CreateExamDtoType,
  UpdateExamDtoType,
  ExamQueryDtoType,
  SubmitExamResultsDtoType,
  ExamResultQueryDtoType,
} from './results.dto';

// ── Exam Services ──────────────────────────────────────────────────────────

export async function createExam(institutionId: string, data: CreateExamDtoType) {
  const exam = await resultsRepository.createExam(institutionId, data);
  logger.info('Exam created', { examId: exam.id, institutionId });
  return exam;
}

export async function updateExam(institutionId: string, id: string, data: UpdateExamDtoType) {
  const exam = await resultsRepository.findExamById(institutionId, id);
  if (!exam) {
    throw new NotFoundError(`Exam with ID '${id}' not found`);
  }
  await resultsRepository.updateExam(institutionId, id, data);
  const updated = await resultsRepository.findExamById(institutionId, id);
  logger.info('Exam updated', { examId: id, institutionId });
  return updated;
}

export async function getExam(institutionId: string, id: string) {
  const exam = await resultsRepository.findExamById(institutionId, id);
  if (!exam) {
    throw new NotFoundError(`Exam with ID '${id}' not found`);
  }
  return exam;
}

export async function listExams(institutionId: string, query: ExamQueryDtoType) {
  return resultsRepository.findAllExams(institutionId, query);
}

export async function deleteExam(institutionId: string, id: string) {
  const exam = await resultsRepository.findExamById(institutionId, id);
  if (!exam) {
    throw new NotFoundError(`Exam with ID '${id}' not found`);
  }

  // Check if exam has results associated
  const resultsCount = await prisma.examResult.count({
    where: { examId: id, institutionId },
  });
  if (resultsCount > 0) {
    throw new BadRequestError('Cannot delete exam because it has results registered. Delete results first.');
  }

  await resultsRepository.removeExam(institutionId, id);
  logger.info('Exam deleted', { examId: id, institutionId });
}

// ── Exam Result Services ────────────────────────────────────────────────────

export async function submitExamResults(
  institutionId: string,
  data: SubmitExamResultsDtoType,
) {
  const { examId, results } = data;

  // Validate Exam exists in the institution
  const exam = await resultsRepository.findExamById(institutionId, examId);
  if (!exam) {
    throw new NotFoundError(`Exam with ID '${examId}' not found`);
  }

  // Validate all students exist in the institution
  const studentIds = results.map((r) => r.studentId);
  const validStudentsCount = await prisma.student.count({
    where: {
      institutionId,
      id: { in: studentIds },
    },
  });

  if (validStudentsCount !== new Set(studentIds).size) {
    throw new BadRequestError('Some student IDs are invalid or belong to another institution');
  }

  const result = await resultsRepository.upsertBulkResults(institutionId, examId, results);
  logger.info('Exam results submitted', { institutionId, examId, count: results.length });
  return result;
}

export async function listResults(
  institutionId: string,
  query: ExamResultQueryDtoType,
) {
  return resultsRepository.findAllResults(institutionId, query);
}

// ── Report Card PDF ─────────────────────────────────────────────────────────

/**
 * Generates a report-card PDF for one student's results in one exam.
 * STUDENT/GUARDIAN callers are ownership-scoped to their own/linked
 * children — never trust the :studentId param for those roles. Follows the
 * same pattern as fee.service.ts's invoice ownership scoping.
 */
export async function generateReportCard(
  institutionId: string,
  studentId: string,
  examId: string,
  requester: { sub: string; role: string },
): Promise<Buffer> {
  if (requester.role === 'STUDENT') {
    const own = await studentRepository.findByUserId(institutionId, requester.sub);
    if (!own || own.id !== studentId) {
      throw new NotFoundError('Student not found');
    }
  } else if (requester.role === 'GUARDIAN') {
    const linked = await guardianRepository.findLinkedStudentIdsByUserId(institutionId, requester.sub);
    if (!linked.includes(studentId)) {
      throw new NotFoundError('Student not found');
    }
  }

  const [student, exam, results] = await Promise.all([
    prisma.student.findFirst({
      where: { id: studentId, institutionId },
      select: {
        studentId: true,
        firstName: true,
        lastName: true,
        rollNumber: true,
        class: { select: { name: true } },
        section: { select: { name: true } },
      },
    }),
    prisma.exam.findFirst({ where: { id: examId, institutionId }, select: { name: true, startDate: true, endDate: true } }),
    prisma.examResult.findMany({
      where: { institutionId, examId, studentId },
      select: { subject: true, marksObtained: true, maxMarks: true, grade: true, remarks: true },
      orderBy: { subject: 'asc' },
    }),
  ]);

  if (!student) throw new NotFoundError('Student not found');
  if (!exam) throw new NotFoundError('Exam not found');
  if (results.length === 0) throw new NotFoundError('No results found for this student in this exam');

  const totalObtained = results.reduce((sum, r) => sum + Number(r.marksObtained), 0);
  const totalMax = results.reduce((sum, r) => sum + Number(r.maxMarks), 0);
  const overallPercentage = totalMax > 0 ? Math.round((totalObtained / totalMax) * 10000) / 100 : 0;

  const pdf = await renderReportCardPdf({
    institutionName: (await prisma.institution.findUnique({ where: { id: institutionId }, select: { name: true } }))?.name ?? '',
    student,
    exam,
    results: results.map((r) => ({
      subject: r.subject,
      marksObtained: Number(r.marksObtained),
      maxMarks: Number(r.maxMarks),
      grade: r.grade ?? '-',
      remarks: r.remarks ?? '',
    })),
    totalObtained,
    totalMax,
    overallPercentage,
  });

  logger.info('Report card generated', { institutionId, studentId, examId });
  return pdf;
}

export async function deleteResult(institutionId: string, id: string) {
  const count = await prisma.examResult.count({
    where: { id, institutionId },
  });
  if (count === 0) {
    throw new NotFoundError(`Exam result with ID '${id}' not found`);
  }
  await resultsRepository.removeResult(institutionId, id);
  logger.info('Exam result deleted', { resultId: id, institutionId });
}
