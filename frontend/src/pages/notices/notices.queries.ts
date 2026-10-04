import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import apiClient from '@/api/client';
import type { Notice, NoticeAudience, NoticePayload } from './notices.types';

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
  classId?: string;
  /** Staff-only filter: notices not yet visible ('scheduled') or already visible ('published'). */
  visibility?: '' | 'scheduled' | 'published';
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
      if (params.classId) query.append('classId', params.classId);
      if (params.visibility) query.append('visibility', params.visibility);
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
    mutationFn: (dto: NoticePayload) => apiClient.post('/notices', dto),
    onSuccess: (_res, dto) => {
      qc.invalidateQueries({ queryKey: [NOTICES_KEY] });
      toast.success(dto.scheduledAt && new Date(dto.scheduledAt).getTime() > Date.now()
        ? 'Notice scheduled successfully.'
        : 'Notice published successfully.');
    },
    onError: (error: any) => toast.error(errorMessage(error, 'Failed to publish notice.')),
  });
}

export function useUpdateNotice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<NoticePayload> }) =>
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

export interface ClassOption {
  id: string;
  name: string;
}

/** Class / section pickers for targeting (staff-only endpoints; the form is staff-only too). */
export function useNoticeClasses(enabled: boolean) {
  return useQuery({
    queryKey: ['notices', 'meta', 'classes'],
    enabled,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<ClassOption[]> => {
      const res = await apiClient.get('/students/meta/classes');
      return ((res.data.data || []) as ClassOption[]).map((c) => ({ id: c.id, name: c.name }));
    },
  });
}

export function useNoticeSections(classId: string) {
  return useQuery({
    queryKey: ['notices', 'meta', 'sections', classId],
    enabled: !!classId,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<ClassOption[]> => {
      const res = await apiClient.get(`/students/meta/sections?classId=${encodeURIComponent(classId)}`);
      return ((res.data.data || []) as ClassOption[]).map((s) => ({ id: s.id, name: s.name }));
    },
  });
}
