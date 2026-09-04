import { z } from 'zod';

// The notification "type" is the template key — one entry per business event.
// Keep in sync with templates.defaults.ts.
export const NOTIFICATION_TYPES = [
  'INVOICE_ISSUED',
  'PAYMENT_RECEIVED',
  'FEE_REMINDER',
  'ABSENCE_ALERT',
] as const;

export const NotificationTypeEnum = z.enum(NOTIFICATION_TYPES);
export type NotificationType = z.infer<typeof NotificationTypeEnum>;

export const NotificationQueryDto = z.object({
  unreadOnly: z.coerce.boolean().optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});

export const NotificationIdParamDto = z.object({
  id: z.string().min(1, 'Invalid notification ID'),
});

export type NotificationQueryDtoType = z.infer<typeof NotificationQueryDto>;

export const NotificationChannelEnum = z.enum(['IN_APP', 'EMAIL', 'SMS']);

export const UpdatePreferencesDto = z.object({
  preferences: z
    .array(
      z.object({
        type: NotificationTypeEnum,
        channel: NotificationChannelEnum,
        enabled: z.boolean(),
      }),
    )
    .min(1, 'At least one preference is required')
    .max(100),
});

export type UpdatePreferencesDtoType = z.infer<typeof UpdatePreferencesDto>;

export const TemplateParamsDto = z.object({
  key: NotificationTypeEnum,
  channel: NotificationChannelEnum,
});

export const UpsertTemplateDto = z.object({
  subject: z.string().max(300).optional().nullable(),
  body: z.string().min(1, 'Template body is required').max(5000),
  isActive: z.boolean().optional(),
});

export const SendTestDto = z.object({
  type: NotificationTypeEnum,
  channel: NotificationChannelEnum,
});

export type UpsertTemplateDtoType = z.infer<typeof UpsertTemplateDto>;
export type SendTestDtoType = z.infer<typeof SendTestDto>;
