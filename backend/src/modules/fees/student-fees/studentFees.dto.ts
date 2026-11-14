import { z } from 'zod';

const id = z.string().min(1).max(64);
const period = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Use YYYY-MM');
const money = z.coerce.number().finite().min(0).max(100_000_000);
const positiveMoney = z.coerce.number().finite().positive('Amount must be greater than zero').max(100_000_000);
const reason = z.string().trim().min(3, 'Please give a reason').max(500);

export const IdParamDto = z.object({ id });
export const StudentIdParamDto = z.object({ studentId: id });
export const PaymentIdParamDto = z.object({ paymentId: id });
export const FineParamDto = z.object({ id, fineId: id });

// ── Settings ──
export const SettingsDto = z.object({
  autoGenerate: z.boolean().optional(),
  generateDay: z.coerce.number().int().min(1).max(28).optional(),
  dueDay: z.coerce.number().int().min(1).max(31).optional(),
  monthlyCategoryIds: z.array(id).max(50).optional(),
  arrearsMode: z.enum(['SEPARATE', 'ARREARS_LINE']).optional(),
});
export type SettingsDtoType = z.infer<typeof SettingsDto>;

export const FineRuleDto = z.object({
  feeCategoryId: id.nullable().optional(),
  type: z.enum(['FLAT', 'PERCENT']),
  value: positiveMoney,
  graceDays: z.coerce.number().int().min(0).max(365).default(0),
  recurrence: z.enum(['ONCE', 'MONTHLY']).default('ONCE'),
  maxAmount: money.nullable().optional(),
  isActive: z.boolean().optional(),
});
export type FineRuleDtoType = z.infer<typeof FineRuleDto>;
export const FineRuleUpdateDto = FineRuleDto.partial();

// ── Student fee profile ──
const profileFields = {
  feeCategoryId: id.nullable().optional(),
  kind: z.enum(['MONTHLY', 'YEARLY']),
  monthlyAmount: money.nullable().optional(),
  yearlyAmount: money.nullable().optional(),
  yearlyMode: z.enum(['SPREAD', 'ONE_TIME']).default('SPREAD'),
  effectiveFrom: period,
  effectiveTo: period.nullable().optional(),
  reason,
};
const profileRefine = <T extends { kind: string; monthlyAmount?: number | null; yearlyAmount?: number | null; effectiveFrom: string; effectiveTo?: string | null }>(
  d: T,
  ctx: z.RefinementCtx,
) => {
  if (d.kind === 'MONTHLY' && (d.monthlyAmount === null || d.monthlyAmount === undefined)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['monthlyAmount'], message: 'Enter the monthly fee' });
  }
  if (d.kind === 'YEARLY' && (d.yearlyAmount === null || d.yearlyAmount === undefined)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['yearlyAmount'], message: 'Enter the yearly total' });
  }
  if (d.effectiveTo && d.effectiveTo < d.effectiveFrom) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['effectiveTo'], message: 'Effective-to must be on or after effective-from' });
  }
};
export const ProfileDto = z.object({ studentId: id, ...profileFields }).superRefine(profileRefine);
export type ProfileDtoType = z.infer<typeof ProfileDto>;
export const BulkProfileDto = z.object({ studentIds: z.array(id).min(1).max(500), ...profileFields }).superRefine(profileRefine);
export type BulkProfileDtoType = z.infer<typeof BulkProfileDto>;

export const EndProfileDto = z.object({
  // Last month the rate applies. Omitted = void the profile entirely (a mistake).
  effectiveTo: period.nullable().optional(),
  reason,
});

export const ListProfilesQueryDto = z.object({
  classId: id.optional(),
  sectionId: id.optional(),
  search: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

// ── Monthly generation ──
export const MonthlyRunDto = z.object({
  period,
  classId: id.nullable().optional(),
});
export type MonthlyRunDtoType = z.infer<typeof MonthlyRunDto>;

// ── Counter ──
export const COUNTER_METHODS = ['CASH', 'BANK', 'BKASH_PERSONAL', 'NAGAD_PERSONAL', 'CHEQUE', 'OTHER'] as const;

export const CounterSearchQueryDto = z.object({ q: z.string().trim().min(1).max(100) });

export const CollectDto = z
  .object({
    studentId: id,
    // Explicit split …
    allocations: z.array(z.object({ invoiceId: id, amount: positiveMoney })).max(60).optional(),
    // … or an amount spread oldest-first over these invoices (default: every
    // unpaid invoice of the student).
    amount: positiveMoney.optional(),
    invoiceIds: z.array(id).max(60).optional(),
    method: z.enum(COUNTER_METHODS),
    reference: z.string().trim().max(120).optional(),
    notes: z.string().trim().max(500).optional(),
    discounts: z.array(z.object({ invoiceId: id, amount: positiveMoney })).max(60).optional(),
    discountReason: z.string().trim().max(500).optional(),
  })
  .superRefine((d, ctx) => {
    if (!d.allocations?.length && d.amount === undefined && !d.discounts?.length) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['amount'], message: 'Enter an amount or choose invoices' });
    }
    if (d.discounts?.length && (!d.discountReason || d.discountReason.length < 3)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['discountReason'], message: 'A discount needs a reason' });
    }
    if (d.method !== 'CASH' && d.method !== 'OTHER' && (d.allocations?.length || d.amount !== undefined) && !d.reference) {
      // Reference is strongly expected for traceable methods but not forced
      // for bKash/Nagad personal (cashiers sometimes note it later).
      if (d.method === 'CHEQUE' || d.method === 'BANK') {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['reference'], message: 'Enter the cheque / bank reference' });
      }
    }
  });
export type CollectDtoType = z.infer<typeof CollectDto>;

// ── Adjustments ──
export const CancelInvoiceDto = z.object({ reason });
export const ReversePaymentDto = z.object({ reason });
export const RefundDto = z.object({
  amount: positiveMoney,
  method: z.enum(['CASH', 'BANK', 'BKASH_PERSONAL', 'NAGAD_PERSONAL', 'CHEQUE', 'GATEWAY', 'OTHER']),
  reference: z.string().trim().max(120).optional(),
  reason,
});
export type RefundDtoType = z.infer<typeof RefundDto>;
export const WaiveFineDto = z.object({ reason, stopFuture: z.boolean().default(true) });
