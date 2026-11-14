// React Query hooks for P2 student fees (backend: modules/fees/student-fees).
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import apiClient from '../../../api/client';
import { FEES_INVOICE_KEY, FEES_INVOICES_KEY } from '../hooks';
import { FEES_BATCHES_KEY } from '../feeExtras.queries';

export const P2_SETTINGS_KEY = 'p2-fee-settings';
export const P2_FINE_RULES_KEY = 'p2-fine-rules';
export const P2_PROFILES_KEY = 'p2-fee-profiles';
export const P2_COUNTER_KEY = 'p2-counter';
export const P2_HISTORY_KEY = 'p2-invoice-history';
export const P2_REFUNDS_KEY = 'p2-refunds';

// ── Types ───────────────────────────────────────────────────────────────────

export interface MonthlySettings {
  autoGenerate: boolean;
  generateDay: number;
  dueDay: number;
  monthlyCategoryIds: string[];
  arrearsMode: 'SEPARATE' | 'ARREARS_LINE';
  lastAutoPeriod: string | null;
  lastAutoRunAt: string | null;
  lastRunSummary: { createdCount?: number; totalAmount?: number } | null;
  effectiveMonthlyCategories: { id: string; name: string }[];
}

export interface FineRule {
  id: string;
  feeCategoryId: string | null;
  categoryName: string | null;
  type: 'FLAT' | 'PERCENT';
  value: number;
  graceDays: number;
  recurrence: 'ONCE' | 'MONTHLY';
  maxAmount: number | null;
  isActive: boolean;
}
export type FineRulePayload = Omit<FineRule, 'id' | 'categoryName'>;

export interface FeeProfile {
  id: string;
  studentId: string;
  feeCategoryId: string | null;
  categoryName: string | null;
  kind: 'MONTHLY' | 'YEARLY';
  monthlyAmount: number | null;
  yearlyAmount: number | null;
  yearlyMode: 'SPREAD' | 'ONE_TIME';
  effectiveFrom: string;
  effectiveTo: string | null;
  reason: string;
  createdAt: string;
  endedAt: string | null;
  endReason: string | null;
  currentAmount: number | null;
  status: 'ACTIVE' | 'UPCOMING' | 'ENDED' | 'VOID';
  student?: { firstName: string; lastName: string; studentId: string; rollNumber: string | null; className: string | null; sectionName: string | null };
}

export interface ProfilePayload {
  feeCategoryId: string | null;
  kind: 'MONTHLY' | 'YEARLY';
  monthlyAmount?: number | null;
  yearlyAmount?: number | null;
  yearlyMode: 'SPREAD' | 'ONE_TIME';
  effectiveFrom: string;
  effectiveTo?: string | null;
  reason: string;
}

export interface MonthlyPreview {
  period: string;
  label: string;
  dueDate: string;
  arrearsMode: string;
  studentCount: number;
  invoiceCount: number;
  customRateCount: number;
  grossAmount: number;
  concessionAmount: number;
  totalAmount: number;
  skipped: { alreadyBilled: number; noFees: number; zeroTotal: number };
  byClass: { className: string; count: number; total: number }[];
}

export interface MonthlyResult {
  period: string;
  label: string;
  createdCount: number;
  skippedCount: number;
  failedCount: number;
  carriedForward: number;
  totalAmount: number;
}

export interface CounterStudent {
  id: string;
  name: string;
  studentId: string;
  rollNumber: string | null;
  className: string | null;
  sectionName: string | null;
  status: string;
  avatarUrl: string | null;
  totalDue: number;
  matchedBy: string;
  guardianName: string | null;
  guardianPhone?: string | null;
}

export interface CounterInvoice {
  id: string;
  invoiceNo: string;
  studentId: string;
  period: string | null;
  monthLabel: string | null;
  totalAmount: number;
  paidAmount: number;
  dueAmount: number;
  dueDate: string;
  status: string;
  items: { id: string; description: string; netAmount: number }[];
  fineTotal: number;
}

export interface CounterDues {
  student: CounterStudent;
  invoices: CounterInvoice[];
  totalDue: number;
  siblings: CounterStudent[];
  recentPayments: { id: string; invoiceId: string; amount: number; method: string; paidAt: string; receiptNo: string | null; status: string; invoiceNo: string }[];
}

export interface CollectPayload {
  studentId: string;
  allocations?: { invoiceId: string; amount: number }[];
  amount?: number;
  invoiceIds?: string[];
  method: string;
  reference?: string;
  notes?: string;
  discounts?: { invoiceId: string; amount: number }[];
  discountReason?: string;
}

export interface CollectResult {
  payments: { paymentId: string; receiptNo: string | null; invoiceId: string; invoiceNo: string; amount: number; dueAfter: number }[];
  total: number;
  discountTotal: number;
}

export interface TodayCollections {
  total: number;
  count: number;
  byMethod: { method: string; total: number; count: number }[];
  recent: { id: string; amount: number; method: string; paidAt: string; receiptNo: string | null; invoiceId: string; invoiceNo: string; studentName: string }[];
}

export interface InvoiceHistory {
  fines: { id: string; fineKey: string; amount: number; waivedAmount: number; waiveReason: string | null; createdAt: string }[];
  finesStopped: boolean;
  adjustments: { id: string; kind: string; amount: number; reason: string; createdAt: string }[];
  reversals: { id: string; paymentId: string; amount: number; appliedAmount: number; reason: string; createdAt: string }[];
  refunds: { id: string; paymentId: string | null; amount: number; method: string; reference: string | null; reason: string; createdAt: string }[];
}

export interface RefundInfo {
  paymentId: string;
  receiptNo: string | null;
  status: string;
  amount: number;
  gateway: boolean;
  refundable: number;
  refunds: { id: string; amount: number; method: string; reference: string | null; reason: string; createdAt: string }[];
}

const data = <T,>(p: Promise<{ data: { data: T } }>) => p.then((r) => r.data.data);

function invalidateMoney(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: [FEES_INVOICES_KEY] });
  qc.invalidateQueries({ queryKey: [FEES_INVOICE_KEY] });
  qc.invalidateQueries({ queryKey: [P2_COUNTER_KEY] });
  qc.invalidateQueries({ queryKey: [P2_HISTORY_KEY] });
  qc.invalidateQueries({ queryKey: [P2_REFUNDS_KEY] });
}

// ── Settings & fine rules ───────────────────────────────────────────────────

export function useFeeSettings(enabled = true) {
  return useQuery({ queryKey: [P2_SETTINGS_KEY], queryFn: () => data<MonthlySettings>(apiClient.get('/fees/settings/monthly')), enabled });
}

export function useSaveFeeSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<Pick<MonthlySettings, 'autoGenerate' | 'generateDay' | 'dueDay' | 'monthlyCategoryIds' | 'arrearsMode'>>) =>
      data<MonthlySettings>(apiClient.put('/fees/settings/monthly', body)),
    onSuccess: (s) => qc.setQueryData([P2_SETTINGS_KEY], s),
  });
}

export function useFineRules(enabled = true) {
  return useQuery({ queryKey: [P2_FINE_RULES_KEY], queryFn: () => data<FineRule[]>(apiClient.get('/fees/fine-rules')), enabled });
}

export function useSaveFineRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: Partial<FineRulePayload> & { id?: string }) =>
      data<FineRule>(id ? apiClient.put(`/fees/fine-rules/${id}`, body) : apiClient.post('/fees/fine-rules', body)),
    onSuccess: () => qc.invalidateQueries({ queryKey: [P2_FINE_RULES_KEY] }),
  });
}

export function useDeleteFineRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/fees/fine-rules/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: [P2_FINE_RULES_KEY] }),
  });
}

// ── Monthly generation ─────────────────────────────────────────────────────

export function usePreviewMonthly() {
  return useMutation({ mutationFn: (body: { period: string; classId?: string | null }) => data<MonthlyPreview>(apiClient.post('/fees/monthly/preview', body)) });
}

export function useGenerateMonthly() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { period: string; classId?: string | null }) => data<MonthlyResult>(apiClient.post('/fees/monthly/generate', body)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [FEES_INVOICES_KEY] });
      qc.invalidateQueries({ queryKey: [FEES_BATCHES_KEY] });
    },
  });
}

// ── Profiles ────────────────────────────────────────────────────────────────

export function useStudentFeeProfiles(studentId: string | null) {
  return useQuery({
    queryKey: [P2_PROFILES_KEY, 'student', studentId],
    queryFn: () => data<{ items: FeeProfile[] }>(apiClient.get(`/fees/profiles/students/${studentId}`)),
    enabled: !!studentId,
  });
}

export function useFeeProfileList(params: { page: number; pageSize: number; search?: string; classId?: string; sectionId?: string }) {
  return useQuery({
    queryKey: [P2_PROFILES_KEY, 'list', params],
    queryFn: () =>
      data<{ items: FeeProfile[]; meta: { total: number; page: number; pageSize: number } }>(
        apiClient.get('/fees/profiles', {
          params: Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined && v !== '')),
        }),
      ),
    placeholderData: (prev) => prev,
  });
}

export function useSaveFeeProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: ProfilePayload & { studentId?: string; studentIds?: string[] }): Promise<FeeProfile | { created: number }> =>
      body.studentIds ? data<{ created: number }>(apiClient.post('/fees/profiles/bulk', body)) : data<FeeProfile>(apiClient.post('/fees/profiles', body)),
    onSuccess: () => qc.invalidateQueries({ queryKey: [P2_PROFILES_KEY] }),
  });
}

export function useEndFeeProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string; effectiveTo?: string | null; reason: string }) => data<FeeProfile>(apiClient.post(`/fees/profiles/${id}/end`, body)),
    onSuccess: () => qc.invalidateQueries({ queryKey: [P2_PROFILES_KEY] }),
  });
}

// ── Counter ─────────────────────────────────────────────────────────────────

export function useCounterSearch(q: string) {
  return useQuery({
    queryKey: [P2_COUNTER_KEY, 'search', q],
    queryFn: () => data<CounterStudent[]>(apiClient.get('/fees/counter/search', { params: { q } })),
    enabled: q.trim().length >= 2,
    staleTime: 15_000,
  });
}

export function useCounterDues(studentId: string | null) {
  return useQuery({
    queryKey: [P2_COUNTER_KEY, 'dues', studentId],
    queryFn: () => data<CounterDues>(apiClient.get(`/fees/counter/students/${studentId}`)),
    enabled: !!studentId,
  });
}

export function useTodayCollections() {
  return useQuery({ queryKey: [P2_COUNTER_KEY, 'today'], queryFn: () => data<TodayCollections>(apiClient.get('/fees/counter/today')), refetchInterval: 60_000 });
}

export function useCollect() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CollectPayload) => data<CollectResult>(apiClient.post('/fees/counter/collect', body)),
    onSuccess: () => invalidateMoney(qc),
  });
}

// ── Adjustments ────────────────────────────────────────────────────────────

export function useInvoiceHistory(invoiceId: string | null, enabled = true) {
  return useQuery({
    queryKey: [P2_HISTORY_KEY, invoiceId],
    queryFn: () => data<InvoiceHistory>(apiClient.get(`/fees/invoices/${invoiceId}/history`)),
    enabled: !!invoiceId && enabled,
  });
}

export function useCancelInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ invoiceId, reason }: { invoiceId: string; reason: string }) => data(apiClient.post(`/fees/invoices/${invoiceId}/cancel`, { reason })),
    onSuccess: () => invalidateMoney(qc),
  });
}

export function useReversePayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ paymentId, reason }: { paymentId: string; reason: string }) =>
      data<{ refundable: number; gateway: boolean }>(apiClient.post(`/fees/payments/${paymentId}/reverse`, { reason })),
    onSuccess: () => invalidateMoney(qc),
  });
}

export function useRefundInfo(paymentId: string | null) {
  return useQuery({
    queryKey: [P2_REFUNDS_KEY, paymentId],
    queryFn: () => data<RefundInfo>(apiClient.get(`/fees/payments/${paymentId}/refunds`)),
    enabled: !!paymentId,
  });
}

export function useRecordRefund() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ paymentId, ...body }: { paymentId: string; amount: number; method: string; reference?: string; reason: string }) =>
      data(apiClient.post(`/fees/payments/${paymentId}/refunds`, body)),
    onSuccess: () => invalidateMoney(qc),
  });
}

export function useWaiveFine() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ invoiceId, fineId, reason, stopFuture }: { invoiceId: string; fineId: string; reason: string; stopFuture: boolean }) =>
      data(apiClient.post(`/fees/invoices/${invoiceId}/fines/${fineId}/waive`, { reason, stopFuture })),
    onSuccess: () => invalidateMoney(qc),
  });
}
