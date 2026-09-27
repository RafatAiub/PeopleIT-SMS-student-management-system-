import { Request, Response, NextFunction } from 'express';
import { BadRequestError } from '../utils/AppError';

// =============================================================================
// requireTenant — for tenant-scoped routes a platform SUPER_ADMIN may also
// reach. setTenant leaves req.tenantId undefined for a SUPER_ADMIN who has
// not selected an institution (no X-Institution-Id header); every tenant
// query needs a concrete institutionId, so fail clearly instead of running a
// query with `institutionId: undefined` (which Prisma treats as "no filter").
// Must run AFTER authenticate + setTenant.
// =============================================================================

export function requireTenant(req: Request, _res: Response, next: NextFunction): void {
  if (!req.tenantId) {
    next(new BadRequestError('Select an institution first (X-Institution-Id header) — this action is institution-scoped'));
    return;
  }
  next();
}

export default requireTenant;
