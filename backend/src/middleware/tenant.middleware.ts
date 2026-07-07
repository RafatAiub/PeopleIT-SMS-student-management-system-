// ============================================================================
// Tenant Middleware — Extracts institutionId from verified JWT payload
// Must run AFTER auth.middleware.ts (authenticate)
// Attaches req.tenantId — use this in ALL repository queries.
// NEVER trust institutionId from req.body or req.params.
// ============================================================================

import { Request, Response, NextFunction } from 'express';
import { UnauthorizedError } from '../utils/AppError';
import { logger } from '../utils/logger';

/**
 * Extracts institutionId from the JWT payload set by authenticate middleware.
 * Attaches it to req.tenantId.
 *
 * Every Prisma query MUST use: where: { institutionId: req.tenantId }
 */
export function setTenant(req: Request, _res: Response, next: NextFunction): void {
  try {
    if (!req.user) {
      throw new UnauthorizedError('Authentication required before tenant resolution');
    }

    const institutionId = req.user.institutionId;

    if (!institutionId || institutionId.trim() === '') {
      if (req.user.role === 'SUPER_ADMIN') {
        req.tenantId = undefined;
        return next();
      }
      throw new UnauthorizedError('No institution associated with this account');
    }

    req.tenantId = institutionId;

    logger.debug('Tenant middleware: institutionId attached', {
      tenantId: req.tenantId,
      userId: req.user.sub,
    });

    next();
  } catch (error) {
    next(error);
  }
}

export default setTenant;
