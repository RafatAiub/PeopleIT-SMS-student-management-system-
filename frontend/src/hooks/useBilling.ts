import { useQuery } from '@tanstack/react-query';
import { billingApi } from '@/api/billing.api';
import { useAuthStore } from '@/store/authStore';

// =============================================================================
// Billing hooks — tenant-side subscription/plans/payments. Shared query keys
// so the paywall gate (App.tsx ProtectedRoute), SubscriptionBanner, and
// SubscriptionOverview all read from the same React Query cache entry.
// =============================================================================

export const BILLING_SUBSCRIPTION_KEY = 'billing-subscription';
export const BILLING_PLANS_KEY = 'billing-plans';
export const BILLING_MY_PAYMENTS_KEY = 'billing-my-payments';

export function useMySubscription() {
  const { user } = useAuthStore();
  return useQuery({
    queryKey: [BILLING_SUBSCRIPTION_KEY],
    queryFn: billingApi.getMySubscription,
    enabled: user?.role === 'ADMIN',
    staleTime: 60_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });
}

export function useBillingPlans() {
  return useQuery({ queryKey: [BILLING_PLANS_KEY], queryFn: billingApi.getPlans });
}

export function useMyPayments() {
  const { user } = useAuthStore();
  return useQuery({
    queryKey: [BILLING_MY_PAYMENTS_KEY],
    queryFn: billingApi.getMyPayments,
    enabled: user?.role === 'ADMIN',
  });
}
