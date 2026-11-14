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
import { getAccessLevel, isRequestAllowedAt, SubscriptionInactiveError, type AccessReason } from '../modules/billing/accessLevel';
import { getPlatformAccessState, type PlatformAccessState } from '../modules/platformBilling/platformBilling.access';
import { isMissingSchemaError } from '../utils/schemaMissing';

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

    if (!institution) {
      throw new ForbiddenError('This institution has been suspended by the platform administrator');
    }

    const now = new Date();

    // P1: platform billing (per-school profile + monthly invoices + owner
    // override). Cached briefly — see platformBilling.access.ts. If the P1
    // migration is not applied yet, fall back to the legacy regime.
    let platform: PlatformAccessState | null = null;
    try {
      platform = await getPlatformAccessState(institutionId, now);
    } catch (error) {
      if (!isMissingSchemaError(error)) throw error;
    }

    // Legacy post-grace hard-suspend — only for schools still on the legacy
    // Plan/Subscription regime (a billing profile replaces it). The school is
    // then DISABLED below, which still lets it sign in and pay.
    let isActive = institution.isActive;
    if (isActive && institution.subscription && !platform?.hasProfile) {
      const effective = computeEffectiveSubscriptionState(institution.subscription, now);
      if (effective.requiresHardSuspend) {
        await applyHardSuspend(institutionId, institution.subscription.id);
        isActive = false;
      }
    }

    // P0/P1: server-side access enforcement (accessLevel.ts decides).
    //   RESTRICTED → read-only (writes 402 SUBSCRIPTION_INACTIVE), billing/auth exempt
    //   DISABLED   → everything 402 ACCOUNT_DISABLED except billing/auth
    // SUPER_ADMIN (incl. support sessions opened by a super admin) is never blocked.
    const accessLevel = getAccessLevel({ isActive }, institution.subscription, now, platform);
    const isPlatformStaff = req.user.role === 'SUPER_ADMIN' || !!req.user.originalSuperAdminId;
    if (!isPlatformStaff && !isRequestAllowedAt(accessLevel, req.method, req.originalUrl || req.url)) {
      const reason: AccessReason = !isActive ? 'SUSPENDED' : platform?.hasProfile ? 'PLATFORM_BILLING' : 'SUBSCRIPTION';
      logger.warn(`Request blocked: school access ${accessLevel} (402)`, {
        institutionId,
        userId: req.user.sub,
        role: req.user.role,
        method: req.method,
        path: req.originalUrl,
        reason,
      });
      throw new SubscriptionInactiveError(accessLevel, undefined, reason);
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
