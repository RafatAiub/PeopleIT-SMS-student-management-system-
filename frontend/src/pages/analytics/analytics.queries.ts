import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import apiClient from '@/api/client';
import type {
  AcademicAnalytics,
  AttendanceAnalytics,
  ChronicAbsentee,
  Defaulter,
  FilterOptions,
  FinanceAnalytics,
  Paged,
  RecipientOption,
  ReportFilters,
  ReportKey,
  SavedView,
  ScheduleList,
  ScheduleRunResult,
} from './analytics.types';

// =============================================================================
// Analytics — React Query data layer for /reports/analytics/*,
// /reports/saved-views and /reports/schedules
// (backend/src/modules/reports/reports.routes.ts).
// =============================================================================

export const ANALYTICS_KEY = 'analytics';
export const SAVED_VIEWS_KEY = 'report-saved-views';
export const SCHEDULES_KEY = 'report-schedules';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const apiError = (error: any, fallback: string): string => error?.response?.data?.message || fallback;

/** Drops empty values so query strings stay clean and cache keys stable. */
export function cleanFilters<T extends object>(f: T): Partial<T> {
  return Object.fromEntries(Object.entries(f).filter(([, v]) => v !== undefined && v !== null && v !== '')) as Partial<T>;
}

const get = async <T,>(url: string, params?: object): Promise<T> => (await apiClient.get(url, { params })).data.data;

export function useFilterOptions() {
  return useQuery({
    queryKey: [ANALYTICS_KEY, 'filter-options'],
    queryFn: () => get<FilterOptions>('/reports/analytics/filter-options'),
    staleTime: 5 * 60 * 1000,
  });
}

export function useFinanceAnalytics(filters: ReportFilters, enabled = true) {
  const params = cleanFilters({ ...filters, examId: undefined, threshold: undefined, minDays: undefined });
  return useQuery({
    queryKey: [ANALYTICS_KEY, 'finance', params],
    queryFn: () => get<FinanceAnalytics>('/reports/analytics/finance', params),
    enabled,
    placeholderData: keepPreviousData,
  });
}

export function useDefaulters(filters: ReportFilters, page: number, pageSize: number, enabled = true) {
  const params = cleanFilters({
    branchId: filters.branchId,
    academicYearId: filters.academicYearId,
    classId: filters.classId,
    sectionId: filters.sectionId,
    page,
    pageSize,
  });
  return useQuery({
    queryKey: [ANALYTICS_KEY, 'defaulters', params],
    queryFn: () => get<Paged<Defaulter> & { asOf: string }>('/reports/analytics/finance/defaulters', params),
    enabled,
    placeholderData: keepPreviousData,
  });
}

export function useAttendanceAnalytics(filters: ReportFilters, enabled = true) {
  const params = cleanFilters({ ...filters, examId: undefined, granularity: undefined });
  return useQuery({
    queryKey: [ANALYTICS_KEY, 'attendance', params],
    queryFn: () => get<AttendanceAnalytics>('/reports/analytics/attendance', params),
    enabled,
    placeholderData: keepPreviousData,
  });
}

export function useChronicAbsentees(filters: ReportFilters, page: number, pageSize: number, enabled = true) {
  const params = cleanFilters({ ...filters, examId: undefined, granularity: undefined, page, pageSize });
  return useQuery({
    queryKey: [ANALYTICS_KEY, 'chronic', params],
    queryFn: () => get<Paged<ChronicAbsentee>>('/reports/analytics/attendance/chronic', params),
    enabled,
    placeholderData: keepPreviousData,
  });
}

export function useAcademicAnalytics(filters: ReportFilters, enabled = true) {
  const params = cleanFilters({ ...filters, granularity: undefined, threshold: undefined, minDays: undefined });
  return useQuery({
    queryKey: [ANALYTICS_KEY, 'academic', params],
    queryFn: () => get<AcademicAnalytics>('/reports/analytics/academic', params),
    enabled,
    placeholderData: keepPreviousData,
  });
}

/** Downloads the server-rendered CSV for a whole tab (same file scheduled emails attach). */
export async function downloadReportCsv(reportKey: ReportKey, filters: ReportFilters) {
  const res = await apiClient.get(`/reports/analytics/${reportKey}/export.csv`, {
    params: cleanFilters(filters),
    responseType: 'blob',
  });
  const url = URL.createObjectURL(res.data as Blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${reportKey}-report-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// ── Saved views ──────────────────────────────────────────────────────────────

export function useSavedViews(reportKey?: ReportKey) {
  return useQuery({
    queryKey: [SAVED_VIEWS_KEY, reportKey ?? 'all'],
    queryFn: () => get<Paged<SavedView>>('/reports/saved-views', cleanFilters({ reportKey, page: 1, pageSize: 100 })),
  });
}

export function useCreateSavedView() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: { name: string; reportKey: ReportKey; filters: ReportFilters; isShared: boolean }) =>
      (await apiClient.post('/reports/saved-views', body)).data.data as SavedView,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [SAVED_VIEWS_KEY] });
      toast.success('View saved.');
    },
    onError: (e) => toast.error(apiError(e, 'Could not save the view.')),
  });
}

export function useUpdateSavedView() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...body }: { id: string; name?: string; filters?: ReportFilters; isShared?: boolean }) =>
      (await apiClient.put(`/reports/saved-views/${id}`, body)).data.data as SavedView,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [SAVED_VIEWS_KEY] });
      toast.success('View updated.');
    },
    onError: (e) => toast.error(apiError(e, 'Could not update the view.')),
  });
}

export function useDeleteSavedView() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => apiClient.delete(`/reports/saved-views/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [SAVED_VIEWS_KEY] });
      qc.invalidateQueries({ queryKey: [SCHEDULES_KEY] });
      toast.success('View deleted.');
    },
    onError: (e) => toast.error(apiError(e, 'Could not delete the view.')),
  });
}

// ── Schedules ────────────────────────────────────────────────────────────────

export function useSchedules(page: number, pageSize: number) {
  return useQuery({
    queryKey: [SCHEDULES_KEY, page, pageSize],
    queryFn: () => get<ScheduleList>('/reports/schedules', { page, pageSize }),
    placeholderData: keepPreviousData,
  });
}

export function useRecipientOptions(enabled: boolean) {
  return useQuery({
    queryKey: [SCHEDULES_KEY, 'recipients'],
    queryFn: () => get<RecipientOption[]>('/reports/schedules/recipients'),
    enabled,
    staleTime: 5 * 60 * 1000,
  });
}

export function useCronPreview(cron: string, enabled: boolean) {
  return useQuery({
    queryKey: [SCHEDULES_KEY, 'preview', cron],
    queryFn: () => get<{ timeZone: string; runs: string[] }>('/reports/schedules/preview', { cron, count: 3 }),
    enabled: enabled && cron.trim().split(/\s+/).length === 5,
    retry: false,
  });
}

export interface ScheduleInput {
  savedViewId: string;
  cron: string;
  recipients: string[];
  format: 'CSV';
  isActive: boolean;
}

export function useSaveSchedule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...body }: ScheduleInput & { id?: string }) =>
      id ? (await apiClient.put(`/reports/schedules/${id}`, body)).data.data : (await apiClient.post('/reports/schedules', body)).data.data,
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: [SCHEDULES_KEY] });
      qc.invalidateQueries({ queryKey: [SAVED_VIEWS_KEY] });
      toast.success(vars.id ? 'Schedule updated.' : 'Schedule created.');
    },
    onError: (e) => toast.error(apiError(e, 'Could not save the schedule.')),
  });
}

export function useToggleSchedule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => apiClient.put(`/reports/schedules/${id}`, { isActive }),
    onSuccess: () => qc.invalidateQueries({ queryKey: [SCHEDULES_KEY] }),
    onError: (e) => toast.error(apiError(e, 'Could not update the schedule.')),
  });
}

export function useDeleteSchedule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => apiClient.delete(`/reports/schedules/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [SCHEDULES_KEY] });
      qc.invalidateQueries({ queryKey: [SAVED_VIEWS_KEY] });
      toast.success('Schedule deleted.');
    },
    onError: (e) => toast.error(apiError(e, 'Could not delete the schedule.')),
  });
}

export function useRunSchedule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => (await apiClient.post(`/reports/schedules/${id}/run`)).data.data as ScheduleRunResult,
    onSuccess: () => qc.invalidateQueries({ queryKey: [SCHEDULES_KEY] }),
    onError: (e) => toast.error(apiError(e, 'Could not run the report.')),
  });
}
