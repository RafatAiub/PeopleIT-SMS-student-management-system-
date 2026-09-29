import { Request, Response, NextFunction } from 'express';
import { successResponse } from '../../utils/response';
import { mapSchemaError } from '../../utils/schemaMissing';
import * as service from './webhooks.service';
import { MAX_DELIVERY_ATTEMPTS, SIGNATURE_HEADER, WEBHOOK_EVENTS, WEBHOOK_EVENT_LABELS } from './webhooks.logic';
import type { ListDeliveriesQuery, ListWebhooksQuery } from './webhooks.dto';

type Handler = (req: Request, res: Response) => Promise<unknown>;
const wrap = (fn: Handler) => async (req: Request, res: Response, next: NextFunction) => {
  try {
    await fn(req, res);
  } catch (error) {
    next(mapSchemaError(error));
  }
};

export const meta = wrap(async (_req, res) => {
  successResponse(res, {
    events: WEBHOOK_EVENTS.map((event) => ({ event, label: WEBHOOK_EVENT_LABELS[event] })),
    signatureHeader: SIGNATURE_HEADER,
    signatureScheme: 'HMAC-SHA256 of `${t}.${rawBody}` with the endpoint secret; header format t=<unix>,v1=<hex>',
    maxAttempts: MAX_DELIVERY_ATTEMPTS,
  });
});

export const list = wrap(async (req, res) => {
  successResponse(res, await service.listEndpoints(req.tenantId!, req.query as unknown as ListWebhooksQuery));
});

export const create = wrap(async (req, res) => {
  successResponse(res, await service.createEndpoint(req.tenantId!, req.body), 'Webhook endpoint created — copy the signing secret now', 201);
});

export const update = wrap(async (req, res) => {
  successResponse(res, await service.updateEndpoint(req.tenantId!, req.params.id, req.body), 'Webhook endpoint updated');
});

export const rotateSecret = wrap(async (req, res) => {
  successResponse(res, await service.rotateSecret(req.tenantId!, req.params.id), 'Signing secret rotated — update your receiver');
});

export const remove = wrap(async (req, res) => {
  await service.deleteEndpoint(req.tenantId!, req.params.id);
  successResponse(res, null, 'Webhook endpoint deleted');
});

export const deliveries = wrap(async (req, res) => {
  successResponse(res, await service.listDeliveries(req.tenantId!, req.params.id, req.query as unknown as ListDeliveriesQuery));
});

export const test = wrap(async (req, res) => {
  const result = await service.sendTest(req.tenantId!, req.params.id, req.user!.sub);
  successResponse(res, result, result.success ? 'Test event delivered' : 'Test event failed');
});

export const redeliver = wrap(async (req, res) => {
  const result = await service.redeliver(req.tenantId!, req.params.deliveryId);
  successResponse(res, result, result.success ? 'Delivery re-sent' : 'Re-delivery failed');
});
