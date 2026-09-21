import { prisma } from '../../config/prisma';
import type {
  CreateLookupDtoType,
  UpdateLookupDtoType,
  CreateClassDtoType,
  UpdateClassDtoType,
  CreateSectionDtoType,
  UpdateSectionDtoType,
} from './academics.dto';

// =============================================================================
// Medium
// =============================================================================

export async function createMedium(institutionId: string, data: CreateLookupDtoType) {
  return prisma.medium.create({ data: { institutionId, name: data.name } });
}

export async function findMediums(institutionId: string) {
  return prisma.medium.findMany({ where: { institutionId }, orderBy: { name: 'asc' } });
}

export async function findMediumById(institutionId: string, id: string) {
  return prisma.medium.findFirst({ where: { id, institutionId } });
}

export async function updateMedium(institutionId: string, id: string, data: UpdateLookupDtoType) {
  return prisma.medium.update({ where: { id }, data });
}

export async function deleteMedium(id: string) {
  return prisma.medium.delete({ where: { id } });
}

export async function countClassesByMedium(mediumId: string) {
  return prisma.class.count({ where: { mediumId } });
}

// =============================================================================
// Stream
// =============================================================================

export async function createStream(institutionId: string, data: CreateLookupDtoType) {
  return prisma.stream.create({ data: { institutionId, name: data.name } });
}

export async function findStreams(institutionId: string) {
  return prisma.stream.findMany({ where: { institutionId }, orderBy: { name: 'asc' } });
}

export async function findStreamById(institutionId: string, id: string) {
  return prisma.stream.findFirst({ where: { id, institutionId } });
}

export async function updateStream(institutionId: string, id: string, data: UpdateLookupDtoType) {
  return prisma.stream.update({ where: { id }, data });
}

export async function deleteStream(id: string) {
  return prisma.stream.delete({ where: { id } });
}

export async function countClassesByStream(streamId: string) {
  return prisma.class.count({ where: { streamId } });
}

// =============================================================================
// Shift
// =============================================================================

export async function createShift(institutionId: string, data: CreateLookupDtoType) {
  return prisma.shift.create({ data: { institutionId, name: data.name } });
}

export async function findShifts(institutionId: string) {
  return prisma.shift.findMany({ where: { institutionId }, orderBy: { name: 'asc' } });
}

export async function findShiftById(institutionId: string, id: string) {
  return prisma.shift.findFirst({ where: { id, institutionId } });
}

export async function updateShift(institutionId: string, id: string, data: UpdateLookupDtoType) {
  return prisma.shift.update({ where: { id }, data });
}

export async function deleteShift(id: string) {
  return prisma.shift.delete({ where: { id } });
}

export async function countClassesByShift(shiftId: string) {
  return prisma.class.count({ where: { shiftId } });
}

// =============================================================================
// Semester
// =============================================================================

export async function createSemester(institutionId: string, data: CreateLookupDtoType) {
  return prisma.semester.create({ data: { institutionId, name: data.name } });
}

export async function findSemesters(institutionId: string) {
  return prisma.semester.findMany({ where: { institutionId }, orderBy: { name: 'asc' } });
}

export async function findSemesterById(institutionId: string, id: string) {
  return prisma.semester.findFirst({ where: { id, institutionId } });
}

export async function updateSemester(institutionId: string, id: string, data: UpdateLookupDtoType) {
  return prisma.semester.update({ where: { id }, data });
}

export async function deleteSemester(id: string) {
  return prisma.semester.delete({ where: { id } });
}

export async function countClassesBySemester(semesterId: string) {
  return prisma.class.count({ where: { semesterId } });
}

// =============================================================================
// Class — scoped via branch.institutionId. Branch is never exposed to the
// caller; every institution transparently uses its single "Main Branch"
// (find-or-create), matching the self-healing pattern in
// student.controller.ts's listClasses.
// =============================================================================

export async function findOrCreateMainBranch(institutionId: string) {
  let branch = await prisma.branch.findFirst({ where: { institutionId } });
  if (!branch) {
    branch = await prisma.branch.create({
      data: { institutionId, name: 'Main Branch' },
    });
  }
  return branch;
}

export async function createClass(institutionId: string, data: CreateClassDtoType) {
  const branch = await findOrCreateMainBranch(institutionId);
  return prisma.class.create({
    data: {
      branchId: branch.id,
      name: data.name,
      level: data.level,
      mediumId: data.mediumId,
      streamId: data.streamId,
      shiftId: data.shiftId,
      semesterId: data.semesterId,
    },
  });
}

export async function findClasses(institutionId: string) {
  return prisma.class.findMany({
    where: { branch: { institutionId } },
    include: { medium: true, stream: true, shift: true, semester: true },
    orderBy: { level: 'asc' },
  });
}

export async function findClassById(institutionId: string, id: string) {
  return prisma.class.findFirst({
    where: { id, branch: { institutionId } },
    include: { medium: true, stream: true, shift: true, semester: true },
  });
}

export async function updateClass(id: string, data: UpdateClassDtoType) {
  return prisma.class.update({
    where: { id },
    data: {
      name: data.name,
      level: data.level,
      mediumId: data.mediumId,
      streamId: data.streamId,
      shiftId: data.shiftId,
      semesterId: data.semesterId,
    },
  });
}

export async function deleteClass(id: string) {
  return prisma.class.delete({ where: { id } });
}

export async function countSectionsByClass(classId: string) {
  return prisma.section.count({ where: { classId } });
}

export async function countStudentsByClass(classId: string) {
  return prisma.student.count({ where: { classId } });
}

// =============================================================================
// Section — per-Class, scoped via class.branch.institutionId.
// =============================================================================

export async function createSection(data: CreateSectionDtoType) {
  return prisma.section.create({
    data: {
      classId: data.classId,
      name: data.name,
      classTeacherId: data.classTeacherId,
    },
  });
}

export async function findSections(institutionId: string, classId: string) {
  return prisma.section.findMany({
    where: { classId, class: { branch: { institutionId } } },
    include: {
      classTeacher: {
        include: { user: { select: { firstName: true, lastName: true, email: true } } },
      },
    },
    orderBy: { name: 'asc' },
  });
}

export async function findSectionById(institutionId: string, id: string) {
  return prisma.section.findFirst({
    where: { id, class: { branch: { institutionId } } },
    include: {
      classTeacher: {
        include: { user: { select: { firstName: true, lastName: true, email: true } } },
      },
    },
  });
}

export async function updateSection(id: string, data: UpdateSectionDtoType) {
  return prisma.section.update({
    where: { id },
    data: {
      name: data.name,
      classId: data.classId,
      classTeacherId: data.classTeacherId,
    },
  });
}

export async function deleteSection(id: string) {
  return prisma.section.delete({ where: { id } });
}

export async function countStudentsBySection(sectionId: string) {
  return prisma.student.count({ where: { sectionId } });
}
