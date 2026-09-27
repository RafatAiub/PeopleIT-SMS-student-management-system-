import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import apiClient from '@/api/client';
import type { Notice, NoticeAudience, NoticeFormValues } from './notices.types';

export const NOTICES_KEY = 'notices';

function errorMessage(error: any, fallback: string) {
  return error.response?.data?.message || fallback;
}

export interface NoticeListParams {
  page: number;
  pageSize: number;
  search?: string;
  audience?: NoticeAudience | '';
  isActive?: '' | 'true' | 'false';
}

export interface NoticeListResult {
  notices: Notice[];
  total: number;
}

export function useNotices(params: NoticeListParams) {
  return useQuery({
    queryKey: [NOTICES_KEY, params],
    queryFn: async (): Promise<NoticeListResult> => {
      const query = new URLSearchParams({ page: String(params.page), pageSize: String(params.pageSize) });
      if (params.search) query.append('search', params.search);
      if (params.audience) query.append('audience', params.audience);
      if (params.isActive) query.append('isActive', params.isActive);
      const res = await apiClient.get(`/notices?${query.toString()}`);
      return {
        notices: res.data.data || [],
        total: res.data.meta?.total ?? 0,
      };
    },
  });
}

export function useCreateNotice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dto: NoticeFormValues) => apiClient.post('/notices', dto),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [NOTICES_KEY] });
      toast.success('Notice published successfully.');
    },
    onError: (error: any) => toast.error(errorMessage(error, 'Failed to publish notice.')),
  });
}

export function useUpdateNotice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<NoticeFormValues> }) =>
      apiClient.put(`/notices/${id}`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [NOTICES_KEY] });
      toast.success('Notice updated successfully.');
    },
    onError: (error: any) => toast.error(errorMessage(error, 'Failed to update notice.')),
  });
}

export function useDeleteNotice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/notices/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [NOTICES_KEY] });
      toast.success('Notice deleted successfully.');
    },
    onError: (error: any) => toast.error(errorMessage(error, 'Failed to delete notice.')),
  });
}
