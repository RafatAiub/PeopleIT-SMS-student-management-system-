import { Request } from 'express';
import { prisma } from '../../config/prisma';
import { logger } from '../../utils/logger';
import { NotFoundError, ValidationError } from '../../utils/AppError';
import { isMissingSchemaError } from '../saas/schemaGuard';
import { hashToken } from './auth.crypto';
import { clientIpFrom, parseUserAgent, sanitizeUserAgent, type SessionContext } from './sessions.logic';

// =============================================================================
// Sessions / devices — Settings → Security.
// Each live RefreshToken row (not revoked, not expired) is one signed-in
// device. Refresh rotates the row, so a device shows up once, with its
// latest rotation time as `lastUsedAt`.
//
// The access token carries `sessionId` (the RefreshToken id) from this
// release on; tokens minted earlier don't, and fall back to the refresh
// token the client sends in the body (revoke-others) or show no
// "this device" marker (list) until the next refresh.
// =============================================================================

export function sessionContextFrom(req: Request): SessionContext {
  return {
    userAgent: sanitizeUserAgent(req.headers['user-agent']),
    ipAddress: clientIpFrom(req.headers['x-forwarded-for'], req.socket?.remoteAddress),
  };
}

/**
 * Best-effort write of device metadata on a freshly issued refresh token.
 * Kept out of the login transaction on purpose: before the Wave C migration
 * adds these columns this update fails, and that must never fail a login.
 */
export async function recordSessionMeta(refreshTokenId: string, ctx: SessionContext | undefined): Promise<void> {
  try {
    await prisma.refreshToken.updateMany({
      where: { id: refreshTokenId },
      data: {
        userAgent: ctx?.userAgent ?? null,
        ipAddress: ctx?.ipAddress ?? null,
        lastUsedAt: new Date(),
      },
    });
  } catch (error) {
    if (!isMissingSchemaError(error)) {
      logger.warn('Could not record session metadata', { error: (error as Error).message });
    }
  }
}

function liveWhere(userId: string) {
  return { userId, isRevoked: false, expiresAt: { gt: new Date() } };
}

export async function listSessions(userId: string, currentSessionId: string | undefined) {
  let rows: {
    id: string;
    createdAt: Date;
    expiresAt: Date;
    userAgent: string | null;
    ipAddress: string | null;
    lastUsedAt: Date | null;
  }[];
  let metadataAvailable = true;
  try {
    rows = await prisma.refreshToken.findMany({
      where: liveWhere(userId),
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: { id: true, createdAt: true, expiresAt: true, userAgent: true, ipAddress: true, lastUsedAt: true },
    });
  } catch (error) {
    if (!isMissingSchemaError(error)) throw error;
    metadataAvailable = false;
    const basic = await prisma.refreshToken.findMany({
      where: liveWhere(userId),
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: { id: true, createdAt: true, expiresAt: true },
    });
    rows = basic.map((r) => ({ ...r, userAgent: null, ipAddress: null, lastUsedAt: null }));
  }

  const sessions = rows
    .map((r) => ({
      id: r.id,
      device: parseUserAgent(r.userAgent),
      ipAddress: r.ipAddress,
      createdAt: r.createdAt,
      lastUsedAt: r.lastUsedAt ?? r.createdAt,
      expiresAt: r.expiresAt,
      isCurrent: Boolean(currentSessionId) && r.id === currentSessionId,
    }))
    .sort((a, b) => Number(b.isCurrent) - Number(a.isCurrent) || b.lastUsedAt.getTime() - a.lastUsedAt.getTime());

  return { sessions, currentSessionKnown: Boolean(currentSessionId), metadataAvailable };
}

export async function revokeSession(userId: string, sessionId: string): Promise<void> {
  const result = await prisma.refreshToken.updateMany({
    where: { id: sessionId, userId, isRevoked: false },
    data: { isRevoked: true },
  });
  if (result.count === 0) throw new NotFoundError('Session not found or already signed out');
  logger.info('Session revoked', { userId, sessionId });
}

/** Resolve "this device": JWT sessionId first, else the refresh token sent by the client. */
async function resolveCurrentSessionId(
  userId: string,
  jwtSessionId: string | undefined,
  refreshToken: string | undefined,
): Promise<string | null> {
  if (jwtSessionId) return jwtSessionId;
  if (!refreshToken) return null;
  const row = await prisma.refreshToken.findFirst({
    where: { token: hashToken(refreshToken), userId },
    select: { id: true },
  });
  return row?.id ?? null;
}

export async function revokeOtherSessions(
  userId: string,
  jwtSessionId: string | undefined,
  refreshToken: string | undefined,
): Promise<{ revoked: number }> {
  const currentId = await resolveCurrentSessionId(userId, jwtSessionId, refreshToken);
  if (!currentId) {
    // Without knowing which session is ours we'd sign this device out too.
    throw new ValidationError('Could not identify this device. Sign out and back in, then try again.');
  }
  const result = await prisma.refreshToken.updateMany({
    where: { userId, isRevoked: false, id: { not: currentId } },
    data: { isRevoked: true },
  });
  logger.info('Other sessions revoked', { userId, revoked: result.count });
  return { revoked: result.count };
}

export async function revokeAllSessions(userId: string): Promise<{ revoked: number }> {
  const result = await prisma.refreshToken.updateMany({
    where: { userId, isRevoked: false },
    data: { isRevoked: true },
  });
  logger.info('All sessions revoked', { userId, revoked: result.count });
  return { revoked: result.count };
}
