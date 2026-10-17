import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import apiClient from '@/api/client';
import { useModuleEnabled } from '@/hooks/useModules';

// =============================================================================
// T2 character (Akhlaq) scoring & badges — data layer (/api/v1/character/...).
// Every query is disabled while the school has the module off.
// =============================================================================

export const MODULE_KEY = 'islamic.character';
const KEY = ['character'] as const;

export type PeriodKind = 'WEEKLY' | 'MONTHLY' | 'TERM';
export type BadgeRule = 'NONE' | 'TRAIT_AVERAGE' | 'OVERALL_AVERAGE' | 'ATTENDANCE_STREAK';

export const BADGE_ICONS = ['star', 'award', 'medal', 'trophy', 'crown', 'heart', 'sparkles', 'sun', 'moon', 'book', 'clock', 'shield', 'thumbs-up', 'smile', 'leaf', 'flame'] as const;
export type BadgeIcon = (typeof BADGE_ICONS)[number];

export const PERIOD_KIND_LABEL: Record<PeriodKind, { en: string; bn: string }> = {
  WEEKLY: { en: 'Weekly', bn: 'সাপ্তাহিক' },
  MONTHLY: { en: 'Monthly', bn: 'মাসিক' },
  TERM: { en: 'Term', bn: 'টার্ম' },
};

export const RULE_LABEL: Record<BadgeRule, { en: string; bn: string }> = {
  NONE: { en: 'Manual only', bn: 'শুধু হাতে দেওয়া' },
  TRAIT_AVERAGE: { en: 'Score in one trait ≥ X', bn: 'একটি গুণে নম্বর ≥ X' },
  OVERALL_AVERAGE: { en: 'Overall ≥ X %', bn: 'সামগ্রিক ≥ X %' },
  ATTENDANCE_STREAK: { en: 'N days on time in a row', bn: 'টানা N দিন সময়মতো উপস্থিত' },
};

export interface Trait {
  id: string;
  name: string;
  nameBn: string | null;
  description: string | null;
  scaleMin: number;
  scaleMax: number;
  weight: number;
  active: boolean;
  sortOrder: number;
}

export interface Period {
  id: string;
  name: string;
  kind: PeriodKind;
  startDate: string;
  endDate: string;
  academicYearId: string | null;
  academicYear?: { id: string; label: string } | null;
  locked: boolean;
  _count?: { scores: number; awards: number };
}

export interface SectionOption {
  id: string;
  name: string;
  classId: string;
  className: string;
  studentCount: number;
}

export interface GridStudent {
  id: string;
  firstName: string;
  lastName: string;
  rollNumber: string | null;
  avatarUrl: string | null;
  studentId: string;
  scores: Record<string, number>;
  comment: string | null;
  overall: number | null;
  badgesThisPeriod: number;
}

export interface Grid {
  period: Period;
  section: { id: string; name: string; classId: string; className: string };
  traits: Trait[];
  students: GridStudent[];
  canEdit: boolean;
}

export interface Badge {
  id: string;
  name: string;
  nameBn: string | null;
  description: string | null;
  icon: BadgeIcon;
  color: string;
  points: number;
  rule: BadgeRule;
  ruleTraitId: string | null;
  ruleTrait?: { id: string; name: string; nameBn: string | null } | null;
  ruleThreshold: number | null;
  ruleStreakDays: number | null;
  active: boolean;
  sortOrder: number;
  _count?: { awards: number };
}

export interface Award {
  id: string;
  badgeId: string;
  studentId: string;
  source: 'MANUAL' | 'AUTO';
  points: number;
  reason: string | null;
  awardedAt: string;
  awardedById: string | null;
  revokedAt: string | null;
  revokeReason: string | null;
  badge: { id: string; name: string; nameBn: string | null; icon: BadgeIcon; color: string };
  student?: { id: string; firstName: string; lastName: string; class?: { name: string } | null; section?: { name: string } | null };
  period?: { id?: string; name: string } | null;
}

export interface Settings {
  leaderboardEnabled: boolean;
  leaderboardPublic: boolean;
  notifyGuardians: boolean;
}

export interface StudentSummary {
  student: { id: string; firstName: string; lastName: string; avatarUrl: string | null; class: { id: string; name: string } | null; section: { id: string; name: string } | null };
  points: number;
  latest: {
    period: { id: string; name: string; kind: PeriodKind; startDate: string; endDate: string };
    overall: number | null;
    band: { en: string; bn: string } | null;
    comment: string | null;
    traits: Array<{ id: string; name: string; nameBn: string | null; score: number; scaleMin: number; scaleMax: number }>;
  } | null;
  history: Array<{ periodId: string; name: string; startDate: string; overall: number | null }>;
  badges: Award[];
  leaderboardVisible: boolean;
}

export interface LeaderboardRow {
  rank: number;
  name: string;
  className: string;
  points: number;
  isMine: boolean;
}

export interface Overview {
  traits: number;
  badges: number;
  latestPeriod: { id: string; name: string; locked: boolean } | null;
  awardsLast30Days: number;
  recent: Array<Award & { student: { firstName: string; lastName: string; class: { name: string } | null } }>;
}

export function apiErrorMessage(error: unknown, fallback: string): string {
  const e = error as { response?: { data?: { message?: string; errors?: { message?: string }[] } } };
  const first = Array.isArray(e?.response?.data?.errors) ? e.response?.data?.errors?.[0]?.message : undefined;
  return e?.response?.data?.message && e.response.data.message !== 'Validation failed' ? e.response.data.message : first || e?.response?.data?.message || fallback;
}

const useOn = () => useModuleEnabled(MODULE_KEY);

async function getData<T>(url: string, params?: Record<string, unknown>): Promise<T> {
  const { data } = await apiClient.get(url, { params });
  return data?.data as T;
}

const clean = (p: Record<string, unknown>) => Object.fromEntries(Object.entries(p).filter(([, v]) => v !== '' && v != null));

/* ── Queries ─────────────────────────────────────────────────────────────── */

export const useCharacterSettings = () => {
  const on = useOn();
  return useQuery({ queryKey: [...KEY, 'settings'], enabled: on, queryFn: () => getData<Settings>('/character/settings') });
};
export const useTraits = (enabled = true) => {
  const on = useOn();
  return useQuery({ queryKey: [...KEY, 'traits'], enabled: on && enabled, queryFn: () => getData<Trait[]>('/character/traits') });
};
export const usePeriods = (enabled = true) => {
  const on = useOn();
  return useQuery({ queryKey: [...KEY, 'periods'], enabled: on && enabled, queryFn: () => getData<Period[]>('/character/periods') });
};
export const useAssessSections = (enabled = true) => {
  const on = useOn();
  return useQuery({ queryKey: [...KEY, 'sections'], enabled: on && enabled, queryFn: () => getData<SectionOption[]>('/character/sections') });
};
export const useGrid = (periodId: string, sectionId: string) => {
  const on = useOn();
  return useQuery({
    queryKey: [...KEY, 'grid', periodId, sectionId],
    enabled: on && Boolean(periodId && sectionId),
    queryFn: () => getData<Grid>('/character/grid', { periodId, sectionId }),
  });
};
export const useBadges = (enabled = true) => {
  const on = useOn();
  return useQuery({ queryKey: [...KEY, 'badges'], enabled: on && enabled, queryFn: () => getData<Badge[]>('/character/badges') });
};
export const useAwards = (params: { studentId?: string; sectionId?: string; page?: number; pageSize?: number }) => {
  const on = useOn();
  return useQuery({
    queryKey: [...KEY, 'awards', params],
    enabled: on,
    queryFn: async () => {
      const { data } = await apiClient.get('/character/awards', { params: clean(params) });
      return { items: (data?.data ?? []) as Award[], total: (data?.meta?.total ?? 0) as number };
    },
  });
};
export const useStudentCharacter = (studentId: string | undefined) => {
  const on = useOn();
  return useQuery({
    queryKey: [...KEY, 'student', studentId],
    enabled: on && Boolean(studentId),
    queryFn: () => getData<StudentSummary>(`/character/students/${studentId}/summary`),
  });
};
export const useMyCharacter = (enabled = true) => {
  const on = useOn();
  return useQuery({ queryKey: [...KEY, 'mine'], enabled: on && enabled, queryFn: () => getData<{ children: StudentSummary[] }>('/character/mine') });
};
export const useLeaderboard = (params: { classId?: string; sectionId?: string; periodId?: string }, enabled = true) => {
  const on = useOn();
  return useQuery({
    queryKey: [...KEY, 'leaderboard', params],
    enabled: on && enabled,
    retry: false,
    queryFn: () => getData<{ className: string | null; rows: LeaderboardRow[] }>('/character/leaderboard', clean(params)),
  });
};
export const useCharacterOverview = (enabled = true) => {
  const on = useOn();
  return useQuery({ queryKey: [...KEY, 'overview'], enabled: on && enabled, queryFn: () => getData<Overview>('/character/overview') });
};

/* ── Mutations ───────────────────────────────────────────────────────────── */

const send = async (method: 'post' | 'put' | 'delete', url: string, body?: unknown) => {
  const { data } = method === 'delete' ? await apiClient.delete(url) : await apiClient[method](url, body ?? {});
  return data?.data;
};
function useInvalidating<TVars, TResult = unknown>(fn: (vars: TVars) => Promise<TResult>) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: fn, onSuccess: () => qc.invalidateQueries({ queryKey: KEY }) });
}

export const useSaveSettings = () => useInvalidating((body: Partial<Settings>) => send('put', '/character/settings', body));
export const useSeedTraits = () => useInvalidating(() => send('post', '/character/traits/defaults'));
export const useSaveTrait = () =>
  useInvalidating((v: { id?: string; body: Record<string, unknown> }) => (v.id ? send('put', `/character/traits/${v.id}`, v.body) : send('post', '/character/traits', v.body)));
export const useDeleteTrait = () => useInvalidating((id: string) => send('delete', `/character/traits/${id}`));
export const useSavePeriod = () =>
  useInvalidating((v: { id?: string; body: Record<string, unknown> }) => (v.id ? send('put', `/character/periods/${v.id}`, v.body) : send('post', '/character/periods', v.body)));
export const useDeletePeriod = () => useInvalidating((id: string) => send('delete', `/character/periods/${id}`));
export const useSaveGrid = () =>
  useInvalidating((body: { periodId: string; sectionId: string; scores: unknown[]; comments: unknown[] }) => send('put', '/character/grid', body) as Promise<{ saved: number; cleared: number }>);
export const useSeedBadges = () => useInvalidating(() => send('post', '/character/badges/defaults'));
export const useSaveBadge = () =>
  useInvalidating((v: { id?: string; body: Record<string, unknown> }) => (v.id ? send('put', `/character/badges/${v.id}`, v.body) : send('post', '/character/badges', v.body)));
export const useDeleteBadge = () => useInvalidating((id: string) => send('delete', `/character/badges/${id}`));
export const useAwardBadge = () =>
  useInvalidating((body: { badgeId: string; studentIds: string[]; periodId?: string | null; reason: string }) => send('post', '/character/awards', body) as Promise<{ awarded: number }>);
export const useRevokeAward = () => useInvalidating((v: { id: string; reason: string }) => send('post', `/character/awards/${v.id}/revoke`, { reason: v.reason }));
export const useAutoAward = () =>
  useInvalidating((body: { periodId: string; sectionId?: string }) => send('post', '/character/awards/auto', body) as Promise<{ awarded: number; checkedStudents: number }>);
export const useAdjustPoints = () => useInvalidating((body: { studentId: string; points: number; reason: string }) => send('post', '/character/points', body));
