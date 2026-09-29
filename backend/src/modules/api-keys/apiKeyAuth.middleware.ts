import { Request, Response, NextFunction } from 'express';
import { rateLimit } from 'express-rate-limit';
import { prisma } from '../../config/prisma';
import { env } from '../../config/env';
import { ForbiddenError, UnauthorizedError } from '../../utils/AppError';
import { logger } from '../../utils/logger';
import { mapSchemaError } from '../../utils/schemaMissing';
import { extractApiKey, hashApiKey, hasScope, looksLikeApiKey, shouldTouchLastUsed } from './apiKeys.logic';

// =============================================================================
// apiKeyAuth — authenticates a machine client by API key and scopes the
// request to the key's institution (req.tenantId). Never mixes with the user
// JWT flow: req.user is left undefined, so no user-only route can be reached
// with a key, and a key never grants more than its explicit read scopes.
// =============================================================================

export interface ApiKeyContext {
  id: string;
  institutionId: string;
  scopes: string[];
}

declare global {
  namespace Express {
    interface Request {
      apiKey?: ApiKeyContext;
    }
  }
}

export async function apiKeyAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const presented = extractApiKey(req.headers as Record<string, string | string[] | undefined>);
    if (!presented) throw new UnauthorizedError('API key required (X-API-Key header)');
    if (!looksLikeApiKey(presented)) throw new UnauthorizedError('API key is invalid');

    const row = await prisma.apiKey.findUnique({
      where: { keyHash: hashApiKey(presented) },
      select: {
        id: true,
        institutionId: true,
        scopes: true,
        revokedAt: true,
        lastUsedAt: true,
        institution: { select: { isActive: true } },
      },
    });
    if (!row || row.revokedAt) throw new UnauthorizedError('API key is invalid or has been revoked');
    if (!row.institution.isActive) throw new ForbiddenError('This institution has been suspended');

    const now = new Date();
    if (shouldTouchLastUsed(row.lastUsedAt, now)) {
      prisma.apiKey
        .update({ where: { id: row.id }, data: { lastUsedAt: now }, select: { id: true } })
        .catch((error: Error) => logger.warn('API key lastUsedAt update failed', { error: error.message }));
    }

    req.apiKey = { id: row.id, institutionId: row.institutionId, scopes: row.scopes };
    req.tenantId = row.institutionId;
    next();
  } catch (error) {
    next(mapSchemaError(error));
  }
}

/** Route guard: the authenticated key must hold `scope`. */
export function requireApiScope(scope: string) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.apiKey) {
      next(new UnauthorizedError('API key required'));
      return;
    }
    if (!hasScope(req.apiKey.scopes, scope)) {
      next(new ForbiddenError(`This API key lacks the '${scope}' scope`));
      return;
    }
    next();
  };
}

/**
 * Per-key rate limit (after apiKeyAuth). The global per-IP limiter in app.ts
 * still applies on top of this. Configurable via PUBLIC_API_RATE_LIMIT_PER_MIN.
 */
const perMinute = Number(process.env.PUBLIC_API_RATE_LIMIT_PER_MIN) > 0 ? Number(process.env.PUBLIC_API_RATE_LIMIT_PER_MIN) : 60;

export const apiKeyRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: perMinute,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `apikey:${req.apiKey?.id ?? 'anonymous'}`,
  message: { success: false, message: `API rate limit exceeded (${perMinute} requests per minute per key)` },
  skip: () => env.NODE_ENV === 'test',
});
