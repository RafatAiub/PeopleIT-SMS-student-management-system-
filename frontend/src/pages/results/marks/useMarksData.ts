// All Grade Book Portal state, data fetching and calculations, extracted
// unchanged in behaviour from the old monolithic MarksEntry.tsx so the three
// tab components (UploadTab / ResultSheetTab / StudentMarksheetTab) and the
// MarksGrid can share one source of truth without prop-drilling every field
// individually. Every fetch, computed value, validation rule and export in
// here is a straight extraction — see the corresponding comments that used
// to live inline in MarksEntry.tsx for the "why".
import { useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import apiClient from '../../../api/client';
import { useAuthStore } from '../../../store/authStore';
import { Column } from '../../../components/DataTable/DataTable';
import { StatusBadge } from '../../../components/common/StatusBadge';
import {
  DEPARTMENTS,
  FALLBACK_SUBJECTS_JUNIOR,
  isSeniorClass as isSeniorClassName,
  getFallbackSubjects,
} from '../../../utils/curriculum';
import { useClassSectionMeta } from '../../../utils/classSections';
import { useResultSheet } from './useResultSheet';
import React from 'react';

export interface MarksheetRow {
  id: string;
  subject: string;
  marksObtained: number;
  maxMarks: number;
  grade: string | null;
  highestMarkInSubject: number;
}

// Mirrors computeGrade() in backend/src/utils/grading.ts — the AI comment
// endpoint requires a `grade` field, and marks are always server-graded on
// save, so this is only a client-side estimate to pass along with the
// generation request, never persisted as the real grade.
export const computeGradeClient = (marksObtained: number, maxMarks: number): string => {
  const percentage = maxMarks > 0 ? (marksObtained / maxMarks) * 100 : 0;
  if (percentage >= 80) return 'A+';
  if (percentage >= 70) return 'A';
  if (percentage >= 60) return 'A-';
  if (percentage >= 50) return 'B';
  if (percentage >= 40) return 'C';
  if (percentage >= 33) return 'D';
  return 'F';
};

export function useMarksData() {
  const { user } = useAuthStore();
  const isTeacher = user?.role === 'TEACHER';
  const isAdmin = user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN';

  const [exams, setExams] = useState<any[]>([]);
  const [selectedExam, setSelectedExam] = useState('');
  const [selectedClass, setSelectedClass] = useState('Class 8');
  const [selectedSection, setSelectedSection] = useState('A');
  const [selectedDepartment, setSelectedDepartment] = useState('None');
  const [availableSubjects, setAvailableSubjects] = useState<string[]>(FALLBACK_SUBJECTS_JUNIOR);
  const [focusedSubject, setFocusedSubject] = useState<string>('ALL');
  const [entryMode, setEntryMode] = useState<'cards' | 'subject' | 'matrix'>('cards');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSubjectFocus, setSelectedSubjectFocus] = useState<string>('');
  // Per-subject, not global — different subjects legitimately have different
  // max marks (e.g. ICT out of 50, others out of 100). A single shared value
  // here previously caused valid marks in one subject to be rejected using
  // another subject's max. subjectMaxMarks holds explicit values (loaded
  // from already-saved ExamResult rows, or a manual edit in the per-subject
  // strip); curriculumDefaults holds the NCTB default max marks fetched from
  // GET /curriculum/subjects for subjects with no saved marks yet. Kept as
  // two separate state slices (rather than merging one into the other) so
  // the two independent fetches that populate them can resolve in either
  // order without a race — the getter below just tries the more specific
  // source first.
  const [subjectMaxMarks, setSubjectMaxMarks] = useState<Record<string, string>>({});
  const [curriculumDefaults, setCurriculumDefaults] = useState<Record<string, number>>({});
  const getSubjectMaxMarks = (subject: string): number => {
    const raw = subjectMaxMarks[subject];
    if (raw !== undefined) {
      const n = parseInt(raw, 10);
      if (!isNaN(n) && n > 0) return n;
    }
    return curriculumDefaults[subject] ?? 100;
  };
  // What the per-subject chip input itself should show — the exact raw
  // string being typed (which may be '' mid-edit), falling back to the
  // resolved default only when there's no in-progress edit at all.
  const getSubjectMaxMarksInputValue = (subject: string): string =>
    subjectMaxMarks[subject] ?? String(curriculumDefaults[subject] ?? 100);
  const handleSubjectMaxMarksChange = (subject: string, val: string) => {
    setSubjectMaxMarks((prev) => ({ ...prev, [subject]: val }));
    setUnsavedChanges(true);
  };
  // Once the teacher clicks away, clean up an empty/invalid box back to the
  // resolved default rather than leaving it visibly blank.
  const handleSubjectMaxMarksBlur = (subject: string, val: string) => {
    const n = parseInt(val, 10);
    if (val.trim() === '' || isNaN(n) || n <= 0) {
      setSubjectMaxMarks((prev) => {
        const next = { ...prev };
        delete next[subject];
        return next;
      });
    }
  };
  // Remarks used to live in a single-line <input>, which silently scrolled
  // long text out of view with no indication there was more to read/edit.
  // Grows the textarea with the content instead, capped so one huge remark
  // can't blow out the row — resize-y still lets a teacher pull it taller.
  const getRemarksRows = (text: string) =>
    Math.min(6, Math.max(1, text.split('\n').length, Math.ceil(text.length / 40)));

  // Real class/section options for the ADMIN/SUPER_ADMIN picker (institution
  // roster, not a fixed guess at how many classes/sections exist). TEACHER
  // keeps using `assignedSections` from /attendance/my-sections below.
  const { classes: adminClasses, sections: adminSections } = useClassSectionMeta(selectedClass);

  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [generatingFor, setGeneratingFor] = useState<string | null>(null);
  // Cells whose remarks text came from POST /ai/comment and hasn't been
  // re-typed by the teacher since — rendered inside <AiGeneratedNotice> so
  // it's clearly flagged for review before Save.
  const [aiGeneratedKeys, setAiGeneratedKeys] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (availableSubjects.length > 0 && (!selectedSubjectFocus || !availableSubjects.includes(selectedSubjectFocus))) {
      setSelectedSubjectFocus(availableSubjects[0]);
    }
  }, [availableSubjects, selectedSubjectFocus]);

  const displayedSubjects = useMemo(() => {
    if (focusedSubject === 'ALL' || !availableSubjects.includes(focusedSubject)) {
      return availableSubjects;
    }
    return [focusedSubject];
  }, [focusedSubject, availableSubjects]);

  const [unsavedChanges, setUnsavedChanges] = useState(false);
  const [uploadSummary, setUploadSummary] = useState<{ students: number; marks: number } | null>(null);

  const [assignedSections, setAssignedSections] = useState<any[]>([]);
  const [hasAssignments, setHasAssignments] = useState(true);
  const [classesMeta, setClassesMeta] = useState<any[]>([]);

  const [activeTab, setActiveTab] = useState<'upload' | 'sheet' | 'marksheet'>('upload');
  const [selectedStudentId, setSelectedStudentId] = useState<string>('');

  // Student Marksheet tab — raw rows from GET /results/marksheet (one row
  // per student x subject across the whole selected class/section+exam).
  const [marksheetRowsRaw, setMarksheetRowsRaw] = useState<any[]>([]);
  const [marksheetLoading, setMarksheetLoading] = useState(false);
  const [marksheetError, setMarksheetError] = useState(false);

  const [students, setStudents] = useState<any[]>([]);
  const [marks, setMarks] = useState<Record<string, Record<string, { score: string; remarks: string }>>>({});
  const [savedMarkKeys, setSavedMarkKeys] = useState<Set<string>>(new Set());
  const [rosterError, setRosterError] = useState(false);

  const filteredStudents = useMemo(() => {
    if (!searchQuery.trim()) return students;
    const q = searchQuery.toLowerCase().trim();
    return students.filter(
      (s) =>
        s.firstName?.toLowerCase().includes(q) ||
        s.lastName?.toLowerCase().includes(q) ||
        s.studentId?.toLowerCase().includes(q) ||
        String(s.rollNumber || '').includes(q)
    );
  }, [students, searchQuery]);

  const studentTotalMap = useMemo(() => {
    const map: Record<string, { totalObtained: number; totalMax: number; filledCount: number }> = {};
    students.forEach((student) => {
      let totalObtained = 0;
      let totalMax = 0;
      let filledCount = 0;
      availableSubjects.forEach((sub) => {
        const scoreStr = marks[sub]?.[student.id]?.score || '';
        if (scoreStr !== '') {
          const val = Number(scoreStr);
          if (!isNaN(val)) {
            totalObtained += val;
            totalMax += getSubjectMaxMarks(sub);
            filledCount++;
          }
        }
      });
      map[student.id] = { totalObtained, totalMax, filledCount };
    });
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [students, availableSubjects, marks, subjectMaxMarks]);

  // Inline validation: whether a given subject/student score cell holds a
  // value outside [0, maxMarks]. Used to redden the cell and to block Save
  // until every invalid cell is corrected, in addition to the toast-based
  // check in handleSave (defense in depth — the toast still runs in case a
  // cell's error state is somehow stale).
  const getScoreError = (subject: string, studentId: string): string | null => {
    const scoreStr = marks[subject]?.[studentId]?.score;
    if (scoreStr === undefined || scoreStr === '') return null;
    const n = Number(scoreStr);
    const max = getSubjectMaxMarks(subject);
    if (isNaN(n)) return 'Not a number';
    if (n < 0) return 'Cannot be negative';
    if (n > max) return `Max is ${max}`;
    return null;
  };

  const sheetHasErrors = useMemo(() => {
    for (const sub of availableSubjects) {
      const bySub = marks[sub];
      if (!bySub) continue;
      for (const studentId of Object.keys(bySub)) {
        if (getScoreError(sub, studentId)) return true;
      }
    }
    return false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [marks, availableSubjects, subjectMaxMarks, curriculumDefaults]);

  const loadInitialMetadata = async () => {
    try {
      setInitialLoading(true);
      const examsRes = await apiClient.get('/results');
      const examsData = examsRes.data.data || [];
      setExams(examsData);
      if (examsData.length > 0 && !selectedExam) {
        setSelectedExam(examsData[0].id);
      }

      const metaRes = await apiClient.get('/students/meta/classes');
      const metaData = metaRes.data.data || [];
      setClassesMeta(metaData);

      if (isTeacher) {
        const res = await apiClient.get('/attendance/my-sections');
        const sections = res.data.data || [];
        setAssignedSections(sections);
        if (sections.length > 0) {
          setSelectedClass(sections[0].class.name);
          setSelectedSection(sections[0].name);
          setHasAssignments(true);
        } else {
          setHasAssignments(false);
        }
      }
    } catch (err) {
      console.error('Failed to fetch exams/sections', err);
    } finally {
      setInitialLoading(false);
    }
  };

  useEffect(() => {
    loadInitialMetadata();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const fetchStudentsAndMarks = async () => {
    if (isTeacher && !hasAssignments) return;
    try {
      setLoading(true);
      setRosterError(false);
      // Reusing attendance sheet endpoint to easily fetch students by class/section name
      const res = await apiClient.get(
        `/attendance/sheet?className=${encodeURIComponent(selectedClass)}&sectionName=${encodeURIComponent(selectedSection)}&date=${new Date().toISOString()}`
      );
      const studentsData = res.data.data || [];
      setStudents(studentsData);

      // Reads whatever the subject-offerings effect has currently loaded for
      // this class/department. Purely a head start for rendering blank
      // cells immediately — every read of `marks` elsewhere already falls
      // back to '' for a subject key that isn't pre-seeded here, and the
      // existingRecords overlay below creates any missing subject key
      // anyway, so a stale value here (e.g. mid class-switch) is harmless.
      const subjects = availableSubjects;

      // Start with a blank grid for every subject/student pair.
      const nextMarks: Record<string, Record<string, { score: string; remarks: string }>> = {};
      subjects.forEach((sub) => {
        nextMarks[sub] = {};
        studentsData.forEach((student: any) => {
          nextMarks[sub][student.id] = { score: '', remarks: '' };
        });
      });

      // Overlay marks already saved for this exam/class/section — without
      // this, reloading the page always showed a blank sheet even though
      // the marks were submitted successfully and safely stored server-side.
      const savedKeys = new Set<string>();
      const nextSubjectMaxMarks: Record<string, string> = {};
      if (selectedExam) {
        try {
          const cls = classesMeta.find((c: any) => c.name === selectedClass);
          let sec = null;
          if (cls) {
            const sectionsRes = await apiClient.get(`/students/meta/sections?classId=${cls.id}`);
            const sectionsList = sectionsRes.data.data || [];
            sec = sectionsList.find((s: any) => s.name === selectedSection);
          }
          const queryParams = new URLSearchParams();
          queryParams.append('examId', selectedExam);
          if (cls) queryParams.append('classId', cls.id);
          if (sec) queryParams.append('sectionId', sec.id);
          queryParams.append('pageSize', '1000');

          const existingRes = await apiClient.get(`/results/results-list?${queryParams.toString()}`);
          const existingRecords = existingRes.data.data || [];
          existingRecords.forEach((record: any) => {
            if (!record.student) return;
            if (!nextMarks[record.subject]) nextMarks[record.subject] = {};
            nextMarks[record.subject][record.student.id] = {
              score: String(record.marksObtained),
              remarks: record.remarks || '',
            };
            savedKeys.add(`${record.subject}:${record.student.id}`);
            // Every result row for a subject shares the same max marks, so
            // last-write-wins here is equivalent to reading any one of them.
            nextSubjectMaxMarks[record.subject] = String(Number(record.maxMarks));
          });
        } catch (err) {
          console.error('Failed to fetch previously saved marks', err);
        }
      }

      setMarks(nextMarks);
      setSavedMarkKeys(savedKeys);
      setSubjectMaxMarks(nextSubjectMaxMarks);
    } catch (err) {
      console.error('Failed to fetch students', err);
      setStudents([]);
      setRosterError(true);
      toast.error('Failed to load the student roster for this class/section. Please retry.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStudentsAndMarks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedClass, selectedSection, selectedDepartment, selectedExam, hasAssignments, classesMeta]);

  const fetchSubjectOfferings = async () => {
    try {
      const params: Record<string, string> = { className: selectedClass };
      if (isSeniorClassName(selectedClass) && selectedDepartment !== 'None') {
        params.group = selectedDepartment.toUpperCase();
      }
      const res = await apiClient.get('/curriculum/subjects', { params });
      const offerings = res.data?.data || [];
      if (offerings.length > 0) {
        setAvailableSubjects(offerings.map((o: any) => o.label));
        setCurriculumDefaults(Object.fromEntries(offerings.map((o: any) => [o.label, o.defaultMaxMarks])));
        return;
      }
    } catch (err) {
      console.warn('Failed to load curriculum subjects, using fallback list', err);
    }
    // Either the request failed, or this institution has no SubjectOffering
    // rows seeded yet for this class/group — fall back rather than showing
    // an empty sheet.
    setAvailableSubjects(getFallbackSubjects(selectedClass, selectedDepartment));
    setCurriculumDefaults({});
  };

  useEffect(() => {
    fetchSubjectOfferings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedClass, selectedDepartment]);

  // Keep the marksheet tab's selected student in sync with the currently
  // loaded class/section roster — default to the first student, and reset
  // if the previously selected student falls outside the new roster.
  useEffect(() => {
    if (students.length === 0) {
      setSelectedStudentId('');
      return;
    }
    if (!selectedStudentId || !students.some((s) => s.id === selectedStudentId)) {
      setSelectedStudentId(students[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [students]);

  const isSeniorClass = isSeniorClassName(selectedClass);

  const subjectFillCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    availableSubjects.forEach((sub) => {
      counts[sub] = students.filter((s) => (marks[sub]?.[s.id]?.score || '') !== '').length;
    });
    return counts;
  }, [availableSubjects, students, marks]);

  const selectedExamName = exams.find((e) => e.id === selectedExam)?.name || '';

  const resultSheet = useResultSheet({ classesMeta, selectedExam, selectedClass, selectedSection, activeTab });

  // ── Student Marksheet tab — GET /results/marksheet ─────────────────────
  // Single isolated integration point for the staff-facing marksheet
  // endpoint: one row per student x subject, plus a highestMarkInSubject
  // aggregate computed server-side across the whole class/section for the
  // selected exam. If the endpoint's field/param names ever change, this
  // function is the only place that needs updating.
  const fetchMarksheet = async () => {
    if (!selectedExam) {
      setMarksheetRowsRaw([]);
      return;
    }
    const cls = classesMeta.find((c: any) => c.name === selectedClass);
    if (!cls) {
      setMarksheetRowsRaw([]);
      return;
    }
    let sec: any = null;
    try {
      const sectionsRes = await apiClient.get(`/students/meta/sections?classId=${cls.id}`);
      const sectionsList = sectionsRes.data.data || [];
      sec = sectionsList.find((s: any) => s.name === selectedSection);
    } catch (err) {
      console.error('Failed to resolve section for marksheet', err);
    }

    try {
      setMarksheetLoading(true);
      setMarksheetError(false);
      const params: Record<string, string> = { examId: selectedExam, classId: cls.id };
      if (sec) params.sectionId = sec.id;
      const res = await apiClient.get('/results/marksheet', { params });
      setMarksheetRowsRaw(res.data?.data?.rows || []);
    } catch (err: any) {
      console.error('Failed to fetch marksheet', err);
      setMarksheetError(true);
      toast.error(err.response?.data?.message || 'Failed to load marksheet');
    } finally {
      setMarksheetLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'marksheet') {
      fetchMarksheet();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, selectedExam, selectedClass, selectedSection, classesMeta]);

  // Staff-facing report card download — same GET /results/:studentId/report-card
  // endpoint the student/guardian self-service view uses (MyExamResults.tsx),
  // just reachable here too since ADMIN/TEACHER previously had no report card
  // UI at all despite the backend already allowing staff to fetch one.
  const [downloadingReportCard, setDownloadingReportCard] = useState(false);
  const fetchReportCardBlob = async (studentId: string, examId: string): Promise<Blob> => {
    const res = await apiClient.get(`/results/${studentId}/report-card`, {
      params: { examId },
      responseType: 'blob',
    });
    return new Blob([res.data], { type: 'application/pdf' });
  };

  // The selected student's own marksheet: one row per subject, sliced out
  // of the full class/section response returned by GET /results/marksheet
  // (marksheetRowsRaw already carries a server-computed highestMarkInSubject
  // per row, aggregated across the whole class/section for this exam).
  const marksheetRows: MarksheetRow[] = useMemo(() => {
    if (!selectedStudentId) return [];
    return marksheetRowsRaw
      .filter((row: any) => row.studentId === selectedStudentId)
      .map((row: any) => ({
        id: `${row.studentId}-${row.subject}`,
        subject: row.subject,
        marksObtained: Number(row.marksObtained),
        maxMarks: Number(row.maxMarks),
        grade: row.grade ?? null,
        highestMarkInSubject: Number(row.highestMarkInSubject),
      }))
      .sort((a, b) => a.subject.localeCompare(b.subject));
  }, [marksheetRowsRaw, selectedStudentId]);

  const marksheetColumns: Column<MarksheetRow>[] = [
    { key: 'subject', header: 'Subject', accessor: 'subject' },
    {
      key: 'marksObtained',
      header: 'Marks Obtained',
      render: (row) => React.createElement('span', { className: 'font-semibold text-slate-900 dark:text-white' }, row.marksObtained),
    },
    {
      key: 'maxMarks',
      header: 'Max Marks',
      render: (row) => React.createElement('span', { className: 'text-slate-600 dark:text-slate-400' }, row.maxMarks),
    },
    {
      key: 'grade',
      header: 'Grade',
      render: (row) =>
        row.grade
          ? React.createElement(StatusBadge, { status: row.grade })
          : React.createElement('span', { className: 'text-slate-400 dark:text-slate-600' }, '—'),
    },
    {
      key: 'highestMarkInSubject',
      header: 'Highest Mark in Class',
      render: (row) =>
        React.createElement(
          'span',
          {
            className:
              row.marksObtained > 0 && row.marksObtained === row.highestMarkInSubject
                ? 'font-bold text-emerald-600 dark:text-emerald-400'
                : 'text-slate-700 dark:text-slate-300',
          },
          row.highestMarkInSubject
        ),
    },
  ];

  const selectedStudent = students.find((s: any) => s.id === selectedStudentId);

  const downloadTemplate = async () => {
    if (students.length === 0) {
      toast.error('Please load the student list first.');
      return;
    }
    const XLSX = await import('xlsx');
    const headers = ['Roll No', 'Student ID', 'Student Name', ...availableSubjects];
    const rows = students.map((s) => [s.rollNumber || '', s.studentId, `${s.firstName} ${s.lastName}`, ...availableSubjects.map(() => '')]);

    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Marks Template');
    XLSX.writeFile(wb, `Template_${selectedClass}_Section_${selectedSection}.xlsx`);
  };

  const handleCSVImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const XLSX = await import('xlsx');
        const data = new Uint8Array(event.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];

        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];

        if (!jsonData || jsonData.length < 2) {
          toast.error('File must contain at least a header row and one student record.');
          return;
        }

        const headers = (jsonData[0] || []).map((h: any) => (h ? String(h).trim() : ''));
        const normalizeHeader = (h: string) => h.toLowerCase().replace(/[^a-z0-9]/g, '');

        const idIdx = headers.findIndex((h: string) => {
          const normalized = normalizeHeader(h);
          return normalized.includes('studentid') || normalized === 'id' || normalized.includes('admissionno');
        });

        if (idIdx === -1) {
          console.warn('Parsed headers:', headers);
          toast.error(`Invalid template. Could not find "Student ID" column. Parsed columns: ${headers.slice(0, 3).join(', ')}`);
          return;
        }

        const subjectCols: { subjectName: string; colIdx: number }[] = [];
        headers.forEach((header: string, idx: number) => {
          if (!header) return;
          const normalizedHeader = normalizeHeader(header);
          const matchedSubject = availableSubjects.find((sub) => normalizeHeader(sub) === normalizedHeader);
          if (matchedSubject) {
            subjectCols.push({ subjectName: matchedSubject, colIdx: idx });
          }
        });

        if (subjectCols.length === 0) {
          toast.error('Could not find any matching subject columns in the uploaded file.');
          return;
        }

        const newMarks = { ...marks };
        let importStudentsCount = 0;
        let importMarksCount = 0;

        for (let i = 1; i < jsonData.length; i++) {
          const row = jsonData[i] || [];
          if (row.length <= idIdx) continue;

          const studentIdStr = row[idIdx] ? String(row[idIdx]).trim() : '';
          if (!studentIdStr) continue;

          const matchedStudent = students.find((s) => s.studentId === studentIdStr);
          if (matchedStudent) {
            let foundAnyMark = false;
            subjectCols.forEach(({ subjectName, colIdx }) => {
              const rawVal = row[colIdx];
              const score = rawVal !== undefined && rawVal !== null ? String(rawVal).trim() : '';
              if (score !== '') {
                if (!newMarks[subjectName]) newMarks[subjectName] = {};
                newMarks[subjectName][matchedStudent.id] = {
                  score: score,
                  remarks: newMarks[subjectName]?.[matchedStudent.id]?.remarks || '',
                };
                importMarksCount++;
                foundAnyMark = true;
              }
            });
            if (foundAnyMark) importStudentsCount++;
          }
        }

        setMarks(newMarks);
        if (importMarksCount > 0) {
          setUnsavedChanges(true);
          setUploadSummary({ students: importStudentsCount, marks: importMarksCount });
          toast.success(`Successfully parsed ${importMarksCount} marks for ${importStudentsCount} students! Please review and click "Confirm & Save".`);
        } else {
          toast.error('No marks found in the uploaded file. Please enter scores before uploading.');
        }
      } catch (err) {
        console.error('Error importing Excel/CSV:', err);
        toast.error('Failed to parse the file. Please ensure it is a valid Excel (.xlsx) or CSV file.');
      }
    };
    reader.readAsArrayBuffer(file);
    e.target.value = '';
  };

  const handleScoreChange = (subject: string, studentId: string, val: string) => {
    setUnsavedChanges(true);
    setSavedMarkKeys((prev) => {
      const next = new Set(prev);
      next.delete(`${subject}:${studentId}`);
      return next;
    });
    setMarks((prev) => ({
      ...prev,
      [subject]: {
        ...(prev[subject] || {}),
        [studentId]: {
          score: val,
          remarks: prev[subject]?.[studentId]?.remarks || '',
        },
      },
    }));
  };

  const handleRemarksChange = (subject: string, studentId: string, val: string, fromAI = false) => {
    setUnsavedChanges(true);
    setMarks((prev) => ({
      ...prev,
      [subject]: {
        ...(prev[subject] || {}),
        [studentId]: {
          score: prev[subject]?.[studentId]?.score || '',
          remarks: val,
        },
      },
    }));
    setAiGeneratedKeys((prev) => {
      const next = new Set(prev);
      const key = `${subject}:${studentId}`;
      if (fromAI) next.add(key);
      else next.delete(key);
      return next;
    });
  };

  const handleGenerateComment = async (subject: string, studentId: string, score: string) => {
    if (!score) {
      toast.error('Please enter a score first to generate a comment.');
      return;
    }
    const generatingKey = `${subject}:${studentId}`;
    setGeneratingFor(generatingKey);
    try {
      const response = await apiClient.post('/ai/comment', {
        subject,
        marks: Number(score),
        grade: computeGradeClient(Number(score), getSubjectMaxMarks(subject)),
      });
      const aiComment =
        response.data?.data?.comment || response.data?.data?.remarks || response.data?.comment || response.data?.remarks;
      if (!aiComment) {
        throw new Error('AI comment service returned no text');
      }
      handleRemarksChange(subject, studentId, aiComment, true);
      toast.success('AI remark generated — review before saving.');
    } catch (error: any) {
      console.error('AI comment generation failed:', error);
      toast.error(error?.response?.data?.message || 'Could not generate an AI remark. Please write one manually.');
    } finally {
      setGeneratingFor(null);
    }
  };

  const fillEmptyWithZero = () => {
    setUnsavedChanges(true);
    setMarks((prev) => {
      const next = { ...prev };
      const targets = focusedSubject === 'ALL' ? availableSubjects : [focusedSubject];
      targets.forEach((sub) => {
        if (!next[sub]) next[sub] = {};
        students.forEach((student) => {
          if (!next[sub][student.id] || next[sub][student.id].score === '') {
            next[sub][student.id] = {
              score: '0',
              remarks: next[sub][student.id]?.remarks || '',
            };
          }
        });
      });
      return next;
    });
    toast.success('Filled empty scores with 0.');
  };

  const handleSave = async () => {
    if (!selectedExam) {
      toast.error('Please select an exam first');
      return;
    }
    if (sheetHasErrors) {
      toast.error('Fix the highlighted invalid marks before saving.');
      return;
    }
    setLoading(true);
    try {
      const payload: any[] = [];
      let invalidScoreFound = false;
      let invalidMessage = '';

      Object.entries(marks).forEach(([subjectName, studentScores]) => {
        const maxForSubject = getSubjectMaxMarks(subjectName);
        Object.entries(studentScores).forEach(([studentId, data]) => {
          if (data.score !== '' && !invalidScoreFound) {
            const scoreNum = Number(data.score);
            if (isNaN(scoreNum) || scoreNum < 0 || scoreNum > maxForSubject) {
              invalidScoreFound = true;
              const studentObj = students.find((s) => s.id === studentId);
              const studentName = studentObj ? `${studentObj.firstName} ${studentObj.lastName}` : studentId;
              invalidMessage = `Invalid mark (${data.score}) for ${studentName} in ${subjectName}. Marks must be between 0 and ${maxForSubject}.`;
            } else {
              payload.push({
                studentId,
                subject: subjectName,
                marksObtained: scoreNum,
                maxMarks: maxForSubject,
                remarks: data.remarks || '',
              });
            }
          }
        });
      });

      if (invalidScoreFound) {
        toast.error(invalidMessage);
        setLoading(false);
        return;
      }

      if (payload.length === 0) {
        toast.error('No marks entered to submit.');
        setLoading(false);
        return;
      }

      await apiClient.post('/results/submit', { examId: selectedExam, results: payload });
      toast.success(`Successfully saved ${payload.length} grade entries!`);
      setUnsavedChanges(false);
      setUploadSummary(null);
      fetchStudentsAndMarks();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to submit grade sheet');
    } finally {
      setLoading(false);
    }
  };

  // Ctrl/Cmd+S saves the grade sheet from anywhere on the Upload tab instead
  // of triggering the browser's "Save page" dialog.
  const handleSaveRef = useRef(handleSave);
  handleSaveRef.current = handleSave;
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        if (activeTab !== 'upload') return;
        e.preventDefault();
        handleSaveRef.current();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeTab]);

  // Unsaved-changes guard — warns before closing/reloading the tab with
  // grades entered but not yet submitted.
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!unsavedChanges) return;
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [unsavedChanges]);

  return {
    user,
    isTeacher,
    isAdmin,
    exams,
    selectedExam,
    setSelectedExam,
    selectedClass,
    setSelectedClass,
    selectedSection,
    setSelectedSection,
    selectedDepartment,
    setSelectedDepartment,
    availableSubjects,
    focusedSubject,
    setFocusedSubject,
    entryMode,
    setEntryMode,
    searchQuery,
    setSearchQuery,
    selectedSubjectFocus,
    setSelectedSubjectFocus,
    subjectMaxMarks,
    curriculumDefaults,
    getSubjectMaxMarks,
    getSubjectMaxMarksInputValue,
    handleSubjectMaxMarksChange,
    handleSubjectMaxMarksBlur,
    getRemarksRows,
    adminClasses,
    adminSections,
    loading,
    initialLoading,
    generatingFor,
    aiGeneratedKeys,
    displayedSubjects,
    unsavedChanges,
    setUnsavedChanges,
    uploadSummary,
    setUploadSummary,
    assignedSections,
    hasAssignments,
    classesMeta,
    activeTab,
    setActiveTab,
    ...resultSheet,
    selectedStudentId,
    setSelectedStudentId,
    marksheetLoading,
    marksheetError,
    fetchMarksheet,
    students,
    marks,
    savedMarkKeys,
    rosterError,
    filteredStudents,
    studentTotalMap,
    getScoreError,
    sheetHasErrors,
    fetchStudentsAndMarks,
    isSeniorClass,
    subjectFillCounts,
    selectedExamName,
    downloadingReportCard,
    setDownloadingReportCard,
    fetchReportCardBlob,
    marksheetRows,
    marksheetColumns,
    selectedStudent,
    downloadTemplate,
    handleCSVImport,
    handleScoreChange,
    handleRemarksChange,
    handleGenerateComment,
    fillEmptyWithZero,
    handleSave,
    DEPARTMENTS,
  };
}

export type UseMarksData = ReturnType<typeof useMarksData>;
