import { z } from 'zod';
import { normalizeBdMobile } from '../../utils/phone';
import { PERIOD_RE } from './platformBilling.logic';

// =============================================================================
// P1 platform billing DTOs. Money is accepted as a number (taka, max 2
// decimals) and converted to paisa in the service.
// =============================================================================

const money = z.coerce
  .number()
  .min(0, 'Amount cannot be negative')
  .max(10_000_000, 'Amount is too large')
  .refine((v) => Math.abs(Math.round(v * 100) - v * 100) < 1e-6, 'At most 2 decimal places');

const positiveMoney = money.refine((v) => v > 0, 'Amount must be greater than zero');

const period = z.string().trim().regex(PERIOD_RE, 'Use YYYY-MM');
const isoDay = z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');
const optionalText = (max: number) => z.string().trim().max(max).nullable().optional();

export const UpsertBillingProfileDto = z
  .object({
    isActive: z.boolean().default(true),
    pricingModel: z.enum(['FLAT', 'PER_STUDENT']),
    flatAmount: money.nullable().optional(),
    perStudentRate: money.nullable().optional(),
    minimumCharge: money.default(0),
    discountType: z.enum(['PERCENT', 'FIXED']).nullable().optional(),
    discountValue: money.nullable().optional(),
    discountNote: optionalText(200),
    dueDay: z.coerce.number().int().min(1).max(28).default(10),
    billingStartMonth: period,
    serviceStartDate: isoDay.nullable().optional(),
    firstMonthMode: z.enum(['PRORATE', 'FREE', 'FULL']).default('PRORATE'),
    freeMonths: z.coerce.number().int().min(0).max(24).default(0),
    remindSms: z.boolean().default(true),
    remindEmail: z.boolean().default(true),
    smsLanguage: z.enum(['bn', 'en']).default('bn'),
    autoRestrictAfterDays: z.coerce.number().int().min(1).max(365).nullable().optional(),
    billingPhone: z
      .string()
      .trim()
      .max(20)
      .nullable()
      .optional()
      .refine((v) => !v || normalizeBdMobile(v) !== null, 'Enter a valid Bangladeshi mobile number (01XXXXXXXXX)'),
    billingEmail: z.string().trim().toLowerCase().email('Enter a valid email').max(200).nullable().optional().or(z.literal('')),
    notes: optionalText(2000),
    reason: optionalText(500),
  })
  .superRefine((v, ctx) => {
    if (v.pricingModel === 'FLAT' && !(Number(v.flatAmount) > 0)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['flatAmount'], message: 'Monthly amount is required for flat pricing' });
    }
    if (v.pricingModel === 'PER_STUDENT' && !(Number(v.perStudentRate) > 0)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['perStudentRate'], message: 'Rate per student is required' });
    }
    if (v.discountType === 'PERCENT' && Number(v.discountValue) > 100) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['discountValue'], message: 'A percentage discount cannot exceed 100' });
    }
    if (v.discountType && !(Number(v.discountValue) > 0)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['discountValue'], message: 'Enter the discount amount' });
    }
  });
export type UpsertBillingProfileDtoType = z.infer<typeof UpsertBillingProfileDto>;

export const SetOverrideDto = z
  .object({
    level: z.enum(['ACTIVE', 'RESTRICTED', 'DISABLED']).nullable(),
    reason: z.string().trim().max(500).optional(),
    keep: z.boolean().default(false),
  })
  .superRefine((v, ctx) => {
    if (v.level && !(v.reason && v.reason.length >= 3)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['reason'], message: 'A reason is required' });
    }
  });
export type SetOverrideDtoType = z.infer<typeof SetOverrideDto>;

export const GenerateInvoicesDto = z.object({
  institutionId: z.string().trim().min(1).optional(),
  period: period.optional(),
});
export type GenerateInvoicesDtoType = z.infer<typeof GenerateInvoicesDto>;

export const InvoiceLineInputDto = z.object({
  description: z.string().trim().min(1).max(200),
  quantity: z.coerce.number().min(0).max(1_000_000),
  // Negative = a discount line.
  unitPrice: z.coerce
    .number()
    .min(-10_000_000)
    .max(10_000_000)
    .refine((v) => Math.abs(Math.round(v * 100) - v * 100) < 1e-6, 'At most 2 decimal places'),
});

export const EditInvoiceLinesDto = z.object({
  lines: z.array(InvoiceLineInputDto).min(1).max(30),
  dueDate: isoDay.optional(),
  reason: z.string().trim().min(3, 'A reason is required').max(500),
});
export type EditInvoiceLinesDtoType = z.infer<typeof EditInvoiceLinesDto>;

export const ReasonDto = z.object({ reason: z.string().trim().min(3, 'A reason is required').max(500) });
export type ReasonDtoType = z.infer<typeof ReasonDto>;

export const ListInvoicesQueryDto = z.object({
  status: z.string().trim().optional(), // comma-separated
  period: period.optional(),
  institutionId: z.string().trim().optional(),
  q: z.string().trim().max(100).optional(),
  overdueOnly: z.enum(['true', 'false']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(25),
  format: z.enum(['csv', 'xlsx']).optional(),
});
export type ListInvoicesQueryDtoType = z.infer<typeof ListInvoicesQueryDto>;

export const ManualPaymentDto = z.object({
  method: z.enum(['CASH', 'BANK_TRANSFER', 'BKASH_PERSONAL', 'NAGAD_PERSONAL', 'OTHER']),
  amount: positiveMoney,
  reference: optionalText(120),
  note: optionalText(500),
  paidAt: isoDay.optional(),
  notify: z.boolean().default(true),
});
export type ManualPaymentDtoType = z.infer<typeof ManualPaymentDto>;

export const CheckoutDto = z
  .object({
    gateway: z.enum(['BKASH', 'SSLCOMMERZ']),
    invoiceId: z.string().trim().min(1).optional(),
    payAll: z.boolean().optional(),
  })
  .refine((v) => !!v.invoiceId || v.payAll === true, { message: 'Choose an invoice or pay all', path: ['invoiceId'] });
export type CheckoutDtoType = z.infer<typeof CheckoutDto>;

export const DemoConfirmDto = z.object({ outcome: z.enum(['success', 'failure']) });

export const CollectionsQueryDto = z.object({
  q: z.string().trim().max(100).optional(),
  assignee: z.string().trim().optional(), // user id | 'me' | 'none'
  accessLevel: z.enum(['ACTIVE', 'RESTRICTED', 'DISABLED']).optional(),
  overdueOnly: z.enum(['true', 'false']).optional(),
  sort: z.enum(['amount', 'daysOverdue', 'nextFollowUp', 'name', 'lastContact']).default('daysOverdue'),
});
export type CollectionsQueryDtoType = z.infer<typeof CollectionsQueryDto>;

export const AddActivityDto = z
  .object({
    type: z.enum(['CALL', 'NOTE', 'PROMISE_TO_PAY']),
    callOutcome: z.enum(['REACHED', 'NO_ANSWER', 'PROMISED', 'REFUSED', 'WRONG_NUMBER']).optional(),
    body: optionalText(2000),
    promiseDate: isoDay.optional(),
    nextFollowUpAt: isoDay.nullable().optional(),
    assigneeUserId: z.string().trim().nullable().optional(),
    invoiceId: z.string().trim().optional(),
  })
  .superRefine((v, ctx) => {
    if (v.type === 'CALL' && !v.callOutcome) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['callOutcome'], message: 'Choose the call outcome' });
    }
    if (v.type === 'PROMISE_TO_PAY' && !v.promiseDate) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['promiseDate'], message: 'Enter the promised payment date' });
    }
    if (v.type === 'NOTE' && !v.body) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['body'], message: 'Write the note' });
    }
  });
export type AddActivityDtoType = z.infer<typeof AddActivityDto>;
