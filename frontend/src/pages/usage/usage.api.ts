// React Query hooks for the usage & cost report.
// Contract: backend/src/modules/usage (mounted /api/v1/usage).
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import apiClient from '@/api/client';

export type Metric = 'SMS' | 'EMAIL' | 'AI_CALL' | 'STORAGE_MB';

export interface UsageLine {
  metric: Metric;
  label: string;
  billableUnits: number;
  notBilled: number;
  unitPrice: number | null;
  estimatedCostBdt: number | null;
}

export interface UsageLines {
  items: UsageLine[];
  inAppNotifications: number;
  estimatedTotalBdt: number | null;
}

interface Common {
  month: string;
  from: string;
  to: string;
  prices: Record<Metric, number | null>;
  unpricedMetrics: Metric[];
  isEstimate: true;
  usageSchemaMissing: boolean;
}

export type TenantUsage = Common & UsageLines;

export interface PlatformUsage extends Common {
  totals: UsageLines;
  institutions: Array<UsageLines & { institutionId: string; institutionName: string }>;
}

export function useTenantUsage(month: string) {
  return useQuery({
    queryKey: ['usage', 'tenant', month],
    queryFn: async (): Promise<TenantUsage> => (await apiClient.get('/usage/summary', { params: { month } })).data.data,
    placeholderData: keepPreviousData,
  });
}

export function usePlatformUsage(month: string) {
  return useQuery({
    queryKey: ['usage', 'platform', month],
    queryFn: async (): Promise<PlatformUsage> => (await apiClient.get('/usage/platform/summary', { params: { month } })).data.data,
    placeholderData: keepPreviousData,
  });
}

export const currentMonth = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

export const METRIC_LABEL: Record<Metric, string> = { SMS: 'SMS (segments)', EMAIL: 'Email', AI_CALL: 'AI calls', STORAGE_MB: 'Storage (MB)' };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const errMsg = (e: any, fallback: string): string => e?.response?.data?.message || fallback;
