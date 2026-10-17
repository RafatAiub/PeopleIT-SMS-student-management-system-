import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import apiClient from '@/api/client';
import { translate } from '@/i18n';
import { ENQUIRIES_KEY, ENQUIRY_BOARD_KEY, ENQUIRY_FUNNEL_KEY } from './enquiries.queries';
import type { Enquiry, StageRef } from './enquiries.types';
import type { BoardColumnData } from './crm.logic';

// =============================================================================
// T4 Admissions CRM — React Query data layer for /api/v1/crm.
// =============================================================================

export const CRM_KEY = 'crm';
const err = (e: any, fallback: string) => e?.response?.data?.message || translate(fallback);

export interface Stage extends StageRef {
  status: string;
  enquiryCount: number;
}

export interface CrmFilters {
  search?: string;
  assignedToUserId?: string;
  mine?: boolean;
  due?: 'overdue' | 'today' | '';
  source?: string;
  classInterested?: string;
  priority?: string;
  stageId?: string;
}

export function filtersToQuery(f: CrmFilters): URLSearchParams {
  const q = new URLSearchParams();
  if (f.search) q.set('search', f.search);
  if (f.assignedToUserId) q.set('assignedToUserId', f.assignedToUserId);
  if (f.mine) q.set('mine', 'true');
  if (f.due) q.set('due', f.due);
  if (f.source) q.set('source', f.source);
  if (f.classInterested) q.set('classInterested', f.classInterested);
  if (f.priority) q.set('priority', f.priority);
  if (f.stageId) q.set('stageId', f.stageId);
  return q;
}

export function invalidateCrm(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: [CRM_KEY] });
  qc.invalidateQueries({ queryKey: [ENQUIRIES_KEY] });
  qc.invalidateQueries({ queryKey: [ENQUIRY_BOARD_KEY] });
  qc.invalidateQueries({ queryKey: [ENQUIRY_FUNNEL_KEY] });
}

// ── Stages & board ──────────────────────────────────────────────────────────

export function useStages() {
  return useQuery({
    queryKey: [CRM_KEY, 'stages'],
    queryFn: async (): Promise<Stage[]> => (await apiClient.get('/crm/stages')).data.data,
    staleTime: 60_000,
  });
}

export function useSaveStages() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { stages: unknown[]; reassign?: Record<string, string> }) => apiClient.put('/crm/stages', body),
    onSuccess: () => {
      invalidateCrm(qc);
      toast.success(translate('Pipeline saved'));
    },
    onError: (e) => toast.error(err(e, 'Could not save the pipeline')),
  });
}

export function boardKey(f: CrmFilters) {
  return [CRM_KEY, 'board', f] as const;
}

export function useCrmBoard(f: CrmFilters) {
  return useQuery({
    queryKey: boardKey(f),
    queryFn: async (): Promise<{ columns: BoardColumnData[]; unstaged: number }> => {
      const q = filtersToQuery(f);
      q.delete('stageId');
      q.set('limit', '50');
      return (await apiClient.get(`/crm/board?${q.toString()}`)).data.data;
    },
  });
}

export function useFilterOptions() {
  return useQuery({
    queryKey: [CRM_KEY, 'filter-options'],
    queryFn: async (): Promise<{ sources: string[]; classes: string[] }> => (await apiClient.get('/crm/filter-options')).data.data,
    staleTime: 5 * 60_000,
  });
}

export function useMoveStage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: string; stageId: string; lostReason?: string | null; note?: string | null }): Promise<Enquiry> =>
      apiClient.patch(`/crm/enquiries/${v.id}/stage`, { stageId: v.stageId, lostReason: v.lostReason, note: v.note }).then((r) => r.data.data),
    onSettled: () => invalidateCrm(qc),
    onError: (e) => toast.error(err(e, 'Could not move the enquiry')),
  });
}

// ── Timeline ────────────────────────────────────────────────────────────────

export interface Activity {
  id: string;
  type: string;
  body: string | null;
  metadata: Record<string, unknown> | null;
  actorUserId: string | null;
  actorName: string | null;
  createdAt: string;
}

export interface CrmTask {
  id: string;
  title: string;
  notes: string | null;
  dueAt: string | null;
  done: boolean;
  doneAt: string | null;
  assigneeUserId: string | null;
  assignee: { id: string; firstName: string; lastName: string } | null;
  enquiryId: string | null;
  enquiry: { id: string; studentName: string; phone: string; guardianName: string | null } | null;
  createdAt: string;
}

export function useTimeline(enquiryId: string | null | undefined) {
  return useQuery({
    queryKey: [CRM_KEY, 'timeline', enquiryId],
    enabled: !!enquiryId,
    queryFn: async (): Promise<{ activities: Activity[]; tasks: CrmTask[] }> => (await apiClient.get(`/crm/enquiries/${enquiryId}/timeline`)).data.data,
  });
}

export function useLogActivity() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { enquiryId: string; type: string; body: string; at?: string | null }) =>
      apiClient.post(`/crm/enquiries/${v.enquiryId}/activities`, { type: v.type, body: v.body, at: v.at || undefined }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [CRM_KEY, 'timeline'] });
      toast.success(translate('Activity logged'));
    },
    onError: (e) => toast.error(err(e, 'Could not log the activity')),
  });
}

// ── Tasks ───────────────────────────────────────────────────────────────────

export interface TaskQuery {
  scope: 'mine' | 'all';
  status: 'open' | 'done' | 'overdue' | 'today' | 'all';
  assigneeUserId?: string;
  page: number;
  pageSize: number;
}

export function useTasks(q: TaskQuery) {
  return useQuery({
    queryKey: [CRM_KEY, 'tasks', q],
    queryFn: async (): Promise<{ items: CrmTask[]; total: number }> => {
      const p = new URLSearchParams({ scope: q.scope, status: q.status, page: String(q.page), pageSize: String(q.pageSize) });
      if (q.assigneeUserId) p.set('assigneeUserId', q.assigneeUserId);
      const r = await apiClient.get(`/crm/tasks?${p.toString()}`);
      return { items: r.data.data ?? [], total: r.data.meta?.total ?? 0 };
    },
  });
}

export function useTaskSummary(enabled = true) {
  return useQuery({
    queryKey: [CRM_KEY, 'tasks', 'summary'],
    enabled,
    queryFn: async (): Promise<{ open: number; overdue: number; today: number }> => (await apiClient.get('/crm/tasks/summary')).data.data,
    staleTime: 60_000,
  });
}

export function useCreateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { title: string; notes?: string | null; dueAt?: string | null; assigneeUserId?: string | null; enquiryId?: string | null }) =>
      apiClient.post('/crm/tasks', body),
    onSuccess: () => {
      invalidateCrm(qc);
      toast.success(translate('Task added'));
    },
    onError: (e) => toast.error(err(e, 'Could not add the task')),
  });
}

export function useUpdateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: string; done?: boolean; notes?: string | null; title?: string; dueAt?: string | null; assigneeUserId?: string | null }) => {
      const { id, ...body } = v;
      return apiClient.patch(`/crm/tasks/${id}`, body);
    },
    onSuccess: () => invalidateCrm(qc),
    onError: (e) => toast.error(err(e, 'Could not save the task')),
  });
}

export function useDeleteTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/crm/tasks/${id}`),
    onSuccess: () => {
      invalidateCrm(qc);
      toast.success(translate('Task deleted'));
    },
    onError: (e) => toast.error(err(e, 'Could not delete the task')),
  });
}

// ── Contacts ────────────────────────────────────────────────────────────────

export type ContactType = 'ENQUIRER' | 'VOLUNTEER' | 'DONOR' | 'OTHER';

export interface Contact {
  id: string;
  type: ContactType;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  organisation: string | null;
  tags: string[];
  notes: string | null;
  ownerUserId: string | null;
  owner: { id: string; firstName: string; lastName: string } | null;
  enquiryId: string | null;
  enquiry: { id: string; studentName: string } | null;
  donorId: string | null;
  donor: { id: string; name: string } | null;
  createdAt: string;
}

export function useContacts(q: { type?: string; tag?: string; search?: string; page: number; pageSize: number }) {
  return useQuery({
    queryKey: [CRM_KEY, 'contacts', q],
    queryFn: async (): Promise<{ items: Contact[]; total: number; donationsEnabled: boolean }> => {
      const p = new URLSearchParams({ page: String(q.page), pageSize: String(q.pageSize) });
      if (q.type) p.set('type', q.type);
      if (q.tag) p.set('tag', q.tag);
      if (q.search) p.set('search', q.search);
      const r = await apiClient.get(`/crm/contacts?${p.toString()}`);
      return { items: r.data.data ?? [], total: r.data.meta?.total ?? 0, donationsEnabled: !!r.data.meta?.donationsEnabled };
    },
  });
}

export function useContactTags() {
  return useQuery({
    queryKey: [CRM_KEY, 'contact-tags'],
    queryFn: async (): Promise<Array<{ tag: string; count: number }>> => (await apiClient.get('/crm/contacts/tags')).data.data,
  });
}

export function useSaveContact() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id?: string; body: Record<string, unknown> }) => (v.id ? apiClient.put(`/crm/contacts/${v.id}`, v.body) : apiClient.post('/crm/contacts', v.body)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [CRM_KEY, 'contacts'] });
      qc.invalidateQueries({ queryKey: [CRM_KEY, 'contact-tags'] });
      toast.success(translate('Contact saved'));
    },
    onError: (e) => toast.error(err(e, 'Could not save the contact')),
  });
}

export function useDeleteContact() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/crm/contacts/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [CRM_KEY, 'contacts'] });
      toast.success(translate('Contact deleted'));
    },
    onError: (e) => toast.error(err(e, 'Could not delete the contact')),
  });
}

export function useLinkDonor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.post(`/crm/contacts/${id}/link-donor`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [CRM_KEY, 'contacts'] });
      toast.success(translate('Linked to donor'));
    },
    onError: (e) => toast.error(err(e, 'Could not link the donor')),
  });
}

// ── Duplicates & merge ──────────────────────────────────────────────────────

export interface DupRow {
  id: string;
  studentName: string;
  guardianName: string | null;
  phone: string;
  email: string | null;
  classInterested: string | null;
  status: string;
  stage: { id: string; name: string; color: string } | null;
  convertedStudentId: string | null;
  createdAt: string;
  reasons?: string[];
}

export function useDuplicateGroups(enabled = true) {
  return useQuery({
    queryKey: [CRM_KEY, 'duplicates'],
    enabled,
    queryFn: async (): Promise<{ scanned: number; groups: Array<{ items: DupRow[]; reasons: string[] }> }> => (await apiClient.get('/crm/duplicates')).data.data,
  });
}

export function useDuplicateCheck(probe: { studentName: string; guardianName?: string; phone: string; email: string; excludeId?: string }, enabled: boolean) {
  return useQuery({
    queryKey: [CRM_KEY, 'dup-check', probe],
    enabled,
    staleTime: 30_000,
    queryFn: async (): Promise<DupRow[]> => (await apiClient.post('/crm/duplicates/check', probe)).data.data,
  });
}

export function useMerge() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { keepId: string; dropId: string }): Promise<Enquiry> => apiClient.post('/crm/merge', v).then((r) => r.data.data),
    onSuccess: () => {
      invalidateCrm(qc);
      toast.success(translate('Enquiries merged'));
    },
    onError: (e) => toast.error(err(e, 'Could not merge')),
  });
}

// ── Report ──────────────────────────────────────────────────────────────────

export type GroupBy = 'source' | 'class' | 'owner' | 'month';

export interface ConversionGroup {
  key: string;
  label: string;
  total: number;
  won: number;
  lost: number;
  open: number;
  conversionRate: number;
  avgDaysToAdmit: number | null;
}

export interface CrmReport {
  truncated: boolean;
  stages: StageRef[];
  overall: Omit<ConversionGroup, 'label'>;
  funnel: { total: number; lost: number; steps: Array<{ stageId: string; name: string; current: number; reached: number; rate: number }> };
  groupBy: GroupBy;
  groups: ConversionGroup[];
}

export function reportQuery(r: { from?: string; to?: string; groupBy: GroupBy }) {
  const p = new URLSearchParams({ groupBy: r.groupBy });
  if (r.from) p.set('from', r.from);
  if (r.to) p.set('to', `${r.to}T23:59:59.999`);
  return p.toString();
}

export function useCrmReport(r: { from?: string; to?: string; groupBy: GroupBy }) {
  return useQuery({
    queryKey: [CRM_KEY, 'report', r],
    queryFn: async (): Promise<CrmReport> => (await apiClient.get(`/crm/report?${reportQuery(r)}`)).data.data,
  });
}

export async function downloadReportCsv(r: { from?: string; to?: string; groupBy: GroupBy }) {
  const res = await apiClient.get(`/crm/report.csv?${reportQuery(r)}`, { responseType: 'blob' });
  const url = URL.createObjectURL(res.data as Blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `admissions-conversion-${r.groupBy}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
