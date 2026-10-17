import { Prisma, TrashEntityType } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../../utils/AppError';
import { logger } from '../../utils/logger';
import { getSystemActorUserId } from '../../utils/systemActor';
import { HANDLERS, PurgeBlockedError, TRASH_TYPES, type Meta, type TrashActor } from './trash.registry';
import { CHILD_SCOPED } from '../../config/softDelete';

// =============================================================================
// T5 trash service. Deleting a supported record calls moveToTrash(); it sets
// deletedAt (which hides the row everywhere, see config/softDelete.ts) and
// writes one TrashEntry. Restore and permanent delete work on entries.
// =============================================================================

export const RETENTION_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;
const MANAGER_ROLES = new Set(['ADMIN', 'SUPER_ADMIN']);

export interface TrashCtx {
  institutionId: string;
  userId: string | null;
  role?: string;
}

export function purgeAfterFrom(deletedAt: Date): Date {
  return new Date(deletedAt.getTime() + RETENTION_DAYS * DAY_MS);
}

/** Whole days left before the purge (0 on the last day; negative never shown). */
export function daysLeft(purgeAfter: Date, now = new Date()): number {
  return Math.max(0, Math.ceil((purgeAfter.getTime() - now.getTime()) / DAY_MS));
}

async function actorName(userId: string | null): Promise<string | null> {
  if (!userId) return null;
  const u = await prisma.user.findFirst({ where: { id: userId, deletedAt: undefined }, select: { firstName: true, lastName: true } });
  return u ? `${u.firstName} ${u.lastName}`.trim() : null;
}

const isFkError = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && (e.code === 'P2003' || e.code === 'P2014');

/**
 * Moves one record to the trash. Returns the entry (its id powers "Undo").
 * Runs the type's guard first (e.g. paid invoices refuse).
 */
export async function moveToTrash(ctx: TrashCtx, type: TrashEntityType, id: string, tx?: Prisma.TransactionClient) {
  if (!ctx.institutionId) throw new ValidationError('Select an institution first');
  const handler = HANDLERS[type];
  const name = await actorName(ctx.userId);
  const run = async (db: Prisma.TransactionClient) => {
    const { row, label } = await handler.load(db, ctx.institutionId, id);
    await handler.guard?.(db, row, { userId: ctx.userId, role: ctx.role } as TrashActor);
    const now = new Date();
    const entryKey = `${type}:${id}:${now.getTime()}`;
    const meta: Meta = (await handler.onTrash?.(db, row, entryKey)) ?? {};
    const res = await (db as unknown as Record<string, { updateMany: (a: unknown) => Promise<{ count: number }> }>)[handler.delegate].updateMany({
      where: { id, institutionId: ctx.institutionId, deletedAt: null },
      data: { deletedAt: now, deletedByUserId: ctx.userId },
    });
    if (res.count === 0) throw new NotFoundError(`${handler.label} not found`);
    // A stale entry for the same row (should not exist) is replaced.
    await db.trashEntry.deleteMany({ where: { entityType: type, entityId: id } });
    return db.trashEntry.create({
      data: {
        institutionId: ctx.institutionId,
        entityType: type,
        entityId: id,
        label: label.slice(0, 300),
        deletedByUserId: ctx.userId,
        deletedByName: name,
        deletedAt: now,
        purgeAfter: purgeAfterFrom(now),
        metadata: meta as Prisma.InputJsonValue,
      },
    });
  };
  const entry = tx ? await run(tx) : await prisma.$transaction(run);
  logger.info('Moved to trash', { institutionId: ctx.institutionId, type, id, entryId: entry.id });
  return { trashEntryId: entry.id, type, id, label: entry.label, purgeAfter: entry.purgeAfter };
}

async function entryOrThrow(ctx: TrashCtx, entryId: string) {
  const entry = await prisma.trashEntry.findFirst({ where: { id: entryId, institutionId: ctx.institutionId } });
  if (!entry) throw new NotFoundError('Item not found in the trash');
  return entry;
}

/** Where for "this row, trashed", opting out of child scoping too (a campaign whose fund is trashed). */
function trashedWhere(type: TrashEntityType, id: string): Record<string, unknown> {
  const delegate = HANDLERS[type].delegate;
  const model = delegate.charAt(0).toUpperCase() + delegate.slice(1);
  const where: Record<string, unknown> = { id, deletedAt: { not: null } };
  for (const rel of CHILD_SCOPED[model] ?? []) where[rel] = { deletedAt: undefined };
  return where;
}

type Delegate = {
  findFirst: (a: unknown) => Promise<Record<string, unknown> | null>;
  updateMany: (a: unknown) => Promise<{ count: number }>;
};
const delegateOf = (db: Prisma.TransactionClient | typeof prisma, type: TrashEntityType) =>
  (db as unknown as Record<string, Delegate>)[HANDLERS[type].delegate];

async function loadTrashedRow(tx: Prisma.TransactionClient | typeof prisma, type: TrashEntityType, id: string) {
  return delegateOf(tx, type).findFirst({ where: trashedWhere(type, id) });
}

/** Restores one entry. Non-admins may only undo their own deletions. */
export async function restoreEntry(ctx: TrashCtx, entryId: string) {
  const entry = await entryOrThrow(ctx, entryId);
  if (!MANAGER_ROLES.has(ctx.role ?? '') && entry.deletedByUserId !== ctx.userId) {
    throw new ForbiddenError('Only an admin can restore items someone else deleted');
  }
  const handler = HANDLERS[entry.entityType];
  if (!(await loadTrashedRow(prisma, entry.entityType, entry.entityId))) {
    // The row is gone or already live — drop the stale entry.
    await prisma.trashEntry.deleteMany({ where: { id: entry.id } });
    throw new NotFoundError(`${handler.label} is no longer in the trash`);
  }
  await prisma.$transaction(async (tx) => {
    const row = await loadTrashedRow(tx, entry.entityType, entry.entityId);
    if (!row) throw new NotFoundError(`${handler.label} is no longer in the trash`);
    const meta = (entry.metadata ?? {}) as Meta;
    const clash = await handler.conflict?.(tx, row, meta);
    if (clash) throw new ConflictError(`Can't restore "${entry.label}": ${clash}`);
    await handler.onRestore?.(tx, row, meta);
    await delegateOf(tx, entry.entityType).updateMany({
      where: trashedWhere(entry.entityType, entry.entityId),
      data: { deletedAt: null, deletedByUserId: null },
    });
    await tx.trashEntry.delete({ where: { id: entry.id } });
  });
  logger.info('Restored from trash', { institutionId: ctx.institutionId, type: entry.entityType, id: entry.entityId });
  return { id: entry.id, type: entry.entityType, entityId: entry.entityId, label: entry.label };
}

/** Permanently deletes one entry (ADMIN). Returns false + reason when blocked. */
export async function purgeEntry(ctx: TrashCtx, entryId: string): Promise<{ purged: boolean; reason?: string }> {
  const entry = await entryOrThrow(ctx, entryId);
  return purgeLoadedEntry(entry);
}

async function purgeLoadedEntry(entry: { id: string; entityType: TrashEntityType; entityId: string; metadata: Prisma.JsonValue; label: string; institutionId: string }) {
  const handler = HANDLERS[entry.entityType];
  try {
    await prisma.$transaction(
      async (tx) => {
        const row = await loadTrashedRow(tx, entry.entityType, entry.entityId);
        if (row) await handler.purge(tx, row, (entry.metadata ?? {}) as Meta);
        await tx.trashEntry.delete({ where: { id: entry.id } });
      },
      { timeout: 20_000 },
    );
    logger.info('Purged from trash', { institutionId: entry.institutionId, type: entry.entityType, id: entry.entityId });
    return { purged: true };
  } catch (error) {
    const reason =
      error instanceof PurgeBlockedError
        ? error.message
        : isFkError(error)
          ? 'Other records still point to it (for example results, payments or history), so it was kept.'
          : null;
    if (!reason) throw error;
    await prisma.trashEntry.update({ where: { id: entry.id }, data: { purgeError: reason } });
    return { purged: false, reason };
  }
}

export interface BulkResult {
  id: string;
  ok: boolean;
  error?: string;
}

export async function bulk(ctx: TrashCtx, ids: string[], action: 'restore' | 'purge'): Promise<BulkResult[]> {
  const out: BulkResult[] = [];
  for (const id of ids) {
    try {
      if (action === 'restore') {
        await restoreEntry(ctx, id);
        out.push({ id, ok: true });
      } else {
        const r = await purgeEntry(ctx, id);
        out.push(r.purged ? { id, ok: true } : { id, ok: false, error: r.reason });
      }
    } catch (error) {
      out.push({ id, ok: false, error: error instanceof Error ? error.message : String(error) });
    }
  }
  return out;
}

export async function listEntries(ctx: TrashCtx, q: { type?: TrashEntityType; search?: string; page: number; pageSize: number }) {
  const where: Prisma.TrashEntryWhereInput = {
    institutionId: ctx.institutionId,
    ...(q.type ? { entityType: q.type } : {}),
    ...(q.search ? { label: { contains: q.search, mode: 'insensitive' } } : {}),
  };
  const [items, total] = await prisma.$transaction([
    prisma.trashEntry.findMany({ where, orderBy: [{ deletedAt: 'desc' }, { id: 'asc' }], skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
    prisma.trashEntry.count({ where }),
  ]);
  const now = new Date();
  return {
    items: items.map((e) => ({
      id: e.id,
      type: e.entityType,
      entityId: e.entityId,
      label: e.label,
      deletedByName: e.deletedByName,
      deletedByUserId: e.deletedByUserId,
      deletedAt: e.deletedAt,
      purgeAfter: e.purgeAfter,
      daysLeft: daysLeft(e.purgeAfter, now),
      purgeError: e.purgeError,
    })),
    total,
  };
}

export async function summary(ctx: TrashCtx) {
  const rows = await prisma.trashEntry.groupBy({ by: ['entityType'], where: { institutionId: ctx.institutionId }, _count: { _all: true } });
  const counts = Object.fromEntries(TRASH_TYPES.map((t) => [t, 0])) as Record<TrashEntityType, number>;
  for (const r of rows) counts[r.entityType] = r._count._all;
  return { total: rows.reduce((s, r) => s + r._count._all, 0), counts, retentionDays: RETENTION_DAYS };
}

/**
 * Daily job: permanently deletes every entry past its 30 days (not ones a
 * previous run could not delete), and writes one audit row per school.
 */
export async function purgeExpired(now = new Date(), limit = 500) {
  const due = await prisma.trashEntry.findMany({
    where: { purgeAfter: { lte: now }, purgeError: null },
    orderBy: { purgeAfter: 'asc' },
    take: limit,
  });
  const bySchool = new Map<string, { purged: string[]; kept: Array<{ id: string; reason: string }> }>();
  for (const entry of due) {
    const agg = bySchool.get(entry.institutionId) ?? { purged: [], kept: [] };
    try {
      const r = await purgeLoadedEntry(entry);
      if (r.purged) agg.purged.push(`${entry.entityType}:${entry.entityId}`);
      else agg.kept.push({ id: `${entry.entityType}:${entry.entityId}`, reason: r.reason ?? '' });
    } catch (error) {
      logger.error('Trash purge failed', { entryId: entry.id, error: error instanceof Error ? error.message : String(error) });
      agg.kept.push({ id: `${entry.entityType}:${entry.entityId}`, reason: 'error' });
    }
    bySchool.set(entry.institutionId, agg);
  }
  const actor = bySchool.size ? await getSystemActorUserId() : null;
  for (const [institutionId, agg] of bySchool) {
    if (!actor) {
      logger.warn('Trash purge: no system actor for the audit log', { institutionId, purged: agg.purged.length });
      continue;
    }
    await prisma.auditLog
      .create({
        data: {
          institutionId,
          userId: actor,
          action: 'DELETE',
          resource: 'trash',
          resourceId: null,
          metadata: { kind: 'TRASH_PURGE', retentionDays: RETENTION_DAYS, purged: agg.purged, kept: agg.kept } as Prisma.InputJsonValue,
        },
      })
      .catch((error) => logger.error('Trash purge audit write failed', { institutionId, error: error instanceof Error ? error.message : String(error) }));
  }
  const totals = { scanned: due.length, purged: [...bySchool.values()].reduce((s, a) => s + a.purged.length, 0) };
  if (due.length) logger.info('Trash purge finished', totals);
  return totals;
}
