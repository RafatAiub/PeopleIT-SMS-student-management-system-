import { z } from 'zod';
import { isValidDonationAmount } from './donations.logic';

// =============================================================================
// Donations (T1) — request schemas. Every id comes from the URL or body but
// is always re-checked against req.tenantId in the service.
// =============================================================================

export const FUND_TYPES = ['ZAKAT', 'SADAQAH', 'WAQF', 'LILLAH', 'BUILDING', 'GENERAL', 'OTHER'] as const;
export const DONATION_METHODS = ['CASH', 'BANK', 'BKASH', 'NAGAD', 'SSLCOMMERZ', 'OTHER'] as const;
export const DONATION_STATUSES = ['PENDING', 'PAID', 'FAILED', 'REFUNDED'] as const;
export const RECURRING_STATUSES = ['ACTIVE', 'PAUSED', 'CANCELLED'] as const;
export const ONLINE_METHODS = ['BKASH', 'NAGAD', 'SSLCOMMERZ'] as const;

const id = z.string().trim().min(1).max(64);
const optText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null));
const amount = z.coerce.number().refine(isValidDonationAmount, 'Enter an amount above 0 with at most 2 decimals');
const optAmount = z
  .union([z.coerce.number(), z.null()])
  .optional()
  .refine((v) => v == null || isValidDonationAmount(v), 'Enter a goal above 0');
const date = z.coerce.date();
const bool = z.union([z.boolean(), z.enum(['true', 'false']).transform((v) => v === 'true')]);
const phone = z.string().trim().max(32).regex(/^[0-9+\-\s()]{6,32}$/, 'Enter a valid phone number');
const email = z.string().trim().toLowerCase().email().max(160);

export const IdParamDto = z.object({ id });

export const PageQuery = {
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(25),
};

// ── Funds ────────────────────────────────────────────────────────────────────

export const CreateFundDto = z.object({
  name: z.string().trim().min(1).max(120),
  nameBn: optText(120),
  type: z.enum(FUND_TYPES).default('GENERAL'),
  description: optText(4000),
  goalAmount: optAmount,
  active: z.boolean().default(true),
  showOnWebsite: z.boolean().default(false),
});
export const UpdateFundDto = CreateFundDto.partial();
export type CreateFundDtoType = z.infer<typeof CreateFundDto>;
export type UpdateFundDtoType = z.infer<typeof UpdateFundDto>;

// ── Donors ───────────────────────────────────────────────────────────────────

export const CreateDonorDto = z.object({
  name: z.string().trim().min(1).max(120),
  phone: phone.optional().nullable(),
  email: email.optional().nullable(),
  address: optText(300),
  anonymous: z.boolean().default(false),
  notes: optText(2000),
  userId: id.optional().nullable(),
});
export const UpdateDonorDto = CreateDonorDto.partial();
export type CreateDonorDtoType = z.infer<typeof CreateDonorDto>;
export type UpdateDonorDtoType = z.infer<typeof UpdateDonorDto>;

export const DonorQueryDto = z.object({ q: z.string().trim().max(100).optional(), ...PageQuery });
export type DonorQueryDtoType = z.infer<typeof DonorQueryDto>;

// ── Campaigns ────────────────────────────────────────────────────────────────

export const CreateCampaignDto = z
  .object({
    fundId: id,
    title: z.string().trim().min(1).max(160),
    titleBn: optText(160),
    description: optText(8000),
    goalAmount: optAmount,
    startDate: date.optional().nullable(),
    endDate: date.optional().nullable(),
    coverImageUrl: z.string().trim().url().max(1000).optional().nullable(),
    isPublic: z.boolean().default(false),
  })
  .refine((d) => !d.startDate || !d.endDate || d.endDate >= d.startDate, { message: 'End date must be after the start date', path: ['endDate'] });
export const UpdateCampaignDto = z
  .object({
    fundId: id.optional(),
    title: z.string().trim().min(1).max(160).optional(),
    titleBn: optText(160),
    description: optText(8000),
    goalAmount: optAmount,
    startDate: date.optional().nullable(),
    endDate: date.optional().nullable(),
    coverImageUrl: z.string().trim().url().max(1000).optional().nullable(),
    isPublic: z.boolean().optional(),
  })
  .refine((d) => !d.startDate || !d.endDate || d.endDate >= d.startDate, { message: 'End date must be after the start date', path: ['endDate'] });
export type CreateCampaignDtoType = z.infer<typeof CreateCampaignDto>;
export type UpdateCampaignDtoType = z.infer<typeof UpdateCampaignDto>;

// ── Donations ────────────────────────────────────────────────────────────────

export const RecordDonationDto = z
  .object({
    fundId: id,
    campaignId: id.optional().nullable(),
    donorId: id.optional().nullable(),
    // Quick entry without a donor profile: a walk-in name.
    donorName: optText(120),
    recurringId: id.optional().nullable(),
    amount,
    method: z.enum(['CASH', 'BANK', 'BKASH', 'NAGAD', 'OTHER']),
    paidAt: date.optional(),
    note: optText(500),
    anonymous: z.boolean().default(false),
    sendReceipt: z.boolean().default(true),
  });
export type RecordDonationDtoType = z.infer<typeof RecordDonationDto>;

export const DonationQueryDto = z.object({
  fundId: id.optional(),
  campaignId: id.optional(),
  donorId: id.optional(),
  status: z.enum(DONATION_STATUSES).optional(),
  method: z.enum(DONATION_METHODS).optional(),
  source: z.enum(['ADMIN', 'ONLINE']).optional(),
  from: date.optional(),
  to: date.optional(),
  q: z.string().trim().max(100).optional(),
  ...PageQuery,
});
export type DonationQueryDtoType = z.infer<typeof DonationQueryDto>;

export const RefundDonationDto = z.object({ reason: z.string().trim().min(3).max(500) });

// ── Recurring pledges ────────────────────────────────────────────────────────

export const CreateRecurringDto = z.object({
  donorId: id,
  fundId: id,
  amount,
  dayOfMonth: z.coerce.number().int().min(1).max(28),
  startDate: date.optional(),
  remindEmail: z.boolean().default(true),
  remindSms: z.boolean().default(false),
  note: optText(500),
});
export const UpdateRecurringDto = z.object({
  fundId: id.optional(),
  amount: amount.optional(),
  dayOfMonth: z.coerce.number().int().min(1).max(28).optional(),
  status: z.enum(RECURRING_STATUSES).optional(),
  remindEmail: z.boolean().optional(),
  remindSms: z.boolean().optional(),
  note: optText(500),
});
export type CreateRecurringDtoType = z.infer<typeof CreateRecurringDto>;
export type UpdateRecurringDtoType = z.infer<typeof UpdateRecurringDto>;

export const RecurringQueryDto = z.object({
  status: z.enum(RECURRING_STATUSES).optional(),
  dueThisMonth: bool.optional(),
  ...PageQuery,
});
export type RecurringQueryDtoType = z.infer<typeof RecurringQueryDto>;

export const RemindDto = z.object({ ids: z.array(id).max(500).optional() });

// ── Disbursements ────────────────────────────────────────────────────────────

export const CreateDisbursementDto = z.object({
  fundId: id,
  amount,
  paidTo: z.string().trim().min(1).max(160),
  purpose: optText(300),
  date: date.optional(),
  note: optText(500),
});
export type CreateDisbursementDtoType = z.infer<typeof CreateDisbursementDto>;

export const DisbursementQueryDto = z.object({ fundId: id.optional(), from: date.optional(), to: date.optional(), ...PageQuery });
export type DisbursementQueryDtoType = z.infer<typeof DisbursementQueryDto>;

// ── Reports ──────────────────────────────────────────────────────────────────

export const ReportQueryDto = z.object({ from: date.optional(), to: date.optional() });
export type ReportQueryDtoType = z.infer<typeof ReportQueryDto>;

// ── Public (website) ─────────────────────────────────────────────────────────

export const PublicSiteParamDto = z.object({ siteId: id });
export const PublicDonationParamDto = z.object({ siteId: id, reference: z.string().trim().min(6).max(40) });

export const PublicCreateDonationDto = z
  .object({
    fundId: id.optional(),
    campaignId: id.optional(),
    amount,
    name: optText(120),
    phone: phone.optional().nullable(),
    email: email.optional().nullable(),
    anonymous: z.boolean().default(false),
    paymentMethod: z.enum(ONLINE_METHODS),
    returnUrl: z.string().trim().url().max(500).optional(),
    note: optText(300),
  })
  .refine((d) => Boolean(d.fundId || d.campaignId), { message: 'Choose a fund or campaign', path: ['fundId'] });
export type PublicCreateDonationDtoType = z.infer<typeof PublicCreateDonationDto>;

export const PublicDemoPayDto = z.object({ outcome: z.enum(['success', 'fail']) });

export const DonationPayCallbackParamDto = z.object({
  gateway: z.enum(['sslcommerz', 'bkash', 'nagad']),
  kind: z.enum(['success', 'fail', 'cancel', 'ipn', 'callback']),
});
