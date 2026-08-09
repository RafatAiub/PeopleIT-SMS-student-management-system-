import { prisma } from '../../config/prisma';
import { StudentGroup } from '@prisma/client';

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
