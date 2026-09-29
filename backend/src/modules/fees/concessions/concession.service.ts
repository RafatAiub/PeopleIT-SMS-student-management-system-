import { Prisma } from '@prisma/client';
import { prisma } from '../../../config/prisma';
import { BadRequestError, ConflictError, NotFoundError } from '../../../utils/AppError';
import { logger } from '../../../utils/logger';
import * as repo from './concession.repository';
import { isAssignmentActive, type ConcessionRule } from './concession.calc';
import type { AssignConcessionDtoType, CreateConcessionDtoType, UpdateConcessionDtoType } from './concession.dto';

async function assertCategory(institutionId: string, feeCategoryId: string | null | undefined) {
  if (!feeCategoryId) return;
  const cat = await prisma.feeCategory.findFirst({ where: { id: feeCategoryId, institutionId }, select: { id: true } });
  if (!cat) throw new BadRequestError('Fee category does not belong to your institution');
}

/** Date-only strings become start/end of that day (UTC) so validTo is inclusive. */
function toBoundary(value: string | null | undefined, edge: 'start' | 'end'): Date | null {
  if (!value) return null;
  const isDateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  if (!isDateOnly) return new Date(value);
  return new Date(`${value}T${edge === 'start' ? '00:00:00.000' : '23:59:59.999'}Z`);
}

export async function listConcessions(institutionId: string, q: Parameters<typeof repo.listConcessions>[1]) {
  const { total, items } = await repo.listConcessions(institutionId, q);
  return {
    items: items.map(({ _count, ...c }) => ({ ...c, value: Number(c.value), assignedCount: _count.studentConcessions })),
    meta: { total, page: q.page, pageSize: q.pageSize },
  };
}

export async function createConcession(institutionId: string, dto: CreateConcessionDtoType) {
  await assertCategory(institutionId, dto.feeCategoryId);
  return repo.createConcession(institutionId, {
    name: dto.name,
    type: dto.type,
    value: new Prisma.Decimal(dto.value),
    feeCategoryId: dto.feeCategoryId ?? null,
    isActive: dto.isActive ?? true,
    description: dto.description ?? null,
  });
}

export async function updateConcession(institutionId: string, id: string, dto: UpdateConcessionDtoType) {
  const existing = await repo.findConcession(institutionId, id);
  if (!existing) throw new NotFoundError('Concession not found');
  if (dto.feeCategoryId !== undefined) await assertCategory(institutionId, dto.feeCategoryId);

  const nextType = dto.type ?? existing.type;
  const nextValue = dto.value ?? Number(existing.value);
  if (nextType === 'PERCENT' && nextValue > 100) {
    throw new BadRequestError('A percentage concession cannot exceed 100%');
  }

  return repo.updateConcession(id, {
    ...(dto.name !== undefined ? { name: dto.name } : {}),
    ...(dto.type !== undefined ? { type: dto.type } : {}),
    ...(dto.value !== undefined ? { value: new Prisma.Decimal(dto.value) } : {}),
    ...(dto.feeCategoryId !== undefined ? { feeCategoryId: dto.feeCategoryId } : {}),
    ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
    ...(dto.description !== undefined ? { description: dto.description } : {}),
  });
}

export async function deleteConcession(institutionId: string, id: string) {
  const existing = await repo.findConcession(institutionId, id);
  if (!existing) throw new NotFoundError('Concession not found');
  if (existing._count.studentConcessions > 0) {
    throw new ConflictError('This concession is assigned to students — unassign it or deactivate it instead');
  }
  await repo.deleteConcession(id);
}

export async function listAssignments(institutionId: string, q: Parameters<typeof repo.listAssignments>[1]) {
  const now = new Date();
  const { total, items } = await repo.listAssignments(institutionId, q);
  return {
    items: items.map((a) => ({
      ...a,
      concession: { ...a.concession, value: Number(a.concession.value) },
      isCurrentlyActive: a.concession.isActive && isAssignmentActive(a, now),
    })),
    meta: { total, page: q.page, pageSize: q.pageSize },
  };
}

export async function assignConcession(institutionId: string, dto: AssignConcessionDtoType) {
  const [student, concession] = await Promise.all([
    prisma.student.findFirst({ where: { id: dto.studentId, institutionId }, select: { id: true } }),
    prisma.concession.findFirst({ where: { id: dto.concessionId, institutionId }, select: { id: true } }),
  ]);
  if (!student) throw new NotFoundError('Student not found');
  if (!concession) throw new NotFoundError('Concession not found');

  const data = {
    validFrom: toBoundary(dto.validFrom, 'start'),
    validTo: toBoundary(dto.validTo, 'end'),
    note: dto.note ?? null,
  };

  // (studentId, concessionId) is unique — re-assigning updates the window.
  const existing = await repo.findAssignmentByPair(institutionId, dto.studentId, dto.concessionId);
  if (existing) return repo.updateAssignment(existing.id, data);
  return repo.createAssignment({ institutionId, studentId: dto.studentId, concessionId: dto.concessionId, ...data });
}

export async function unassignConcession(institutionId: string, id: string) {
  const existing = await repo.findAssignment(institutionId, id);
  if (!existing) throw new NotFoundError('Concession assignment not found');
  await repo.deleteAssignment(id);
}

/** Currently-active concession rules per student (concession active + inside validity window). */
export async function getActiveConcessionRules(
  institutionId: string,
  studentIds: string[],
  at: Date = new Date(),
): Promise<Map<string, ConcessionRule[]>> {
  const rows = await repo.findActiveAssignmentsForStudents(institutionId, studentIds);
  const map = new Map<string, ConcessionRule[]>();
  for (const row of rows) {
    if (!isAssignmentActive(row, at)) continue;
    const list = map.get(row.studentId) ?? [];
    list.push({
      id: row.concession.id,
      name: row.concession.name,
      type: row.concession.type,
      value: Number(row.concession.value),
      feeCategoryId: row.concession.feeCategoryId,
    });
    map.set(row.studentId, list);
  }
  return map;
}

/**
 * Same as getActiveConcessionRules but never throws: invoice creation must
 * keep working even before the Wave C migration creates the concession
 * tables (or if the lookup fails for any other reason) — it just proceeds
 * without concessions and logs.
 */
export async function getActiveConcessionRulesSafe(institutionId: string, studentIds: string[]) {
  try {
    return await getActiveConcessionRules(institutionId, studentIds);
  } catch (error) {
    logger.warn('Concession lookup failed — creating invoice(s) without concessions', {
      institutionId,
      error: error instanceof Error ? error.message : String(error),
    });
    return new Map<string, ConcessionRule[]>();
  }
}

export async function getStudentActiveConcessions(institutionId: string, studentId: string) {
  const student = await prisma.student.findFirst({ where: { id: studentId, institutionId }, select: { id: true } });
  if (!student) throw new NotFoundError('Student not found');
  const map = await getActiveConcessionRules(institutionId, [studentId]);
  return map.get(studentId) ?? [];
}
