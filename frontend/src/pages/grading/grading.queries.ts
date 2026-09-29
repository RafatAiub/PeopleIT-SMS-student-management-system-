// React Query hooks for grading scales. Contract: backend/src/modules/grading
// (grading.routes.ts) — mounted at /api/v1/grading.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import apiClient from '../../api/client';

export interface GradeBand {
  id?: string | null;
  grade: string;
  minPercent: number;
  maxPercent: number;
  gradePoint: number;
  remark?: string | null;
}

export interface GradingScale {
  id: string;
  name: string;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
  bands: GradeBand[];
}

export interface EffectiveScale {
  id: string | null;
  name: string;
  isDefault: boolean;
  isFallback: boolean;
  bands: GradeBand[];
}

export interface Paginated<T> {
  items: T[];
  meta: { total: number; page: number; pageSize: number };
}

export const GRADING_SCALES_KEY = 'grading-scales';
export const GRADING_EFFECTIVE_KEY = 'grading-effective-scale';

export function useGradingScales(page: number, pageSize: number) {
  return useQuery({
    queryKey: [GRADING_SCALES_KEY, page, pageSize],
    queryFn: async (): Promise<Paginated<GradingScale>> => {
      const { data } = await apiClient.get('/grading/scales', { params: { page, pageSize } });
      return data.data;
    },
  });
}

export function useEffectiveScale(enabled = true) {
  return useQuery({
    queryKey: [GRADING_EFFECTIVE_KEY],
    queryFn: async (): Promise<EffectiveScale> => {
      const { data } = await apiClient.get('/grading/scales/effective');
      return data.data;
    },
    enabled,
    staleTime: 5 * 60 * 1000,
  });
}

function useInvalidate() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: [GRADING_SCALES_KEY] });
    qc.invalidateQueries({ queryKey: [GRADING_EFFECTIVE_KEY] });
  };
}

export type ScalePayload = { name: string; isDefault?: boolean; bands: GradeBand[] };

export function useSaveScale() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async ({ id, payload }: { id?: string; payload: ScalePayload }) => {
      const bands = payload.bands.map(({ grade, minPercent, maxPercent, gradePoint, remark }) => ({
        grade,
        minPercent,
        maxPercent,
        gradePoint,
        remark: remark || null,
      }));
      if (id) {
        const { data } = await apiClient.put(`/grading/scales/${id}`, { name: payload.name, bands });
        return data.data as GradingScale;
      }
      const { data } = await apiClient.post('/grading/scales', { name: payload.name, isDefault: !!payload.isDefault, bands });
      return data.data as GradingScale;
    },
    onSuccess: invalidate,
  });
}

export function useSetDefaultScale() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (id: string) => (await apiClient.post(`/grading/scales/${id}/set-default`)).data.data as GradingScale,
    onSuccess: invalidate,
  });
}

export function useDeleteScale() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (id: string) => {
      await apiClient.delete(`/grading/scales/${id}`);
    },
    onSuccess: invalidate,
  });
}

export function useSeedBangladesh() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (setDefault: boolean) =>
      (await apiClient.post('/grading/scales/seed-bangladesh', { setDefault })).data.data as GradingScale,
    onSuccess: invalidate,
  });
}

/**
 * Client-side mirror of backend grading.core.ts validateBands() for inline
 * feedback — the server re-validates and is authoritative.
 */
export function validateBandsClient(bands: GradeBand[]): string[] {
  const errors: string[] = [];
  if (bands.length === 0) return ['At least one grade band is required'];
  const seen = new Set<string>();
  for (const b of bands) {
    const label = b.grade.trim();
    if (!label) errors.push('Every band needs a grade label');
    if (label && seen.has(label.toUpperCase())) errors.push(`Grade "${label}" is used more than once`);
    seen.add(label.toUpperCase());
    if ([b.minPercent, b.maxPercent, b.gradePoint].some((n) => !Number.isFinite(n))) {
      errors.push(`Grade "${label}": enter numbers for every field`);
      continue;
    }
    if (b.minPercent < 0 || b.maxPercent > 100) errors.push(`Grade "${label}": range must be within 0–100`);
    if (b.minPercent > b.maxPercent) errors.push(`Grade "${label}": minimum is greater than maximum`);
    if (b.gradePoint < 0 || b.gradePoint > 9.99) errors.push(`Grade "${label}": grade point must be between 0 and 9.99`);
  }
  if (errors.length) return errors;
  const sorted = [...bands].sort((a, b) => a.minPercent - b.minPercent);
  if (sorted[0].minPercent !== 0) errors.push('Bands must start at 0%');
  if (sorted[sorted.length - 1].maxPercent !== 100) errors.push('Bands must end at 100%');
  for (let i = 1; i < sorted.length; i++) {
    const gap = sorted[i].minPercent - sorted[i - 1].maxPercent;
    if (gap < -1e-9) errors.push(`Grades "${sorted[i - 1].grade}" and "${sorted[i].grade}" overlap`);
    else if (gap > 0.01 + 1e-9) errors.push(`Gap between "${sorted[i - 1].grade}" and "${sorted[i].grade}"`);
  }
  return errors;
}
