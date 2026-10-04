// Shared lookup queries (exams, classes, sections, session years) for the
// results insights, promotion and exam-timetable pages. Existing endpoints:
//   GET /results?pageSize=100          (exam list, paginated → data[])
//   GET /students/meta/classes         (SA/A/T/ACCOUNTANT/LIBRARIAN)
//   GET /students/meta/sections?classId
//   GET /session-years                 (all roles)
import { useQuery } from '@tanstack/react-query';
import apiClient from '../../api/client';

export interface ExamOption {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  isActive: boolean;
}
export interface ClassOption {
  id: string;
  name: string;
}
export interface SectionOption {
  id: string;
  name: string;
}
export interface SessionYearOption {
  id: string;
  label: string;
  isCurrent: boolean;
  startDate: string;
  endDate: string;
}

export function useExamOptions(enabled = true) {
  return useQuery({
    queryKey: ['lookup-exams'],
    queryFn: async (): Promise<ExamOption[]> => {
      const { data } = await apiClient.get('/results', { params: { page: 1, pageSize: 100 } });
      return data.data ?? [];
    },
    enabled,
    staleTime: 60 * 1000,
  });
}

export function useClassOptions(enabled = true) {
  return useQuery({
    queryKey: ['lookup-classes'],
    queryFn: async (): Promise<ClassOption[]> => {
      const { data } = await apiClient.get('/students/meta/classes');
      return data.data ?? [];
    },
    enabled,
    staleTime: 5 * 60 * 1000,
  });
}

export function useSectionOptions(classId: string | null | undefined) {
  return useQuery({
    queryKey: ['lookup-sections', classId],
    queryFn: async (): Promise<SectionOption[]> => {
      const { data } = await apiClient.get('/students/meta/sections', { params: { classId } });
      return data.data ?? [];
    },
    enabled: !!classId,
    staleTime: 5 * 60 * 1000,
  });
}

export function useSessionYears(enabled = true) {
  return useQuery({
    queryKey: ['lookup-session-years'],
    queryFn: async (): Promise<SessionYearOption[]> => {
      const { data } = await apiClient.get('/session-years');
      return data.data ?? [];
    },
    enabled,
    staleTime: 5 * 60 * 1000,
  });
}

export const errorMessage = (err: unknown, fallback: string): string =>
  (err as { response?: { data?: { message?: string } } })?.response?.data?.message || fallback;
