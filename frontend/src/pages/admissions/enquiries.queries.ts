import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import apiClient from '@/api/client';
import type {
  ClassOption,
  ConvertFormValues,
  ConvertResult,
  Enquiry,
  EnquiryAssignee,
  EnquiryFormValues,
  EnquiryFunnel,
  EnquiryStatus,
  BoardColumn,
} from './enquiries.types';
import { toConvertPayload, toEnquiryPayload } from './enquiries.types';

// =============================================================================
// Admission Enquiries — React Query data layer for /enquiries (SUPER_ADMIN,
// ADMIN only). Endpoints per backend/src/modules/enquiries/enquiries.routes.ts.
// =============================================================================

export const ENQUIRIES_KEY = 'enquiries';
export const ENQUIRY_BOARD_KEY = 'enquiry-board';
export const ENQUIRY_FUNNEL_KEY = 'enquiry-funnel';
export const ENQUIRY_ASSIGNEES_KEY = 'enquiry-assignees';
export const ENQUIRY_CLASSES_KEY = 'enquiry-classes';
/** Shares its cache with frontend/src/pages/settings/settings.queries.ts —
 * same endpoint, read-only here (just need the slug for the public link). */
export const INSTITUTION_WEBSITE_KEY = ['institution-website'] as const;

function errorMessage(error: any, fallback: string) {
  return error.response?.data?.message || fallback;
}

function invalidateAll(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: [ENQUIRIES_KEY] });
  qc.invalidateQueries({ queryKey: [ENQUIRY_BOARD_KEY] });
  qc.invalidateQueries({ queryKey: [ENQUIRY_FUNNEL_KEY] });
}

// ── List ─────────────────────────────────────────────────────────────────────

export interface EnquiryListParams {
  page: number;
  pageSize: number;
  search?: string;
  status?: EnquiryStatus | '';
  assignedToUserId?: string;
  source?: string;
  followUp?: 'due' | 'upcoming' | '';
}

export interface EnquiryListResult {
  items: Enquiry[];
  total: number;
}

export function useEnquiries(params: EnquiryListParams) {
  return useQuery({
    queryKey: [ENQUIRIES_KEY, params],
    queryFn: async (): Promise<EnquiryListResult> => {
      const query = new URLSearchParams({ page: String(params.page), pageSize: String(params.pageSize) });
      if (params.search) query.append('search', params.search);
      if (params.status) query.append('status', params.status);
      if (params.assignedToUserId) query.append('assignedToUserId', params.assignedToUserId);
      if (params.source) query.append('source', params.source);
      if (params.followUp) query.append('followUp', params.followUp);
      const res = await apiClient.get(`/enquiries?${query.toString()}`);
      return { items: res.data.data || [], total: res.data.meta?.total ?? 0 };
    },
  });
}

// ── Board ────────────────────────────────────────────────────────────────────

export interface EnquiryBoardParams {
  search?: string;
  assignedToUserId?: string;
  limit?: number;
}

export function useEnquiryBoard(params: EnquiryBoardParams) {
  return useQuery({
    queryKey: [ENQUIRY_BOARD_KEY, params],
    queryFn: async (): Promise<{ columns: BoardColumn[] }> => {
      const query = new URLSearchParams();
      if (params.search) query.append('search', params.search);
      if (params.assignedToUserId) query.append('assignedToUserId', params.assignedToUserId);
      if (params.limit) query.append('limit', String(params.limit));
      const res = await apiClient.get(`/enquiries/board?${query.toString()}`);
      return res.data.data;
    },
  });
}

// ── Funnel ───────────────────────────────────────────────────────────────────

export interface EnquiryFunnelParams {
  from?: string;
  to?: string;
}

export function useEnquiryFunnel(params: EnquiryFunnelParams) {
  return useQuery({
    queryKey: [ENQUIRY_FUNNEL_KEY, params],
    queryFn: async (): Promise<EnquiryFunnel> => {
      const query = new URLSearchParams();
      if (params.from) query.append('from', params.from);
      if (params.to) query.append('to', params.to);
      const res = await apiClient.get(`/enquiries/funnel?${query.toString()}`);
      return res.data.data;
    },
  });
}

// ── Assignees & classes (for the forms) ─────────────────────────────────────

export function useEnquiryAssignees() {
  return useQuery({
    queryKey: [ENQUIRY_ASSIGNEES_KEY],
    queryFn: async (): Promise<EnquiryAssignee[]> => {
      const res = await apiClient.get('/enquiries/assignees');
      return res.data.data || [];
    },
  });
}

export function useClassOptions() {
  return useQuery({
    queryKey: [ENQUIRY_CLASSES_KEY],
    queryFn: async (): Promise<ClassOption[]> => {
      const res = await apiClient.get('/students/meta/classes');
      return res.data.data || [];
    },
  });
}

/** Just enough of the institution's website config to build the public
 * enquiry-form link (name + slug). Read-only; never edits it here. */
export function useInstitutionSlug() {
  return useQuery({
    queryKey: INSTITUTION_WEBSITE_KEY,
    queryFn: async (): Promise<{ slug?: string; name?: string }> => {
      const res = await apiClient.get('/institution/website');
      return res.data.data || {};
    },
    staleTime: 5 * 60 * 1000,
  });
}

// ── Mutations ────────────────────────────────────────────────────────────────

export function useCreateEnquiry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (values: EnquiryFormValues) => apiClient.post('/enquiries', toEnquiryPayload(values)),
    onSuccess: () => {
      invalidateAll(qc);
      toast.success('Enquiry created.');
    },
    onError: (error: any) => toast.error(errorMessage(error, 'Failed to create enquiry.')),
  });
}

export function useUpdateEnquiry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, values }: { id: string; values: EnquiryFormValues }): Promise<Enquiry> =>
      apiClient.put(`/enquiries/${id}`, toEnquiryPayload(values)).then((res) => res.data.data),
    onSuccess: () => {
      invalidateAll(qc);
      toast.success('Enquiry updated.');
    },
    onError: (error: any) => toast.error(errorMessage(error, 'Failed to update enquiry.')),
  });
}

export function useDeleteEnquiry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/enquiries/${id}`),
    onSuccess: () => {
      invalidateAll(qc);
      toast.success('Enquiry deleted.');
    },
    onError: (error: any) => toast.error(errorMessage(error, 'Failed to delete enquiry.')),
  });
}

export interface UpdateStatusVars {
  id: string;
  status: EnquiryStatus;
  note?: string;
}

/** Plain mutation — board drag-and-drop applies its own optimistic update
 * around this (see EnquiryBoard.tsx) since it needs to reach into the board
 * query's cache specifically; the drawer/list just call it and wait. */
export function useUpdateEnquiryStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status, note }: UpdateStatusVars): Promise<Enquiry> =>
      apiClient.patch(`/enquiries/${id}/status`, { status, note: note || undefined }).then((res) => res.data.data),
    onSuccess: () => {
      invalidateAll(qc);
    },
    onError: (error: any) => toast.error(errorMessage(error, 'Failed to update status.')),
  });
}

export function useConvertEnquiry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, values }: { id: string; values: ConvertFormValues }): Promise<ConvertResult> =>
      apiClient
        .post(`/enquiries/${id}/convert`, toConvertPayload(values))
        .then((res) => res.data.data),
    onSuccess: () => {
      invalidateAll(qc);
      toast.success('Enquiry converted to an online application.');
    },
    onError: (error: any) => toast.error(errorMessage(error, 'Failed to convert enquiry.')),
  });
}
