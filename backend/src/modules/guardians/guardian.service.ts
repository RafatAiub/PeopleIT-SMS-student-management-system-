import * as guardianRepository from './guardian.repository';
import { prisma } from '../../config/prisma';
import { NotFoundError, ConflictError } from '../../utils/AppError';
import { logger } from '../../utils/logger';
import type {
  CreateGuardianDtoType,
  UpdateGuardianDtoType,
  GuardianQueryDtoType,
  LinkGuardianDtoType,
} from './guardian.dto';

// =============================================================================
// Guardian Service — Business logic
// =============================================================================

export async function listGuardians(institutionId: string, query: GuardianQueryDtoType) {
  return guardianRepository.findAll(institutionId, query);
}

export async function getGuardian(institutionId: string, id: string) {
  const guardian = await guardianRepository.findById(institutionId, id);
  if (!guardian) {
    throw new NotFoundError(`Guardian with ID '${id}' not found`);
  }
  return guardian;
}

export async function createGuardian(institutionId: string, data: CreateGuardianDtoType) {
  const guardian = await guardianRepository.create(institutionId, data);
  logger.info('Guardian created', { guardianId: guardian.id, institutionId });
  return guardian;
}

export async function updateGuardian(
  institutionId: string,
  id: string,
  data: UpdateGuardianDtoType,
) {
  const existing = await guardianRepository.findById(institutionId, id);
  if (!existing) {
    throw new NotFoundError(`Guardian with ID '${id}' not found`);
  }
  return guardianRepository.update(institutionId, id, data);
}

export async function deleteGuardian(institutionId: string, id: string) {
  const existing = await guardianRepository.findById(institutionId, id);
  if (!existing) {
    throw new NotFoundError(`Guardian with ID '${id}' not found`);
  }
  await guardianRepository.remove(institutionId, id);
  logger.info('Guardian deleted', { guardianId: id, institutionId });
}

export async function linkGuardianToStudent(
  institutionId: string,
  studentId: string,
  data: LinkGuardianDtoType,
) {
  // Verify student belongs to institution
  const student = await prisma.student.findFirst({
    where: { id: studentId, institutionId },
    select: { id: true },
  });
  if (!student) {
    throw new NotFoundError(`Student with ID '${studentId}' not found`);
  }

  // Verify guardian belongs to institution
  const guardian = await guardianRepository.findById(institutionId, data.guardianId);
  if (!guardian) {
    throw new NotFoundError(`Guardian with ID '${data.guardianId}' not found`);
  }

  // Check for existing link
  const existingLink = await prisma.guardianStudent.findFirst({
    where: { guardianId: data.guardianId, studentId },
    select: { guardianId: true },
  });
  if (existingLink) {
    throw new ConflictError('Guardian is already linked to this student');
  }

  return guardianRepository.linkToStudent(data.guardianId, studentId, data);
}

export async function unlinkGuardianFromStudent(
  institutionId: string,
  studentId: string,
  guardianId: string,
) {
  // Verify student belongs to institution
  const student = await prisma.student.findFirst({
    where: { id: studentId, institutionId },
    select: { id: true },
  });
  if (!student) {
    throw new NotFoundError(`Student with ID '${studentId}' not found`);
  }

  await guardianRepository.unlinkFromStudent(guardianId, studentId);
  logger.info('Guardian unlinked from student', { guardianId, studentId, institutionId });
}
