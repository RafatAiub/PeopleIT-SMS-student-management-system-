import { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { BadRequestError, NotFoundError } from '../../utils/AppError';
import { attemptDelivery, newEnvelope, type DeliveryEnvelope } from './webhooks.dispatcher';
import { generateWebhookSecret, maskSecret, WEBHOOK_TEST_EVENT } from './webhooks.logic';
import type { CreateWebhookInput, ListDeliveriesQuery, ListWebhooksQuery, UpdateWebhookInput } from './webhooks.dto';

// =============================================================================
// Webhook endpoint management — every query pinned to institutionId.
// The signing secret is returned in full only on create / rotate; list and
// update responses carry a masked copy.
// =============================================================================

export const MAX_ENDPOINTS_PER_INSTITUTION = 10;

const endpointSelect = {
  id: true,
  url: true,
  events: true,
  isActive: true,
  secret: true,
  createdAt: true,
} satisfies Prisma.WebhookEndpointSelect;

type EndpointRow = Prisma.WebhookEndpointGetPayload<{ select: typeof endpointSelect }>;

function present(row: EndpointRow, revealSecret = false) {
  const { secret, ...rest } = row;
  return { ...rest, secretMasked: maskSecret(secret), ...(revealSecret ? { secret } : {}) };
}

async function findOwned(institutionId: string, id: string) {
  const row = await prisma.webhookEndpoint.findFirst({ where: { id, institutionId }, select: endpointSelect });
  if (!row) throw new NotFoundError('Webhook endpoint not found');
  return row;
}

export async function listEndpoints(institutionId: string, q: ListWebhooksQuery) {
  const where = { institutionId };
  const [rows, total] = await Promise.all([
    prisma.webhookEndpoint.findMany({
      where,
      select: endpointSelect,
      orderBy: { createdAt: 'desc' },
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
    }),
    prisma.webhookEndpoint.count({ where }),
  ]);

  // Last delivery per endpoint (for the "health" column).
  const ids = rows.map((r) => r.id);
  const last = ids.length
    ? await prisma.webhookDelivery.findMany({
        where: { webhookId: { in: ids } },
        orderBy: { createdAt: 'desc' },
        distinct: ['webhookId'],
        select: { webhookId: true, success: true, statusCode: true, createdAt: true },
      })
    : [];
  const lastBy = new Map(last.map((d) => [d.webhookId, d]));

  return {
    items: rows.map((r) => ({ ...present(r), lastDelivery: lastBy.get(r.id) ?? null })),
    meta: { total, page: q.page, pageSize: q.pageSize },
  };
}

export async function createEndpoint(institutionId: string, input: CreateWebhookInput) {
  const count = await prisma.webhookEndpoint.count({ where: { institutionId } });
  if (count >= MAX_ENDPOINTS_PER_INSTITUTION) {
    throw new BadRequestError(`An institution can have at most ${MAX_ENDPOINTS_PER_INSTITUTION} webhook endpoints`);
  }
  const row = await prisma.webhookEndpoint.create({
    data: { institutionId, url: input.url, events: input.events, isActive: input.isActive, secret: generateWebhookSecret() },
    select: endpointSelect,
  });
  return present(row, true);
}

export async function updateEndpoint(institutionId: string, id: string, input: UpdateWebhookInput) {
  await findOwned(institutionId, id);
  await prisma.webhookEndpoint.updateMany({
    where: { id, institutionId },
    data: {
      ...(input.url !== undefined ? { url: input.url } : {}),
      ...(input.events !== undefined ? { events: input.events } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
    },
  });
  return present(await findOwned(institutionId, id));
}

export async function rotateSecret(institutionId: string, id: string) {
  await findOwned(institutionId, id);
  await prisma.webhookEndpoint.updateMany({ where: { id, institutionId }, data: { secret: generateWebhookSecret() } });
  return present(await findOwned(institutionId, id), true);
}

export async function deleteEndpoint(institutionId: string, id: string) {
  await findOwned(institutionId, id);
  // WebhookDelivery → WebhookEndpoint is ON DELETE RESTRICT, so clear the log first.
  await prisma.$transaction([
    prisma.webhookDelivery.deleteMany({ where: { webhookId: id, webhook: { institutionId } } }),
    prisma.webhookEndpoint.deleteMany({ where: { id, institutionId } }),
  ]);
}

export async function listDeliveries(institutionId: string, id: string, q: ListDeliveriesQuery) {
  await findOwned(institutionId, id);
  const where: Prisma.WebhookDeliveryWhereInput = {
    webhookId: id,
    webhook: { institutionId },
    ...(q.success ? { success: q.success === 'true' } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.webhookDelivery.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
      select: { id: true, event: true, statusCode: true, success: true, attempt: true, payload: true, createdAt: true },
    }),
    prisma.webhookDelivery.count({ where }),
  ]);
  return { items, meta: { total, page: q.page, pageSize: q.pageSize } };
}

/** Sends a `webhook.test` event once (no retries) and returns the outcome. */
export async function sendTest(institutionId: string, id: string, userId: string) {
  await findOwned(institutionId, id);
  const envelope = newEnvelope(institutionId, WEBHOOK_TEST_EVENT, {
    message: 'Test event from PeopleNIT SMS. If you can read this, your endpoint works.',
    triggeredByUserId: userId,
  });
  return attemptDelivery(id, envelope, 1, { allowRetry: false, ignoreInactive: true });
}

/** Re-sends the exact envelope of an earlier delivery (new attempt chain). */
export async function redeliver(institutionId: string, deliveryId: string) {
  const delivery = await prisma.webhookDelivery.findFirst({
    where: { id: deliveryId, webhook: { institutionId } },
    select: { webhookId: true, payload: true },
  });
  if (!delivery) throw new NotFoundError('Delivery not found');
  const payload = delivery.payload as { envelope?: DeliveryEnvelope } | null;
  const envelope = payload?.envelope;
  if (!envelope || envelope.institutionId !== institutionId) throw new BadRequestError('This delivery cannot be re-sent');
  return attemptDelivery(delivery.webhookId, envelope, 1, { allowRetry: false, ignoreInactive: true });
}
