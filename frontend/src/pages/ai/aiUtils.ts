import { useQuery } from '@tanstack/react-query';
import apiClient from '../../api/client';

// ── Shared types ────────────────────────────────────────────────────────────

export type RiskLevel = 'HIGH' | 'MEDIUM' | 'LOW';
export type Role = 'SUPER_ADMIN' | 'ADMIN' | 'TEACHER' | 'ACCOUNTANT' | 'LIBRARIAN' | 'TRANSPORT_OFFICER' | 'GUARDIAN' | 'STUDENT' | 'MANAGEMENT';

export interface PageMeta {
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/** Fields every AI-generated response carries. */
export interface AiMode {
  demo?: boolean;
  model?: string | null;
  aiError?: string;
}

export interface AiStatus {
  configured: boolean;
  demo: boolean;
  provider: 'anthropic' | 'gemini' | null;
  model: string | null;
  providers?: {
    anthropic: { configured: boolean; coolingDown: boolean; model: string | null };
    gemini: { configured: boolean; model: string | null };
  };
  semanticSearch?: boolean;
  usage: { since: string; calls: number; demoCalls: number; inputTokens: number; outputTokens: number } | null;
  pendingDrafts: number | null;
}

// Role groups — mirror backend/src/modules/ai/ai.routes.ts exactly.
export const ROLES = {
  STAFF_AI: ['SUPER_ADMIN', 'ADMIN', 'TEACHER'] as Role[],
  ADMIN_ONLY: ['SUPER_ADMIN', 'ADMIN'] as Role[],
  FEE: ['SUPER_ADMIN', 'ADMIN', 'ACCOUNTANT'] as Role[],
  ALL_STAFF: ['SUPER_ADMIN', 'ADMIN', 'TEACHER', 'ACCOUNTANT', 'LIBRARIAN', 'TRANSPORT_OFFICER', 'MANAGEMENT'] as Role[],
};

export function errorMessage(err: unknown, fallback: string): string {
  const e = err as { response?: { data?: { message?: string } }; message?: string };
  return e?.response?.data?.message || fallback;
}

// ── Hooks ───────────────────────────────────────────────────────────────────

export function useAiStatus(enabled = true) {
  return useQuery({
    queryKey: ['ai', 'status'],
    queryFn: async (): Promise<AiStatus> => (await apiClient.get('/ai/status')).data.data,
    enabled,
    staleTime: 60_000,
  });
}

export function useClassOptions(enabled = true) {
  return useQuery({
    queryKey: ['ai', 'class-options'],
    queryFn: async (): Promise<{ id: string; name: string }[]> =>
      ((await apiClient.get('/academics/classes')).data.data || []).map((c: { id: string; name: string }) => ({ id: c.id, name: c.name })),
    enabled,
    staleTime: 5 * 60_000,
  });
}

export function useSectionOptions(classId: string) {
  return useQuery({
    queryKey: ['ai', 'section-options', classId],
    queryFn: async (): Promise<{ id: string; name: string }[]> =>
      ((await apiClient.get('/academics/sections', { params: { classId } })).data.data || []).map((s: { id: string; name: string }) => ({ id: s.id, name: s.name })),
    enabled: !!classId,
    staleTime: 5 * 60_000,
  });
}

// ── Labels ──────────────────────────────────────────────────────────────────

/** "anthropic:claude-haiku-4-5" → { provider: 'Claude (Anthropic)', model: 'claude-haiku-4-5' }. */
export function describeModel(model?: string | null): { provider: string; model: string } | null {
  if (!model || model === 'template') return null;
  if (model === 'rules') return { provider: 'School records', model: 'rule-based' };
  const [p, ...rest] = model.split(':');
  const name = rest.join(':') || p;
  if (p === 'anthropic') return { provider: 'Claude (Anthropic)', model: name };
  if (p === 'gemini') return { provider: 'Google Gemini', model: name };
  return { provider: p, model: name };
}

