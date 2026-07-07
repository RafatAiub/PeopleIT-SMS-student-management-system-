import * as resultsRepository from './results.repository';
import { prisma } from '../../config/prisma';
import { NotFoundError, BadRequestError } from '../../utils/AppError';
import { logger } from '../../utils/logger';
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
