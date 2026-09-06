import { z } from 'zod';

// The notification "type" is the template key — one entry per business event.
// Keep in sync with DEFAULT_CHANNELS (notifications.service.ts) and
// DEFAULT_TEMPLATES (templates.defaults.ts) — both are exhaustive Records
// keyed on this list, so a missing entry is a compile error.
export const NOTIFICATION_TYPES = [
  // Student fees
  'INVOICE_ISSUED',
  'PAYMENT_RECEIVED',
  'FEE_REMINDER',
  'ABSENCE_ALERT',
  // Platform subscription billing (institute admin + super admin recipients)
  'SUBSCRIPTION_ACTIVATED',
  'SUBSCRIPTION_PAYMENT_FAILED',
  'SUBSCRIPTION_PAYMENT_REQUESTED',
  'SUBSCRIPTION_ADJUSTED',
  'SUBSCRIPTION_REFUND_INITIATED',
  'SUBSCRIPTION_REFUNDED',
  'SUBSCRIPTION_TRIAL_ENDING',
  'SUBSCRIPTION_GRACE',
  'SUBSCRIPTION_SUSPENDED',
] as const;

// Subset that concerns platform subscription billing — used by the frontend
// bell for icon severity and by tests. A billing notification's institutionId
// is the *subject* institution even when the recipient is a super admin whose
// own User.institutionId is null.
export const SUBSCRIPTION_NOTIFICATION_TYPES = [
  'SUBSCRIPTION_ACTIVATED',
  'SUBSCRIPTION_PAYMENT_FAILED',
  'SUBSCRIPTION_PAYMENT_REQUESTED',
  'SUBSCRIPTION_ADJUSTED',
  'SUBSCRIPTION_REFUND_INITIATED',
  'SUBSCRIPTION_REFUNDED',
  'SUBSCRIPTION_TRIAL_ENDING',
  'SUBSCRIPTION_GRACE',
  'SUBSCRIPTION_SUSPENDED',
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
