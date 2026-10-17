import { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { logger } from '../../utils/logger';
import { defaultFamilyName, pickAnchor } from './families.logic';

// =============================================================================
// Family sync (T3). The migration backfilled families from GuardianStudent
// links; this keeps NEW links grouped the same way, lazily (called by the
// family list, "my family" and student→family lookups — never on a hot path).
//
// Rules (same as the backfill):
//   • Only students with no family yet and at least one guardian link.
//   • Anchor = primary guardian, else earliest-created linked guardian.
//   • If the anchor already belongs to a family → the student joins it.
//     Otherwise a new AUTO family is created with the anchor as primary.
//   • Guardians linked to the student who are in no family join the
//     student's family. A guardian staff removed from a family stays out
//     unless their child is newly grouped (it never re-attaches on its own).
// Bounded: at most `limit` students per call.
// =============================================================================

export async function syncFamilies(institutionId: string, opts: { studentIds?: string[]; limit?: number } = {}): Promise<number> {
  const students = await prisma.student.findMany({
    where: {
      institutionId,
      familyMember: null,
      guardians: { some: { guardian: { institutionId } } },
      ...(opts.studentIds ? { id: { in: opts.studentIds } } : {}),
    },
    select: {
      id: true,
      guardians: {
        where: { guardian: { institutionId } },
        select: {
          guardianId: true,
          isPrimary: true,
          guardian: { select: { createdAt: true, firstName: true, lastName: true, familyMember: { select: { familyId: true } } } },
        },
      },
    },
    take: opts.limit ?? 200,
  });
  if (students.length === 0) return 0;

  let grouped = 0;
  // Guardian → family assignments made during this run (the fetched rows are stale).
  const assigned = new Map<string, string>();
  for (const s of students) {
    const anchor = pickAnchor(s.guardians.map((g) => ({ ...g, guardianCreatedAt: g.guardian.createdAt })));
    if (!anchor) continue;
    try {
      await prisma.$transaction(async (tx) => {
        let familyId = anchor.guardian.familyMember?.familyId ?? assigned.get(anchor.guardianId) ?? null;
        if (!familyId) {
          const fam = await tx.family.create({
            data: { institutionId, name: defaultFamilyName(anchor.guardian), primaryGuardianId: anchor.guardianId, source: 'AUTO' },
          });
          familyId = fam.id;
        }
        await tx.familyStudent.create({ data: { institutionId, familyId, studentId: s.id } });
        const free = s.guardians.filter((g) => !g.guardian.familyMember && !assigned.has(g.guardianId)).map((g) => g.guardianId);
        if (free.length) {
          await tx.familyGuardian.createMany({ data: free.map((guardianId) => ({ institutionId, familyId: familyId as string, guardianId })), skipDuplicates: true });
        }
        for (const gid of free) assigned.set(gid, familyId);
      });
      grouped += 1;
    } catch (error) {
      // A concurrent sync grouped this student first (unique studentId/guardianId) — fine.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') continue;
      logger.warn('Family sync skipped a student', { institutionId, studentId: s.id, error: (error as Error).message });
    }
  }
  return grouped;
}
