import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { platformBillingApi } from '@/api/platformBilling.api';
import { useAuthStore } from '@/store/authStore';
import { ACCOUNT_DISABLED_EVENT } from '@/api/client';

// P1: the school's platform-billing status, for every signed-in school role.
// Shared by the app-wide banner, the "account disabled" gate and the Billing page.
export const PLATFORM_STATUS_KEY = 'platform-billing-status';
export const PLATFORM_INVOICES_KEY = 'platform-billing-invoices';
export const PLATFORM_PAYMENTS_KEY = 'platform-billing-payments';

export function usePlatformBillingStatus() {
  const { user, isAuthenticated, supportSession } = useAuthStore();
  const qc = useQueryClient();
  const enabled = isAuthenticated && !!user && (user.role !== 'SUPER_ADMIN' || !!supportSession);

  useEffect(() => {
    const refresh = () => qc.invalidateQueries({ queryKey: [PLATFORM_STATUS_KEY] });
    window.addEventListener(ACCOUNT_DISABLED_EVENT, refresh);
    return () => window.removeEventListener(ACCOUNT_DISABLED_EVENT, refresh);
  }, [qc]);

  return useQuery({
    queryKey: [PLATFORM_STATUS_KEY, user?.id],
    queryFn: platformBillingApi.status,
    enabled,
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
    refetchOnWindowFocus: true,
    retry: 1,
  });
}

export function useMyPlatformInvoices(enabled = true) {
  const { user } = useAuthStore();
  return useQuery({ queryKey: [PLATFORM_INVOICES_KEY], queryFn: platformBillingApi.myInvoices, enabled: enabled && user?.role === 'ADMIN' });
}

export function useMyPlatformPayments(enabled = true) {
  const { user } = useAuthStore();
  return useQuery({ queryKey: [PLATFORM_PAYMENTS_KEY], queryFn: platformBillingApi.myPayments, enabled: enabled && user?.role === 'ADMIN' });
}
