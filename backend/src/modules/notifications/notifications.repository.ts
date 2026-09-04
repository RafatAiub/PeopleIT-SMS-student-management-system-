import { Prisma, NotificationChannel } from '@prisma/client';
import { prisma } from '../../config/prisma';

export interface ListParams {
  unreadOnly?: boolean;
  page: number;
  pageSize: number;
}

export async function createMany(rows: Prisma.NotificationCreateManyInput[]) {
  if (rows.length === 0) return { count: 0 };
  return prisma.notification.createMany({ data: rows });
}

/**
 * Always filtered by BOTH institutionId and recipientUserId — a notification is
 * private to one user, so tenant scoping alone is not sufficient here.
 */
export async function findAllForRecipient(
  institutionId: string,
  recipientUserId: string,
  params: ListParams,
) {
  const where: Prisma.NotificationWhereInput = {
    institutionId,
    recipientUserId,
    ...(params.unreadOnly ? { readAt: null } : {}),
  };

  const [notifications, total, unreadCount] = await prisma.$transaction([
    prisma.notification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (params.page - 1) * params.pageSize,
      take: params.pageSize,
      select: {
        id: true,
        type: true,
        title: true,
        body: true,
        data: true,
        readAt: true,
        createdAt: true,
      },
    }),
    prisma.notification.count({ where }),
    prisma.notification.count({ where: { institutionId, recipientUserId, readAt: null } }),
  ]);

  return { notifications, total, unreadCount };
}

/**
 * updateMany (not update) so a foreign id simply matches zero rows instead of
 * throwing — the caller turns a 0 count into a 404 without ever confirming
 * whether that id exists under another user or another institution.
 */
export async function markRead(institutionId: string, recipientUserId: string, id: string) {
  return prisma.notification.updateMany({
    where: { id, institutionId, recipientUserId, readAt: null },
    data: { readAt: new Date() },
  });
}

export async function existsForRecipient(
  institutionId: string,
  recipientUserId: string,
  id: string,
): Promise<boolean> {
  const found = await prisma.notification.findFirst({
    where: { id, institutionId, recipientUserId },
    select: { id: true },
  });
  return !!found;
}

export async function markAllRead(institutionId: string, recipientUserId: string) {
  return prisma.notification.updateMany({
    where: { institutionId, recipientUserId, readAt: null },
    data: { readAt: new Date() },
  });
}

// ── Delivery log ───────────────────────────────────────────────────────────

export interface DeliverySkeleton {
  institutionId: string;
  channel: NotificationChannel;
  recipient: string;
  templateKey: string;
}

/**
 * Claims the delivery slot for a dedupeKey. The unique constraint on dedupeKey
 * makes this the durable idempotency boundary: two concurrent workers racing
 * the same job both end up looking at the SAME row, and the status guard below
 * lets exactly one of them proceed to send.
 */
export async function upsertQueuedDelivery(dedupeKey: string, skeleton: DeliverySkeleton) {
  return prisma.notificationDelivery.upsert({
    where: { dedupeKey },
    create: { ...skeleton, dedupeKey, status: 'QUEUED', attempts: 0 },
    update: {},
  });
}

export async function recordSkippedDelivery(dedupeKey: string, skeleton: DeliverySkeleton, reason: string) {
  return prisma.notificationDelivery.upsert({
    where: { dedupeKey },
    create: { ...skeleton, dedupeKey, status: 'SKIPPED', error: reason },
    update: {},
  });
}

/**
 * Status-guarded claim: only transitions QUEUED/FAILED -> QUEUED with an
 * incremented attempt count, and reports whether THIS caller won the race.
 * A row already SENT matches nothing, so a replay is a no-op.
 */
export async function claimForSend(id: string): Promise<boolean> {
  const result = await prisma.notificationDelivery.updateMany({
    where: { id, status: { in: ['QUEUED', 'FAILED'] } },
    data: { attempts: { increment: 1 } },
  });
  return result.count === 1;
}

export async function markDeliverySent(id: string, providerRef?: string, notificationId?: string) {
  return prisma.notificationDelivery.update({
    where: { id },
    data: { status: 'SENT', providerRef: providerRef ?? null, error: null, notificationId: notificationId ?? null },
  });
}

export async function markDeliveryFailed(id: string, error: string) {
  return prisma.notificationDelivery.update({
    where: { id },
    data: { status: 'FAILED', error: error.slice(0, 2000) },
  });
}

export async function findDeliveryByDedupeKey(dedupeKey: string) {
  return prisma.notificationDelivery.findUnique({ where: { dedupeKey } });
}

// ── Preferences ────────────────────────────────────────────────────────────

/**
 * Absent row == enabled. Only explicit opt-outs are stored, so a newly added
 * notification type is never silently muted for existing users.
 */
export async function findDisabledChannels(
  institutionId: string,
  userId: string,
  type: string,
): Promise<Set<NotificationChannel>> {
  const rows = await prisma.notificationPreference.findMany({
    where: { institutionId, userId, type, enabled: false },
    select: { channel: true },
  });
  return new Set(rows.map((r) => r.channel));
}

export async function listPreferences(institutionId: string, userId: string) {
  return prisma.notificationPreference.findMany({
    where: { institutionId, userId },
    select: { type: true, channel: true, enabled: true },
    orderBy: [{ type: 'asc' }, { channel: 'asc' }],
  });
}

export async function upsertPreferences(
  institutionId: string,
  userId: string,
  prefs: { type: string; channel: NotificationChannel; enabled: boolean }[],
) {
  return prisma.$transaction(
    prefs.map((p) =>
      prisma.notificationPreference.upsert({
        where: { userId_type_channel: { userId, type: p.type, channel: p.channel } },
        create: { institutionId, userId, type: p.type, channel: p.channel, enabled: p.enabled },
        update: { enabled: p.enabled },
      }),
    ),
  );
}

// ── Recipient contact ──────────────────────────────────────────────────────

export async function findRecipientContact(institutionId: string, userId: string) {
  return prisma.user.findFirst({
    where: { id: userId, institutionId },
    select: { id: true, firstName: true, lastName: true, email: true, phone: true },
  });
}

// ── Templates ──────────────────────────────────────────────────────────────

export async function findTemplate(
  institutionId: string,
  key: string,
  channel: NotificationChannel,
) {
  return prisma.notificationTemplate.findFirst({
    where: { institutionId, key, channel, isActive: true },
    select: { subject: true, body: true },
  });
}

export async function listTemplates(institutionId: string) {
  return prisma.notificationTemplate.findMany({
    where: { institutionId },
    select: { key: true, channel: true, subject: true, body: true, isActive: true, updatedAt: true },
    orderBy: [{ key: 'asc' }, { channel: 'asc' }],
  });
}

export async function upsertTemplate(
  institutionId: string,
  key: string,
  channel: NotificationChannel,
  data: { subject?: string | null; body: string; isActive?: boolean },
) {
  return prisma.notificationTemplate.upsert({
    where: { institutionId_key_channel: { institutionId, key, channel } },
    create: {
      institutionId,
      key,
      channel,
      subject: data.subject ?? null,
      body: data.body,
      isActive: data.isActive ?? true,
    },
    update: {
      subject: data.subject ?? null,
      body: data.body,
      ...(data.isActive === undefined ? {} : { isActive: data.isActive }),
    },
  });
}

export async function findInstitutionName(institutionId: string): Promise<string> {
  const institution = await prisma.institution.findUnique({
    where: { id: institutionId },
    select: { name: true },
  });
  return institution?.name ?? 'Your Institution';
}
