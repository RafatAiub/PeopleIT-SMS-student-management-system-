import { z } from 'zod';
import { httpUrl } from '../../utils/url';
import { checkWebhookUrl, WEBHOOK_EVENTS } from './webhooks.logic';

const webhookUrl = httpUrl('Must be a valid https URL')
  .refine((v) => v.length <= 500, { message: 'URL is too long' })
  .superRefine((value, ctx) => {
    const check = checkWebhookUrl(value);
    if (!check.ok) ctx.addIssue({ code: z.ZodIssueCode.custom, message: check.reason });
  });

const events = z
  .array(z.enum(WEBHOOK_EVENTS))
  .min(1, 'Subscribe to at least one event')
  .transform((list) => Array.from(new Set(list)));

export const CreateWebhookDto = z.object({
  url: webhookUrl,
  events,
  isActive: z.boolean().optional().default(true),
});

export const UpdateWebhookDto = z
  .object({
    url: webhookUrl.optional(),
    events: events.optional(),
    isActive: z.boolean().optional(),
  })
  .refine((v) => v.url !== undefined || v.events !== undefined || v.isActive !== undefined, { message: 'Nothing to update' });

export const WebhookIdParamDto = z.object({ id: z.string().min(1).max(64) });
export const DeliveryIdParamDto = z.object({ deliveryId: z.string().min(1).max(64) });

export const ListWebhooksQueryDto = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const ListDeliveriesQueryDto = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  success: z.enum(['true', 'false']).optional(),
});

export type CreateWebhookInput = z.infer<typeof CreateWebhookDto>;
export type UpdateWebhookInput = z.infer<typeof UpdateWebhookDto>;
export type ListWebhooksQuery = z.infer<typeof ListWebhooksQueryDto>;
export type ListDeliveriesQuery = z.infer<typeof ListDeliveriesQueryDto>;
