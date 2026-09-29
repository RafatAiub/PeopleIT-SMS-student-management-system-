// React Query hooks for the Wave C fee features: online-payment status/demo
// checkout, receipts, concessions, bulk invoicing, overdue sweep and
// reconciliation. Contracts verified against backend/src/modules/fees
// (fee.routes.ts + concessions/, bulk/, online/, reconciliation/).
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from '../../api/client';
import { FEES_INVOICES_KEY, FEES_INVOICE_KEY } from './hooks';
import type {
  ActiveConcessionRule,
  BulkInvoicePayload,
  BulkPreview,
  BulkResult,
  Concession,
  ConcessionAssignment,
  ConcessionType,
  DemoConfirmResult,
  GatewayMode,
  OnlineGateway,
  OnlineTransaction,
  Paginated,
  ReconciliationRow,
  ReconciliationSummary,
  FeeTxnStatus,
} from './types';

export const FEES_GATEWAYS_KEY = 'fees-gateways';
export const FEES_TXN_KEY = 'fees-online-txn';
export const FEES_CONCESSIONS_KEY = 'fees-concessions';
export const FEES_ASSIGNMENTS_KEY = 'fees-concession-assignments';
export const FEES_STUDENT_CONCESSIONS_KEY = 'fees-student-active-concessions';
export const FEES_RECON_KEY = 'fees-reconciliation';
export const FEES_BATCHES_KEY = 'fees-invoice-batches';

// ── Online payments ─────────────────────────────────────────────────────────

export function useGatewayModes(enabled = true) {
  return useQuery({
    queryKey: [FEES_GATEWAYS_KEY],
    queryFn: async (): Promise<{ gateways: GatewayMode[]; demo: boolean }> => {
      const { data } = await apiClient.get('/fees/payments/gateways');
      return data.data;
    },
    enabled,
    staleTime: 5 * 60 * 1000,
  });
}

export function useOnlineTransaction(txnId: string | null) {
  return useQuery({
    queryKey: [FEES_TXN_KEY, txnId],
    queryFn: async (): Promise<OnlineTransaction> => {
      const { data } = await apiClient.get(`/fees/payments/online/${txnId}`);
      return data.data;
    },
    enabled: !!txnId,
  });
}

export function useConfirmDemoPayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ txnId, outcome }: { txnId: string; outcome: 'success' | 'failure' }) => {
      const { data } = await apiClient.post(`/fees/payments/online/${txnId}/demo-confirm`, { outcome });
      return data.data as DemoConfirmResult;
    },
    onSuccess: (result, vars) => {
      qc.invalidateQueries({ queryKey: [FEES_TXN_KEY, vars.txnId] });
      qc.invalidateQueries({ queryKey: [FEES_INVOICES_KEY] });
      qc.invalidateQueries({ queryKey: [FEES_INVOICE_KEY, result.invoiceId] });
    },
  });
}

// ── Concessions ─────────────────────────────────────────────────────────────

export function useConcessions(params: { page: number; pageSize: number; search?: string; includeInactive?: boolean }) {
  return useQuery({
    queryKey: [FEES_CONCESSIONS_KEY, params],
    queryFn: async (): Promise<Paginated<Concession>> => {
      const { data } = await apiClient.get('/fees/concessions', {
        params: {
          page: params.page,
          pageSize: params.pageSize,
          ...(params.search ? { search: params.search } : {}),
          ...(params.includeInactive ? { includeInactive: 'true' } : {}),
        },
      });
      return data.data;
    },
    placeholderData: (prev) => prev,
  });
}

/** Active concessions (first 100) for pickers. */
export function useActiveConcessionOptions(enabled = true) {
  return useQuery({
    queryKey: [FEES_CONCESSIONS_KEY, 'options'],
    queryFn: async (): Promise<Concession[]> => {
      const { data } = await apiClient.get('/fees/concessions', { params: { page: 1, pageSize: 100 } });
      return data.data.items;
    },
    enabled,
  });
}

export interface ConcessionPayload {
  name: string;
  type: ConcessionType;
  value: number;
  feeCategoryId?: string | null;
  isActive?: boolean;
  description?: string | null;
}

export function useSaveConcession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...payload }: ConcessionPayload & { id?: string }) => {
      const { data } = id
        ? await apiClient.put(`/fees/concessions/${id}`, payload)
        : await apiClient.post('/fees/concessions', payload);
      return data.data as Concession;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [FEES_CONCESSIONS_KEY] }),
  });
}

export function useDeleteConcession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await apiClient.delete(`/fees/concessions/${id}`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [FEES_CONCESSIONS_KEY] }),
  });
}

export function useConcessionAssignments(params: { page: number; pageSize: number; search?: string; concessionId?: string; studentId?: string }) {
  return useQuery({
    queryKey: [FEES_ASSIGNMENTS_KEY, params],
    queryFn: async (): Promise<Paginated<ConcessionAssignment>> => {
      const q: Record<string, string | number> = { page: params.page, pageSize: params.pageSize };
      if (params.search) q.search = params.search;
      if (params.concessionId) q.concessionId = params.concessionId;
      if (params.studentId) q.studentId = params.studentId;
      const { data } = await apiClient.get('/fees/concessions/assignments', { params: q });
      return data.data;
    },
    placeholderData: (prev) => prev,
  });
}

export interface AssignConcessionPayload {
  studentId: string;
  concessionId: string;
  validFrom?: string | null;
  validTo?: string | null;
  note?: string | null;
}

export function useAssignConcession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: AssignConcessionPayload) => {
      const { data } = await apiClient.post('/fees/concessions/assignments', payload);
      return data.data as ConcessionAssignment;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [FEES_ASSIGNMENTS_KEY] });
      qc.invalidateQueries({ queryKey: [FEES_CONCESSIONS_KEY] });
      qc.invalidateQueries({ queryKey: [FEES_STUDENT_CONCESSIONS_KEY] });
    },
  });
}

export function useUnassignConcession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await apiClient.delete(`/fees/concessions/assignments/${id}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [FEES_ASSIGNMENTS_KEY] });
      qc.invalidateQueries({ queryKey: [FEES_CONCESSIONS_KEY] });
      qc.invalidateQueries({ queryKey: [FEES_STUDENT_CONCESSIONS_KEY] });
    },
  });
}

export function useStudentActiveConcessions(studentId: string | null) {
  return useQuery({
    queryKey: [FEES_STUDENT_CONCESSIONS_KEY, studentId],
    queryFn: async (): Promise<ActiveConcessionRule[]> => {
      const { data } = await apiClient.get(`/fees/concessions/students/${studentId}/active`);
      return data.data;
    },
    enabled: !!studentId,
  });
}

// ── Bulk invoicing & overdue ───────────────────────────────────────────────

export interface ClassOption {
  id: string;
  name: string;
}
export interface SectionOption {
  id: string;
  name: string;
  classId: string;
}

export function useClassOptions(enabled: boolean) {
  return useQuery({
    queryKey: ['fees-class-options'],
    queryFn: async (): Promise<ClassOption[]> => {
      const { data } = await apiClient.get('/academics/classes');
      return (data.data || []).map((c: { id: string; name: string }) => ({ id: c.id, name: c.name }));
    },
    enabled,
  });
}

export function useSectionOptions(classId: string | null) {
  return useQuery({
    queryKey: ['fees-section-options', classId],
    queryFn: async (): Promise<SectionOption[]> => {
      const { data } = await apiClient.get('/academics/sections', { params: { classId } });
      return (data.data || []).map((s: { id: string; name: string; classId: string }) => ({ id: s.id, name: s.name, classId: s.classId }));
    },
    enabled: !!classId,
  });
}

export function usePreviewBulkInvoices() {
  return useMutation({
    mutationFn: async (payload: BulkInvoicePayload) => {
      const { data } = await apiClient.post('/fees/invoices/bulk/preview', payload);
      return data.data as BulkPreview;
    },
  });
}

export function useGenerateBulkInvoices() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: BulkInvoicePayload) => {
      const { data } = await apiClient.post('/fees/invoices/bulk', payload);
      return data.data as BulkResult;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [FEES_INVOICES_KEY] });
      qc.invalidateQueries({ queryKey: [FEES_BATCHES_KEY] });
    },
  });
}

export function useMarkOverdue() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data } = await apiClient.post('/fees/invoices/mark-overdue');
      return data.data as { updated: number; cutoff: string };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [FEES_INVOICES_KEY] }),
  });
}

// ── Reconciliation ─────────────────────────────────────────────────────────

export interface ReconciliationFilters {
  page: number;
  pageSize: number;
  from?: string;
  to?: string;
  gateway?: OnlineGateway | '';
  status?: FeeTxnStatus | '';
}

export interface ReconciliationResponse extends Paginated<ReconciliationRow> {
  summary: ReconciliationSummary;
}

function reconParams(f: ReconciliationFilters) {
  const p: Record<string, string | number> = { page: f.page, pageSize: f.pageSize };
  if (f.from) p.from = f.from;
  if (f.to) p.to = f.to;
  if (f.gateway) p.gateway = f.gateway;
  if (f.status) p.status = f.status;
  return p;
}

export function useReconciliation(filters: ReconciliationFilters) {
  return useQuery({
    queryKey: [FEES_RECON_KEY, filters],
    queryFn: async (): Promise<ReconciliationResponse> => {
      const { data } = await apiClient.get('/fees/reconciliation', { params: reconParams(filters) });
      return data.data;
    },
    placeholderData: (prev) => prev,
  });
}

/** Fetches every page (100/page, capped at 50 pages) for export. */
export async function fetchAllReconciliation(filters: Omit<ReconciliationFilters, 'page' | 'pageSize'>): Promise<ReconciliationRow[]> {
  const rows: ReconciliationRow[] = [];
  for (let page = 1; page <= 50; page++) {
    const { data } = await apiClient.get('/fees/reconciliation', { params: reconParams({ ...filters, page, pageSize: 100 }) });
    const res = data.data as ReconciliationResponse;
    rows.push(...res.items);
    if (rows.length >= res.meta.total || res.items.length === 0) break;
  }
  return rows;
}
