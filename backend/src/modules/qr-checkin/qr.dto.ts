import { z } from 'zod';

export const QrScanDto = z.object({
  code: z.string().trim().min(4, 'QR code is required').max(512),
  /** Local HH:MM after which a check-in counts as LATE. Server default 09:00. */
  cutoffTime: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'cutoffTime must be HH:MM')
    .optional(),
  deviceInfo: z.string().max(255).optional(),
});

export const QrTokensQueryDto = z
  .object({
    type: z.enum(['STUDENT', 'STAFF']),
    className: z.string().optional(),
    sectionName: z.string().optional(),
    search: z.string().optional(),
    page: z.coerce.number().int().positive().default(1),
    pageSize: z.coerce.number().int().positive().max(100).default(50),
  })
  .refine((q) => q.type === 'STAFF' || Boolean(q.className), {
    message: 'className is required for student tokens',
    path: ['className'],
  });

export const QrCheckInsQueryDto = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD').optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});

export type QrScanDtoType = z.infer<typeof QrScanDto>;
export type QrTokensQueryDtoType = z.infer<typeof QrTokensQueryDto>;
export type QrCheckInsQueryDtoType = z.infer<typeof QrCheckInsQueryDto>;
