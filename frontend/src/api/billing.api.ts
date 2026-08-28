import apiClient from './client';

// =============================================================================
// Billing API — SaaS subscription plans, checkout, and super-admin
// plan/subscription management. Mirrors backend/src/modules/billing exactly
// (billing.dto.ts / billing.controller.ts / billing.repository.ts) — do not
// add fields here that the backend doesn't actually return/accept.
// =============================================================================

export type BillingCycle = 'MONTHLY' | 'QUARTERLY' | 'HALF_YEARLY' | 'YEARLY';

export type SubscriptionStatus = 'TRIALING' | 'ACTIVE' | 'GRACE' | 'EXPIRED' | 'CANCELLED';

export type SubscriptionPaymentStatus = 'INITIATED' | 'PENDING' | 'SUCCESS' | 'FAILED' | 'CANCELLED' | 'REFUNDED';

export type BannerLevel = 'none' | 'trial-ending' | 'renewal-due' | 'grace';

export interface PlanPrice {
  id: string;
  planId: string;
  billingCycle: BillingCycle;
  amount: string | number;
  currency: string;
  isActive: boolean;
  createdAt: string;
}

export interface Plan {
  id: string;
  name: string;
  slug: string;
  studentCap: number | null;
  description: string | null;
  isArchived: boolean;
  displayOrder: number;
  createdAt: string;
  updatedAt: string;
  prices: PlanPrice[];
}

export interface Subscription {
  id: string;
  institutionId: string;
  planId: string;
  plan: Plan;
  billingCycle: BillingCycle;
  status: SubscriptionStatus;
  trialEndsAt: string | null;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  graceEndsAt: string | null;
  cancelAtPeriodEnd: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PendingPaymentRequest {
  id: string;
  planId: string | null;
  planName: string | null;
  billingCycle: BillingCycle;
  amount: string | number;
  currency: string;
  requestedAt: string;
}

export interface MySubscription extends Subscription {
  daysRemaining: number;
  bannerLevel: BannerLevel;
  isPaywalled: boolean;
  pendingPaymentRequest: PendingPaymentRequest | null;
}

export interface SubscriptionListItem extends Omit<Subscription, 'plan'> {
  institution: { id: string; name: string; slug: string; isActive: boolean };
  plan: { id: string; name: string; slug: string };
}

export interface SubscriptionPayment {
  id: string;
  subscriptionId: string;
  institutionId: string;
  planPriceId: string | null;
  planPrice: PlanPrice | null;
  amount: string | number;
  currency: string;
  billingCycle: BillingCycle;
  gateway: 'SSLCOMMERZ';
  gatewayTransactionId: string | null;
  gatewayValId: string | null;
  status: SubscriptionPaymentStatus;
  initiatedByUserId: string | null;
  isManualOverride: boolean;
  overrideReason: string | null;
  overriddenByUserId: string | null;
  // Redisplayable checkout URL for a not-yet-consumed super-admin-generated
  // payment link.
  gatewayPaymentUrl: string | null;
  // Distinguishes a super-admin-initiated payment request from tenant
  // self-checkout, without a User join.
  generatedBySuperAdmin: boolean;
  refundRefId: string | null;
  refundedAt: string | null;
  refundedByUserId: string | null;
  createdAt: string;
  updatedAt: string;
}

// Full payment record as returned by getPaymentReceipt/getPaymentReceiptAdmin
// — includes the related institution/subscription/plan the base
// SubscriptionPayment row doesn't carry.
export interface PaymentReceipt extends SubscriptionPayment {
  institution: { id: string; name: string; slug: string };
  subscription: { id: string; status: SubscriptionStatus };
  planPrice: (PlanPrice & { plan: Plan }) | null;
}

export interface SubscriptionDetail {
  subscription: Subscription;
  payments: SubscriptionPayment[];
}

export interface PaginatedMeta {
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export interface ListSubscriptionsParams {
  page?: number;
  pageSize?: number;
  status?: SubscriptionStatus;
  planId?: string;
  q?: string;
}

export interface CreatePlanDto {
  name: string;
  slug: string;
  studentCap?: number | null;
  description?: string;
  displayOrder?: number;
}

export interface UpdatePlanDto {
  name?: string;
  studentCap?: number | null;
  description?: string | null;
  displayOrder?: number;
}

export interface SetPlanPriceDto {
  billingCycle: BillingCycle;
  amount: number;
  currency?: string;
}

export type ManualOverrideAction = 'EXTEND' | 'MARK_PAID' | 'FORCE_SUSPEND' | 'FORCE_REACTIVATE';

export interface ManualOverrideDto {
  action: ManualOverrideAction;
  planId?: string;
  billingCycle?: BillingCycle;
  extendDays?: number;
  reason: string;
}

// No amount field — the price is always resolved server-side from the
// active PlanPrice row, same as InitiateCheckoutDto.
export interface GeneratePaymentLinkDto {
  planId: string;
  billingCycle: BillingCycle;
}

export interface InitiateRefundDto {
  refundAmount: number;
  refundRemarks: string;
  refeId?: string;
}

export interface RefundStatusResult {
  paymentId: string;
  refundRefId: string | null;
  liveStatus: string | null;
  refundedOn: string | null;
  persisted: boolean;
}

export interface AnalyticsQueryParams {
  renewalWindowDays?: number;
  churnWindowDays?: number;
}

export interface RevenueByPlanItem {
  planPriceId: string | null;
  planId: string | null;
  planName: string;
  billingCycle: BillingCycle | null;
  totalRevenue: string | number;
}

export interface UpcomingRenewalItem {
  id: string;
  institutionId: string;
  planId: string;
  billingCycle: BillingCycle;
  status: SubscriptionStatus;
  trialEndsAt: string | null;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  graceEndsAt: string | null;
  cancelAtPeriodEnd: boolean;
  createdAt: string;
  updatedAt: string;
  institution: { id: string; name: string; slug: string };
  plan: { id: string; name: string };
}

export interface BillingAnalytics {
  mrr: number;
  revenueByPlan: RevenueByPlanItem[];
  churnCount: number;
  upcomingRenewals: { count: number; list: UpcomingRenewalItem[] };
}

// ── Tenant-admin ─────────────────────────────────────────────────────────

export const billingApi = {
  getPlans: async (): Promise<Plan[]> => {
    const { data } = await apiClient.get('/billing/plans');
    return data.data;
  },

  getMySubscription: async (): Promise<MySubscription> => {
    const { data } = await apiClient.get('/billing/subscription');
    return data.data;
  },

  initiateCheckout: async (planId: string, billingCycle: BillingCycle): Promise<{ paymentUrl: string }> => {
    const { data } = await apiClient.post('/billing/checkout', { planId, billingCycle });
    return data.data;
  },

  getMyPayments: async (): Promise<SubscriptionPayment[]> => {
    const { data } = await apiClient.get('/billing/my-payments');
    return data.data;
  },

  getPaymentReceipt: async (paymentId: string): Promise<PaymentReceipt> => {
    const { data } = await apiClient.get(`/billing/payments/${paymentId}`);
    return data.data;
  },

  // ── Super-admin ───────────────────────────────────────────────────────

  listAllPlans: async (): Promise<Plan[]> => {
    const { data } = await apiClient.get('/billing/super-admin/plans');
    return data.data;
  },

  createPlan: async (dto: CreatePlanDto): Promise<Plan> => {
    const { data } = await apiClient.post('/billing/super-admin/plans', dto);
    return data.data;
  },

  updatePlan: async (id: string, dto: UpdatePlanDto): Promise<Plan> => {
    const { data } = await apiClient.patch(`/billing/super-admin/plans/${id}`, dto);
    return data.data;
  },

  archivePlan: async (id: string): Promise<Plan> => {
    const { data } = await apiClient.post(`/billing/super-admin/plans/${id}/archive`);
    return data.data;
  },

  setPlanPrice: async (id: string, dto: SetPlanPriceDto): Promise<PlanPrice> => {
    const { data } = await apiClient.put(`/billing/super-admin/plans/${id}/price`, dto);
    return data.data;
  },

  listSubscriptions: async (
    params: ListSubscriptionsParams
  ): Promise<{ data: SubscriptionListItem[]; meta: PaginatedMeta }> => {
    const { data } = await apiClient.get('/billing/super-admin/subscriptions', { params });
    return { data: data.data, meta: data.meta };
  },

  getSubscriptionDetail: async (institutionId: string): Promise<SubscriptionDetail> => {
    const { data } = await apiClient.get(`/billing/super-admin/subscriptions/${institutionId}`);
    return data.data;
  },

  manualOverride: async (institutionId: string, dto: ManualOverrideDto): Promise<Subscription> => {
    const { data } = await apiClient.post(`/billing/super-admin/subscriptions/${institutionId}/override`, dto);
    return data.data;
  },

  generatePaymentLink: async (
    institutionId: string,
    dto: GeneratePaymentLinkDto
  ): Promise<{ paymentUrl: string; paymentId: string }> => {
    const { data } = await apiClient.post(
      `/billing/super-admin/subscriptions/${institutionId}/generate-payment-link`,
      dto
    );
    return data.data;
  },

  getPaymentReceiptAdmin: async (paymentId: string): Promise<PaymentReceipt> => {
    const { data } = await apiClient.get(`/billing/super-admin/payments/${paymentId}`);
    return data.data;
  },

  initiateRefund: async (paymentId: string, dto: InitiateRefundDto): Promise<SubscriptionPayment> => {
    const { data } = await apiClient.post(`/billing/super-admin/payments/${paymentId}/refund`, dto);
    return data.data;
  },

  queryRefundStatus: async (paymentId: string): Promise<RefundStatusResult> => {
    const { data } = await apiClient.get(`/billing/super-admin/payments/${paymentId}/refund`);
    return data.data;
  },

  getAnalytics: async (params?: AnalyticsQueryParams): Promise<BillingAnalytics> => {
    const { data } = await apiClient.get('/billing/super-admin/analytics', { params });
    return data.data;
  },
};

export const BILLING_CYCLE_LABELS: Record<BillingCycle, string> = {
  MONTHLY: 'Monthly',
  QUARTERLY: 'Quarterly',
  HALF_YEARLY: 'Half-Yearly',
  YEARLY: 'Yearly',
};

export const formatCurrency = (amount: string | number, currency = 'BDT'): string => {
  const value = typeof amount === 'string' ? Number(amount) : amount;
  return `${currency === 'BDT' ? '৳' : currency + ' '}${value.toLocaleString('en-BD', { maximumFractionDigits: 2 })}`;
};
