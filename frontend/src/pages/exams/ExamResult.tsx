import React, { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { DataTable, Column, RowAction } from '../../components/DataTable/DataTable';
import { Button } from '../../components/ui/Button';
import {
  Exam,
  ClassOption,
  SectionOption,
  ClassResultRow,
  classLabel,
  examsApi,
  examResultsApi,
  fetchClasses,
  fetchSections,
} from '../../api/exams.api';

/** "classId|sectionId" — sectionId is empty for a class with no sections. */
interface ClassSectionOption {
  value: string;
  classId: string;
  sectionId?: string;
  label: string;
}

/** Exam > Exam Result — pick a class/section + exam, list each student's
 *  totals, percentage and grade, with their report card as the action. */
const ExamResult = () => {
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [sections, setSections] = useState<SectionOption[]>([]);
  const [exams, setExams] = useState<Exam[]>([]);

  const [classValue, setClassValue] = useState('');
  const [examId, setExamId] = useState('');
  const [rows, setRows] = useState<ClassResultRow[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  // What the current table was searched for (the selects can change after).
  const [searchedExamId, setSearchedExamId] = useState('');

  useEffect(() => {
    Promise.all([fetchClasses(), fetchSections()]).then(([c, s]) => {
      setClasses(c);
      setSections(s);
    });
    examsApi
      .list()
      .then(setExams)
      .catch(() => toast.error('Failed to load exams'));
  }, []);

  // eSchool-style "9 - A Bangla Science": one option per class-section, or
  // the bare class when it has no sections.
  const classOptions = useMemo<ClassSectionOption[]>(() => {
    const byClass = new Map<string, SectionOption[]>();
    for (const s of sections) byClass.set(s.class.id, [...(byClass.get(s.class.id) ?? []), s]);
    return classes.flatMap((c) => {
      const extra = [c.medium?.name, c.stream?.name].filter(Boolean).join(' ');
      const secs = byClass.get(c.id) ?? [];
      if (secs.length === 0) return [{ value: `${c.id}|`, classId: c.id, label: classLabel(c) }];
      return secs.map((s) => ({
        value: `${c.id}|${s.id}`,
        classId: c.id,
        sectionId: s.id,
        label: `${c.name} - ${s.name}${extra ? ` ${extra}` : ''}`,
      }));
    });
  }, [classes, sections]);

  const selectedClass = classOptions.find((o) => o.value === classValue);

  // All exams until a class is picked, then only that class's exams (an
  // exam with no linked classes applies to every class).
  const classExams = useMemo(
    () =>
      selectedClass
        ? exams.filter((x) => x.classes.length === 0 || x.classes.some((c) => c.class.id === selectedClass.classId))
        : exams,
    [exams, selectedClass],
  );

  // Drop an exam choice the newly picked class doesn't sit.
  useEffect(() => {
    if (examId && !classExams.some((x) => x.id === examId)) setExamId('');
  }, [classExams, examId]);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedClass) return toast.error('Select a class');
    if (!examId) return toast.error('Select an exam');
    setSearching(true);
    try {
      const data = await examResultsApi.list({
        examId,
        classId: selectedClass.classId,
        sectionId: selectedClass.sectionId,
      });
      setRows(data);
      setSearchedExamId(examId);
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to load results');
    } finally {
      setSearching(false);
    }
  };

  const downloadReportCard = async (row: ClassResultRow) => {
    setDownloadingId(row.id);
    try {
      const blob = await examResultsApi.downloadReportCard(row.id, searchedExamId);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `report-card-${row.studentId || row.id}.pdf`;
      link.click();
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      toast.error('Report card not available for this student yet');
    } finally {
      setDownloadingId(null);
    }
  };

  const tableRows = useMemo(() => (rows ?? []).map((r, i) => ({ ...r, no: i + 1, name: `${r.firstName} ${r.lastName}` })), [rows]);
  type Row = (typeof tableRows)[number];

  const dash = <span className="text-slate-400">—</span>;
  const columns: Column<Row>[] = [
    { key: 'no', header: 'No.', accessor: 'no', width: '60px' },
    {
      key: 'name',
      header: 'Student',
      accessor: 'name',
      render: (r) => (
        <div className="flex items-center gap-3">
          {r.avatarUrl ? (
            <img src={r.avatarUrl} alt="" className="w-8 h-8 rounded-full object-cover flex-shrink-0" />
          ) : (
            <div className="w-8 h-8 rounded-full bg-primary-50 dark:bg-primary-500/10 text-primary-600 dark:text-primary-400 flex items-center justify-center text-xs font-bold flex-shrink-0">
              {r.firstName.charAt(0)}
              {r.lastName.charAt(0)}
            </div>
          )}
          <div>
            <p className="font-medium text-slate-900 dark:text-white">{r.name}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {r.rollNumber ? `Roll ${r.rollNumber} · ` : ''}
              {r.studentId}
            </p>
          </div>
        </div>
      ),
    },
    { key: 'totalMarks', header: 'Total Marks', accessor: 'totalMarks', render: (r) => r.totalMarks ?? dash },
    { key: 'obtainedMarks', header: 'Obtained Marks', accessor: 'obtainedMarks', render: (r) => r.obtainedMarks ?? dash },
    {
      key: 'percentage',
      header: 'Percentage',
      accessor: 'percentage',
      render: (r) => (r.percentage !== null ? `${r.percentage}%` : dash),
    },
    {
      key: 'grade',
      header: 'Grade',
      accessor: 'grade',
      render: (r) =>
        r.grade ? (
          <span
            className={`inline-flex rounded-md px-2 py-0.5 text-xs font-bold ${
              r.status === 'FAIL'
                ? 'bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400'
                : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400'
            }`}
          >
            {r.grade}
          </span>
        ) : (
          dash
        ),
    },
  ];

  const actions: RowAction<Row>[] = [
    {
      label: 'Download report card',
      icon: 'view',
      onClick: (r) => {
        if (r.subjectCount === 0) {
          toast.error('No marks entered for this student in this exam');
          return;
        }
        if (downloadingId) return;
        downloadReportCard(r);
      },
    },
  ];

  const labelClass = 'text-sm font-medium text-slate-700 dark:text-slate-400';

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">Exam Result</h2>

      <div className="glass-card p-6 rounded-2xl space-y-5">
        <h3 className="text-lg font-bold text-slate-900 dark:text-white">View Result</h3>

        <form onSubmit={handleSearch} className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            <div className="space-y-1.5">
              <label htmlFor="result-class" className={labelClass}>Class</label>
              <select
                id="result-class"
                value={classValue}
                onChange={(e) => setClassValue(e.target.value)}
                className="input-field cursor-pointer"
              >
                <option value="">Select Class</option>
                {classOptions.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="result-exam" className={labelClass}>Exam</label>
              <select
                id="result-exam"
                value={examId}
                onChange={(e) => setExamId(e.target.value)}
                className="input-field cursor-pointer"
              >
                <option value="">Select Exam</option>
                {classExams.map((x) => (
                  <option key={x.id} value={x.id}>{x.name}</option>
                ))}
              </select>
            </div>
          </div>

          <Button type="submit" variant="primary" isLoading={searching} className="px-10">
            Search
          </Button>
        </form>

        {rows !== null && (
          <div className="pt-2">
            <DataTable
              data={tableRows}
              columns={columns}
              actions={actions}
              isLoading={searching}
              searchPlaceholder="Search"
              emptyTitle="No students found"
              emptyDescription="There are no students in this class/section."
            />
          </div>
        )}
      </div>
    </div>
  );
};

export default ExamResult;
