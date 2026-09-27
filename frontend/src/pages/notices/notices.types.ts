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
}

export interface NoticeFormValues {
  title: string;
  content: string;
  audience: NoticeAudience;
  isActive: boolean;
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
};
