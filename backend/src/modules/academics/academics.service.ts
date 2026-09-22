import * as academicsRepository from './academics.repository';
import { prisma } from '../../config/prisma';
import { NotFoundError, ConflictError } from '../../utils/AppError';
import { logger } from '../../utils/logger';
import type {
  CreateLookupDtoType,
  UpdateLookupDtoType,
  CreateClassDtoType,
  UpdateClassDtoType,
  CreateSectionDtoType,
  UpdateSectionDtoType,
} from './academics.dto';

// Prisma unique-constraint violation code — @@unique([institutionId, name])
// on Medium/Stream/Shift/Semester/Subject.
const UNIQUE_CONSTRAINT_CODE = 'P2002';

function isUniqueConstraintError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: string }).code === UNIQUE_CONSTRAINT_CODE;
}

// =============================================================================
// Medium
// =============================================================================

export async function createMedium(institutionId: string, data: CreateLookupDtoType) {
  try {
    const medium = await academicsRepository.createMedium(institutionId, data);
    logger.info('Medium created', { mediumId: medium.id, institutionId });
    return medium;
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw new ConflictError(`A medium named "${data.name}" already exists`);
    }
    throw error;
  }
}

export async function listMediums(institutionId: string) {
  return academicsRepository.findMediums(institutionId);
}

export async function updateMedium(institutionId: string, id: string, data: UpdateLookupDtoType) {
  const existing = await academicsRepository.findMediumById(institutionId, id);
  if (!existing) {
    throw new NotFoundError(`Medium with ID '${id}' not found`);
  }
  try {
    const updated = await academicsRepository.updateMedium(institutionId, id, data);
    logger.info('Medium updated', { mediumId: id, institutionId });
    return updated;
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw new ConflictError(`A medium named "${data.name}" already exists`);
    }
    throw error;
  }
}

export async function deleteMedium(institutionId: string, id: string) {
  const existing = await academicsRepository.findMediumById(institutionId, id);
  if (!existing) {
    throw new NotFoundError(`Medium with ID '${id}' not found`);
  }
  const classCount = await academicsRepository.countClassesByMedium(id);
  if (classCount > 0) {
    throw new ConflictError(`Cannot delete — ${classCount} class(es) still reference this medium.`);
  }
  await academicsRepository.deleteMedium(id);
  logger.info('Medium deleted', { mediumId: id, institutionId });
}

// =============================================================================
// Stream
// =============================================================================

export async function createStream(institutionId: string, data: CreateLookupDtoType) {
  try {
    const stream = await academicsRepository.createStream(institutionId, data);
    logger.info('Stream created', { streamId: stream.id, institutionId });
    return stream;
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw new ConflictError(`A stream named "${data.name}" already exists`);
    }
    throw error;
  }
}

export async function listStreams(institutionId: string) {
  return academicsRepository.findStreams(institutionId);
}

export async function updateStream(institutionId: string, id: string, data: UpdateLookupDtoType) {
  const existing = await academicsRepository.findStreamById(institutionId, id);
  if (!existing) {
    throw new NotFoundError(`Stream with ID '${id}' not found`);
  }
  try {
    const updated = await academicsRepository.updateStream(institutionId, id, data);
    logger.info('Stream updated', { streamId: id, institutionId });
    return updated;
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw new ConflictError(`A stream named "${data.name}" already exists`);
    }
    throw error;
  }
}

export async function deleteStream(institutionId: string, id: string) {
  const existing = await academicsRepository.findStreamById(institutionId, id);
  if (!existing) {
    throw new NotFoundError(`Stream with ID '${id}' not found`);
  }
  const classCount = await academicsRepository.countClassesByStream(id);
  if (classCount > 0) {
    throw new ConflictError(`Cannot delete — ${classCount} class(es) still reference this stream.`);
  }
  await academicsRepository.deleteStream(id);
  logger.info('Stream deleted', { streamId: id, institutionId });
}

// =============================================================================
// Shift
// =============================================================================

export async function createShift(institutionId: string, data: CreateLookupDtoType) {
  try {
    const shift = await academicsRepository.createShift(institutionId, data);
    logger.info('Shift created', { shiftId: shift.id, institutionId });
    return shift;
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw new ConflictError(`A shift named "${data.name}" already exists`);
    }
    throw error;
  }
}

export async function listShifts(institutionId: string) {
  return academicsRepository.findShifts(institutionId);
}

export async function updateShift(institutionId: string, id: string, data: UpdateLookupDtoType) {
  const existing = await academicsRepository.findShiftById(institutionId, id);
  if (!existing) {
    throw new NotFoundError(`Shift with ID '${id}' not found`);
  }
  try {
    const updated = await academicsRepository.updateShift(institutionId, id, data);
    logger.info('Shift updated', { shiftId: id, institutionId });
    return updated;
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw new ConflictError(`A shift named "${data.name}" already exists`);
    }
    throw error;
  }
}

export async function deleteShift(institutionId: string, id: string) {
  const existing = await academicsRepository.findShiftById(institutionId, id);
  if (!existing) {
    throw new NotFoundError(`Shift with ID '${id}' not found`);
  }
  const classCount = await academicsRepository.countClassesByShift(id);
  if (classCount > 0) {
    throw new ConflictError(`Cannot delete — ${classCount} class(es) still reference this shift.`);
  }
  await academicsRepository.deleteShift(id);
  logger.info('Shift deleted', { shiftId: id, institutionId });
}

// =============================================================================
// Semester
// =============================================================================

export async function createSemester(institutionId: string, data: CreateLookupDtoType) {
  try {
    const semester = await academicsRepository.createSemester(institutionId, data);
    logger.info('Semester created', { semesterId: semester.id, institutionId });
    return semester;
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw new ConflictError(`A semester named "${data.name}" already exists`);
    }
    throw error;
  }
}

export async function listSemesters(institutionId: string) {
  return academicsRepository.findSemesters(institutionId);
}

export async function updateSemester(institutionId: string, id: string, data: UpdateLookupDtoType) {
  const existing = await academicsRepository.findSemesterById(institutionId, id);
  if (!existing) {
    throw new NotFoundError(`Semester with ID '${id}' not found`);
  }
  try {
    const updated = await academicsRepository.updateSemester(institutionId, id, data);
    logger.info('Semester updated', { semesterId: id, institutionId });
    return updated;
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw new ConflictError(`A semester named "${data.name}" already exists`);
    }
    throw error;
  }
}

export async function deleteSemester(institutionId: string, id: string) {
  const existing = await academicsRepository.findSemesterById(institutionId, id);
  if (!existing) {
    throw new NotFoundError(`Semester with ID '${id}' not found`);
  }
  const classCount = await academicsRepository.countClassesBySemester(id);
  if (classCount > 0) {
    throw new ConflictError(`Cannot delete — ${classCount} class(es) still reference this semester.`);
  }
  await academicsRepository.deleteSemester(id);
  logger.info('Semester deleted', { semesterId: id, institutionId });
}

// =============================================================================
// StudentCategory
// =============================================================================

export async function createStudentCategory(institutionId: string, data: CreateLookupDtoType) {
  try {
    const category = await academicsRepository.createStudentCategory(institutionId, data);
    logger.info('Student category created', { categoryId: category.id, institutionId });
    return category;
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw new ConflictError(`A student category named "${data.name}" already exists`);
    }
    throw error;
  }
}

export async function listStudentCategories(institutionId: string) {
  return academicsRepository.findStudentCategories(institutionId);
}

export async function updateStudentCategory(institutionId: string, id: string, data: UpdateLookupDtoType) {
  const existing = await academicsRepository.findStudentCategoryById(institutionId, id);
  if (!existing) {
    throw new NotFoundError(`Student category with ID '${id}' not found`);
  }
  try {
    const updated = await academicsRepository.updateStudentCategory(institutionId, id, data);
    logger.info('Student category updated', { categoryId: id, institutionId });
    return updated;
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw new ConflictError(`A student category named "${data.name}" already exists`);
    }
    throw error;
  }
}

export async function deleteStudentCategory(institutionId: string, id: string) {
  const existing = await academicsRepository.findStudentCategoryById(institutionId, id);
  if (!existing) {
    throw new NotFoundError(`Student category with ID '${id}' not found`);
  }
  const studentCount = await academicsRepository.countStudentsByCategory(id);
  if (studentCount > 0) {
    throw new ConflictError(`Cannot delete — ${studentCount} student(s) still reference this category.`);
  }
  await academicsRepository.deleteStudentCategory(id);
  logger.info('Student category deleted', { categoryId: id, institutionId });
}

// =============================================================================
// Class
// =============================================================================

// A caller-supplied mediumId/streamId/shiftId/semesterId must belong to the
// same institution — otherwise a Class could be wired to another tenant's
// lookup row. Validated here rather than trusted from the client.
async function assertClassLookupsBelongToInstitution(institutionId: string, data: CreateClassDtoType | UpdateClassDtoType) {
  if (data.mediumId) {
    const medium = await academicsRepository.findMediumById(institutionId, data.mediumId);
    if (!medium) throw new NotFoundError(`Medium with ID '${data.mediumId}' not found`);
  }
  if (data.streamId) {
    const stream = await academicsRepository.findStreamById(institutionId, data.streamId);
    if (!stream) throw new NotFoundError(`Stream with ID '${data.streamId}' not found`);
  }
  if (data.shiftId) {
    const shift = await academicsRepository.findShiftById(institutionId, data.shiftId);
    if (!shift) throw new NotFoundError(`Shift with ID '${data.shiftId}' not found`);
  }
  if (data.semesterId) {
    const semester = await academicsRepository.findSemesterById(institutionId, data.semesterId);
    if (!semester) throw new NotFoundError(`Semester with ID '${data.semesterId}' not found`);
  }
}

export async function createClass(institutionId: string, data: CreateClassDtoType) {
  await assertClassLookupsBelongToInstitution(institutionId, data);
  const created = await academicsRepository.createClass(institutionId, data);
  logger.info('Class created', { classId: created.id, institutionId });
  return created;
}

export async function listClasses(institutionId: string) {
  return academicsRepository.findClasses(institutionId);
}

export async function updateClass(institutionId: string, id: string, data: UpdateClassDtoType) {
  const existing = await academicsRepository.findClassById(institutionId, id);
  if (!existing) {
    throw new NotFoundError(`Class with ID '${id}' not found`);
  }
  await assertClassLookupsBelongToInstitution(institutionId, data);
  const updated = await academicsRepository.updateClass(id, data);
  logger.info('Class updated', { classId: id, institutionId });
  return updated;
}

export async function deleteClass(institutionId: string, id: string) {
  const existing = await academicsRepository.findClassById(institutionId, id);
  if (!existing) {
    throw new NotFoundError(`Class with ID '${id}' not found`);
  }
  const sectionCount = await academicsRepository.countSectionsByClass(id);
  if (sectionCount > 0) {
    throw new ConflictError(`Cannot delete — ${sectionCount} section(s) still exist under this class.`);
  }
  const studentCount = await academicsRepository.countStudentsByClass(id);
  if (studentCount > 0) {
    throw new ConflictError(`Cannot delete — ${studentCount} student(s) are still enrolled in this class.`);
  }
  await academicsRepository.deleteClass(id);
  logger.info('Class deleted', { classId: id, institutionId });
}

// =============================================================================
// Section
// =============================================================================

// classTeacherId, if provided, must belong to a Teacher in this institution —
// same validation pattern as timetables.service.ts.
async function assertClassTeacherBelongsToInstitution(institutionId: string, classTeacherId?: string | null) {
  if (!classTeacherId) return;
  const teacher = await prisma.teacher.findFirst({
    where: { id: classTeacherId, user: { institutionId } },
  });
  if (!teacher) {
    throw new NotFoundError(`Teacher with ID '${classTeacherId}' not found under this institution`);
  }
}

export async function createSection(institutionId: string, data: CreateSectionDtoType) {
  const ownedClass = await academicsRepository.findClassById(institutionId, data.classId);
  if (!ownedClass) {
    throw new NotFoundError(`Class with ID '${data.classId}' not found`);
  }
  await assertClassTeacherBelongsToInstitution(institutionId, data.classTeacherId);

  const created = await academicsRepository.createSection(data);
  logger.info('Section created', { sectionId: created.id, institutionId });
  return created;
}

// classId provided → sections for that one class (existing behavior,
// unchanged for every existing caller). classId omitted → every section
// institution-wide, each with its class name and current class teacher
// joined in (Assign Class Teacher screen).
export async function listSections(institutionId: string, classId?: string) {
  if (!classId) {
    return academicsRepository.findAllSections(institutionId);
  }
  const ownedClass = await academicsRepository.findClassById(institutionId, classId);
  if (!ownedClass) {
    throw new NotFoundError(`Class with ID '${classId}' not found`);
  }
  return academicsRepository.findSections(institutionId, classId);
}

export async function updateSection(institutionId: string, id: string, data: UpdateSectionDtoType) {
  const existing = await academicsRepository.findSectionById(institutionId, id);
  if (!existing) {
    throw new NotFoundError(`Section with ID '${id}' not found`);
  }
  if (data.classId) {
    const ownedClass = await academicsRepository.findClassById(institutionId, data.classId);
    if (!ownedClass) {
      throw new NotFoundError(`Class with ID '${data.classId}' not found`);
    }
  }
  await assertClassTeacherBelongsToInstitution(institutionId, data.classTeacherId);

  const updated = await academicsRepository.updateSection(id, data);
  logger.info('Section updated', { sectionId: id, institutionId });
  return updated;
}

export async function deleteSection(institutionId: string, id: string) {
  const existing = await academicsRepository.findSectionById(institutionId, id);
  if (!existing) {
    throw new NotFoundError(`Section with ID '${id}' not found`);
  }
  const studentCount = await academicsRepository.countStudentsBySection(id);
  if (studentCount > 0) {
    throw new ConflictError(`Cannot delete — ${studentCount} student(s) are still enrolled in this section.`);
  }
  await academicsRepository.deleteSection(id);
  logger.info('Section deleted', { sectionId: id, institutionId });
}
