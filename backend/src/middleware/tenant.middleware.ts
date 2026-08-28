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
import { computeEffectiveSubscriptionState, applyHardSuspend } from '../modules/billing/subscriptionLifecycle';

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

    let institutionId = req.user.institutionId;

    // Fallback for Super Admin accessing tenant endpoints directly
    if ((!institutionId || institutionId.trim() === '') && req.user.role === 'SUPER_ADMIN') {
      const targetHeader = (req.headers['x-institution-id'] as string) || (req.headers['x-tenant-id'] as string) || (req.query.institutionId as string);
      if (targetHeader && targetHeader.trim() !== '') {
        institutionId = targetHeader.trim();
      }
    }

    if (!institutionId || institutionId.trim() === '') {
      if (req.user.role === 'SUPER_ADMIN') {
        req.tenantId = undefined;
        return next();
      }
      throw new UnauthorizedError('No institution associated with this account');
    }

    const institution = await prisma.institution.findUnique({
      where: { id: institutionId },
      select: {
        isActive: true,
        subscription: { select: { id: true, status: true, trialEndsAt: true, currentPeriodEnd: true, graceEndsAt: true } },
      },
    });

    if (!institution || !institution.isActive) {
      throw new ForbiddenError('This institution has been suspended by the platform administrator');
    }

    if (institution.subscription) {
      const effective = computeEffectiveSubscriptionState(institution.subscription, new Date());
      if (effective.requiresHardSuspend) {
        await applyHardSuspend(institutionId, institution.subscription.id);
        throw new ForbiddenError('This institution has been suspended by the platform administrator');
      }
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
