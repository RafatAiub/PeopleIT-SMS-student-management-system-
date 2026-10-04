import { Request } from 'express';
import { prisma } from '../../config/prisma';

// =============================================================================
// X-Branch-Id — the header branch switcher (frontend) sends the admin's
// selected branch on every request. Endpoints opt in by calling
// resolveBranchScope(req); nothing is filtered unless they do.
//
// The header is untrusted client input: it is honoured only when it names an
// ACTIVE branch of the caller's own tenant, otherwise it's ignored (null ⇒ all
// branches). It never widens access — it can only narrow a tenant-scoped list.
// =============================================================================

export const BRANCH_HEADER = 'x-branch-id';

export function readBranchHeader(req: Request): string | null {
  const raw = req.headers[BRANCH_HEADER];
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value || typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed && trimmed.length <= 64 && trimmed !== 'all' ? trimmed : null;
}

export async function resolveBranchScope(req: Request): Promise<string | null> {
  const institutionId = req.tenantId;
  const branchId = readBranchHeader(req);
  if (!institutionId || !branchId) return null;
  const branch = await prisma.branch.findFirst({
    where: { id: branchId, institutionId, isActive: true },
    select: { id: true },
  });
  return branch?.id ?? null;
}
