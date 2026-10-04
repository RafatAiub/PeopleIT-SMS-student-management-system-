import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import apiClient from '@/api/client';

export type SubjectStatus = 'PRESENT' | 'ABSENT' | 'LATE' | 'HALF_DAY';

export interface TeacherClass {
  className: string;
  sectionName: string;
  isClassTeacher: boolean;
}

export interface SubjectOption {
  subjectName: string;
  subjectId: string | null;
  source: 'TIMETABLE' | 'CURRICULUM';
  periods: { dayOfWeek: string; period: number; startTime: string; endTime: string }[];
}

export interface SubjectSheet {
  className: string;
  sectionName: string;
  subjectName: string;
  date: string;
  period: number | null;
  alreadyMarked: boolean;
  students: { id: string; studentId: string; name: string; rollNumber: string | null; status: SubjectStatus | null }[];
}

export interface Counts {
  present: number;
  absent: number;
  late: number;
  halfDay: number;
  total: number;
  percentage: number | null;
}

export interface SubjectReport {
  className: string;
  sectionName: string;
  from: string;
  to: string;
  subjects: string[];
  subjectTotals: (Counts & { subjectName: string; sessions: number })[];
  students: {
    id: string;
    studentId: string;
    name: string;
    rollNumber: string | null;
    bySubject: Record<string, Counts>;
    overall: Counts;
  }[];
}

export interface StudentSubjectView {
  student: { id: string; name: string };
  subjects: (Counts & { subjectName: string })[];
  recent: { date: string; subjectName: string; period: number | null; status: SubjectStatus }[];
}

const KEY = 'subject-attendance';

function errorMessage(error: any, fallback: string) {
  return error?.response?.data?.message || fallback;
}

export function useTeacherClasses(enabled: boolean) {
  return useQuery({
    queryKey: [KEY, 'my-classes'],
    queryFn: async (): Promise<TeacherClass[]> => (await apiClient.get('/subject-attendance/my-classes')).data.data,
    enabled,
  });
}

export function useSubjectOptions(className: string, sectionName: string) {
  return useQuery({
    queryKey: [KEY, 'options', className, sectionName],
    queryFn: async (): Promise<{ subjects: SubjectOption[] }> =>
      (await apiClient.get('/subject-attendance/options', { params: { className, sectionName } })).data.data,
    enabled: !!className && !!sectionName,
  });
}

export function useSubjectSheet(p: { className: string; sectionName: string; subjectName: string; date: string; period: number | null }) {
  return useQuery({
    queryKey: [KEY, 'sheet', p],
    queryFn: async (): Promise<SubjectSheet> =>
      (
        await apiClient.get('/subject-attendance/sheet', {
          params: { ...p, period: p.period ?? undefined },
        })
      ).data.data,
    enabled: !!p.className && !!p.sectionName && !!p.subjectName && !!p.date,
  });
}

export function useSubmitSubjectAttendance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dto: {
      className: string;
      sectionName: string;
      subjectName: string;
      date: string;
      period: number | null;
      records: { studentId: string; status: SubjectStatus }[];
    }) => apiClient.post('/subject-attendance/bulk', dto),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [KEY] });
      toast.success('Subject attendance saved.');
    },
    onError: (error: any) => toast.error(errorMessage(error, 'Failed to save subject attendance.')),
  });
}

export function useSubjectReport(p: { className: string; sectionName: string; from: string; to: string }) {
  return useQuery({
    queryKey: [KEY, 'report', p],
    queryFn: async (): Promise<SubjectReport> => (await apiClient.get('/subject-attendance/report', { params: p })).data.data,
    enabled: !!p.className && !!p.sectionName && !!p.from && !!p.to,
  });
}

export function useStudentSubjectView(mode: 'student' | 'guardian', studentId: string | null) {
  return useQuery({
    queryKey: [KEY, 'view', mode, studentId],
    queryFn: async (): Promise<StudentSubjectView> =>
      (await apiClient.get(mode === 'student' ? '/subject-attendance/my' : `/subject-attendance/child/${studentId}`)).data.data,
    enabled: mode === 'student' || !!studentId,
  });
}

export const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export const WEEKDAYS = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
export const weekdayOf = (day: string) => WEEKDAYS[new Date(`${day}T00:00:00Z`).getUTCDay()];
