import * as curriculumRepository from './curriculum.repository';
import { StudentGroup } from '@prisma/client';
import { NotFoundError, ConflictError } from '../../utils/AppError';
import { logger } from '../../utils/logger';
import type { CreateSubjectDtoType, UpdateSubjectDtoType } from './curriculum.dto';

export async function getSubjectOfferings(institutionId: string, className: string, group?: StudentGroup) {
  const offerings = await curriculumRepository.findOfferingsByClass(institutionId, className, group);

  return offerings.map((o) => ({
    id: o.id,
    subjectName: o.subject.name,
    paper: o.paper,
    // Folds the paper into a single label (e.g. "Bangla 1st Paper") since
    // ExamResult.subject has always been one free-text string — callers
    // save/read marks against this label, same shape as before.
    label:
      o.paper === 'FIRST'
        ? `${o.subject.name} 1st Paper`
        : o.paper === 'SECOND'
          ? `${o.subject.name} 2nd Paper`
          : o.subject.name,
    defaultMaxMarks: Number(o.defaultMaxMarks),
    group: o.group,
    displayOrder: o.displayOrder,
  }));
}

// Flat, un-scoped catalogue list — backs the Subject admin CRUD page.
// Distinct from getSubjectOfferings above, which is className-scoped and
// feeds the mark-entry subject list with SubjectOffering rows, not Subject.
export async function listSubjects(institutionId: string) {
  return curriculumRepository.listSubjects(institutionId);
}

// Prisma unique-constraint violation code — @@unique([institutionId, name]) on Subject.
const UNIQUE_CONSTRAINT_CODE = 'P2002';

function isUniqueConstraintError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: string }).code === UNIQUE_CONSTRAINT_CODE;
}

export async function createSubject(institutionId: string, data: CreateSubjectDtoType) {
  try {
    const subject = await curriculumRepository.createSubject(institutionId, data);
    logger.info('Subject created', { subjectId: subject.id, institutionId });
    return subject;
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw new ConflictError(`A subject named "${data.name}" already exists`);
    }
    throw error;
  }
}

export async function updateSubject(institutionId: string, id: string, data: UpdateSubjectDtoType) {
  const existing = await curriculumRepository.findSubjectById(institutionId, id);
  if (!existing) {
    throw new NotFoundError(`Subject with ID '${id}' not found`);
  }
  try {
    const updated = await curriculumRepository.updateSubject(institutionId, id, data);
    logger.info('Subject updated', { subjectId: id, institutionId });
    return updated;
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw new ConflictError(`A subject named "${data.name}" already exists`);
    }
    throw error;
  }
}

export async function deleteSubject(institutionId: string, id: string) {
  const existing = await curriculumRepository.findSubjectById(institutionId, id);
  if (!existing) {
    throw new NotFoundError(`Subject with ID '${id}' not found`);
  }
  const offeringCount = await curriculumRepository.countOfferingsBySubject(id);
  if (offeringCount > 0) {
    throw new ConflictError(`Cannot delete — ${offeringCount} class subject offering(s) still reference this subject.`);
  }
  await curriculumRepository.deleteSubject(id);
  logger.info('Subject deleted', { subjectId: id, institutionId });
}
