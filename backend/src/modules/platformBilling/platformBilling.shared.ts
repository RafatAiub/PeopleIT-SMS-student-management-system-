import crypto from 'crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { env } from '../../config/env';
import { logger } from '../../utils/logger';
import { getSystemActorUserId } from '../../utils/systemActor';
import { signPayToken } from './platformBilling.logic';

// =============================================================================
// P1 shared helpers: audit log, collections timeline entries, actor names,
// pay links. Kept separate so service/payments/reminders don't import each
// other in a cycle.
// =============================================================================

export type Tx = Prisma.TransactionClient;

/** AuditLog.userId is a required FK: fall back to the system actor (first SUPER_ADMIN). */
export async function writeAudit(
  db: Tx | typeof prisma,
  entry: { institutionId: string; userId?: string | null; action: string; resource: string; resourceId?: string | null; metadata?: Record<string, unknown> },
): Promise<void> {
  const userId = entry.userId ?? (await getSystemActorUserId());
  if (!userId) {
    logger.warn(`Skipped ${entry.action} audit log: no actor and no SUPER_ADMIN user exists`, { institutionId: entry.institutionId });
    return;
  }
  await db.auditLog.create({
    data: {
      institutionId: entry.institutionId,
      userId,
      action: entry.action,
      resource: entry.resource,
      resourceId: entry.resourceId ?? null,
      metadata: (entry.metadata ?? {}) as Prisma.InputJsonValue,
    },
  });
}

export async function actorName(userId: string | null | undefined): Promise<string | null> {
  if (!userId) return null;
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { firstName: true, lastName: true } });
  return u ? `${u.firstName} ${u.lastName}`.trim() : null;
}

/** Secret for pay-link HMACs. PAY_LINK_SECRET when set, else derived from JWT_ACCESS_SECRET. */
export function payLinkSecret(): string {
  const explicit = (process.env.PAY_LINK_SECRET ?? '').trim();
  if (explicit.length >= 16) return explicit;
  return crypto.createHash('sha256').update(`p1-pay-link:${env.JWT_ACCESS_SECRET}`).digest('hex');
}

export const PAY_LINK_DAYS = 45;

export function payLinkFor(institutionId: string, invoiceId: string, now: Date = new Date()): string {
  const token = signPayToken(institutionId, invoiceId, new Date(now.getTime() + PAY_LINK_DAYS * 24 * 60 * 60 * 1000), payLinkSecret());
  return `${env.FRONTEND_URL.replace(/\/+$/, '')}/billing/pay/${token}`;
}

export function isUniqueViolation(error: unknown, field?: string): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') return false;
  if (!field) return true;
  const target = (error.meta as { target?: unknown } | undefined)?.target;
  return (Array.isArray(target) ? target.join(',') : String(target ?? '')).includes(field);
}
