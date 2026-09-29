import { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { isMissingSchemaError, withSchemaFallback } from '../saas/schemaGuard';

// =============================================================================
// Branch repository — every query is scoped by institutionId.
// Branch.phone / Branch.email and User.branchId are Wave C columns; reads
// fall back gracefully if the migration hasn't been applied yet.
// =============================================================================

const BASE_SELECT = {
  id: true,
  name: true,
  address: true,
  isActive: true,
  createdAt: true,
} as const;

const FULL_SELECT = { ...BASE_SELECT, phone: true, email: true } as const;

export interface BranchRow {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  isActive: boolean;
  createdAt: Date;
}

export interface BranchCounts {
  students: number;
  classes: number;
  /** null when User.branchId isn't available yet (migration pending). */
  staff: number | null;
}

function withContactDefaults(row: Omit<BranchRow, 'phone' | 'email'> & Partial<BranchRow>): BranchRow {
  return { ...row, phone: row.phone ?? null, email: row.email ?? null };
}

export async function findMany(where: Prisma.BranchWhereInput, skip: number, take: number) {
  const args = { where, orderBy: [{ isActive: 'desc' as const }, { createdAt: 'asc' as const }], skip, take };
  let rows: BranchRow[];
  try {
    rows = await prisma.branch.findMany({ ...args, select: FULL_SELECT });
  } catch (error) {
    if (!isMissingSchemaError(error)) throw error;
    rows = (await prisma.branch.findMany({ ...args, select: BASE_SELECT })).map(withContactDefaults);
  }
  const total = await prisma.branch.count({ where });
  return { rows, total };
}

export async function findById(institutionId: string, id: string): Promise<BranchRow | null> {
  try {
    return await prisma.branch.findFirst({ where: { id, institutionId }, select: FULL_SELECT });
  } catch (error) {
    if (!isMissingSchemaError(error)) throw error;
    const row = await prisma.branch.findFirst({ where: { id, institutionId }, select: BASE_SELECT });
    return row ? withContactDefaults(row) : null;
  }
}

export function countActive(institutionId: string, excludeId?: string) {
  return prisma.branch.count({
    where: { institutionId, isActive: true, ...(excludeId ? { id: { not: excludeId } } : {}) },
  });
}

export async function countsFor(institutionId: string, branchIds: string[]): Promise<Map<string, BranchCounts>> {
  const result = new Map<string, BranchCounts>(branchIds.map((id) => [id, { students: 0, classes: 0, staff: null }]));
  if (branchIds.length === 0) return result;

  const [students, classes, staff] = await Promise.all([
    prisma.student.groupBy({
      by: ['branchId'],
      where: { institutionId, status: 'ACTIVE', branchId: { in: branchIds } },
      _count: { _all: true },
    }),
    prisma.class.groupBy({
      by: ['branchId'],
      where: { branchId: { in: branchIds }, branch: { institutionId } },
      _count: { _all: true },
    }),
    withSchemaFallback<{ branchId: string | null; _count: { _all: number } }[] | null>(
      'user.branchId',
      async () =>
        prisma.user.groupBy({
          by: ['branchId'],
          where: { institutionId, isActive: true, branchId: { in: branchIds } },
          _count: { _all: true },
        }),
      null,
    ),
  ]);

  for (const s of students) if (s.branchId && result.has(s.branchId)) result.get(s.branchId)!.students = s._count._all;
  for (const c of classes) if (result.has(c.branchId)) result.get(c.branchId)!.classes = c._count._all;
  if (staff) {
    for (const id of branchIds) result.get(id)!.staff = 0;
    for (const u of staff) if (u.branchId && result.has(u.branchId)) result.get(u.branchId)!.staff = u._count._all;
  }
  return result;
}

/** Records that would block a hard delete (FKs are ON DELETE RESTRICT). */
export async function dependentCount(institutionId: string, id: string): Promise<number> {
  const where = { branchId: id };
  const [students, classes, slots, lectures, assignments, users] = await Promise.all([
    prisma.student.count({ where: { ...where, institutionId } }),
    prisma.class.count({ where }),
    prisma.timetableSlot.count({ where }),
    prisma.lectureMaterial.count({ where }),
    prisma.assignment.count({ where }),
    withSchemaFallback('user.branchId', () => prisma.user.count({ where: { ...where, institutionId } }), 0),
  ]);
  return students + classes + slots + lectures + assignments + users;
}

export function create(institutionId: string, data: { name: string; address: string | null; phone: string | null; email: string | null }) {
  return prisma.branch.create({ data: { institutionId, ...data }, select: FULL_SELECT });
}

export async function update(institutionId: string, id: string, data: Prisma.BranchUpdateManyMutationInput) {
  await prisma.branch.updateMany({ where: { id, institutionId }, data });
  return findById(institutionId, id);
}

export function remove(institutionId: string, id: string) {
  return prisma.branch.deleteMany({ where: { id, institutionId } });
}
