import React, { useEffect, useMemo, useState } from 'react';
import { Plus, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { DataTable, Column, RowAction } from '../../components/DataTable/DataTable';
import { ConfirmModal } from '../../components/common/ConfirmModal';
import { Button } from '../../components/ui/Button';
import {
  Exam,
  ClassOption,
  NamedRef,
  SessionYear,
  TimetableEntry,
  classLabel,
  examsApi,
  timetableApi,
  fetchClasses,
  fetchSessionYears,
  fetchSubjects,
} from '../../api/exams.api';

interface EntryRow {
  key: number;
  subjectId: string;
  totalMarks: string;
  passingMarks: string;
  startTime: string;
  endTime: string;
  date: string;
}

let rowKey = 0;
const blankRow = (): EntryRow => ({
  key: ++rowKey,
  subjectId: '',
  totalMarks: '',
  passingMarks: '',
  startTime: '',
  endTime: '',
  date: '',
});

// Timetable dates come back as ISO timestamps of a DATE column (UTC midnight).
const toDateInput = (iso: string) => iso.slice(0, 10);
const formatDate = (iso: string) => {
  const [y, m, d] = toDateInput(iso).split('-');
  return `${d}-${m}-${y}`;
};

/** One List Exam Timetable row = every subject of one exam for one class. */
interface GroupRow {
  id: string;
  no: number;
  examId: string;
  classId: string;
  examName: string;
  cls: ClassOption;
  sessionYear: string;
  entries: TimetableEntry[];
}

/** Exam > Create Exam Timetable — eSchool "Manage Exam Timetable". */
const ExamTimetable = () => {
  const [sessionYears, setSessionYears] = useState<SessionYear[]>([]);
  const [exams, setExams] = useState<Exam[]>([]);
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [subjects, setSubjects] = useState<NamedRef[]>([]);

  const [yearId, setYearId] = useState('');
  const [examId, setExamId] = useState('');
  const [classId, setClassId] = useState('');
  const [rows, setRows] = useState<EntryRow[]>([blankRow()]);
  // Subjects already saved for the exam+class being edited — any of these
  // missing from the form on submit get deleted.
  const [loadedEntries, setLoadedEntries] = useState<TimetableEntry[]>([]);
  const [saving, setSaving] = useState(false);

  const [entries, setEntries] = useState<TimetableEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterExam, setFilterExam] = useState('');
  const [filterClass, setFilterClass] = useState('');
  const [groupToDelete, setGroupToDelete] = useState<GroupRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadEntries = async () => {
    setLoading(true);
    try {
      setEntries(await timetableApi.list());
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to load exam timetables');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadEntries();
    Promise.all([fetchSessionYears(), fetchClasses(), fetchSubjects(), examsApi.list().catch(() => [] as Exam[])]).then(
      ([y, c, s, e]) => {
        setSessionYears(y);
        setYearId((y.find((yr) => yr.isCurrent) ?? y[0])?.id ?? '');
        setClasses(c);
        setSubjects(s);
        setExams(e);
      },
    );
  }, []);

  // Exams without a session year (created before this module) stay pickable.
  const yearExams = useMemo(
    () => exams.filter((e) => !yearId || !e.academicYearId || e.academicYearId === yearId),
    [exams, yearId],
  );
  const selectedExam = exams.find((e) => e.id === examId);
  // An exam with no linked classes is open to every class.
  const examClasses = useMemo(
    () => (selectedExam && selectedExam.classes.length > 0 ? selectedExam.classes.map((c) => c.class) : classes),
    [selectedExam, classes],
  );

  // Picking an exam + class that already has a timetable loads it for editing.
  useEffect(() => {
    if (!examId || !classId) {
      setLoadedEntries([]);
      return;
    }
    const existing = entries.filter((e) => e.examId === examId && e.classId === classId);
    setLoadedEntries(existing);
    setRows(
      existing.length > 0
        ? existing.map((e) => ({
            key: ++rowKey,
            subjectId: e.subject.id,
            totalMarks: String(Number(e.totalMarks)),
            passingMarks: String(Number(e.passingMarks)),
            startTime: e.startTime,
            endTime: e.endTime,
            date: toDateInput(e.date),
          }))
        : [blankRow()],
    );
    // Only re-seed when the exam/class selection changes, not on every list refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [examId, classId]);

  const updateRow = (key: number, patch: Partial<EntryRow>) =>
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const resetForm = () => {
    setExamId('');
    setClassId('');
    setRows([blankRow()]);
    setLoadedEntries([]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!examId) return toast.error('Select an exam');
    if (!classId) return toast.error('Select a class');

    const subjectIds = rows.map((r) => r.subjectId);
    for (const [i, r] of rows.entries()) {
      const n = i + 1;
      if (!r.subjectId) return toast.error(`Row ${n}: select a subject`);
      if (!r.totalMarks || !r.passingMarks) return toast.error(`Row ${n}: total and passing marks are required`);
      if (Number(r.passingMarks) > Number(r.totalMarks)) return toast.error(`Row ${n}: passing marks exceed total marks`);
      if (!r.startTime || !r.endTime || !r.date) return toast.error(`Row ${n}: start time, end time and date are required`);
      if (r.endTime <= r.startTime) return toast.error(`Row ${n}: end time must be after start time`);
      if (subjectIds.indexOf(r.subjectId) !== i) return toast.error(`Row ${n}: subject is already listed`);
    }

    setSaving(true);
    try {
      const removed = loadedEntries.filter((le) => !subjectIds.includes(le.subject.id));
      await Promise.all(removed.map((le) => timetableApi.remove(le.id)));
      await timetableApi.create({
        examId,
        classId,
        entries: rows.map((r) => ({
          subjectId: r.subjectId,
          totalMarks: Number(r.totalMarks),
          passingMarks: Number(r.passingMarks),
          startTime: r.startTime,
          endTime: r.endTime,
          date: r.date,
        })),
      });
      toast.success('Exam timetable saved successfully');
      resetForm();
      loadEntries();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to save exam timetable');
    } finally {
      setSaving(false);
    }
  };

  const groups = useMemo<GroupRow[]>(() => {
    const map = new Map<string, GroupRow>();
    for (const e of entries) {
      if (filterExam && e.examId !== filterExam) continue;
      if (filterClass && e.classId !== filterClass) continue;
      const id = `${e.examId}:${e.classId}`;
      if (!map.has(id)) {
        map.set(id, {
          id,
          no: 0,
          examId: e.examId,
          classId: e.classId,
          examName: e.exam.name,
          cls: e.class,
          sessionYear: e.exam.academicYear?.label || '—',
          entries: [],
        });
      }
      map.get(id)!.entries.push(e);
    }
    return Array.from(map.values()).map((g, i) => ({ ...g, no: i + 1 }));
  }, [entries, filterExam, filterClass]);

  const editGroup = (g: GroupRow) => {
    const exam = exams.find((x) => x.id === g.examId);
    if (exam?.academicYearId) setYearId(exam.academicYearId);
    setExamId(g.examId);
    setClassId(g.classId);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleConfirmDelete = async () => {
    if (!groupToDelete) return;
    setDeleting(true);
    try {
      await Promise.all(groupToDelete.entries.map((e) => timetableApi.remove(e.id)));
      toast.success('Exam timetable deleted');
      if (examId === groupToDelete.examId && classId === groupToDelete.classId) resetForm();
      setGroupToDelete(null);
      loadEntries();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to delete exam timetable');
      loadEntries();
    } finally {
      setDeleting(false);
    }
  };

  const columns: Column<GroupRow>[] = [
    { key: 'no', header: 'No.', accessor: 'no', width: '60px' },
    { key: 'examName', header: 'Exam Name', accessor: 'examName' },
    { key: 'class', header: 'Class', sortable: false, render: (g) => [g.cls.name, g.cls.medium?.name].filter(Boolean).join(' - ') },
    { key: 'stream', header: 'Stream', sortable: false, render: (g) => g.cls.stream?.name || '—' },
    {
      key: 'timetable',
      header: 'Timetable',
      sortable: false,
      render: (g) => (
        <ul className="space-y-0.5 text-xs text-slate-600 dark:text-slate-400">
          {g.entries.map((e) => (
            <li key={e.id}>
              <span className="font-medium text-slate-800 dark:text-slate-200">{e.subject.name}</span>
              {` - ${Number(e.totalMarks)}/${Number(e.passingMarks)} - ${e.startTime} - ${e.endTime} - ${formatDate(e.date)}`}
            </li>
          ))}
        </ul>
      ),
    },
    { key: 'sessionYear', header: 'Session Year', accessor: 'sessionYear' },
  ];

  const actions: RowAction<GroupRow>[] = [
    { label: 'Edit', icon: 'edit', onClick: editGroup },
    { label: 'Delete', icon: 'delete', variant: 'danger', onClick: (g) => setGroupToDelete(g) },
  ];

  const labelClass = 'text-sm font-medium text-slate-700 dark:text-slate-400';
  const req = <span className="text-red-500 ml-1">*</span>;

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">Manage Exam Timetable</h2>

      <div className="glass-card p-6 rounded-2xl space-y-5">
        <h3 className="text-lg font-bold text-slate-900 dark:text-white">
          {loadedEntries.length > 0 ? 'Edit Exam Timetable' : 'Create Exam Timetable'}
        </h3>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <div className="space-y-1.5">
              <label htmlFor="tt-session" className={labelClass}>Session Year{req}</label>
              <select
                id="tt-session"
                value={yearId}
                onChange={(e) => {
                  setYearId(e.target.value);
                  setExamId('');
                  setClassId('');
                }}
                className="input-field cursor-pointer"
              >
                {sessionYears.map((y) => (
                  <option key={y.id} value={y.id}>{y.label}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="tt-exam" className={labelClass}>Exam{req}</label>
              <select
                id="tt-exam"
                value={examId}
                onChange={(e) => {
                  setExamId(e.target.value);
                  setClassId('');
                }}
                className="input-field cursor-pointer"
              >
                <option value="">--Select--</option>
                {yearExams.map((x) => (
                  <option key={x.id} value={x.id}>{x.name}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="tt-class" className={labelClass}>Class{req}</label>
              <select
                id="tt-class"
                value={classId}
                onChange={(e) => setClassId(e.target.value)}
                className="input-field cursor-pointer"
              >
                <option value="">--Select--</option>
                {examClasses.map((c) => (
                  <option key={c.id} value={c.id}>{classLabel(c)}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-4">
            {rows.map((row, i) => (
              <div
                key={row.key}
                className={`grid grid-cols-1 md:grid-cols-3 gap-5 ${i > 0 ? 'pt-4 border-t border-slate-100 dark:border-white/5' : ''}`}
              >
                <div className="space-y-1.5">
                  <label htmlFor={`tt-subject-${row.key}`} className={labelClass}>Subject{req}</label>
                  <select
                    id={`tt-subject-${row.key}`}
                    value={row.subjectId}
                    onChange={(e) => updateRow(row.key, { subjectId: e.target.value })}
                    className="input-field cursor-pointer"
                  >
                    <option value="">--Select--</option>
                    {subjects.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label htmlFor={`tt-total-${row.key}`} className={labelClass}>Total Marks{req}</label>
                  <input
                    id={`tt-total-${row.key}`}
                    type="number"
                    min={1}
                    max={1000}
                    step="0.01"
                    value={row.totalMarks}
                    onChange={(e) => updateRow(row.key, { totalMarks: e.target.value })}
                    className="input-field"
                    placeholder="Total Marks"
                  />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor={`tt-passing-${row.key}`} className={labelClass}>Passing Marks{req}</label>
                  <input
                    id={`tt-passing-${row.key}`}
                    type="number"
                    min={0}
                    max={1000}
                    step="0.01"
                    value={row.passingMarks}
                    onChange={(e) => updateRow(row.key, { passingMarks: e.target.value })}
                    className="input-field"
                    placeholder="Passing Marks"
                  />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor={`tt-start-${row.key}`} className={labelClass}>Start Time{req}</label>
                  <input
                    id={`tt-start-${row.key}`}
                    type="time"
                    value={row.startTime}
                    onChange={(e) => updateRow(row.key, { startTime: e.target.value })}
                    className="input-field"
                  />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor={`tt-end-${row.key}`} className={labelClass}>End Time{req}</label>
                  <input
                    id={`tt-end-${row.key}`}
                    type="time"
                    value={row.endTime}
                    onChange={(e) => updateRow(row.key, { endTime: e.target.value })}
                    className="input-field"
                  />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor={`tt-date-${row.key}`} className={labelClass}>Date{req}</label>
                  <div className="flex items-center gap-2">
                    <input
                      id={`tt-date-${row.key}`}
                      type="date"
                      value={row.date}
                      onChange={(e) => updateRow(row.key, { date: e.target.value })}
                      className="input-field flex-1"
                    />
                    {i === rows.length - 1 ? (
                      <button
                        type="button"
                        onClick={() => setRows((prev) => [...prev, blankRow()])}
                        title="Add subject"
                        aria-label="Add subject"
                        className="p-2.5 rounded-lg bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 hover:bg-emerald-100 dark:hover:bg-emerald-500/20 transition-colors flex-shrink-0"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    ) : null}
                    {rows.length > 1 && (
                      <button
                        type="button"
                        onClick={() => setRows((prev) => prev.filter((r) => r.key !== row.key))}
                        title="Remove subject"
                        aria-label="Remove subject"
                        className="p-2.5 rounded-lg bg-red-50 dark:bg-red-500/10 text-red-500 hover:bg-red-100 dark:hover:bg-red-500/20 transition-colors flex-shrink-0"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="flex items-center gap-2 pt-4 border-t border-slate-100 dark:border-white/5">
            <Button type="submit" variant="primary" isLoading={saving} className="px-8">
              Submit
            </Button>
            {(examId || classId) && (
              <Button type="button" variant="ghost" onClick={resetForm} disabled={saving}>
                Cancel
              </Button>
            )}
          </div>
        </form>
      </div>

      <div className="glass-card p-6 rounded-2xl space-y-4">
        <h3 className="text-lg font-bold text-slate-900 dark:text-white">List Exam Timetable</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="space-y-1.5">
            <label htmlFor="tt-filter-exam" className={labelClass}>Exam</label>
            <select
              id="tt-filter-exam"
              value={filterExam}
              onChange={(e) => setFilterExam(e.target.value)}
              className="input-field cursor-pointer"
            >
              <option value="">All</option>
              {exams.map((x) => (
                <option key={x.id} value={x.id}>{x.name}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="tt-filter-class" className={labelClass}>Class</label>
            <select
              id="tt-filter-class"
              value={filterClass}
              onChange={(e) => setFilterClass(e.target.value)}
              className="input-field cursor-pointer"
            >
              <option value="">All</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>{classLabel(c)}</option>
              ))}
            </select>
          </div>
        </div>
        <DataTable
          data={groups}
          columns={columns}
          actions={actions}
          isLoading={loading}
          searchPlaceholder="Search"
          emptyTitle="No exam timetables found"
          emptyDescription="Create a timetable using the form above."
        />
      </div>

      <ConfirmModal
        isOpen={!!groupToDelete}
        title="Delete exam timetable"
        message={`Delete the "${groupToDelete?.examName}" timetable for ${groupToDelete?.cls.name}? This cannot be undone.`}
        confirmLabel="Delete"
        variant="danger"
        isLoading={deleting}
        onConfirm={handleConfirmDelete}
        onCancel={() => setGroupToDelete(null)}
      />
    </div>
  );
};

export default ExamTimetable;
