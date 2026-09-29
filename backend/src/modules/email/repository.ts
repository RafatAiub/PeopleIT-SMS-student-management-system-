import { EmailLogStatus, EmailPriority, EmailSuppressionReason, EmailSuppressionScope, Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';

// =============================================================================
// EmailLog / EmailSuppression persistence. Thin wrappers only — every query
// here is either global (platform-owned rows have institutionId: null) or
// explicitly institution-scoped by the caller; nothing here trusts client input.
// =============================================================================

export interface CreateLogInput {
  institutionId?: string | null;
  template: string;
  priority: EmailPriority;
  toHash: string;
  toMasked: string;
  subject: string;
  idempotencyKey?: string | null;
  tags: string[];
}

export function createQueuedLog(input: CreateLogInput) {
  return prisma.emailLog.create({
    data: {
      institutionId: input.institutionId ?? null,
      template: input.template,
      priority: input.priority,
      status: EmailLogStatus.QUEUED,
      toHash: input.toHash,
      toMasked: input.toMasked,
      subject: input.subject,
      idempotencyKey: input.idempotencyKey ?? null,
      tags: input.tags,
    },
  });
}

export function findByIdempotencyKey(idempotencyKey: string) {
  return prisma.emailLog.findUnique({ where: { idempotencyKey } });
}

export function findById(id: string) {
  return prisma.emailLog.findUnique({ where: { id } });
}

export function markSent(id: string, provider: string, messageId?: string | null) {
  return prisma.emailLog.update({
    where: { id },
    data: { status: EmailLogStatus.SENT, provider, messageId: messageId ?? null, sentAt: new Date(), error: null },
  });
}

export function markFailed(id: string, provider: string | null, error: string) {
  return prisma.emailLog.update({
    where: { id },
    data: { status: EmailLogStatus.FAILED, provider, error: error.slice(0, 2000) },
  });
}

export function markSkipped(id: string, reason: string) {
  return prisma.emailLog.update({
    where: { id },
    data: { status: EmailLogStatus.SKIPPED, error: reason.slice(0, 2000) },
  });
}

export function markSuppressed(id: string, reason: string) {
  return prisma.emailLog.update({
    where: { id },
    data: { status: EmailLogStatus.SUPPRESSED, error: reason.slice(0, 2000) },
  });
}

export function markDeferred(id: string, notBefore: Date, reason: string) {
  return prisma.emailLog.update({
    where: { id },
    data: { status: EmailLogStatus.DEFERRED, notBefore, error: reason.slice(0, 2000) },
  });
}

/** Rows whose deferral window has passed — the deferred-send retry job's work queue. */
export function findDueDeferred(limit = 100) {
  return prisma.emailLog.findMany({
    where: { status: EmailLogStatus.DEFERRED, notBefore: { lte: new Date() } },
    orderBy: { createdAt: 'asc' },
    take: limit,
  });
}

/** Total SENT emails since `since` — the Redis-outage fallback for the daily budget counter. */
export function countSentSince(since: Date) {
  return prisma.emailLog.count({ where: { status: EmailLogStatus.SENT, sentAt: { gte: since } } });
}

export function recentLogs(limit = 50) {
  return prisma.emailLog.findMany({ orderBy: { createdAt: 'desc' }, take: limit });
}

export function listLogsPaginated(params: { page: number; pageSize: number }) {
  return Promise.all([
    prisma.emailLog.findMany({
      orderBy: { createdAt: 'desc' },
      skip: (params.page - 1) * params.pageSize,
      take: params.pageSize,
    }),
    prisma.emailLog.count(),
  ]);
}

export function updateLastEvent(id: string, event: string) {
  return prisma.emailLog.update({ where: { id }, data: { lastEvent: event, lastEventAt: new Date() } });
}

export function findByMessageId(messageId: string) {
  return prisma.emailLog.findFirst({ where: { messageId }, orderBy: { createdAt: 'desc' } });
}

// ── Suppression ──────────────────────────────────────────────────────────────

export function findSuppressions(email: string) {
  return prisma.emailSuppression.findMany({ where: { email } });
}

export interface AddSuppressionInput {
  email: string;
  scope: EmailSuppressionScope;
  reason: EmailSuppressionReason;
  source: string;
  institutionId?: string | null;
  note?: string | null;
}

/** Idempotent: same (email, scope) upserts rather than duplicating. */
export function upsertSuppression(input: AddSuppressionInput) {
  return prisma.emailSuppression.upsert({
    where: { email_scope: { email: input.email, scope: input.scope } },
    create: {
      email: input.email,
      scope: input.scope,
      reason: input.reason,
      source: input.source,
      institutionId: input.institutionId ?? null,
      note: input.note ?? null,
    },
    update: {
      reason: input.reason,
      source: input.source,
      note: input.note ?? null,
    },
  });
}

export function removeSuppression(email: string, scope?: EmailSuppressionScope) {
  return prisma.emailSuppression.deleteMany({
    where: { email, ...(scope ? { scope } : {}) },
  });
}

export function listSuppressions(params: { page: number; pageSize: number; search?: string }) {
  const where: Prisma.EmailSuppressionWhereInput = params.search
    ? { email: { contains: params.search.toLowerCase(), mode: 'insensitive' } }
    : {};
  return Promise.all([
    prisma.emailSuppression.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (params.page - 1) * params.pageSize,
      take: params.pageSize,
    }),
    prisma.emailSuppression.count({ where }),
  ]);
}
