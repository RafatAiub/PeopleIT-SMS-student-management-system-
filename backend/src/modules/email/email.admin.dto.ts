import { z } from 'zod';

export const EmailLogsQueryDto = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(50),
});

export const SuppressionQueryDto = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(50),
  search: z.string().trim().max(200).optional(),
});

export const AddSuppressionDto = z.object({
  email: z.string().email(),
  scope: z.enum(['ALL', 'BULK']).default('ALL'),
  reason: z.enum(['HARD_BOUNCE', 'SPAM', 'BLOCKED', 'INVALID', 'UNSUBSCRIBED', 'MANUAL']).default('MANUAL'),
  note: z.string().trim().max(500).optional(),
});

export const RemoveSuppressionDto = z.object({
  email: z.string().email(),
  scope: z.enum(['ALL', 'BULK']).optional(),
});

export const TestSendDto = z.object({
  to: z.string().email(),
});

export const TemplateKeyParamDto = z.object({
  key: z.string().min(1).max(200),
});

export type EmailLogsQueryDtoType = z.infer<typeof EmailLogsQueryDto>;
export type SuppressionQueryDtoType = z.infer<typeof SuppressionQueryDto>;
export type AddSuppressionDtoType = z.infer<typeof AddSuppressionDto>;
export type RemoveSuppressionDtoType = z.infer<typeof RemoveSuppressionDto>;
export type TestSendDtoType = z.infer<typeof TestSendDto>;
export type TemplateKeyParamDtoType = z.infer<typeof TemplateKeyParamDto>;
