import apiClient from './client';

// ── Shared lookups ───────────────────────────────────────────────────────

export interface NamedRef {
  id: string;
  name: string;
}

export interface SessionYear {
  id: string;
  label: string;
  isCurrent: boolean;
}

export interface ClassOption {
  id: string;
  name: string;
  level?: number;
  medium?: { name: string } | null;
  stream?: { name: string } | null;
}

export interface SectionOption {
  id: string;
  name: string;
  class: { id: string; name: string };
}

/** eSchool-style class label: "Class 9 - Bangla - Science". */
export const classLabel = (c: ClassOption) =>
  [c.name, c.medium?.name, c.stream?.name].filter(Boolean).join(' - ');

const unwrap = <T,>(res: { data?: { data?: T } }, fallback: T): T => res.data?.data ?? fallback;

// Lookups degrade to an empty list rather than blocking the page.
const safeList = async <T,>(path: string): Promise<T[]> => {
  try {
    return unwrap(await apiClient.get(path), [] as T[]);
  } catch (err) {
    console.warn(`Failed to load ${path}`, err);
    return [];
  }
};

export const fetchClasses = () => safeList<ClassOption>('/academics/classes');
export const fetchSections = () => safeList<SectionOption>('/academics/sections');
export const fetchSemesters = () => safeList<NamedRef>('/academics/semesters');
export const fetchSubjects = () => safeList<NamedRef>('/curriculum/subjects/catalog');
export const fetchSessionYears = () => safeList<SessionYear>('/exams/meta/session-years');

// ── Exams ────────────────────────────────────────────────────────────────

export interface Exam {
  id: string;
  name: string;
  description: string | null;
  isPublished: boolean;
  startDate: string;
  endDate: string;
  academicYearId: string | null;
  academicYear: { id: string; label: string } | null;
  semesterId: string | null;
  semester: { id: string; name: string } | null;
  classes: { class: ClassOption }[];
  _count: { results: number; timetable: number };
}

export interface ExamPayload {
  name: string;
  academicYearId: string;
  semesterId: string | null;
  classIds: string[];
  description: string | null;
}

export const examsApi = {
  list: async (params: { classId?: string; academicYearId?: string } = {}) =>
    unwrap<Exam[]>(await apiClient.get('/exams', { params }), []),
  create: (data: ExamPayload) => apiClient.post('/exams', data),
  update: (id: string, data: ExamPayload) => apiClient.put(`/exams/${id}`, data),
  setPublished: (id: string, isPublished: boolean) => apiClient.patch(`/exams/${id}/publish`, { isPublished }),
  remove: (id: string) => apiClient.delete(`/exams/${id}`),
};

// ── Exam Timetable ───────────────────────────────────────────────────────

export interface TimetableEntryPayload {
  subjectId: string;
  totalMarks: number;
  passingMarks: number;
  date: string; // YYYY-MM-DD
  startTime: string; // HH:mm
  endTime: string; // HH:mm
}

export interface TimetableEntry extends Omit<TimetableEntryPayload, 'totalMarks' | 'passingMarks'> {
  id: string;
  examId: string;
  classId: string;
  // Prisma Decimals serialize as strings.
  totalMarks: string | number;
  passingMarks: string | number;
  exam: { id: string; name: string; academicYear: { id: string; label: string } | null };
  class: ClassOption;
  subject: NamedRef;
}

export const timetableApi = {
  list: async (params: { examId?: string; classId?: string } = {}) =>
    unwrap<TimetableEntry[]>(await apiClient.get('/exams/timetable', { params }), []),
  create: (data: { examId: string; classId: string; entries: TimetableEntryPayload[] }) =>
    apiClient.post('/exams/timetable', data),
  update: (id: string, data: TimetableEntryPayload) => apiClient.put(`/exams/timetable/${id}`, data),
  remove: (id: string) => apiClient.delete(`/exams/timetable/${id}`),
};

// ── Exam Grades ──────────────────────────────────────────────────────────

export interface ExamGrade {
  id: string;
  minPercent: string | number;
  maxPercent: string | number;
  grade: string;
}

export const gradesApi = {
  list: async () => unwrap<ExamGrade[]>(await apiClient.get('/exams/grades'), []),
  save: (grades: { minPercent: number; maxPercent: number; grade: string }[]) =>
    apiClient.put('/exams/grades', { grades }),
};

// ── Exam Result ──────────────────────────────────────────────────────────

export interface ClassResultRow {
  id: string;
  studentId: string;
  firstName: string;
  lastName: string;
  rollNumber: string | null;
  avatarUrl: string | null;
  section: { id: string; name: string } | null;
  subjectCount: number;
  totalMarks: number | null;
  obtainedMarks: number | null;
  percentage: number | null;
  grade: string | null;
  status: 'PASS' | 'FAIL' | null;
  rank: number | null;
}

export const examResultsApi = {
  list: async (params: { examId: string; classId: string; sectionId?: string }) =>
    unwrap<ClassResultRow[]>(await apiClient.get('/exams/results', { params }), []),
  downloadReportCard: async (studentId: string, examId: string) => {
    const res = await apiClient.get(`/results/${studentId}/report-card`, {
      params: { examId },
      responseType: 'blob',
    });
    return new Blob([res.data], { type: 'application/pdf' });
  },
};
