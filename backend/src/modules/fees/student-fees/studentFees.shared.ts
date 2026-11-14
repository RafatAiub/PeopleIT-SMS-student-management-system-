import { Prisma } from '@prisma/client';
import { prisma } from '../../../config/prisma';
import { logger } from '../../../utils/logger';

export type Tx = Prisma.TransactionClient;
export type Db = Tx | typeof prisma;

/** Who is acting: tenant + user (+ role for permission checks inside services). */
export interface FeeCtx {
  institutionId: string;
  userId: string;
  role: string;
}

export const num = (v: Prisma.Decimal | number | string | null | undefined): number => (v === null || v === undefined ? 0 : Number(v));
export const dec = (n: number) => new Prisma.Decimal(n.toFixed(2));

/** Explicit, money-specific audit entry (the route middleware also logs the request). */
export async function writeAudit(
  db: Db,
  entry: { institutionId: string; userId: string; action: string; resource: string; resourceId?: string | null; metadata?: Record<string, unknown> },
): Promise<void> {
  try {
    await db.auditLog.create({
      data: {
        institutionId: entry.institutionId,
        userId: entry.userId,
        action: entry.action,
        resource: entry.resource,
        resourceId: entry.resourceId ?? null,
        metadata: (entry.metadata ?? {}) as Prisma.InputJsonValue,
      },
    });
  } catch (error) {
    // Inside a transaction a failed insert would abort it — callers pass the
    // tx only where the user id is known to exist.
    logger.warn('P2 audit log write failed', { action: entry.action, error: error instanceof Error ? error.message : String(error) });
    throw error;
  }
}

export function isUniqueViolation(error: unknown, field?: string): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') return false;
  if (!field) return true;
  const target = (error.meta as { target?: unknown } | undefined)?.target;
  return (Array.isArray(target) ? target.join(',') : String(target ?? '')).includes(field);
}
