import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import apiClient from '@/api/client';
import type { CellStatus, ReportKey } from './dues.logic';
import { fileNameFrom, saveBlob } from './dues.logic';

// =============================================================================
// P4 dues, reports and restrictions — data layer (/api/v1/fee-dues/...).
// =============================================================================

const KEY = ['fee-dues'] as const;

export interface GridCell { month: string; status: CellStatus; billed: number; paid: number; due: number; invoices: number; overdue: boolean }
export interface GridRow {
  id: string; studentCode: string; name: string; rollNumber: string | null; className: string | null; sectionName: string | null;
  totals: { billed: number; paid: number; due: number; overdue: number };
  cells: GridCell[];
}
export interface GridData {
  months: string[];
  rows: GridRow[];
  columns: Array<{ month: string; billed: number; paid: number; due: number; studentsWithDues: number; collectionRate: number | null }>;
  summary: { students: number; billed: number; collected: number; outstanding: number; overdue: number; collectionRate: number | null; studentsWithDues: number };
  page: number; pageSize: number; total: number;
}
export interface GridParams {
  from: string; to: string; classId?: string; sectionId?: string; feeCategoryId?: string; status?: string; search?: string; studentStatus?: string; page?: number; pageSize?: number;
}

export interface DefaulterRow {
  id: string; studentCode: string; name: string; rollNumber: string | null; className: string | null; sectionName: string | null;
  monthsDue: number; months: string[]; amountDue: number; oldestDueDate: string | null; lastPaymentAt: string | null; lastRemindedAt: string | null;
  guardianName: string | null; guardianPhone: string | null; guardianEmail: string | null;
}
export interface DefaulterParams { classId?: string; sectionId?: string; search?: string; minMonths?: number; minAmount?: number; page?: number; pageSize?: number }

export interface FilterOptions {
  timeZone: string;
  classes: Array<{ id: string; name: string; sections: Array<{ id: string; name: string }> }>;
  categories: Array<{ id: string; name: string; isActive: boolean }>;
  collectors: Array<{ id: string; name: string; role: string }>;
  methods: string[];
  sessions: Array<{ id: string; label: string; isCurrent: boolean; fromMonth: string; toMonth: string }>;
}

export interface DuesSettings {
  restrictionsEnabled: boolean;
  minMonthsDue: number | null;
  minAmountDueTaka: number | null;
  overdueDays: number | null;
  blockResults: boolean;
  blockAdmitCard: boolean;
  blockIdCard: boolean;
  blockPortalLogin: boolean;
  blockOnlineExam: boolean;
  restrictionMessage: string | null;
  smsTemplate: string;
  emailSubject: string;
  emailTemplate: string;
}

export interface RestrictedRow {
  id: string; studentCode: string; name: string; className: string | null; sectionName: string | null;
  monthsDue: number; amountDue: number; daysOverdue: number; lastPaymentAt: string | null;
  manualState: 'BLOCKED' | 'UNBLOCKED' | null; manualReason: string | null; exempt: boolean; exemptReason: string | null;
  restricted: boolean; source: string; reasons: string[];
}

export interface ReminderBody {
  studentIds?: string[];
  filter?: Omit<DefaulterParams, 'page' | 'pageSize'>;
  channels: Array<'SMS' | 'EMAIL'>;
  smsTemplate?: string;
  emailSubject?: string;
  emailTemplate?: string;
}
export interface ReminderPreview {
  students: number;
  sms: { messages: number; segments: number; maxSegmentsPerMessage: number; encoding: 'GSM' | 'UNICODE'; noPhone: number } | null;
  email: { messages: number; noEmail: number } | null;
  totalMessages: number;
  samples: Array<{ studentId: string; student: string; phone: string | null; email: string | null; sms: string; segments: { segments: number; encoding: string; length: number }; emailSubject: string; emailBody: string }>;
}
export interface SendResult {
  batchId: string; done: boolean; students?: number;
  sms?: { sent: number; skipped: number; failed: number };
  email?: { sent: number; skipped: number; failed: number };
}

export interface ReportDoc {
  key: ReportKey; title: string; subtitle?: string;
  filters: Array<{ label: string; value: string }>;
  tables: Array<{ title?: string; columns: Array<{ key: string; label: string; type?: string }>; rows: Array<Record<string, unknown>>; totals?: Record<string, unknown> | null }>;
  notes?: string[];
  generatedAt: string;
}

const clean = <T extends object>(p: T) => Object.fromEntries(Object.entries(p).filter(([, v]) => v !== '' && v !== undefined && v !== null));

export const useFilterOptions = () =>
  useQuery({ queryKey: [...KEY, 'options'], queryFn: async (): Promise<FilterOptions> => (await apiClient.get('/fee-dues/reports/options')).data.data, staleTime: 5 * 60_000 });

export const useDuesGrid = (p: GridParams, enabled = true) =>
  useQuery({
    queryKey: [...KEY, 'grid', p],
    queryFn: async (): Promise<GridData> => (await apiClient.get('/fee-dues/grid', { params: clean(p) })).data.data,
    placeholderData: keepPreviousData,
    enabled,
  });

export const useStudentLedger = (studentId: string | null, range: { from: string; to: string }) =>
  useQuery({
    queryKey: [...KEY, 'ledger', studentId, range],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    queryFn: async (): Promise<any> => (await apiClient.get(`/fee-dues/students/${studentId}/ledger`, { params: range })).data.data,
    enabled: !!studentId,
  });

export const useDefaulters = (p: DefaulterParams) =>
  useQuery({
    queryKey: [...KEY, 'defaulters', p],
    queryFn: async (): Promise<{ items: DefaulterRow[]; total: number; totalAmount: number; page: number; pageSize: number }> =>
      (await apiClient.get('/fee-dues/defaulters', { params: clean(p) })).data.data,
    placeholderData: keepPreviousData,
  });

export const useDuesWidget = (enabled = true) =>
  useQuery({
    queryKey: [...KEY, 'widget'],
    queryFn: async (): Promise<{ month: string; billedThisMonth: number; collectedForThisMonth: number; collectedThisMonth: number; collectionRate: number | null; topDefaulterClasses: Array<{ classId: string | null; className: string; due: number; students: number }> }> =>
      (await apiClient.get('/fee-dues/widget')).data.data,
    enabled,
    staleTime: 60_000,
  });

export const useDuesSettings = () =>
  useQuery({ queryKey: [...KEY, 'settings'], queryFn: async (): Promise<DuesSettings> => (await apiClient.get('/fee-dues/settings')).data.data });

export const useSaveDuesSettings = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: Partial<Omit<DuesSettings, 'minAmountDueTaka' | 'smsTemplate' | 'emailSubject' | 'emailTemplate'>> & {
      minAmountDue?: number | null; smsTemplate?: string | null; emailSubject?: string | null; emailTemplate?: string | null;
    }) => (await apiClient.put('/fee-dues/settings', body)).data.data as DuesSettings,
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
};

export const useRestricted = (p: { view: 'RESTRICTED' | 'OVERRIDES'; classId?: string; search?: string; page?: number }) =>
  useQuery({
    queryKey: [...KEY, 'restricted', p],
    queryFn: async (): Promise<{ items: RestrictedRow[]; total: number; page: number; pageSize: number; settings: { restrictionsEnabled: boolean } }> =>
      (await apiClient.get('/fee-dues/restricted', { params: clean(p) })).data.data,
    placeholderData: keepPreviousData,
  });

export const useSetBlock = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ studentId, state, reason }: { studentId: string; state: 'BLOCKED' | 'UNBLOCKED' | 'AUTO'; reason: string }) =>
      (await apiClient.put(`/fee-dues/students/${studentId}/block`, { state, reason })).data.data,
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
};

export const useSetExempt = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ studentId, exempt, reason }: { studentId: string; exempt: boolean; reason?: string }) =>
      (await apiClient.put(`/fee-dues/students/${studentId}/exempt`, { exempt, reason })).data.data,
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
};

export const previewReminders = async (body: ReminderBody): Promise<ReminderPreview> => (await apiClient.post('/fee-dues/reminders/preview', body)).data.data;
export const sendReminders = async (body: ReminderBody): Promise<SendResult> => (await apiClient.post('/fee-dues/reminders/send', body)).data.data;
export const getBatch = async (batchId: string) =>
  (await apiClient.get(`/fee-dues/reminders/batches/${batchId}`)).data.data as { attempted: number; sms: { sent: number; skipped: number; failed: number }; email: { sent: number; skipped: number; failed: number } };

export const useReport = (key: ReportKey, params: Record<string, string | undefined>, enabled: boolean) =>
  useQuery({
    queryKey: [...KEY, 'report', key, params],
    queryFn: async (): Promise<ReportDoc> => (await apiClient.get(`/fee-dues/reports/${key}`, { params: clean(params) })).data.data,
    enabled,
  });

export async function downloadReport(key: ReportKey, params: Record<string, string | undefined>, format: 'xlsx' | 'csv' | 'pdf') {
  const res = await apiClient.get(`/fee-dues/reports/${key}`, { params: { ...clean(params), format }, responseType: 'blob' });
  saveBlob(res.data, fileNameFrom(res.headers['content-disposition'], `${key}.${format}`));
}

export const useMyFeeStatus = (enabled: boolean) =>
  useQuery({
    queryKey: [...KEY, 'me'],
    queryFn: async (): Promise<{ features: Record<string, { blocked: boolean; studentIds: string[] }>; contact: { school: string; phone: string | null; email: string | null; note: string | null } | null }> =>
      (await apiClient.get('/fee-dues/me/status')).data.data,
    enabled,
    staleTime: 60_000,
  });

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const apiErrorMessage = (e: unknown, fallback: string) => ((e as any)?.response?.data?.message as string | undefined) || fallback;
