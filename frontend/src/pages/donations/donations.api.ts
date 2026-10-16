import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import apiClient from '@/api/client';
import { useModuleEnabled } from '@/hooks/useModules';

// =============================================================================
// T1 donations — dashboard data layer (GET/POST /api/v1/donations/...).
// Every query is disabled while the school has the module off, so a
// switched-off module never fires requests that would 403.
// =============================================================================

export const MODULE_KEY = 'islamic.donations';

export type FundType = 'ZAKAT' | 'SADAQAH' | 'WAQF' | 'LILLAH' | 'BUILDING' | 'GENERAL' | 'OTHER';
export type DonationMethod = 'CASH' | 'BANK' | 'BKASH' | 'NAGAD' | 'SSLCOMMERZ' | 'OTHER';
export type DonationStatus = 'PENDING' | 'PAID' | 'FAILED' | 'REFUNDED';
export type PledgeStatus = 'ACTIVE' | 'PAUSED' | 'CANCELLED';
export type DueState = 'inactive' | 'overdue' | 'due' | 'upcoming';

export const FUND_TYPES: FundType[] = ['ZAKAT', 'SADAQAH', 'WAQF', 'LILLAH', 'BUILDING', 'GENERAL', 'OTHER'];
export const FUND_TYPE_LABEL: Record<FundType, { en: string; bn: string }> = {
  ZAKAT: { en: 'Zakat', bn: 'যাকাত' },
  SADAQAH: { en: 'Sadaqah', bn: 'সদকা' },
  WAQF: { en: 'Waqf', bn: 'ওয়াকফ' },
  LILLAH: { en: 'Lillah', bn: 'লিল্লাহ' },
  BUILDING: { en: 'Building', bn: 'নির্মাণ' },
  GENERAL: { en: 'General', bn: 'সাধারণ' },
  OTHER: { en: 'Other', bn: 'অন্যান্য' },
};
export const METHOD_LABEL: Record<DonationMethod, string> = {
  CASH: 'Cash',
  BANK: 'Bank',
  BKASH: 'bKash',
  NAGAD: 'Nagad',
  SSLCOMMERZ: 'Card / SSLCommerz',
  OTHER: 'Other',
};
export const OFFLINE_METHODS: DonationMethod[] = ['CASH', 'BANK', 'BKASH', 'NAGAD', 'OTHER'];

export interface Fund {
  id: string;
  name: string;
  nameBn: string | null;
  type: FundType;
  description: string | null;
  goalAmount: number | null;
  active: boolean;
  showOnWebsite: boolean;
  collected: number;
  disbursed: number;
  balance: number;
  progress: number | null;
}

export interface Donor {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  anonymous: boolean;
  notes: string | null;
  userId: string | null;
  user?: { id: string; firstName: string; lastName: string; role: string } | null;
  totalGiven?: number;
  donationCount?: number;
}

export interface Campaign {
  id: string;
  fundId: string;
  fund?: { id: string; name: string; nameBn: string | null; type: FundType };
  title: string;
  titleBn: string | null;
  description: string | null;
  goalAmount: number | null;
  startDate: string | null;
  endDate: string | null;
  coverImageUrl: string | null;
  isPublic: boolean;
  raised: number;
  donationCount: number;
  progress: number | null;
}

export interface Donation {
  id: string;
  reference: string;
  receiptNo: string | null;
  fundId: string;
  fund: { name: string; nameBn: string | null; type: FundType };
  campaign?: { title: string } | null;
  donorId: string | null;
  donorName: string | null;
  donorPhone: string | null;
  donorEmail: string | null;
  anonymous: boolean;
  amount: number;
  currency: string;
  method: DonationMethod;
  status: DonationStatus;
  source: 'ADMIN' | 'ONLINE';
  paidAt: string | null;
  note: string | null;
  isDemo: boolean;
  refundReason: string | null;
  createdAt: string;
}

export interface Pledge {
  id: string;
  donorId: string;
  donor: { id: string; name: string; phone: string | null; email: string | null; userId: string | null };
  fundId: string;
  fund: { id: string; name: string; nameBn: string | null; type: FundType };
  amount: number;
  dayOfMonth: number;
  status: PledgeStatus;
  nextDueDate: string;
  lastPaidAt: string | null;
  lastReminderAt: string | null;
  remindEmail: boolean;
  remindSms: boolean;
  note: string | null;
  dueState: DueState;
  remindedThisMonth: boolean;
}

export interface Disbursement {
  id: string;
  fundId: string;
  fund: { name: string; nameBn: string | null; type: FundType };
  amount: number;
  paidTo: string;
  purpose: string | null;
  date: string;
  note: string | null;
}

export interface FundBalance {
  fundId: string;
  name: string;
  nameBn: string | null;
  type: FundType;
  collected: number;
  disbursed: number;
  balance: number;
  goalAmount: number | null;
  progress: number | null;
}

export interface DonationReport {
  total: number;
  count: number;
  byFund: { fundId: string; name: string; nameBn: string | null; type: FundType; total: number; count: number; disbursed: number }[];
  byMethod: { method: DonationMethod; label: string; total: number; count: number }[];
  byMonth: { month: string; total: number; count: number }[];
  zakat: { collected: number; distributed: number; balance: number; allTimeCollected: number; allTimeDistributed: number };
  fundBalances: FundBalance[];
}

export interface DonationSummary {
  thisMonth: { total: number; count: number };
  zakat: { collected: number; disbursed: number; balance: number };
  pledgesDueThisMonth: number;
  recent: { id: string; donorName: string | null; amount: number; paidAt: string; fund: { name: string; nameBn: string | null } }[];
}

export interface Receipt {
  institution: { name: string; logoUrl: string | null; address: string | null; phone: string | null; email: string | null };
  receiptNo: string;
  reference: string;
  status: DonationStatus;
  paidAt: string | null;
  donorName: string | null;
  anonymous: boolean;
  donorPhone: string | null;
  fund: { name: string; nameBn: string | null; type: FundType };
  campaign: { title: string; titleBn: string | null } | null;
  amount: number;
  currency: string;
  method: DonationMethod;
  methodLabel: string;
  amountInWords: { en: string; bn: string };
  note: string | null;
  refundedAt: string | null;
}

export interface MyDonations {
  total: number;
  donations: { id: string; receiptNo: string | null; reference: string; amount: number; currency: string; method: DonationMethod; status: DonationStatus; paidAt: string | null; fund: { name: string; nameBn: string | null; type: FundType }; campaign: { title: string; titleBn: string | null } | null }[];
  pledges: { id: string; amount: number; dayOfMonth: number; nextDueDate: string; status: PledgeStatus; fund: { name: string; nameBn: string | null }; dueState: DueState }[];
}

export interface Paged<T> {
  items: T[];
  total: number;
  extra?: Record<string, unknown>;
}

const KEY = ['donations'] as const;

export function apiErrorMessage(error: unknown, fallback: string): string {
  const e = error as { response?: { data?: { message?: string; errors?: { message?: string }[] } } };
  const first = Array.isArray(e?.response?.data?.errors) ? e.response?.data?.errors?.[0]?.message : undefined;
  return e?.response?.data?.message && e.response.data.message !== 'Validation failed' ? e.response.data.message : first || e?.response?.data?.message || fallback;
}

function useOn() {
  return useModuleEnabled(MODULE_KEY);
}

async function getData<T>(url: string, params?: Record<string, unknown>): Promise<T> {
  const { data } = await apiClient.get(url, { params });
  return data?.data as T;
}

async function getPaged<T>(url: string, params?: Record<string, unknown>): Promise<Paged<T>> {
  const { data } = await apiClient.get(url, { params });
  const { data: items, meta, success: _s, message: _m, ...extra } = data ?? {};
  return { items: (items ?? []) as T[], total: meta?.total ?? 0, extra };
}

/* ── Queries ──────────────────────────────────────────────────────────────── */

export function useDonationSummary(enabled = true) {
  const on = useOn();
  return useQuery({ queryKey: [...KEY, 'summary'], enabled: on && enabled, queryFn: () => getData<DonationSummary>('/donations/summary') });
}

export function useFunds() {
  const on = useOn();
  return useQuery({ queryKey: [...KEY, 'funds'], enabled: on, queryFn: () => getData<Fund[]>('/donations/funds') });
}

export function useDonors(params: { q?: string; page?: number; pageSize?: number }) {
  const on = useOn();
  return useQuery({ queryKey: [...KEY, 'donors', params], enabled: on, queryFn: () => getPaged<Donor>('/donations/donors', params) });
}

export function useCampaigns() {
  const on = useOn();
  return useQuery({ queryKey: [...KEY, 'campaigns'], enabled: on, queryFn: () => getData<Campaign[]>('/donations/campaigns') });
}

export interface DonationFilters {
  fundId?: string;
  status?: DonationStatus | '';
  method?: DonationMethod | '';
  source?: 'ADMIN' | 'ONLINE' | '';
  q?: string;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}

export function cleanParams<T extends object>(p: T): Record<string, unknown> {
  return Object.fromEntries(Object.entries(p).filter(([, v]) => v !== '' && v !== undefined && v !== null));
}

export function useDonations(filters: DonationFilters) {
  const on = useOn();
  return useQuery({
    queryKey: [...KEY, 'records', filters],
    enabled: on,
    queryFn: () => getPaged<Donation>('/donations/records', cleanParams(filters)),
  });
}

export function usePledges(params: { status?: PledgeStatus | ''; dueThisMonth?: boolean; page?: number; pageSize?: number }) {
  const on = useOn();
  return useQuery({ queryKey: [...KEY, 'recurring', params], enabled: on, queryFn: () => getPaged<Pledge>('/donations/recurring', cleanParams(params)) });
}

export function useDisbursements(params: { fundId?: string; page?: number; pageSize?: number }) {
  const on = useOn();
  return useQuery({ queryKey: [...KEY, 'disbursements', params], enabled: on, queryFn: () => getPaged<Disbursement>('/donations/disbursements', cleanParams(params)) });
}

export function useDonationReport(params: { from?: string; to?: string }) {
  const on = useOn();
  return useQuery({ queryKey: [...KEY, 'report', params], enabled: on, queryFn: () => getData<DonationReport>('/donations/reports/summary', cleanParams(params)) });
}

export function useReceipt(id: string | undefined, mine = false) {
  const on = useOn();
  return useQuery({
    queryKey: [...KEY, 'receipt', mine ? 'mine' : 'staff', id],
    enabled: on && Boolean(id),
    queryFn: () => getData<Receipt>(mine ? `/donations/mine/${id}/receipt` : `/donations/records/${id}/receipt`),
  });
}

export function useMyDonations() {
  const on = useOn();
  return useQuery({ queryKey: [...KEY, 'mine'], enabled: on, queryFn: () => getData<MyDonations>('/donations/mine') });
}

/* ── Mutations ────────────────────────────────────────────────────────────── */

function useInvalidating<TVars, TResult = unknown>(fn: (vars: TVars) => Promise<TResult>) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: fn, onSuccess: () => qc.invalidateQueries({ queryKey: KEY }) });
}

const send = async (method: 'post' | 'put' | 'delete', url: string, body?: unknown) => {
  const { data } = method === 'delete' ? await apiClient.delete(url) : await apiClient[method](url, body ?? {});
  return data?.data;
};

export const useSaveFund = () => useInvalidating((v: { id?: string; body: Record<string, unknown> }) => (v.id ? send('put', `/donations/funds/${v.id}`, v.body) : send('post', '/donations/funds', v.body)));
export const useDeleteFund = () => useInvalidating((id: string) => send('delete', `/donations/funds/${id}`));
export const useSaveDonor = () => useInvalidating((v: { id?: string; body: Record<string, unknown> }) => (v.id ? send('put', `/donations/donors/${v.id}`, v.body) : send('post', '/donations/donors', v.body)));
export const useDeleteDonor = () => useInvalidating((id: string) => send('delete', `/donations/donors/${id}`));
export const useSaveCampaign = () => useInvalidating((v: { id?: string; body: Record<string, unknown> }) => (v.id ? send('put', `/donations/campaigns/${v.id}`, v.body) : send('post', '/donations/campaigns', v.body)));
export const useDeleteCampaign = () => useInvalidating((id: string) => send('delete', `/donations/campaigns/${id}`));
export const useRecordDonation = () => useInvalidating((body: Record<string, unknown>) => send('post', '/donations/records', body) as Promise<Donation>);
export const useRefundDonation = () => useInvalidating((v: { id: string; reason: string }) => send('post', `/donations/records/${v.id}/refund`, { reason: v.reason }));
export const useEmailReceipt = () => useMutation({ mutationFn: (id: string) => send('post', `/donations/records/${id}/email-receipt`) as Promise<{ sent: boolean; reason?: string }> });
export const useSavePledge = () => useInvalidating((v: { id?: string; body: Record<string, unknown> }) => (v.id ? send('put', `/donations/recurring/${v.id}`, v.body) : send('post', '/donations/recurring', v.body)));
export const useDeletePledge = () => useInvalidating((id: string) => send('delete', `/donations/recurring/${id}`));
export const useSendReminders = () =>
  useInvalidating((ids?: string[]) => send('post', '/donations/recurring/remind', ids?.length ? { ids } : {}) as Promise<{ reminded: number; skipped: number }>);
export const useSaveDisbursement = () => useInvalidating((body: Record<string, unknown>) => send('post', '/donations/disbursements', body));
export const useDeleteDisbursement = () => useInvalidating((id: string) => send('delete', `/donations/disbursements/${id}`));

/** Downloads the filtered donations as CSV (authenticated blob request). */
export async function downloadDonationsCsv(filters: DonationFilters): Promise<void> {
  const { page: _p, pageSize: _ps, ...rest } = filters;
  const res = await apiClient.get('/donations/records/export.csv', { params: cleanParams(rest), responseType: 'blob' });
  const url = URL.createObjectURL(res.data as Blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `donations-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
