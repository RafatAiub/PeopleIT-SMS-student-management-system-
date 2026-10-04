// React Query hooks for tenant data export.
// Contract: backend/src/modules/data-export (mounted /api/v1/data-export).
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import apiClient from '@/api/client';

export type ExportStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'EXPIRED';

export interface ExportJob {
  id: string;
  status: ExportStatus;
  createdAt: string;
  completedAt: string | null;
  expiresAt: string | null;
  downloadable: boolean;
  requestedBy: { id: string; firstName: string; lastName: string };
}

export interface ExportList {
  items: ExportJob[];
  meta: { total: number; page: number; pageSize: number };
  retentionDays: number;
}

export function useExportJobs(page: number, pageSize: number) {
  return useQuery({
    queryKey: ['data-export', page, pageSize],
    queryFn: async (): Promise<ExportList> => (await apiClient.get('/data-export', { params: { page, pageSize } })).data.data,
    placeholderData: keepPreviousData,
    // Poll while a job is being built.
    refetchInterval: (q) => (q.state.data?.items.some((j) => j.status === 'PENDING' || j.status === 'RUNNING') ? 4000 : false),
  });
}

export function useRequestExport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<ExportJob> => (await apiClient.post('/data-export')).data.data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['data-export'] }),
  });
}

/** Downloads the ZIP through the authenticated client and saves it. */
export async function downloadExport(job: ExportJob): Promise<void> {
  const res = await apiClient.get(`/data-export/${job.id}/download`, { responseType: 'blob', timeout: 5 * 60 * 1000 });
  const disposition = String(res.headers['content-disposition'] ?? '');
  const match = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(disposition);
  const name = match ? decodeURIComponent(match[1]) : `peoplenit-export-${job.id}.zip`;
  const url = URL.createObjectURL(res.data as Blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Error bodies of blob requests arrive as Blob — read the JSON message out of them. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function blobErrMsg(e: any, fallback: string): Promise<string> {
  const data = e?.response?.data;
  if (data instanceof Blob) {
    try {
      const parsed = JSON.parse(await data.text());
      return parsed?.message || fallback;
    } catch {
      return fallback;
    }
  }
  return data?.message || fallback;
}
