// React Query hooks for the fees screens, wired to the real backend contract
// (verified against backend/src/modules/fees). Kept local to this screen per
// the redesign brief ("helpers private to your screen go next to your
// files") — the pre-existing frontend/src/hooks/useFees.ts and
// frontend/src/api/fees.api.ts model a different (stale) API shape
// (invoiceNumber, lineItems, /fees/payments, SSL_COMMERZ, ...) that doesn't
// match the live routes/dtos, so they are intentionally not reused here.
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from '../../api/client';
import type {
  InvoiceListItem,
  InvoiceDetail,
  InvoiceSummary,
  FeeCategory,
  CategorySummary,
  PaymentMethod,
} from './types';

export const FEES_INVOICES_KEY = 'fees-invoices';
export const FEES_INVOICE_KEY = 'fees-invoice';
export const FEES_CATEGORIES_KEY = 'fees-categories';
export const FEES_MY_CHILDREN_KEY = 'fees-my-children';

export interface InvoiceListFilters {
  page: number;
  pageSize: number;
  status?: string;
  search?: string;
}

interface InvoiceListResponse {
  data: InvoiceListItem[];
  meta: { total: number; page: number; pageSize: number; totalPages: number };
  summary: InvoiceSummary;
}

export function useInvoicesList(filters: InvoiceListFilters) {
  return useQuery({
    queryKey: [FEES_INVOICES_KEY, filters],
    queryFn: async (): Promise<InvoiceListResponse> => {
      const params: Record<string, any> = { page: filters.page, pageSize: filters.pageSize };
      if (filters.status) params.status = filters.status;
      if (filters.search) params.search = filters.search;
      const { data } = await apiClient.get('/fees/invoices', { params });
      return data;
    },
    placeholderData: (prev) => prev,
  });
}

export function useInvoiceDetail(invoiceId: string | null) {
  return useQuery({
    queryKey: [FEES_INVOICE_KEY, invoiceId],
    queryFn: async (): Promise<InvoiceDetail> => {
      const { data } = await apiClient.get(`/fees/invoices/${invoiceId}`);
      return data.data;
    },
    enabled: !!invoiceId,
  });
}

export interface CreateInvoiceItemInput {
  feeCategoryId: string;
  description: string;
  amount: number;
  discount: number;
}

export interface CreateInvoicePayload {
  studentId: string;
  dueDate: string; // ISO datetime
  notes?: string;
  items: CreateInvoiceItemInput[];
}

export function useCreateInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: CreateInvoicePayload) => {
      const { data } = await apiClient.post('/fees/invoices', payload);
      return data.data as InvoiceDetail;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [FEES_INVOICES_KEY] });
    },
  });
}

export interface RecordPaymentPayload {
  invoiceId: string;
  amount: number;
  method: PaymentMethod;
  transactionRef?: string;
  notes?: string;
}

export function useRecordOfflinePayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ invoiceId, ...body }: RecordPaymentPayload) => {
      const { data } = await apiClient.post(`/fees/invoices/${invoiceId}/payments/offline`, body);
      return data.data;
    },
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: [FEES_INVOICES_KEY] });
      qc.invalidateQueries({ queryKey: [FEES_INVOICE_KEY, variables.invoiceId] });
    },
  });
}

interface CategoryListResponse {
  data: FeeCategory[];
  summary: CategorySummary;
}

export function useFeeCategoriesList(includeInactive: boolean) {
  return useQuery({
    queryKey: [FEES_CATEGORIES_KEY, includeInactive],
    queryFn: async (): Promise<CategoryListResponse> => {
      const { data } = await apiClient.get('/fees/categories', { params: includeInactive ? { includeInactive: 'true' } : {} });
      return data;
    },
  });
}

export interface CategoryPayload {
  name: string;
  description?: string;
  amount: number;
  frequency: string;
}

export function useCreateFeeCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: CategoryPayload) => {
      const { data } = await apiClient.post('/fees/categories', payload);
      return data.data as FeeCategory;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [FEES_CATEGORIES_KEY] }),
  });
}

export function useUpdateFeeCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...payload }: Partial<CategoryPayload> & { id: string; isActive?: boolean }) => {
      const { data } = await apiClient.put(`/fees/categories/${id}`, payload);
      return data.data as FeeCategory;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [FEES_CATEGORIES_KEY] }),
  });
}

export function useDeleteFeeCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await apiClient.delete(`/fees/categories/${id}`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [FEES_CATEGORIES_KEY] }),
  });
}

// ── Student/Guardian self-service (MyInvoices) ──────────────────────────────

export interface LinkedChild {
  id: string;
  studentId: string;
  firstName: string;
  lastName: string;
}

/** GUARDIAN only — the guardian's own linked children (`/guardians/me/students`). */
export function useLinkedChildren(enabled: boolean) {
  return useQuery({
    queryKey: [FEES_MY_CHILDREN_KEY],
    queryFn: async (): Promise<LinkedChild[]> => {
      const { data } = await apiClient.get('/guardians/me/students');
      return data.data || [];
    },
    enabled,
  });
}

/**
 * STUDENT/GUARDIAN invoice list. The backend scopes /fees/invoices to the
 * caller's own student (STUDENT) or *all* linked children (GUARDIAN) — for
 * GUARDIAN it does not currently accept a studentId filter (see
 * FeeService.listInvoices: studentIdIn always covers every linked child), so
 * a single child's invoices are isolated client-side by matching the human-
 * readable studentId already shown to guardians in the child switcher.
 */
export function useMyInvoicesList() {
  return useQuery({
    queryKey: [FEES_INVOICES_KEY, 'self'],
    queryFn: async (): Promise<InvoiceListItem[]> => {
      const { data } = await apiClient.get('/fees/invoices', { params: { pageSize: 100, page: 1 } });
      return data.data || [];
    },
  });
}

export function useInitiateOnlinePayment() {
  return useMutation({
    mutationFn: async ({ invoiceId, method, callbackUrl }: { invoiceId: string; method: Exclude<PaymentMethod, 'CASH' | 'BANK_TRANSFER'>; callbackUrl: string }) => {
      const { data } = await apiClient.post(`/fees/invoices/${invoiceId}/payments/online`, { method, callbackUrl });
      return data.data;
    },
  });
}
