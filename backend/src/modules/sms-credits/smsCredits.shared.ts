import { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { logger } from '../../utils/logger';
import { getSystemActorUserId } from '../../utils/systemActor';

// P5 shared helpers (audit log, unique-violation check).

export type Tx = Prisma.TransactionClient;

/** AuditLog.userId is a required FK: fall back to the system actor (first SUPER_ADMIN). */
export async function writeAudit(
  db: Tx | typeof prisma,
  entry: { institutionId: string | null | undefined; userId?: string | null; action: string; resource: string; resourceId?: string | null; metadata?: Record<string, unknown> },
): Promise<void> {
  let institutionId = entry.institutionId ?? null;
  const userId = entry.userId ?? (await getSystemActorUserId());
  if (!userId) {
    logger.warn(`Skipped ${entry.action} audit log: no actor`, { institutionId });
    return;
  }
  if (!institutionId) {
    const u = await db.user.findUnique({ where: { id: userId }, select: { institutionId: true } });
    institutionId = u?.institutionId ?? null;
  }
  if (!institutionId) {
    logger.info(`Audit (no institution): ${entry.action}`, { userId, resourceId: entry.resourceId, metadata: entry.metadata });
    return;
  }
  await db.auditLog.create({
    data: {
      institutionId,
      userId,
      action: entry.action,
      resource: entry.resource,
      resourceId: entry.resourceId ?? null,
      metadata: (entry.metadata ?? {}) as Prisma.InputJsonValue,
    },
  });
}

export function isUniqueViolation(error: unknown, field?: string): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') return false;
  if (!field) return true;
  const target = (error.meta as { target?: unknown } | undefined)?.target;
  return (Array.isArray(target) ? target.join(',') : String(target ?? '')).includes(field);
}
