// ============================================================================
// Tenant Middleware — Extracts institutionId from verified JWT payload
// Must run AFTER auth.middleware.ts (authenticate)
// Attaches req.tenantId — use this in ALL repository queries.
// NEVER trust institutionId from req.body or req.params.
// ============================================================================

import { Request, Response, NextFunction } from 'express';
import { prisma } from '../config/prisma';
import { UnauthorizedError, ForbiddenError } from '../utils/AppError';
import { logger } from '../utils/logger';

/**
 * Extracts institutionId from the JWT payload set by authenticate middleware.
 * Attaches it to req.tenantId.
 *
 * Every Prisma query MUST use: where: { institutionId: req.tenantId }
 */
export async function setTenant(req: Request, _res: Response, next: NextFunction): Promise<void> {
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

    // Suspension must take effect instantly, even for users holding an
    // already-issued access token — so re-check isActive against the DB on
    // every tenant-scoped request rather than trusting the JWT snapshot.
    const institution = await prisma.institution.findUnique({
      where: { id: institutionId },
      select: { isActive: true },
    });

    if (!institution || !institution.isActive) {
      throw new ForbiddenError('This institution has been suspended by the platform administrator');
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
