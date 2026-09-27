// React Query hooks for API keys + webhooks.
// Contract: backend/src/modules/api-keys (mounted /api/v1/api-keys) and
// backend/src/modules/webhooks (mounted /api/v1/webhooks). Lists return
// { items, meta: { total, page, pageSize } }.
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import apiClient from '@/api/client';

export interface Paged<T> {
  items: T[];
  meta: { total: number; page: number; pageSize: number };
}

export interface Person {
  id: string;
  firstName: string;
  lastName: string;
}

// ── API keys ──────────────────────────────────────────────────────────────

export interface ApiKey {
  id: string;
  name: string;
  keyPrefix: string;
  scopes: string[];
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
  createdBy: Person | null;
}

export interface CreatedApiKey extends ApiKey {
  key: string;
}

export interface ScopeOption {
  scope: string;
  label: string;
}

export function useApiKeys(params: { page: number; pageSize: number; includeRevoked: boolean }) {
  return useQuery({
    queryKey: ['api-keys', params],
    queryFn: async (): Promise<Paged<ApiKey>> => {
      const { data } = await apiClient.get('/api-keys', { params: { ...params, includeRevoked: String(params.includeRevoked) } });
      return data.data;
    },
    placeholderData: keepPreviousData,
  });
}

export function useApiKeyScopes() {
  return useQuery({
    queryKey: ['api-keys', 'scopes'],
    queryFn: async (): Promise<ScopeOption[]> => (await apiClient.get('/api-keys/scopes')).data.data,
    staleTime: Infinity,
  });
}

export function useCreateApiKey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: { name: string; scopes: string[] }): Promise<CreatedApiKey> => (await apiClient.post('/api-keys', body)).data.data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['api-keys'] }),
  });
}

export function useRevokeApiKey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => (await apiClient.delete(`/api-keys/${id}`)).data.data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['api-keys'] }),
  });
}

// ── Webhooks ──────────────────────────────────────────────────────────────

export interface WebhookEndpoint {
  id: string;
  url: string;
  events: string[];
  isActive: boolean;
  secretMasked: string;
  secret?: string;
  createdAt: string;
  lastDelivery?: { success: boolean; statusCode: number | null; createdAt: string } | null;
}

export interface WebhookMeta {
  events: { event: string; label: string }[];
  signatureHeader: string;
  signatureScheme: string;
  maxAttempts: number;
}

export interface WebhookDelivery {
  id: string;
  event: string;
  statusCode: number | null;
  success: boolean;
  attempt: number;
  createdAt: string;
  payload: { envelope?: unknown; error?: string | null; durationMs?: number; response?: string | null } | null;
}

export interface AttemptResult {
  success: boolean;
  statusCode: number | null;
  error: string | null;
  durationMs: number;
  deliveryId: string | null;
}

export function useWebhookMeta() {
  return useQuery({
    queryKey: ['webhooks', 'meta'],
    queryFn: async (): Promise<WebhookMeta> => (await apiClient.get('/webhooks/meta')).data.data,
    staleTime: Infinity,
  });
}

export function useWebhooks(params: { page: number; pageSize: number }) {
  return useQuery({
    queryKey: ['webhooks', 'list', params],
    queryFn: async (): Promise<Paged<WebhookEndpoint>> => (await apiClient.get('/webhooks', { params })).data.data,
    placeholderData: keepPreviousData,
  });
}

export function useWebhookDeliveries(id: string | null, params: { page: number; pageSize: number; success?: 'true' | 'false' }) {
  return useQuery({
    queryKey: ['webhooks', 'deliveries', id, params],
    queryFn: async (): Promise<Paged<WebhookDelivery>> => (await apiClient.get(`/webhooks/${id}/deliveries`, { params })).data.data,
    enabled: !!id,
    placeholderData: keepPreviousData,
  });
}

export function useWebhookMutation<TVars, TResult = unknown>(fn: (vars: TVars) => Promise<TResult>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['webhooks'] }),
  });
}

export const webhookApi = {
  create: async (body: { url: string; events: string[]; isActive: boolean }): Promise<WebhookEndpoint> => (await apiClient.post('/webhooks', body)).data.data,
  update: async ({ id, ...body }: { id: string; url?: string; events?: string[]; isActive?: boolean }): Promise<WebhookEndpoint> =>
    (await apiClient.patch(`/webhooks/${id}`, body)).data.data,
  remove: async (id: string) => (await apiClient.delete(`/webhooks/${id}`)).data,
  rotate: async (id: string): Promise<WebhookEndpoint> => (await apiClient.post(`/webhooks/${id}/rotate-secret`)).data.data,
  test: async (id: string): Promise<AttemptResult> => (await apiClient.post(`/webhooks/${id}/test`, {}, { timeout: 30000 })).data.data,
  redeliver: async (deliveryId: string): Promise<AttemptResult> =>
    (await apiClient.post(`/webhooks/deliveries/${deliveryId}/redeliver`, {}, { timeout: 30000 })).data.data,
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const errMsg = (e: any, fallback: string): string => e?.response?.data?.message || fallback;
export const personName = (u?: Person | null) => (u ? `${u.firstName} ${u.lastName}`.trim() : '');
