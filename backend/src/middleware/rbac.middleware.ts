// ⚠️ APPROVAL GATE: This file requires manual security review before production deployment.
// ============================================================================
// RBAC Middleware — Role-Based Access Control via Permission table
// requirePermission(resource, action) — checks DB permissions for current user.
// Must run AFTER authenticate + setTenant middleware.
// ============================================================================

import { Request, Response, NextFunction } from 'express';
import { ForbiddenError, UnauthorizedError } from '../utils/AppError';
import { logger } from '../utils/logger';
import { prisma } from '../config/prisma';
import { UserRole } from '@prisma/client';

// SUPER_ADMIN bypasses all permission checks
const BYPASS_ROLES: UserRole[] = [UserRole.SUPER_ADMIN];

/**
 * Middleware factory — checks that the authenticated user has a specific
 * permission (resource + action) for their institution.
 *
 * Usage: router.delete('/students/:id', requirePermission('students', 'delete'))
 */
export function requirePermission(resource: string, action: string) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        throw new UnauthorizedError('Authentication required');
      }

      const { sub: userId, role } = req.user;

      // Super admins bypass all permission checks
      if (BYPASS_ROLES.includes(role as UserRole)) {
        logger.debug('RBAC: SUPER_ADMIN bypass', { userId, resource, action });
        return next();
      }

      if (!req.tenantId) {
        throw new UnauthorizedError('Tenant context missing');
      }

      const institutionId = req.tenantId;

      // Check the Permission table for explicit grant
      const permission = await prisma.permission.findFirst({
        where: {
          role: role as UserRole,
          resource,
          action,
        },
      });
 
      if (!permission) {
        logger.warn('RBAC: permission denied', {
          userId,
          institutionId,
          resource,
          action,
          role,
        });
        throw new ForbiddenError(
          `You do not have permission to perform '${action}' on '${resource}'`,
        );
      }
 
      logger.debug('RBAC: permission granted', { userId, resource, action });
      next();
    } catch (error) {
      next(error);
    }
  };
}

/**
 * Middleware factory — checks that the user has at least one of the given roles.
 * Simpler than permission table check — use for coarse-grained role gates.
 */
export function requireRole(...roles: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      if (!req.user) {
        throw new UnauthorizedError('Authentication required');
      }

      const { role, sub: userId } = req.user;

      if (!roles.includes(role as UserRole)) {
        logger.warn('RBAC: role check failed', {
          userId,
          currentRole: role,
          requiredRoles: roles,
        });
        throw new ForbiddenError(
          `This action requires one of the following roles: ${roles.join(', ')}`,
        );
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}
