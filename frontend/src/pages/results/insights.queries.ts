// Merit list, class analytics, transcript and progress report. Contracts:
// backend/src/modules/results/results.routes.ts + results.insights.service.ts.
import { useQuery } from '@tanstack/react-query';
import apiClient from '../../api/client';

export interface ScaleInfo {
  id: string | null;
  name: string;
  isFallback: boolean;
}

export interface ExamRef {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
}

export interface MeritRow {
  id: string;
  studentId: string;
  studentCode: string;
  name: string;
  rollNumber: string | null;
  sectionName: string | null;
  rank: number;
  totalObtained: number;
  totalMax: number;
  percent: number;
  gpa: number;
  grade: string;
  passed: boolean;
  failedSubjects: string[];
  subjectsCount: number;
  marks: Record<string, { marksObtained: number; maxMarks: number; grade: string; gradePoint: number }>;
}

export interface MeritList {
  exam: ExamRef;
  className: string;
  sectionName: string | null;
  rankBy: 'total' | 'percent';
  scale: ScaleInfo;
  subjects: string[];
  items: MeritRow[];
  stats: { students: number; passed: number; highestPercent: number };
}

export interface ClassAnalytics {
  exam: ExamRef;
  className: string;
  sectionName: string | null;
  scale: ScaleInfo;
  enrolledActiveStudents: number;
  studentsWithResults: number;
  passCount: number;
  failCount: number;
  passRate: number;
  averagePercent: number;
  highestPercent: number;
  lowestPercent: number;
  averageGpa: number;
  gradeDistribution: Array<{ grade: string; count: number }>;
  subjectGradeDistribution: Array<{ grade: string; count: number }>;
  subjectAverages: Array<{
    subject: string;
    entries: number;
    averagePercent: number;
    averageMarks: number;
    highestPercent: number;
    lowestPercent: number;
    passRate: number;
  }>;
}

export interface ResultSummary {
  subjects: number;
  totalObtained: number;
  totalMax: number;
  percent: number;
  gpa: number;
  failedSubjects: string[];
  passed: boolean;
  grade: string;
}

export interface TranscriptExam {
  exam: ExamRef;
  session: { id: string; label: string } | null;
  subjects: Array<{
    subject: string;
    marksObtained: number;
    maxMarks: number;
    percent: number;
    grade: string;
    gradePoint: number;
    remarks: string | null;
  }>;
  summary: ResultSummary;
}

export interface Transcript {
  institution: { name: string; logoUrl: string | null; address: string | null; phone: string | null; email: string | null } | null;
  student: {
    id: string;
    studentId: string;
    firstName: string;
    lastName: string;
    rollNumber: string | null;
    dateOfBirth: string | null;
    admissionDate: string | null;
    status: string;
    department: string | null;
    class: { id: string; name: string } | null;
    section: { id: string; name: string } | null;
    academicYear: { id: string; label: string } | null;
    guardianName: string | null;
  };
  scale: ScaleInfo;
  sessions: Array<{ session: { id: string; label: string } | null; exams: TranscriptExam[] }>;
  overall: { exams: number; totalObtained: number; totalMax: number; percent: number; averageGpa: number; passedExams: number };
  generatedAt: string;
}

export interface Progress {
  student: { id: string; studentId: string; firstName: string; lastName: string; class: { name: string } | null; section: { name: string } | null };
  scale: ScaleInfo;
  exams: Array<{ id: string; name: string; startDate: string; percent: number; gpa: number; passed: boolean }>;
  subjects: Array<{
    subject: string;
    points: Array<{ examId: string; marksObtained: number | null; maxMarks: number | null; percent: number | null; grade: string | null }>;
  }>;
}

export interface ClassScopeParams {
  examId: string;
  classId: string;
  sectionId?: string;
}

export function useMeritList(params: ClassScopeParams & { rankBy: 'total' | 'percent' }, enabled: boolean) {
  return useQuery({
    queryKey: ['results-merit-list', params],
    queryFn: async (): Promise<MeritList> => {
      const { data } = await apiClient.get('/results/merit-list', {
        params: { ...params, sectionId: params.sectionId || undefined },
      });
      return data.data;
    },
    enabled,
  });
}

export function useClassAnalytics(params: ClassScopeParams, enabled: boolean) {
  return useQuery({
    queryKey: ['results-class-analytics', params],
    queryFn: async (): Promise<ClassAnalytics> => {
      const { data } = await apiClient.get('/results/class-analytics', {
        params: { ...params, sectionId: params.sectionId || undefined },
      });
      return data.data;
    },
    enabled,
  });
}

/** studentId may be "me" for the signed-in STUDENT. */
export function useTranscript(studentId: string | null) {
  return useQuery({
    queryKey: ['results-transcript', studentId],
    queryFn: async (): Promise<Transcript> => (await apiClient.get(`/results/transcript/${studentId}`)).data.data,
    enabled: !!studentId,
  });
}

export function useProgress(studentId: string | null) {
  return useQuery({
    queryKey: ['results-progress', studentId],
    queryFn: async (): Promise<Progress> => (await apiClient.get(`/results/progress/${studentId}`)).data.data,
    enabled: !!studentId,
  });
}
