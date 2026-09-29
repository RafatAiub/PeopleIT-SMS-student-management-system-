import React, { useEffect, useMemo, useState } from 'react';
import { FileDown } from 'lucide-react';
import apiClient from '../../api/client';
import toast from 'react-hot-toast';
import { Select } from '../../components/ui/Input';
import { ErrorState } from '../../components/ui/Feedback';
import { DataTable, Column, RowAction } from '../../components/DataTable/DataTable';
import { useClassSectionMeta } from '../../utils/classSections';

interface MarksheetRow {
  studentId: string;
  studentName: string;
  rollNumber: string | null;
  subject: string;
  marksObtained: number;
  maxMarks: number;
  grade: string | null;
  highestMarkInSubject: number;
}

interface StudentResultSummary {
  id: string;
  studentName: string;
  rollNumber: string | null;
  subjectCount: number;
  totalObtained: number;
  totalMax: number;
  percentage: number;
}

/**
 * Class/exam results list — pick a class (+ optional section) and an exam,
 * see every student with marks recorded, open any student's report card.
 * Uses the existing STAFF-facing GET /results/marksheet (same permissions as
 * this route already requires). Presented as the "By class" tab in
 * GenerateResult.tsx, alongside the original single-student flow.
 */
const GenerateResultByClass = () => {
  const [selectedClassName, setSelectedClassName] = useState('');
  const [selectedSectionId, setSelectedSectionId] = useState('');
  const { classes, sections, loadingClasses, loadingSections, classesError } = useClassSectionMeta(selectedClassName);

  const [exams, setExams] = useState<any[]>([]);
  const [selectedExamId, setSelectedExamId] = useState('');
  const [examsError, setExamsError] = useState(false);

  const [rows, setRows] = useState<MarksheetRow[]>([]);
  const [loadingResults, setLoadingResults] = useState(false);
  const [resultsError, setResultsError] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const fetchExams = async () => {
    setExamsError(false);
    try {
      const res = await apiClient.get('/results');
      const examsData = res.data.data || [];
      setExams(examsData);
      if (examsData.length > 0) setSelectedExamId((prev) => prev || examsData[0].id);
    } catch (err) {
      console.error('Failed to fetch exams', err);
      toast.error('Failed to load exam list');
      setExamsError(true);
    }
  };

  useEffect(() => {
    fetchExams();
  }, []);

  // Reset section choice whenever the class changes — mirrors AssignRollNo.
  useEffect(() => {
    setSelectedSectionId('');
  }, [selectedClassName]);

  const selectedClassId = useMemo(
    () => classes.find((c) => c.name === selectedClassName)?.id || '',
    [classes, selectedClassName],
  );

  const fetchResults = async () => {
    if (!selectedClassId || !selectedExamId) {
      setRows([]);
      return;
    }
    setLoadingResults(true);
    setResultsError(false);
    try {
      const res = await apiClient.get('/results/marksheet', {
        params: {
          examId: selectedExamId,
          classId: selectedClassId,
          sectionId: selectedSectionId || undefined,
        },
      });
      setRows(res.data.data?.rows || []);
    } catch (err: any) {
      console.error('Failed to fetch results', err);
      toast.error(err.response?.data?.message || 'Failed to load results for this class/exam');
      setResultsError(true);
    } finally {
      setLoadingResults(false);
    }
  };

  useEffect(() => {
    fetchResults();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedClassId, selectedSectionId, selectedExamId]);

  // One row per student x subject from the API — collapse to one summary
  // row per student for the results list.
  const studentSummaries: StudentResultSummary[] = useMemo(() => {
    const byStudent = new Map<string, StudentResultSummary>();
    for (const row of rows) {
      const existing = byStudent.get(row.studentId);
      if (existing) {
        existing.subjectCount += 1;
        existing.totalObtained += Number(row.marksObtained);
        existing.totalMax += Number(row.maxMarks);
      } else {
        byStudent.set(row.studentId, {
          id: row.studentId,
          studentName: row.studentName,
          rollNumber: row.rollNumber,
          subjectCount: 1,
          totalObtained: Number(row.marksObtained),
          totalMax: Number(row.maxMarks),
          percentage: 0,
        });
      }
    }
    return Array.from(byStudent.values())
      .map((s) => ({ ...s, percentage: s.totalMax > 0 ? Math.round((s.totalObtained / s.totalMax) * 10000) / 100 : 0 }))
      .sort((a, b) => (a.rollNumber || '').localeCompare(b.rollNumber || '', undefined, { numeric: true }));
  }, [rows]);

  const openReportCard = async (studentId: string) => {
    if (!selectedExamId) return;
    setDownloadingId(studentId);
    try {
      const res = await apiClient.get(`/results/${studentId}/report-card`, {
        params: { examId: selectedExamId },
        responseType: 'blob',
      });
      const url = window.URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
      window.open(url, '_blank', 'noopener');
      // Give the new tab time to load the blob before releasing it.
      window.setTimeout(() => window.URL.revokeObjectURL(url), 60_000);
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Report card not available for this student/exam yet');
    } finally {
      setDownloadingId(null);
    }
  };

  const columns: Column<StudentResultSummary>[] = [
    {
      key: 'rollNumber',
      header: 'Roll',
      accessor: 'rollNumber',
      width: '80px',
    },
    {
      key: 'studentName',
      header: 'Student Name',
      accessor: 'studentName',
      primary: true,
    },
    {
      key: 'subjectCount',
      header: 'Subjects',
      accessor: 'subjectCount',
      align: 'right',
    },
    {
      key: 'total',
      header: 'Total',
      align: 'right',
      exportValue: (s) => `${s.totalObtained}/${s.totalMax}`,
      render: (s) => `${s.totalObtained}/${s.totalMax}`,
    },
    {
      key: 'percentage',
      header: 'Percentage',
      align: 'right',
      exportValue: (s) => s.percentage,
      render: (s) => `${s.percentage}%`,
    },
  ];

  const actions: RowAction<StudentResultSummary>[] = [
    {
      label: 'Open report card',
      icon: 'view',
      onClick: (s) => openReportCard(s.id),
    },
  ];

  return (
    <div className="glass-card p-5 sm:p-6 rounded-2xl space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Select
          label="Class"
          value={selectedClassName}
          onChange={(e) => setSelectedClassName(e.target.value)}
          placeholder={loadingClasses ? 'Loading…' : '-- Select Class --'}
          disabled={loadingClasses}
          options={classes.map((c) => ({ value: c.name, label: c.name }))}
        />
        <Select
          label="Section"
          value={selectedSectionId}
          onChange={(e) => setSelectedSectionId(e.target.value)}
          placeholder={loadingSections ? 'Loading…' : 'All Sections'}
          disabled={!selectedClassName || loadingSections}
          options={sections.map((s) => ({ value: s.id, label: s.name }))}
        />
        <Select
          label="Exam"
          value={selectedExamId}
          onChange={(e) => setSelectedExamId(e.target.value)}
          placeholder={exams.length === 0 ? 'No exams available' : undefined}
          disabled={exams.length === 0}
          options={exams.map((exam) => ({ value: exam.id, label: exam.name }))}
        />
      </div>

      {classesError || examsError ? (
        <ErrorState
          message="Failed to load classes or exams."
          onRetry={() => {
            fetchExams();
          }}
          compact
        />
      ) : resultsError ? (
        <ErrorState message="Failed to load results for this class/exam." onRetry={fetchResults} compact />
      ) : !selectedClassName || !selectedExamId ? (
        <div className="rounded-xl border border-dashed border-slate-300 dark:border-white/15 px-4 py-8 text-center text-sm text-slate-500 dark:text-slate-400">
          Select a class and an exam to see the results list.
        </div>
      ) : (
        <DataTable
          data={studentSummaries}
          columns={columns}
          actions={actions}
          isLoading={loadingResults}
          emptyTitle="No results found"
          emptyDescription="Marks haven't been submitted for this class/section in this exam yet."
        />
      )}

      {downloadingId && (
        <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
          <FileDown className="w-3.5 h-3.5 animate-pulse" /> Preparing report card…
        </p>
      )}
    </div>
  );
};

export default GenerateResultByClass;
