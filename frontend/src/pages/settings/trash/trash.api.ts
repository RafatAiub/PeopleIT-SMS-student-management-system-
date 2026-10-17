import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import apiClient from '@/api/client';
import type { BulkResult, TrashType } from './trash.logic';

// =============================================================================
// T5 Trash — React Query data layer for /api/v1/trash (ADMIN).
// =============================================================================

export const TRASH_KEY = 'trash';

export interface TrashItem {
  id: string;
  type: TrashType;
  entityId: string;
  label: string;
  deletedByName: string | null;
  deletedByUserId: string | null;
  deletedAt: string;
  purgeAfter: string;
  daysLeft: number;
  purgeError: string | null;
}

export function useTrashList(q: { type?: string; search?: string; page: number; pageSize: number }) {
  return useQuery({
    queryKey: [TRASH_KEY, 'list', q],
    queryFn: async (): Promise<{ items: TrashItem[]; total: number }> => {
      const p = new URLSearchParams({ page: String(q.page), pageSize: String(q.pageSize) });
      if (q.type) p.set('type', q.type);
      if (q.search) p.set('search', q.search);
      const r = await apiClient.get(`/trash?${p.toString()}`);
      return { items: r.data.data ?? [], total: r.data.meta?.total ?? 0 };
    },
  });
}

export function useTrashSummary() {
  return useQuery({
    queryKey: [TRASH_KEY, 'summary'],
    queryFn: async (): Promise<{ total: number; counts: Partial<Record<TrashType, number>>; retentionDays: number }> => (await apiClient.get('/trash/summary')).data.data,
  });
}

/** Restore or permanently delete; always resolves with per-item results (single-item errors are mapped too). */
export function useTrashAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { action: 'restore' | 'purge'; ids: string[] }): Promise<BulkResult[]> => {
      try {
        const body = v.action === 'purge' ? { ids: v.ids, confirm: 'DELETE' } : { ids: v.ids };
        const r = await apiClient.post(`/trash/${v.action}`, body);
        return r.data.data.results as BulkResult[];
      } catch (error) {
        const msg = (error as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Failed';
        return v.ids.map((id) => ({ id, ok: false, error: msg }));
      }
    },
    // Restored rows reappear everywhere — refresh every cached list.
    onSuccess: () => qc.invalidateQueries(),
  });
}
