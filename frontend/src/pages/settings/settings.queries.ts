import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import apiClient from '@/api/client';
import { useUiStore } from '@/store/uiStore';

// =============================================================================
// Settings — local data layer. Kept next to the pages that use it (per the
// redesign brief, shared /api and /hooks files are out of this task's scope),
// wrapping the same endpoints Settings.tsx used to call directly with
// useState/useEffect.
// =============================================================================

export interface InstitutionWebsiteConfig {
  name?: string;
  email?: string;
  contactEmail?: string;
  phone?: string;
  contactPhone?: string;
  address?: string;
  logoUrl?: string | null;
  themeColor?: string | null;
  heroTitle?: string;
  heroSubtitle?: string;
  aboutText?: string;
}

export const INSTITUTION_WEBSITE_KEY = ['institution-website'] as const;

export function useInstitutionWebsite() {
  return useQuery({
    queryKey: INSTITUTION_WEBSITE_KEY,
    queryFn: async (): Promise<InstitutionWebsiteConfig> => {
      const { data } = await apiClient.get('/institution/website');
      return data?.data ?? {};
    },
  });
}

export function useUpdateInstitutionWebsite() {
  const qc = useQueryClient();
  const { setInstitutionBranding } = useUiStore();
  return useMutation({
    mutationFn: async (payload: Partial<InstitutionWebsiteConfig>) => {
      const { data } = await apiClient.put('/institution/website', payload);
      return data?.data ?? payload;
    },
    onSuccess: (data: any, variables) => {
      setInstitutionBranding(
        (data?.logoUrl ?? variables.logoUrl) || null,
        (data?.name ?? variables.name) || null
      );
      qc.invalidateQueries({ queryKey: INSTITUTION_WEBSITE_KEY });
    },
  });
}

// ── Exams (Manage exams tab; also backs the read-only academic calendar on
// the non-admin Profile tab) ────────────────────────────────────────────────

export interface Exam {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  isActive: boolean;
}

export const EXAMS_KEY = ['settings-exams'] as const;

export function useExams(options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: EXAMS_KEY,
    enabled: options.enabled ?? true,
    queryFn: async (): Promise<Exam[]> => {
      const { data } = await apiClient.get('/results?pageSize=100');
      return data?.data ?? [];
    },
  });
}

export interface ExamFormValues {
  name: string;
  startDate: string;
  endDate: string;
  isActive: boolean;
}

export function useCreateExam() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: ExamFormValues) => {
      const { data } = await apiClient.post('/results', payload);
      return data?.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: EXAMS_KEY }),
  });
}

export function useUpdateExam() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...payload }: ExamFormValues & { id: string }) => {
      const { data } = await apiClient.put(`/results/${id}`, payload);
      return data?.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: EXAMS_KEY }),
  });
}

export function useDeleteExam() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await apiClient.delete(`/results/${id}`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: EXAMS_KEY }),
  });
}

// ── Notification preferences ────────────────────────────────────────────────
// Mirrors backend/src/modules/notifications/notifications.dto.ts exactly.
// Keep NOTIFICATION_TYPE_GROUPS in sync with NOTIFICATION_TYPES there — it is
// intentionally not imported from src/api/notifications.api.ts because that
// file's own NOTIFICATION_TYPES list predates the leave/event/lead types and
// is out of this task's scope to correct.

export type NotificationChannel = 'IN_APP' | 'EMAIL' | 'SMS';

export const NOTIFICATION_CHANNELS: NotificationChannel[] = ['IN_APP', 'EMAIL', 'SMS'];

export const NOTIFICATION_CHANNEL_LABELS: Record<NotificationChannel, string> = {
  IN_APP: 'In-app',
  EMAIL: 'Email',
  SMS: 'SMS',
};

export interface NotificationTypeGroup {
  label: string;
  types: { type: string; label: string }[];
}

export const NOTIFICATION_TYPE_GROUPS: NotificationTypeGroup[] = [
  {
    label: 'Fees',
    types: [
      { type: 'INVOICE_ISSUED', label: 'Invoice issued' },
      { type: 'PAYMENT_RECEIVED', label: 'Payment received' },
      { type: 'FEE_REMINDER', label: 'Fee reminder' },
    ],
  },
  {
    label: 'Attendance',
    types: [{ type: 'ABSENCE_ALERT', label: 'Absence alert' }],
  },
  {
    label: 'Leave',
    types: [
      { type: 'LEAVE_REQUESTED', label: 'Leave requested' },
      { type: 'LEAVE_APPROVED', label: 'Leave approved' },
      { type: 'LEAVE_REJECTED', label: 'Leave rejected' },
    ],
  },
  {
    label: 'Events',
    types: [{ type: 'EVENT_PUBLISHED', label: 'Event published' }],
  },
  {
    label: 'Subscription & billing',
    types: [
      { type: 'SUBSCRIPTION_ACTIVATED', label: 'Subscription activated' },
      { type: 'SUBSCRIPTION_PAYMENT_FAILED', label: 'Payment failed' },
      { type: 'SUBSCRIPTION_PAYMENT_REQUESTED', label: 'Payment requested' },
      { type: 'SUBSCRIPTION_ADJUSTED', label: 'Subscription adjusted' },
      { type: 'SUBSCRIPTION_REFUND_INITIATED', label: 'Refund initiated' },
      { type: 'SUBSCRIPTION_REFUNDED', label: 'Refund completed' },
      { type: 'SUBSCRIPTION_TRIAL_ENDING', label: 'Trial ending soon' },
      { type: 'SUBSCRIPTION_TRIAL_EXPIRED', label: 'Trial expired' },
      { type: 'SUBSCRIPTION_GRACE', label: 'Grace period started' },
      { type: 'SUBSCRIPTION_SUSPENDED', label: 'Account suspended' },
    ],
  },
  {
    label: 'Platform',
    types: [{ type: 'LEAD_SUBMITTED', label: 'New lead submitted' }],
  },
  {
    label: 'Support tickets',
    types: [
      { type: 'SUPPORT_TICKET_CREATED', label: 'Ticket created' },
      { type: 'SUPPORT_TICKET_REPLIED', label: 'Ticket replied' },
      { type: 'SUPPORT_TICKET_STATUS_CHANGED', label: 'Ticket status changed' },
    ],
  },
  {
    label: 'Results & HR',
    types: [
      { type: 'RESULTS_PUBLISHED', label: 'Results published' },
      { type: 'PAYSLIP_ISSUED', label: 'Payslip issued' },
      { type: 'DATA_EXPORT_READY', label: 'Data export ready' },
    ],
  },
];

export interface NotificationPreferenceRow {
  type: string;
  channel: NotificationChannel;
  enabled: boolean;
}

export const NOTIFICATION_PREFERENCES_KEY = ['notification-preferences'] as const;

export function useNotificationPreferences() {
  return useQuery({
    queryKey: NOTIFICATION_PREFERENCES_KEY,
    queryFn: async (): Promise<NotificationPreferenceRow[]> => {
      const { data } = await apiClient.get('/notifications/preferences');
      return data?.data ?? [];
    },
  });
}

export function useUpdateNotificationPreferences() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (preferences: NotificationPreferenceRow[]) => {
      const { data } = await apiClient.put('/notifications/preferences', { preferences });
      return (data?.data ?? []) as NotificationPreferenceRow[];
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: NOTIFICATION_PREFERENCES_KEY }),
  });
}

// ── Notification templates (admin) — per-school EMAIL/SMS/IN_APP copy
// overrides. Track A's "per-school template override editor" reuses this
// existing endpoint (backend/src/modules/notifications/notifications.routes.ts),
// which had no UI before.

export interface NotificationTemplateRow {
  key: string;
  channel: NotificationChannel;
  subject: string | null;
  body: string;
  isActive: boolean;
  source: 'tenant' | 'default';
}

export const NOTIFICATION_TEMPLATES_KEY = ['notification-templates'] as const;

export function useNotificationTemplates() {
  return useQuery({
    queryKey: NOTIFICATION_TEMPLATES_KEY,
    queryFn: async (): Promise<NotificationTemplateRow[]> => {
      const { data } = await apiClient.get('/notifications/templates');
      return data?.data ?? [];
    },
  });
}

export function useUpsertNotificationTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { key: string; channel: NotificationChannel; subject?: string | null; body: string; isActive?: boolean }) => {
      const { data } = await apiClient.put(`/notifications/templates/${input.key}/${input.channel}`, {
        subject: input.subject ?? null,
        body: input.body,
        isActive: input.isActive ?? true,
      });
      return data?.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: NOTIFICATION_TEMPLATES_KEY }),
  });
}
