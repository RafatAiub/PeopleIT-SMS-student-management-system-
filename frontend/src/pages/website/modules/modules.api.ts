import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import apiClient from '@/api/client';
import { apiError } from '../sites.queries';
import type { ModuleField } from '@/site/modules/types';

// =============================================================================
// Website custom modules — admin data layer (/api/v1/sites/modules, W13).
// =============================================================================

export type ModuleStatus = 'DRAFT' | 'PUBLISHED';

export interface SiteModuleLight {
  id: string;
  key: string;
  name: string;
  nameBn: string | null;
  description: string | null;
  category: string;
  icon: string | null;
  status: ModuleStatus;
  version: number;
  publishedVersion: number | null;
  publishedAt: string | null;
  hasDraftChanges: boolean;
  createdAt: string;
  updatedAt: string;
  usageCount?: number;
}

export interface SiteModuleFull extends SiteModuleLight {
  fields: ModuleField[];
  template: string;
  css: string;
  js: string;
  usage?: { count: number; pages: Array<{ id: string; title: string; slug: string }> };
  /** Present on `PUT /sites/modules/:id` responses (server-side validation of the saved draft). */
  validation?: ModuleValidation;
}

export interface ModuleIssue {
  source: 'fields' | 'template' | 'css' | 'js';
  line: number | null;
  col: number | null;
  message: string;
  path?: string;
}

export interface ModuleValidation {
  ok: boolean;
  errors: ModuleIssue[];
  warnings: ModuleIssue[];
}

export interface ModuleVersionRow {
  id: string;
  version: number;
  note: string | null;
  createdAt: string;
  createdByName: string | null;
  isPublished: boolean;
}

export interface ModulePayload {
  key?: string;
  name?: string;
  nameBn?: string | null;
  description?: string | null;
  category?: string;
  icon?: string | null;
  fields?: unknown;
  template?: string;
  css?: string;
  js?: string;
}

const KEY = ['sites', 'modules'] as const;
const unwrap = <T>(res: { data: { data?: T } }): T => res.data.data as T;

export function useModules(params: { search?: string; category?: string; status?: string }) {
  return useQuery({
    queryKey: [...KEY, 'list', params],
    queryFn: async (): Promise<SiteModuleLight[]> => {
      const res = await apiClient.get('/sites/modules', { params: { pageSize: 200, ...Object.fromEntries(Object.entries(params).filter(([, v]) => v)) } });
      const d = res.data?.data as { items?: SiteModuleLight[] } | SiteModuleLight[] | undefined;
      return Array.isArray(d) ? d : d?.items ?? [];
    },
    placeholderData: keepPreviousData,
  });
}

export function useModule(id: string | null) {
  return useQuery({
    queryKey: [...KEY, 'one', id],
    queryFn: async (): Promise<SiteModuleFull> => unwrap(await apiClient.get(`/sites/modules/${id}`)),
    enabled: Boolean(id),
  });
}

/** Public published-module cache used by the page editor and the site. */
const invalidateAll = (qc: ReturnType<typeof useQueryClient>) => {
  qc.invalidateQueries({ queryKey: KEY });
  qc.invalidateQueries({ queryKey: ['site-public'] });
};

export function useCreateModule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: ModulePayload): Promise<SiteModuleFull> => unwrap(await apiClient.post('/sites/modules', data)),
    onSuccess: () => invalidateAll(qc),
    onError: (e) => toast.error(apiError(e, 'Could not create the module.')),
  });
}

export function useUpdateModule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: ModulePayload }): Promise<SiteModuleFull> => unwrap(await apiClient.put(`/sites/modules/${id}`, data)),
    onSuccess: (m) => {
      qc.setQueryData([...KEY, 'one', m.id], (old: SiteModuleFull | undefined) => ({ ...(old ?? {}), ...m }));
      qc.invalidateQueries({ queryKey: [...KEY, 'list'] });
    },
    onError: (e) => toast.error(apiError(e, 'Could not save the module.')),
  });
}

export function usePublishModule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, note }: { id: string; note?: string }): Promise<{ module: SiteModuleFull; warnings: ModuleIssue[] }> =>
      unwrap(await apiClient.post(`/sites/modules/${id}/publish`, { note })),
    onSuccess: () => invalidateAll(qc),
    onError: (e) => toast.error(apiError(e, 'Could not publish the module.')),
  });
}

export function useDeleteModule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, force }: { id: string; force?: boolean }) => unwrap(await apiClient.delete(`/sites/modules/${id}`, { params: force ? { force: 'true' } : undefined })),
    onSuccess: () => invalidateAll(qc),
    onError: (e) => toast.error(apiError(e, 'Could not delete the module.')),
  });
}

export function useModuleVersions(id: string | null, enabled: boolean) {
  return useQuery({
    queryKey: [...KEY, 'versions', id],
    queryFn: async (): Promise<ModuleVersionRow[]> => {
      const res = await apiClient.get(`/sites/modules/${id}/versions`, { params: { pageSize: 50 } });
      const d = res.data?.data as { items?: ModuleVersionRow[] } | ModuleVersionRow[] | undefined;
      return Array.isArray(d) ? d : d?.items ?? [];
    },
    enabled: Boolean(id) && enabled,
  });
}

export function useRestoreModuleVersion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, versionId }: { id: string; versionId: string }): Promise<SiteModuleFull> =>
      unwrap(await apiClient.post(`/sites/modules/${id}/versions/${versionId}/restore`)),
    onSuccess: (m) => {
      qc.setQueryData([...KEY, 'one', m.id], (old: SiteModuleFull | undefined) => ({ ...(old ?? {}), ...m }));
      qc.invalidateQueries({ queryKey: [...KEY, 'list'] });
    },
    onError: (e) => toast.error(apiError(e, 'Could not restore that version.')),
  });
}

export async function exportModule(id: string): Promise<unknown> {
  return unwrap(await apiClient.get(`/sites/modules/${id}/export`));
}

export function useImportModule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (doc: unknown): Promise<{ module: SiteModuleFull; rekeyed: boolean; originalKey: string }> =>
      unwrap(await apiClient.post('/sites/modules/import', doc)),
    onSuccess: () => invalidateAll(qc),
    onError: (e) => toast.error(apiError(e, 'Could not import the module.')),
  });
}

/** Triggers a browser download of a JSON document. */
export function downloadJson(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
