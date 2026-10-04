export type NoticeAudience = 'ALL' | 'TEACHERS' | 'GUARDIANS' | 'STUDENTS';

export interface Notice {
  id: string;
  institutionId: string;
  title: string;
  content: string;
  audience: NoticeAudience;
  isActive: boolean;
  publishedAt: string;
  createdAt?: string;
  updatedAt?: string;
  /** Optional class/section targeting — null means the whole audience. */
  classId?: string | null;
  sectionId?: string | null;
  class?: { id: string; name: string } | null;
  section?: { id: string; name: string } | null;
  /** Hidden from students/guardians/other non-staff until this moment. */
  scheduledAt?: string | null;
}

export interface NoticeFormValues {
  title: string;
  content: string;
  audience: NoticeAudience;
  isActive: boolean;
  classId: string;
  sectionId: string;
  /** `datetime-local` input value ('' = publish now). */
  scheduledAt: string;
}

/** Wire shape sent to POST/PUT /notices. */
export interface NoticePayload {
  title: string;
  content: string;
  audience: NoticeAudience;
  isActive: boolean;
  classId: string | null;
  sectionId: string | null;
  scheduledAt: string | null;
}

export const AUDIENCE_OPTIONS: { value: NoticeAudience; label: string }[] = [
  { value: 'ALL', label: 'All Users (Public)' },
  { value: 'TEACHERS', label: 'Teachers Only' },
  { value: 'GUARDIANS', label: 'Guardians Only' },
  { value: 'STUDENTS', label: 'Students Only' },
];

export const EMPTY_NOTICE_FORM: NoticeFormValues = {
  title: '',
  content: '',
  audience: 'ALL',
  isActive: true,
  classId: '',
  sectionId: '',
  scheduledAt: '',
};

/** ISO -> value for <input type="datetime-local"> in the browser's local time. */
export function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function toPayload(values: NoticeFormValues): NoticePayload {
  return {
    title: values.title,
    content: values.content,
    audience: values.audience,
    isActive: values.isActive,
    classId: values.classId || null,
    sectionId: values.sectionId || null,
    scheduledAt: values.scheduledAt ? new Date(values.scheduledAt).toISOString() : null,
  };
}

export function isScheduled(notice: Pick<Notice, 'scheduledAt'>, now = Date.now()): boolean {
  return !!notice.scheduledAt && new Date(notice.scheduledAt).getTime() > now;
}
