import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import apiClient from '@/api/client';
import type { Award } from '../character/character.api';

// =============================================================================
// T3 family profile — data layer (/api/v1/families/...). No module switch.
// =============================================================================

const KEY = ['families'] as const;

export interface FamilyGuardian {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  email?: string | null;
  relationship: string;
  occupation?: string | null;
  emergencyPhone?: string | null;
  avatarUrl?: string | null;
  hasLogin?: boolean;
  isPrimary?: boolean;
  inOtherFamily?: boolean;
}

export interface UnpaidInvoice {
  id: string;
  invoiceNo: string;
  totalAmount: number;
  dueAmount: number;
  dueDate: string;
  status: string;
}

export interface FamilyChild {
  id: string;
  studentId: string;
  firstName: string;
  lastName: string;
  avatarUrl: string | null;
  rollNumber: string | null;
  status: string;
  class: { id: string; name: string } | null;
  section: { id: string; name: string } | null;
  attendance: { total: number; present: number; absent: number; late: number; halfDay: number; rate: number | null };
  fees: { due: number; overdue: number; count: number; unpaid: UnpaidInvoice[] } | null;
  character: {
    points: number;
    overall: number | null;
    band: { en: string; bn: string } | null;
    periodName: string | null;
    badges: Award[];
    badgeCount: number;
  } | null;
}

export interface FamilyProfile {
  view: 'staff' | 'teacher' | 'guardian';
  family: { id: string; name: string; primaryGuardianId: string | null; source: string; createdAt: string };
  guardians: FamilyGuardian[];
  otherGuardians: FamilyGuardian[];
  children: FamilyChild[];
  attendanceWindow: { from: string; to: string; label: string | null };
  fees: { due: number; overdue: number; count: number } | null;
  recentPayments: Array<{ id: string; amount: number; method: string; paidAt: string; receiptNo: string | null; invoiceNo: string; studentId: string; familyPaymentId: string | null }>;
  familyPayments: Array<{ id: string; source: string; method: string; amount: number; completedAt: string | null; isDemo: boolean; invoiceCount: number }>;
  notes: Array<{ id: string; body: string; authorId: string | null; authorName: string; createdAt: string }>;
  documents: Array<{ id: string; studentId: string; name: string; type: string; fileUrl: string; uploadedAt: string }>;
  donations: { total: number; count: number; recent: Array<{ id: string; amount: number; paidAt: string | null; receiptNo: string | null; fund: { name: string; nameBn: string | null } }> } | null;
  concessions: {
    active: Array<{ id: string; studentId: string; concession: { id: string; name: string; type: string; value: number } }>;
    available: Array<{ id: string; name: string; type: string; value: number }>;
  } | null;
  permissions: { canEdit: boolean; canNotes: boolean; canPayOffline: boolean; canConcession: boolean; canPayOnline: boolean };
}

export interface FamilyListItem {
  id: string;
  name: string;
  source: string;
  guardians: Array<{ guardian: { id: string; firstName: string; lastName: string; phone: string } }>;
  students: Array<{ student: { id: string; firstName: string; lastName: string; class: { name: string } | null; section: { name: string } | null } }>;
  _count: { students: number; guardians: number };
}

export interface FamilySearchHit {
  id: string;
  name: string;
  guardians: string[];
  children: string[];
  childCount: number;
}

export interface FamilyPaymentStatus {
  id: string;
  familyId: string;
  source: string;
  gateway: string | null;
  method: string;
  amount: number;
  status: 'INITIATED' | 'PENDING' | 'SUCCESS' | 'FAILED' | 'CANCELLED';
  isDemo: boolean;
  allocations: Array<{ invoiceId: string; invoiceNo: string; studentName: string; amount: number; receiptNo: string | null }>;
}

export function apiErrorMessage(error: unknown, fallback: string): string {
  const e = error as { response?: { data?: { message?: string; errors?: { message?: string }[] } } };
  const first = Array.isArray(e?.response?.data?.errors) ? e.response?.data?.errors?.[0]?.message : undefined;
  return e?.response?.data?.message && e.response.data.message !== 'Validation failed' ? e.response.data.message : first || e?.response?.data?.message || fallback;
}

async function getData<T>(url: string, params?: Record<string, unknown>): Promise<T> {
  const { data } = await apiClient.get(url, { params });
  return data?.data as T;
}

export const useFamilies = (params: { q?: string; page?: number; pageSize?: number }) =>
  useQuery({
    queryKey: [...KEY, 'list', params],
    queryFn: async () => {
      const { data } = await apiClient.get('/families', { params: Object.fromEntries(Object.entries(params).filter(([, v]) => v !== '' && v != null)) });
      return { items: (data?.data ?? []) as FamilyListItem[], total: (data?.meta?.total ?? 0) as number };
    },
  });

export const useFamily = (id: string | undefined) =>
  useQuery({ queryKey: [...KEY, 'one', id], enabled: Boolean(id), queryFn: () => getData<FamilyProfile>(`/families/${id}`) });

export const useMyFamily = (enabled = true) =>
  useQuery({ queryKey: [...KEY, 'mine'], enabled, queryFn: () => getData<FamilyProfile | null>('/families/mine') });

export const useFamilySearch = (q: string, enabled: boolean) =>
  useQuery({
    queryKey: [...KEY, 'search', q],
    enabled: enabled && q.trim().length >= 2,
    staleTime: 30_000,
    queryFn: () => getData<FamilySearchHit[]>('/families/search', { q: q.trim() }),
  });

export const useFamilyPayment = (id: string | undefined) =>
  useQuery({ queryKey: [...KEY, 'payment', id], enabled: Boolean(id), queryFn: () => getData<FamilyPaymentStatus>(`/families/payments/${id}`) });

export const fetchFamilyIdForStudent = (studentId: string) => getData<{ familyId: string | null }>(`/families/by-student/${studentId}`);
export const fetchFamilyIdForGuardian = (guardianId: string) => getData<{ familyId: string | null }>(`/families/by-guardian/${guardianId}`);

const send = async (method: 'post' | 'put' | 'delete', url: string, body?: unknown) => {
  const { data } = method === 'delete' ? await apiClient.delete(url) : await apiClient[method](url, body ?? {});
  return data?.data;
};
function useInvalidating<TVars, TResult = unknown>(fn: (vars: TVars) => Promise<TResult>) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: fn, onSuccess: () => qc.invalidateQueries({ queryKey: KEY }) });
}

export const useUpdateFamily = () => useInvalidating((v: { id: string; body: { name?: string; primaryGuardianId?: string | null } }) => send('put', `/families/${v.id}`, v.body));
export const useAddMembers = () => useInvalidating((v: { id: string; studentIds?: string[]; guardianIds?: string[] }) => send('post', `/families/${v.id}/members`, { studentIds: v.studentIds ?? [], guardianIds: v.guardianIds ?? [] }));
export const useRemoveStudent = () => useInvalidating((v: { id: string; studentId: string }) => send('delete', `/families/${v.id}/students/${v.studentId}`) as Promise<{ familyId: string }>);
export const useRemoveGuardian = () => useInvalidating((v: { id: string; guardianId: string }) => send('delete', `/families/${v.id}/guardians/${v.guardianId}`));
export const useMergeFamily = () => useInvalidating((v: { id: string; otherFamilyId: string }) => send('post', `/families/${v.id}/merge`, { otherFamilyId: v.otherFamilyId }));
export const useAddNote = () => useInvalidating((v: { id: string; body: string }) => send('post', `/families/${v.id}/notes`, { body: v.body }));
// T5: delete = move to the trash (ADMIN); the response carries the trash entry for Undo.
export const useDeleteFamily = () => useInvalidating((id: string) => send('delete', `/families/${id}`));
export const useDeleteNote = () => useInvalidating((v: { id: string; noteId: string }) => send('delete', `/families/${v.id}/notes/${v.noteId}`));
export const useSiblingConcession = () =>
  useInvalidating((v: { id: string; concessionId: string; studentIds: string[] }) => send('post', `/families/${v.id}/sibling-concession`, { concessionId: v.concessionId, studentIds: v.studentIds }) as Promise<{ applied: number }>);
export const usePayOnline = () =>
  useMutation({
    mutationFn: (v: { id: string; method: 'BKASH' | 'NAGAD' | 'SSLCOMMERZ' }) =>
      send('post', `/families/${v.id}/pay-online`, { method: v.method }) as Promise<{ paymentId: string; demo: boolean; paymentUrl: string; checkoutPath?: string; amount: number }>,
  });
export const useDemoConfirm = () =>
  useInvalidating((v: { paymentId: string; outcome: 'success' | 'failure' }) => send('post', `/families/payments/${v.paymentId}/demo-confirm`, { outcome: v.outcome }) as Promise<{ status: string }>);
export const useOfflinePayment = () =>
  useInvalidating((v: { id: string; amount: number; method: 'CASH' | 'BANK_TRANSFER'; transactionRef?: string; notes?: string; allocations?: Array<{ invoiceId: string; amount: number }> }) => {
    const { id, ...body } = v;
    return send('post', `/families/${id}/payments/offline`, body) as Promise<{ familyPaymentId: string; payments: Array<{ receiptNo: string; amount: number }> }>;
  });
