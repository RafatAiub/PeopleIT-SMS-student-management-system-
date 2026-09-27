import { z } from 'zod';
import { API_KEY_SCOPES } from './apiKeys.logic';

const pageParams = {
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
};

export const CreateApiKeyDto = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(80),
  scopes: z.array(z.enum(API_KEY_SCOPES)).min(1, 'Pick at least one scope').max(API_KEY_SCOPES.length),
});

export const ListApiKeysQueryDto = z.object({
  ...pageParams,
  includeRevoked: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
});

export const ApiKeyIdParamDto = z.object({ id: z.string().min(1).max(64) });

// ── Public API (key-authenticated) ────────────────────────────────────────

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');

export const PublicStudentsQueryDto = z.object({
  ...pageParams,
  classId: z.string().max(64).optional(),
  sectionId: z.string().max(64).optional(),
  status: z.string().max(20).optional(),
  updatedSince: z.string().datetime({ offset: true }).optional(),
});

export const PublicAttendanceSummaryQueryDto = z.object({
  from: isoDate,
  to: isoDate,
  classId: z.string().max(64).optional(),
  sectionId: z.string().max(64).optional(),
});

export const PublicInvoicesQueryDto = z.object({
  ...pageParams,
  status: z.enum(['UNPAID', 'PARTIAL', 'PAID', 'OVERDUE', 'CANCELLED']).optional(),
  studentId: z.string().max(64).optional(),
  dueFrom: isoDate.optional(),
  dueTo: isoDate.optional(),
});

export type CreateApiKeyInput = z.infer<typeof CreateApiKeyDto>;
export type ListApiKeysQuery = z.infer<typeof ListApiKeysQueryDto>;
export type PublicStudentsQuery = z.infer<typeof PublicStudentsQueryDto>;
export type PublicAttendanceSummaryQuery = z.infer<typeof PublicAttendanceSummaryQueryDto>;
export type PublicInvoicesQuery = z.infer<typeof PublicInvoicesQueryDto>;
