import { z } from 'zod';
import { SENDER_ID_MAX, validateSenderId } from './smsCredits.logic';

// =============================================================================
// P5 SMS credits DTOs.
// =============================================================================

const senderId = z
  .string()
  .trim()
  .max(SENDER_ID_MAX, `Sender ID can be at most ${SENDER_ID_MAX} characters`)
  .superRefine((v, ctx) => {
    const r = validateSenderId(v);
    if (!r.ok) ctx.addIssue({ code: z.ZodIssueCode.custom, message: r.error });
  });

const optionalText = (max: number) => z.string().trim().max(max).nullable().optional();
const isoDay = z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');

export const SettingsDto = z.object({
  lowBalanceThreshold: z.coerce.number().int().min(0).max(1_000_000),
});

export const SenderIdRequestDto = z.object({
  senderId,
  note: optionalText(1000),
});

export const CheckoutDto = z.object({
  packId: z.string().trim().min(1),
  gateway: z.enum(['BKASH', 'SSLCOMMERZ']),
});

export const DemoConfirmDto = z.object({ outcome: z.enum(['success', 'failure']) });

export const LogQueryDto = z.object({
  status: z.enum(['QUEUED', 'SENT', 'DELIVERED', 'FAILED', 'SKIPPED']).optional(),
  purpose: z.string().trim().max(60).optional(),
  provider: z.enum(['GREENWEB', 'BULKSMSBD', 'SSLWIRELESS']).optional(),
  billing: z.enum(['SCHOOL', 'PLATFORM']).optional(),
  institutionId: z.string().trim().max(60).optional(),
  search: z.string().trim().max(40).optional(),
  from: isoDay.optional(),
  to: isoDay.optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});
export type LogQueryDtoType = z.infer<typeof LogQueryDto>;

export const LedgerQueryDto = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});

// ── Super-admin ──

export const PackDto = z.object({
  name: z.string().trim().min(1).max(80),
  nameBn: optionalText(80),
  units: z.coerce.number().int().min(1).max(10_000_000),
  priceBdt: z.coerce
    .number()
    .positive('Price must be greater than zero')
    .max(10_000_000)
    .refine((v) => Math.abs(Math.round(v * 100) - v * 100) < 1e-6, 'At most 2 decimal places'),
  isActive: z.boolean().default(true),
  sortOrder: z.coerce.number().int().min(0).max(1000).default(0),
});

export const ManualCreditDto = z.object({
  units: z.coerce.number().int().min(1).max(10_000_000),
  amount: z.coerce.number().min(0).max(10_000_000).default(0),
  packId: z.string().trim().min(1).nullable().optional(),
  reference: optionalText(120),
  reason: z.string().trim().min(3, 'Give a reason').max(500),
});

export const AdjustDto = z.object({
  type: z.enum(['ADJUST', 'BONUS']),
  units: z.coerce
    .number()
    .int()
    .min(-10_000_000)
    .max(10_000_000)
    .refine((v) => v !== 0, 'Units must not be zero'),
  reason: z.string().trim().min(3, 'Give a reason').max(500),
});

export const ReviewSenderIdDto = z.discriminatedUnion('decision', [
  z.object({
    decision: z.literal('APPROVE'),
    approvedValue: senderId,
    provider: z.enum(['GREENWEB', 'BULKSMSBD', 'SSLWIRELESS']).nullable().optional(),
    reviewNote: optionalText(1000),
  }),
  z.object({
    decision: z.literal('REJECT'),
    reviewNote: z.string().trim().min(3, 'Give a reason').max(1000),
  }),
]);
