import { useCallback, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import apiClient from '@/api/client';
import { useAuthStore } from '@/store/authStore';
import type { DateFormat, Lang, Numerals } from '@/i18n';

// =============================================================================
// SaaS layer data hooks — entitlements, onboarding, branches, institution
// locale settings. Backends: /saas/*, /branches/*, /institution/settings.
// =============================================================================

export type EntitlementSource = 'override' | 'plan' | 'plan-cap' | 'default' | 'no-plan';

export interface ResolvedFeature {
  key: string;
  label: string;
  enabled: boolean;
  source: EntitlementSource;
}

export interface LimitWithUsage {
  resource: string;
  label: string;
  period: 'total' | 'month';
  limit: number | null;
  used: number | null;
  remaining: number | null;
  percent: number | null;
  allowed: boolean;
  source: EntitlementSource;
}

export interface Entitlements {
  plan: { id: string; name: string; slug: string } | null;
  subscription: {
    status: string;
    billingCycle: string;
    trialEndsAt: string | null;
    currentPeriodEnd: string | null;
  } | null;
  unlimited: boolean;
  configured: boolean;
  platform?: boolean;
  features: Record<string, ResolvedFeature>;
  limits: Record<string, LimitWithUsage>;
}

export const ENTITLEMENTS_KEY = ['saas', 'entitlements'] as const;

/** Plan features + limits + usage for the signed-in user's institution. */
export function useEntitlements() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const query = useQuery({
    queryKey: ENTITLEMENTS_KEY,
    queryFn: async (): Promise<Entitlements> => {
      const { data } = await apiClient.get('/saas/entitlements');
      return data.data;
    },
    enabled: isAuthenticated,
    staleTime: 5 * 60 * 1000,
  });

  const data = query.data;
  // Unknown flags and failed lookups resolve to enabled: the backend is the
  // enforcement point, the UI must never lock a school out by mistake.
  const isEnabled = useCallback((flag: string) => (data?.features[flag] ? data.features[flag].enabled : true), [data]);
  const limitFor = useCallback((resource: string): LimitWithUsage | null => data?.limits[resource] ?? null, [data]);

  return useMemo(() => ({ ...query, isEnabled, limitFor }), [query, isEnabled, limitFor]);
}

// ── Onboarding ──────────────────────────────────────────────────────────────

export interface OnboardingItem {
  key: string;
  title: string;
  description: string;
  href: string;
  optional: boolean;
  done: boolean;
  skipped: boolean;
  count: number | null;
}

export interface OnboardingState {
  items: OnboardingItem[];
  completed: number;
  total: number;
  percent: number;
  requiredRemaining: number;
  allDone: boolean;
  dismissed: boolean;
  nextStep: OnboardingItem | null;
  /** false until the Wave C migration adds OnboardingProgress — skip/dismiss then live in this browser only. */
  persisted: boolean;
}

export const ONBOARDING_KEY = ['saas', 'onboarding'] as const;

interface LocalProgress {
  skipped: string[];
  dismissed: boolean;
}

function localKey(institutionId: string | undefined) {
  return `onboarding-progress:${institutionId ?? 'none'}`;
}

function readLocal(institutionId: string | undefined): LocalProgress {
  try {
    const raw = localStorage.getItem(localKey(institutionId));
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<LocalProgress>;
      return { skipped: Array.isArray(parsed.skipped) ? parsed.skipped : [], dismissed: Boolean(parsed.dismissed) };
    }
  } catch {
    /* storage unavailable — fall through */
  }
  return { skipped: [], dismissed: false };
}

function writeLocal(institutionId: string | undefined, value: LocalProgress) {
  try {
    localStorage.setItem(localKey(institutionId), JSON.stringify(value));
  } catch {
    /* ignore */
  }
}

/** Recompute totals when skip/dismiss come from local storage. */
function mergeLocal(server: OnboardingState, local: LocalProgress): OnboardingState {
  const items = server.items.map((i) => ({ ...i, skipped: !i.done && (i.skipped || local.skipped.includes(i.key)) }));
  const completed = items.filter((i) => i.done || i.skipped).length;
  return {
    ...server,
    items,
    completed,
    percent: server.total === 0 ? 100 : Math.round((completed / server.total) * 100),
    requiredRemaining: items.filter((i) => !i.optional && !i.done && !i.skipped).length,
    allDone: completed === server.total,
    dismissed: server.dismissed || local.dismissed,
    nextStep: items.find((i) => !i.done && !i.skipped) ?? null,
  };
}

export function useOnboarding(enabled = true) {
  const institutionId = useAuthStore((s) => s.user?.institutionId);
  return useQuery({
    queryKey: [...ONBOARDING_KEY, institutionId],
    queryFn: async (): Promise<OnboardingState> => {
      const { data } = await apiClient.get('/saas/onboarding');
      const server = data.data as OnboardingState;
      return server.persisted ? server : mergeLocal(server, readLocal(institutionId));
    },
    enabled,
  });
}

export function useUpdateOnboarding() {
  const qc = useQueryClient();
  const institutionId = useAuthStore((s) => s.user?.institutionId);
  return useMutation({
    mutationFn: async (patch: { dismissed?: boolean; skip?: string; unskip?: string }): Promise<OnboardingState> => {
      const { data } = await apiClient.patch('/saas/onboarding', patch);
      const server = data.data as OnboardingState;
      if (server.persisted) return server;
      // Migration pending: keep the choice in this browser.
      const local = readLocal(institutionId);
      const skipped = new Set(local.skipped);
      if (patch.skip) skipped.add(patch.skip);
      if (patch.unskip) skipped.delete(patch.unskip);
      const next = { skipped: [...skipped], dismissed: patch.dismissed ?? local.dismissed };
      writeLocal(institutionId, next);
      return mergeLocal(server, next);
    },
    onSuccess: (state) => {
      qc.setQueryData([...ONBOARDING_KEY, institutionId], state);
    },
  });
}

// ── Branches ────────────────────────────────────────────────────────────────

export interface Branch {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  isActive: boolean;
  createdAt: string;
  counts: { students: number; classes: number; staff: number | null };
}

export interface BranchInput {
  name: string;
  address?: string;
  phone?: string;
  email?: string;
  isActive?: boolean;
}

export const BRANCHES_KEY = ['branches'] as const;

export function useBranches(params: { status?: 'active' | 'inactive' | 'all'; enabled?: boolean } = {}) {
  const status = params.status ?? 'all';
  return useQuery({
    queryKey: [...BRANCHES_KEY, status],
    queryFn: async (): Promise<{ items: Branch[]; total: number }> => {
      const { data } = await apiClient.get('/branches', { params: { page: 1, pageSize: 100, status } });
      return { items: data.data ?? [], total: data.meta?.total ?? 0 };
    },
    enabled: params.enabled ?? true,
    staleTime: 60 * 1000,
  });
}

export function useSaveBranch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...input }: BranchInput & { id?: string }): Promise<Branch> => {
      const { data } = id ? await apiClient.patch(`/branches/${id}`, input) : await apiClient.post('/branches', input);
      return data.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: BRANCHES_KEY });
      qc.invalidateQueries({ queryKey: ENTITLEMENTS_KEY });
    },
  });
}

export function useDeleteBranch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await apiClient.delete(`/branches/${id}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: BRANCHES_KEY });
      qc.invalidateQueries({ queryKey: ENTITLEMENTS_KEY });
    },
  });
}

// ── Institution locale settings ─────────────────────────────────────────────

export interface InstitutionSettings {
  timezone: string;
  dateFormat: DateFormat;
  numeralSystem: Numerals;
  currency: string;
  defaultLanguage: Lang;
  /** false until the Wave C migration adds the columns (defaults shown, saving disabled). */
  persisted: boolean;
}

export const INSTITUTION_SETTINGS_KEY = ['institution', 'settings'] as const;

export function useInstitutionSettings(enabled = true) {
  const institutionId = useAuthStore((s) => s.user?.institutionId);
  return useQuery({
    queryKey: [...INSTITUTION_SETTINGS_KEY, institutionId],
    queryFn: async (): Promise<InstitutionSettings> => {
      const { data } = await apiClient.get('/institution/settings');
      return data.data;
    },
    enabled: enabled && Boolean(institutionId),
    staleTime: 10 * 60 * 1000,
  });
}

export function useUpdateInstitutionSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: Partial<Omit<InstitutionSettings, 'persisted'>>): Promise<InstitutionSettings> => {
      const { data } = await apiClient.put('/institution/settings', patch);
      return data.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: INSTITUTION_SETTINGS_KEY });
    },
  });
}

/** Human message from an axios error. */
export function apiErrorMessage(error: unknown, fallback: string): string {
  const e = error as { response?: { data?: { message?: string } } };
  return e?.response?.data?.message || fallback;
}
