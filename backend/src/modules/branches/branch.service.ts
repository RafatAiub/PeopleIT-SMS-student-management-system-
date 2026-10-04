import { Prisma } from '@prisma/client';
import { AppError, NotFoundError, ValidationError } from '../../utils/AppError';
import { evaluateResourceLimit } from '../saas/entitlements.service';
import { limitExceededMessage } from '../saas/entitlements.logic';
import { PlanRestrictionError } from '../saas/entitlements.middleware';
import * as repo from './branch.repository';
import type { BranchQueryDtoType, CreateBranchDtoType, UpdateBranchDtoType } from './branch.dto';

const emptyToNull = (v: string | null | undefined) => (v === undefined ? undefined : v && v.trim() ? v.trim() : null);

export async function listBranches(institutionId: string, query: BranchQueryDtoType, selectedBranchId: string | null) {
  const where: Prisma.BranchWhereInput = {
    institutionId,
    ...(query.status === 'active' ? { isActive: true } : query.status === 'inactive' ? { isActive: false } : {}),
    ...(query.search ? { name: { contains: query.search, mode: 'insensitive' } } : {}),
  };
  const { rows, total } = await repo.findMany(where, (query.page - 1) * query.pageSize, query.pageSize);
  const counts = await repo.countsFor(institutionId, rows.map((r) => r.id));
  return {
    items: rows.map((r) => ({ ...r, counts: counts.get(r.id)! })),
    meta: { total, page: query.page, pageSize: query.pageSize },
    selectedBranchId,
  };
}

export async function getBranch(institutionId: string, id: string) {
  const branch = await repo.findById(institutionId, id);
  if (!branch) throw new NotFoundError('Branch not found');
  const counts = await repo.countsFor(institutionId, [id]);
  return { ...branch, counts: counts.get(id)! };
}

export async function getCurrentBranch(institutionId: string, selectedBranchId: string | null) {
  if (!selectedBranchId) return null;
  return getBranch(institutionId, selectedBranchId);
}

export async function createBranch(institutionId: string, data: CreateBranchDtoType) {
  const created = await repo.create(institutionId, {
    name: data.name.trim(),
    address: emptyToNull(data.address) ?? null,
    phone: emptyToNull(data.phone) ?? null,
    email: emptyToNull(data.email) ?? null,
  });
  return { ...created, counts: { students: 0, classes: 0, staff: 0 } };
}

export async function updateBranch(institutionId: string, id: string, data: UpdateBranchDtoType) {
  const existing = await repo.findById(institutionId, id);
  if (!existing) throw new NotFoundError('Branch not found');

  if (data.isActive === false && existing.isActive) {
    const othersActive = await repo.countActive(institutionId, id);
    if (othersActive === 0) {
      throw new ValidationError('You cannot deactivate the only active branch.');
    }
  }
  if (data.isActive === true && !existing.isActive) {
    // Reactivating adds one to the active-branch count — respect the plan.
    const limit = await evaluateResourceLimit(institutionId, 'branches', 1);
    if (!limit.allowed && limit.limit !== null) {
      throw new PlanRestrictionError(limitExceededMessage(limit.label, limit.limit));
    }
  }

  const patch: Prisma.BranchUpdateManyMutationInput = {};
  if (data.name !== undefined) patch.name = data.name.trim();
  if (data.address !== undefined) patch.address = emptyToNull(data.address);
  if (data.phone !== undefined) patch.phone = emptyToNull(data.phone);
  if (data.email !== undefined) patch.email = emptyToNull(data.email);
  if (data.isActive !== undefined) patch.isActive = data.isActive;
  if (Object.keys(patch).length === 0) return getBranch(institutionId, id);

  await repo.update(institutionId, id, patch);
  return getBranch(institutionId, id);
}

export async function deleteBranch(institutionId: string, id: string) {
  const existing = await repo.findById(institutionId, id);
  if (!existing) throw new NotFoundError('Branch not found');
  if (existing.isActive && (await repo.countActive(institutionId, id)) === 0) {
    throw new ValidationError('You cannot delete the only active branch.');
  }
  const dependents = await repo.dependentCount(institutionId, id);
  if (dependents > 0) {
    throw new AppError(
      'This branch still has students, classes, staff or timetable records. Deactivate it instead, or move those records first.',
      409,
    );
  }
  await repo.remove(institutionId, id);
}
