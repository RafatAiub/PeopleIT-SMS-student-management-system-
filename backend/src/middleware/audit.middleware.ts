// ⚠️ APPROVAL GATE: This file requires manual security review before production deployment.
// ============================================================================
// Audit Log Middleware — Logs mutating requests to the AuditLog table
// Captures: POST, PUT, PATCH, DELETE
// Records: userId, institutionId, action, resource, resourceId, ip, userAgent
// ============================================================================

import { Request, Response, NextFunction } from 'express';
import { prisma } from '../config/prisma';
import { logger } from '../utils/logger';

const AUDITABLE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Derives a human-readable action name from HTTP method.
 */
function methodToAction(method: string, path: string): string {
  switch (method.toUpperCase()) {
    case 'POST':
      return path.includes('/login') ? 'LOGIN' : 'CREATE';
    case 'PUT':
    case 'PATCH':
      return 'UPDATE';
    case 'DELETE':
      return 'DELETE';
    default:
      return method.toUpperCase();
  }
}

/**
 * Extracts the resource name from the URL path.
 * e.g. /api/v1/students/123 → 'students'
 */
function extractResource(path: string): string {
  const segments = path.replace(/^\/api\/v\d+\//, '').split('/');
  return segments[0] ?? 'unknown';
}

/**
 * Extracts a resourceId from the URL path (the segment after the resource name).
 * e.g. /api/v1/students/abc123 → 'abc123'
 */
function extractResourceId(path: string): string | undefined {
  const segments = path.replace(/^\/api\/v\d+\//, '').split('/');
  return segments[1] ?? undefined;
}

/**
 * Gets the real client IP, accounting for proxies.
 */
function getClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') {
    return forwarded.split(',')[0].trim();
  }
  return req.socket.remoteAddress ?? 'unknown';
}

/**
 * Audit logging middleware.
 * Must be mounted AFTER authenticate and setTenant middleware.
 * Writes asynchronously to avoid blocking responses.
 */
export function auditLog(req: Request, res: Response, next: NextFunction): void {
  if (!AUDITABLE_METHODS.has(req.method)) {
    return next();
  }

  // Capture original json method to intercept resourceId from response
  const originalJson = res.json.bind(res);
  let responseBody: Record<string, unknown> | null = null;

  res.json = function (body: unknown) {
    responseBody = body as Record<string, unknown>;
    return originalJson(body);
  };

  // Write audit log after response is sent
  res.on('finish', () => {
    // Only log successful mutations (2xx responses)
    if (res.statusCode < 200 || res.statusCode >= 300) return;

    const userId = req.user?.sub;
    const institutionId = req.tenantId;

    if (!userId || !institutionId) {
      logger.warn('Skipping audit log: missing userId or institutionId', { userId, institutionId });
      return;
    }

    const action = methodToAction(req.method, req.path);
    const resource = extractResource(req.path);
    const resourceId =
      extractResourceId(req.path) ??
      (responseBody?.data && typeof responseBody.data === 'object'
        ? ((responseBody.data as Record<string, unknown>).id as string | undefined)
        : undefined);

    prisma.auditLog
      .create({
        data: {
          institutionId,
          userId,
          action,
          resource,
          resourceId: resourceId ?? null,
          metadata:
            req.method !== 'DELETE' && req.body ? (req.body as Record<string, any>) : undefined,
          ipAddress: getClientIp(req),
          userAgent: req.headers['user-agent'] ?? null,
        },
      })
      .catch((err: Error) => {
        // Audit log failure should NEVER crash the app
        logger.error('Failed to write audit log', {
          error: err.message,
          resource,
          action,
          userId,
        });
      });
  });

  next();
}

export default auditLog;
