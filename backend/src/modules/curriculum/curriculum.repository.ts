import { prisma } from '../../config/prisma';
import { StudentGroup } from '@prisma/client';
import type { CreateSubjectDtoType, UpdateSubjectDtoType } from './curriculum.dto';

// Class 1-8 offerings are seeded with group: NONE (no group split). Class 9+
// callers pass a specific group and see both that group's subjects AND any
// NONE-group offering (the compulsory-for-every-group subjects, e.g. Bangla,
// English, ICT) — mirrors how the old hardcoded frontend list concatenated
// COMPULSORY_SUBJECTS_SENIOR with the group-specific array.
export async function findOfferingsByClass(
  institutionId: string,
  className: string,
  group?: StudentGroup,
) {
  return prisma.subjectOffering.findMany({
    where: {
      institutionId,
      className,
      group: group ? { in: [StudentGroup.NONE, group] } : StudentGroup.NONE,
      isGraded: true,
    },
    include: { subject: true },
    orderBy: [{ displayOrder: 'asc' }, { subject: { name: 'asc' } }],
  });
}

// =============================================================================
// Subject CRUD — the catalogue itself. SubjectOffering (the actual
// class↔subject link) stays read-only, out of scope for this pass.
// =============================================================================

export async function listSubjects(institutionId: string) {
  return prisma.subject.findMany({
    where: { institutionId },
    orderBy: { name: 'asc' },
  });
}

export async function createSubject(institutionId: string, data: CreateSubjectDtoType) {
  return prisma.subject.create({ data: { institutionId, name: data.name } });
}

export async function findSubjectById(institutionId: string, id: string) {
  return prisma.subject.findFirst({ where: { id, institutionId } });
}

export async function updateSubject(institutionId: string, id: string, data: UpdateSubjectDtoType) {
  return prisma.subject.update({ where: { id }, data });
}

export async function deleteSubject(id: string) {
  return prisma.subject.delete({ where: { id } });
}

export async function countOfferingsBySubject(subjectId: string) {
  return prisma.subjectOffering.count({ where: { subjectId } });
}
