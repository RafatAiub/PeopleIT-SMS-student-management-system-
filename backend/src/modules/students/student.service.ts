import * as studentRepository from './student.repository';
import { NotFoundError, ConflictError } from '../../utils/AppError';
import { logger } from '../../utils/logger';
import type {
  CreateStudentDtoType,
  UpdateStudentDtoType,
  StudentQueryDtoType,
  CreateStudentDocumentDtoType,
} from './student.dto';

// =============================================================================
// Student Service — Business logic layer
// institutionId ALWAYS comes from req.tenantId (never from body)
// =============================================================================

export async function listStudents(institutionId: string, query: StudentQueryDtoType) {
  return studentRepository.findAll(institutionId, query);
}

export async function getStudent(institutionId: string, id: string) {
  const student = await studentRepository.findById(institutionId, id);
  if (!student) {
    throw new NotFoundError(`Student with ID '${id}' not found`);
  }
  return student;
}

export async function createStudent(institutionId: string, data: CreateStudentDtoType) {
  // Check for duplicate studentId within this institution
  const existing = await studentRepository.findByStudentId(institutionId, data.studentId);
  if (existing) {
    throw new ConflictError(
      `Student ID '${data.studentId}' already exists in this institution`,
    );
  }

  const student = await studentRepository.create(institutionId, data);
  logger.info('Student created', { studentId: student.id, institutionId });
  return student;
}

export async function updateStudent(
  institutionId: string,
  id: string,
  data: UpdateStudentDtoType,
) {
  // Confirm student belongs to this institution
  const existing = await studentRepository.findById(institutionId, id);
  if (!existing) {
    throw new NotFoundError(`Student with ID '${id}' not found`);
  }

  const updated = await studentRepository.update(institutionId, id, data);
  logger.info('Student updated', { studentId: id, institutionId });
  return updated;
}

export async function deleteStudent(institutionId: string, id: string) {
  const existing = await studentRepository.findById(institutionId, id);
  if (!existing) {
    throw new NotFoundError(`Student with ID '${id}' not found`);
  }

  await studentRepository.remove(institutionId, id);
  logger.info('Student deleted', { studentId: id, institutionId });
}

export async function getStudentDocuments(institutionId: string, studentId: string) {
  // Verify student exists in this institution
  const student = await studentRepository.findById(institutionId, studentId);
  if (!student) {
    throw new NotFoundError(`Student with ID '${studentId}' not found`);
  }

  return studentRepository.findDocuments(institutionId, studentId);
}

export async function addStudentDocument(
  institutionId: string,
  studentId: string,
  data: CreateStudentDocumentDtoType,
) {
  const student = await studentRepository.findById(institutionId, studentId);
  if (!student) {
    throw new NotFoundError(`Student with ID '${studentId}' not found`);
  }

  const doc = await studentRepository.createDocument(institutionId, studentId, data);
  logger.info('Student document added', { studentId, docId: doc.id, institutionId });
  return doc;
}
