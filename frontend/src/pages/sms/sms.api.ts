import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import apiClient from '@/api/client';
import type { LedgerType, ProviderName, SmsStatus } from './sms.logic';

// =============================================================================
// P5 SMS credits — data layer for /api/v1/sms-credits (school ADMIN) and
// /api/v1/sms-credits/admin (SUPER_ADMIN).
// =============================================================================

export interface Pack { id: string; name: string; nameBn: string | null; units: number; priceBdt: number; perUnit: number; isActive: boolean; sortOrder: number }
export interface Gateway { gateway: 'BKASH' | 'SSLCOMMERZ'; label: string; live: boolean; demo: boolean; available: boolean }
export interface SenderRequest {
  id: string;
  institutionId: string;
  requested: string;
  approvedValue: string | null;
  provider: ProviderName | null;
  status: 'REQUESTED' | 'APPROVED' | 'REJECTED';
  note: string | null;
  reviewNote: string | null;
  createdAt: string;
  reviewedAt: string | null;
  institution?: { id: string; name: string };
}
export interface Overview {
  balance: number;
  totalPurchased: number;
  totalUsed: number;
  lowBalanceThreshold: number;
  isLow: boolean;
  freeAllowance: number;
  freeRemaining: number;
  month: string;
  senderId: string | null;
  senderIdProvider: string | null;
  latestSenderRequest: SenderRequest | null;
  thisMonth: Partial<Record<SmsStatus, { count: number; segments: number }>>;
  smsLive: boolean;
  enforced: boolean;
  packs: Pack[];
  gateways: Gateway[];
}
export interface SmsRow {
  id: string;
  institutionId: string | null;
  institutionName: string | null;
  to: string;
  body: string | null;
  segments: number;
  encoding: string;
  billing: 'SCHOOL' | 'PLATFORM';
  purpose: string | null;
  provider: ProviderName | null;
  providerMessageId: string | null;
  senderId: string | null;
  status: SmsStatus;
  costUnits: number;
  freeUnits: number;
  refundedAt: string | null;
  error: string | null;
  sentAt: string | null;
  deliveredAt: string | null;
  createdAt: string;
}
export interface LedgerRow { id: string; type: LedgerType; units: number; freeUnits: number; balanceAfter: number; reason: string | null; createdAt: string; purchaseId: string | null }
export interface Purchase {
  id: string;
  institutionId: string;
  institutionName: string;
  packName: string | null;
  packNameBn: string | null;
  units: number;
  amount: number;
  currency: string;
  method: 'SSLCOMMERZ' | 'BKASH' | 'MANUAL';
  status: 'INITIATED' | 'PENDING' | 'SUCCESS' | 'FAILED' | 'CANCELLED';
  receiptNumber: string | null;
  reference: string | null;
  note: string | null;
  isDemo: boolean;
  paidAt: string | null;
  createdAt: string;
  demoAllowed: boolean;
}
export interface Paged<T> { data: T[]; meta: { page: number; pageSize: number; total: number } }
export interface LogFilters { status?: string; purpose?: string; provider?: string; billing?: string; institutionId?: string; search?: string; from?: string; to?: string; page?: number; pageSize?: number }

export interface AdminOverview {
  sold: { allTime: { units: number; amount: number; count: number }; thisMonth: { units: number; amount: number; count: number } };
  usedThisMonth: { messages: number; segments: number; paidUnits: number; freeUnits: number };
  platformThisMonth: { messages: number; segments: number };
  failedThisMonth: number;
  outstandingBalance: number;
  pendingSenderRequests: number;
  schools: { institutionId: string; name: string; balance: number; totalPurchased: number; totalUsed: number; lowBalanceThreshold: number; isLow: boolean; senderId: string | null }[];
  providers: { name: ProviderName; label: string; configured: boolean; role: 'PRIMARY' | 'FALLBACK' | 'UNUSED'; supportsBalance: boolean; supportsStatus: boolean; verified: boolean }[];
  mode: string;
  enforced: boolean;
  smsEnabled: boolean;
}

const BASE = '/sms-credits';
const ADMIN = '/sms-credits/admin';
const clean = (f: LogFilters) => Object.fromEntries(Object.entries(f).filter(([, v]) => v !== undefined && v !== ''));

// ── School ADMIN ──

export const useSmsOverview = () =>
  useQuery({ queryKey: ['sms', 'overview'], queryFn: async () => (await apiClient.get(`${BASE}/overview`)).data.data as Overview });

export const useSmsLog = (filters: LogFilters, admin = false) =>
  useQuery({
    queryKey: ['sms', admin ? 'admin-log' : 'log', filters],
    queryFn: async () => (await apiClient.get(`${admin ? ADMIN : BASE}/messages`, { params: clean(filters) })).data as Paged<SmsRow>,
    placeholderData: (prev) => prev,
  });

export const useSmsLedger = (page: number) =>
  useQuery({ queryKey: ['sms', 'ledger', page], queryFn: async () => (await apiClient.get(`${BASE}/ledger`, { params: { page, pageSize: 50 } })).data as Paged<LedgerRow> });

export const useMyPurchases = () =>
  useQuery({ queryKey: ['sms', 'purchases'], queryFn: async () => (await apiClient.get(`${BASE}/purchases`)).data.data as Purchase[] });

export const usePurchase = (id: string | undefined, admin = false) =>
  useQuery({
    queryKey: ['sms', 'purchase', id, admin],
    enabled: !!id,
    queryFn: async () => (await apiClient.get(`${admin ? ADMIN : BASE}/purchases/${id}`)).data.data as Purchase,
  });

export const useMySenderRequests = () =>
  useQuery({ queryKey: ['sms', 'sender'], queryFn: async () => (await apiClient.get(`${BASE}/sender-id`)).data.data as SenderRequest[] });

function useInvalidate() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ['sms'] });
}

export function useSaveSettings() {
  const inv = useInvalidate();
  return useMutation({ mutationFn: async (body: { lowBalanceThreshold: number }) => (await apiClient.put(`${BASE}/settings`, body)).data.data, onSuccess: inv });
}

export function useRequestSender() {
  const inv = useInvalidate();
  return useMutation({ mutationFn: async (body: { senderId: string; note?: string }) => (await apiClient.post(`${BASE}/sender-id`, body)).data.data, onSuccess: inv });
}

export function useCancelSender() {
  const inv = useInvalidate();
  return useMutation({ mutationFn: async (id: string) => (await apiClient.delete(`${BASE}/sender-id/${id}`)).data.data, onSuccess: inv });
}

export function useCheckout() {
  return useMutation({
    mutationFn: async (body: { packId: string; gateway: 'BKASH' | 'SSLCOMMERZ' }) =>
      (await apiClient.post(`${BASE}/checkout`, body)).data.data as { demo: boolean; paymentUrl: string; checkoutPath?: string; purchaseId: string; message: string },
  });
}

export function useDemoConfirm() {
  const inv = useInvalidate();
  return useMutation({
    mutationFn: async ({ id, outcome }: { id: string; outcome: 'success' | 'failure' }) =>
      (await apiClient.post(`${BASE}/purchases/${id}/demo-confirm`, { outcome })).data.data as { status: string; receiptNumber: string | null },
    onSuccess: inv,
  });
}

/** Downloads the CSV through the authenticated client (keeps the bearer token out of URLs). */
export async function downloadLogCsv(filters: LogFilters, admin = false) {
  const res = await apiClient.get(`${admin ? ADMIN : BASE}/messages/export`, { params: clean({ ...filters, page: undefined, pageSize: undefined }), responseType: 'blob' });
  const url = URL.createObjectURL(res.data as Blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `sms-log-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ── Super-admin ──

export const useAdminOverview = () =>
  useQuery({ queryKey: ['sms', 'admin-overview'], queryFn: async () => (await apiClient.get(`${ADMIN}/overview`)).data.data as AdminOverview });

export const useProviderBalances = (enabled: boolean) =>
  useQuery({
    queryKey: ['sms', 'provider-balances'],
    enabled,
    queryFn: async () => (await apiClient.get(`${ADMIN}/provider-balances`)).data.data as { name: ProviderName; ok: boolean; balance?: number; detail: string }[],
  });

export const useAdminPacks = () => useQuery({ queryKey: ['sms', 'admin-packs'], queryFn: async () => (await apiClient.get(`${ADMIN}/packs`)).data.data as Pack[] });

export const useSenderQueue = (status?: string) =>
  useQuery({ queryKey: ['sms', 'sender-queue', status], queryFn: async () => (await apiClient.get(`${ADMIN}/sender-requests`, { params: status ? { status } : {} })).data.data as SenderRequest[] });

export const useAdminPurchases = () => useQuery({ queryKey: ['sms', 'admin-purchases'], queryFn: async () => (await apiClient.get(`${ADMIN}/purchases`)).data.data as Purchase[] });

export function useSavePack() {
  const inv = useInvalidate();
  return useMutation({
    mutationFn: async ({ id, ...body }: Omit<Pack, 'id' | 'perUnit'> & { id?: string }) =>
      (id ? await apiClient.put(`${ADMIN}/packs/${id}`, body) : await apiClient.post(`${ADMIN}/packs`, body)).data.data,
    onSuccess: inv,
  });
}

export function useReviewSender() {
  const inv = useInvalidate();
  return useMutation({
    mutationFn: async ({ id, ...body }: { id: string; decision: 'APPROVE' | 'REJECT'; approvedValue?: string; provider?: ProviderName | null; reviewNote?: string }) =>
      (await apiClient.post(`${ADMIN}/sender-requests/${id}/review`, body)).data.data,
    onSuccess: inv,
  });
}

export function useClearSender() {
  const inv = useInvalidate();
  return useMutation({ mutationFn: async (institutionId: string) => (await apiClient.delete(`${ADMIN}/schools/${institutionId}/sender-id`)).data.data, onSuccess: inv });
}

export function useManualCredit() {
  const inv = useInvalidate();
  return useMutation({
    mutationFn: async ({ institutionId, ...body }: { institutionId: string; units: number; amount: number; reference?: string; reason: string }) =>
      (await apiClient.post(`${ADMIN}/schools/${institutionId}/credits`, body)).data.data as { receiptNumber: string; balance: number; id: string },
    onSuccess: inv,
  });
}

export function useAdjustCredits() {
  const inv = useInvalidate();
  return useMutation({
    mutationFn: async ({ institutionId, ...body }: { institutionId: string; type: 'ADJUST' | 'BONUS'; units: number; reason: string }) =>
      (await apiClient.post(`${ADMIN}/schools/${institutionId}/adjust`, body)).data.data as { balance: number },
    onSuccess: inv,
  });
}

/** Server error message for toasts. */
export function errorMessage(e: unknown, fallback: string): string {
  const r = (e as { response?: { data?: { message?: string; errors?: { message?: string }[] } } })?.response?.data;
  return r?.errors?.[0]?.message || r?.message || fallback;
}
