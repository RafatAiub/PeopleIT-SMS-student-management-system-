import { z } from 'zod';

// =============================================================================
// Billing DTOs — Plan CRUD, pricing, checkout, manual override
// =============================================================================

export const BillingCycleEnum = z.enum(['MONTHLY', 'QUARTERLY', 'HALF_YEARLY', 'YEARLY']);

export const CreatePlanDto = z.object({
  name: z.string().trim().min(2, 'Plan name is too short').max(200),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9-]+$/, 'Slug must be lowercase alphanumeric with hyphens only'),
  studentCap: z.number().int().positive().nullable().optional(),
  description: z.string().trim().max(2000).optional(),
  displayOrder: z.number().int().optional(),
});

export type CreatePlanDtoType = z.infer<typeof CreatePlanDto>;

// NOTE: slug is intentionally NOT included here — once a Plan is created its
// slug is immutable. Subscriptions/SubscriptionPayments and any external
// references (e.g. provisionInstitutionAndAdmin's 'legacy' trial fallback)
// key off the slug, so allowing it to change post-creation would silently
// break those lookups. Create a new Plan instead if a rename is needed.
export const UpdatePlanDto = z.object({
  name: z.string().trim().min(2, 'Plan name is too short').max(200).optional(),
  studentCap: z.number().int().positive().nullable().optional(),
  description: z.string().trim().max(2000).optional().nullable(),
  displayOrder: z.number().int().optional(),
});

export type UpdatePlanDtoType = z.infer<typeof UpdatePlanDto>;

export const SetPlanPriceDto = z.object({
  billingCycle: BillingCycleEnum,
  amount: z.number().positive('Amount must be greater than zero'),
  currency: z.string().trim().toUpperCase().length(3).optional(),
});

export type SetPlanPriceDtoType = z.infer<typeof SetPlanPriceDto>;

// No amount field, ever — the price is always resolved server-side from the
// active PlanPrice row so a client can never pay a self-chosen amount.
export const InitiateCheckoutDto = z.object({
  planId: z.string().min(1, 'Plan ID is required'),
  billingCycle: BillingCycleEnum,
});

export type InitiateCheckoutDtoType = z.infer<typeof InitiateCheckoutDto>;

export const ManualOverrideDto = z.object({
  action: z.enum(['EXTEND', 'MARK_PAID', 'FORCE_SUSPEND', 'FORCE_REACTIVATE']),
  planId: z.string().optional(),
  billingCycle: BillingCycleEnum.optional(),
  extendDays: z.number().int().positive().optional(),
  reason: z.string().trim().min(5, 'Reason must be at least 5 characters'),
});

export type ManualOverrideDtoType = z.infer<typeof ManualOverrideDto>;

export const ListSubscriptionsQueryDto = z.object({
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().max(100).optional(),
  status: z.enum(['TRIALING', 'ACTIVE', 'GRACE', 'EXPIRED', 'CANCELLED']).optional(),
  planId: z.string().optional(),
  q: z.string().optional(),
});

export type ListSubscriptionsQueryDtoType = z.infer<typeof ListSubscriptionsQueryDto>;
