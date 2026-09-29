import React, { useEffect, useMemo, useState } from 'react';
import { Info } from 'lucide-react';
import toast from 'react-hot-toast';
import { DataTable, Column, RowAction } from '../../components/DataTable/DataTable';
import { ConfirmModal } from '../../components/common/ConfirmModal';
import { Button } from '../../components/ui/Button';
import { ClassMultiSelect } from '../../components/exams/ClassMultiSelect';
import {
  Exam,
  ClassOption,
  NamedRef,
  SessionYear,
  classLabel,
  examsApi,
  fetchClasses,
  fetchSemesters,
  fetchSessionYears,
} from '../../api/exams.api';

const emptyForm = { name: '', academicYearId: '', semesterId: '', classIds: [] as string[], description: '' };

/** Exam > Create Exam — eSchool "Manage Exam": Create Exams form card over a
 *  List Exams table with an inline publish toggle. */
const ManageExam = () => {
  const [exams, setExams] = useState<Exam[]>([]);
  const [loading, setLoading] = useState(true);
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [semesters, setSemesters] = useState<NamedRef[]>([]);
  const [sessionYears, setSessionYears] = useState<SessionYear[]>([]);

  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [examToDelete, setExamToDelete] = useState<Exam | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [publishingId, setPublishingId] = useState<string | null>(null);

  const currentYearId = useMemo(
    () => (sessionYears.find((y) => y.isCurrent) ?? sessionYears[0])?.id ?? '',
    [sessionYears],
  );

  const loadExams = async () => {
    setLoading(true);
    try {
      setExams(await examsApi.list());
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to load exams');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadExams();
    Promise.all([fetchClasses(), fetchSemesters(), fetchSessionYears()]).then(([c, s, y]) => {
      setClasses(c);
      setSemesters(s);
      setSessionYears(y);
    });
  }, []);

  // Default the session year once years load (and after every reset).
  useEffect(() => {
    if (!form.academicYearId && currentYearId) setForm((f) => ({ ...f, academicYearId: currentYearId }));
  }, [currentYearId, form.academicYearId]);

  const resetForm = () => {
    setEditingId(null);
    setForm({ ...emptyForm, academicYearId: currentYearId });
  };

  const startEdit = (exam: Exam) => {
    setEditingId(exam.id);
    setForm({
      name: exam.name,
      academicYearId: exam.academicYearId || currentYearId,
      semesterId: exam.semesterId || '',
      classIds: exam.classes.map((c) => c.class.id),
      description: exam.description || '',
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return toast.error('Exam name is required');
    if (!form.academicYearId) return toast.error('Session year is required');
    if (form.classIds.length === 0) return toast.error('Select at least one class');

    const payload = {
      name: form.name.trim(),
      academicYearId: form.academicYearId,
      semesterId: form.semesterId || null,
      classIds: form.classIds,
      description: form.description.trim() || null,
    };

    setSaving(true);
    try {
      if (editingId) {
        await examsApi.update(editingId, payload);
        toast.success('Exam updated successfully');
      } else {
        await examsApi.create(payload);
        toast.success('Exam created successfully');
      }
      resetForm();
      loadExams();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to save exam');
    } finally {
      setSaving(false);
    }
  };

  const togglePublish = async (exam: Exam) => {
    setPublishingId(exam.id);
    try {
      await examsApi.setPublished(exam.id, !exam.isPublished);
      setExams((prev) => prev.map((x) => (x.id === exam.id ? { ...x, isPublished: !exam.isPublished } : x)));
      toast.success(exam.isPublished ? 'Exam unpublished' : 'Exam published');
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to update publish status');
    } finally {
      setPublishingId(null);
    }
  };

  const handleConfirmDelete = async () => {
    if (!examToDelete) return;
    setDeleting(true);
    try {
      await examsApi.remove(examToDelete.id);
      toast.success('Exam deleted successfully');
      if (editingId === examToDelete.id) resetForm();
      setExamToDelete(null);
      loadExams();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to delete exam');
    } finally {
      setDeleting(false);
    }
  };

  const rows = useMemo(() => exams.map((exam, i) => ({ ...exam, no: i + 1 })), [exams]);
  type Row = (typeof rows)[number];

  const columns: Column<Row>[] = [
    { key: 'no', header: 'No.', accessor: 'no', width: '60px' },
    { key: 'name', header: 'Name', accessor: 'name' },
    {
      key: 'description',
      header: 'Description',
      sortable: false,
      render: (row) => <span className="text-slate-500 dark:text-slate-400">{row.description || '—'}</span>,
    },
    {
      key: 'class',
      header: 'Class',
      sortable: false,
      render: (row) =>
        row.classes.length === 0 ? (
          <span className="text-slate-500 dark:text-slate-400">All classes</span>
        ) : (
          <div className="flex flex-wrap gap-1">
            {row.classes.map(({ class: c }) => (
              <span
                key={c.id}
                className="rounded-md bg-slate-100 dark:bg-white/5 px-2 py-0.5 text-xs text-slate-700 dark:text-slate-300"
              >
                {classLabel(c)}
              </span>
            ))}
          </div>
        ),
    },
    {
      key: 'publish',
      header: 'Publish',
      sortable: false,
      render: (row) => (
        <button
          type="button"
          role="switch"
          aria-checked={row.isPublished}
          aria-label={`${row.isPublished ? 'Unpublish' : 'Publish'} ${row.name}`}
          disabled={publishingId === row.id}
          onClick={() => togglePublish(row)}
          className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors disabled:opacity-50 ${
            row.isPublished ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-white/15'
          }`}
        >
          <span
            className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${
              row.isPublished ? 'translate-x-4' : 'translate-x-0.5'
            }`}
          />
        </button>
      ),
    },
    {
      key: 'sessionYear',
      header: 'Session Year',
      sortable: false,
      render: (row) => row.academicYear?.label || '—',
    },
  ];

  const actions: RowAction<Row>[] = [
    { label: 'Edit', icon: 'edit', onClick: startEdit },
    { label: 'Delete', icon: 'delete', variant: 'danger', onClick: (row) => setExamToDelete(row) },
  ];

  const labelClass = 'text-sm font-medium text-slate-700 dark:text-slate-400';

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">Manage Exam</h2>

      <div className="glass-card p-6 rounded-2xl space-y-5">
        <h3 className="text-lg font-bold text-slate-900 dark:text-white">{editingId ? 'Edit Exam' : 'Create Exams'}</h3>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="space-y-1.5">
              <label htmlFor="exam-name" className={labelClass}>
                Exam Name<span className="text-red-500 ml-1">*</span>
              </label>
              <input
                id="exam-name"
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="input-field"
                placeholder="Exam Name"
                maxLength={100}
                required
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="exam-session" className={labelClass}>
                Session Year<span className="text-red-500 ml-1">*</span>
              </label>
              <select
                id="exam-session"
                value={form.academicYearId}
                onChange={(e) => setForm({ ...form, academicYearId: e.target.value })}
                className="input-field cursor-pointer"
                required
              >
                {sessionYears.length === 0 && <option value="">Loading...</option>}
                {sessionYears.map((y) => (
                  <option key={y.id} value={y.id}>{y.label}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="exam-semester" className={labelClass}>Semester</label>
              <select
                id="exam-semester"
                value={form.semesterId}
                onChange={(e) => setForm({ ...form, semesterId: e.target.value })}
                className="input-field cursor-pointer"
              >
                <option value="">--Select--</option>
                {semesters.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
              <p className="flex items-center gap-1 text-xs text-primary-600 dark:text-primary-400">
                <Info className="w-3.5 h-3.5" />
                Leave unselected to create exam for non-semester classes.
              </p>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="exam-classes" className={labelClass}>
                Class<span className="text-red-500 ml-1">*</span>
              </label>
              <ClassMultiSelect
                id="exam-classes"
                classes={classes}
                value={form.classIds}
                onChange={(classIds) => setForm({ ...form, classIds })}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="exam-description" className={labelClass}>Exam Description</label>
            <textarea
              id="exam-description"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="input-field min-h-[70px]"
              placeholder="Exam Description"
              maxLength={500}
            />
          </div>

          <div className="flex items-center gap-2">
            <Button type="submit" variant="primary" isLoading={saving} className="px-8">
              {editingId ? 'Update' : 'Submit'}
            </Button>
            {editingId && (
              <Button type="button" variant="ghost" onClick={resetForm} disabled={saving}>
                Cancel
              </Button>
            )}
          </div>
        </form>
      </div>

      <div className="glass-card p-6 rounded-2xl space-y-4">
        <h3 className="text-lg font-bold text-slate-900 dark:text-white">List Exams</h3>
        <DataTable
          data={rows}
          columns={columns}
          actions={actions}
          isLoading={loading}
          searchPlaceholder="Search"
          emptyTitle="No exams found"
          emptyDescription="Create your first exam using the form above."
        />
      </div>

      <ConfirmModal
        isOpen={!!examToDelete}
        title="Delete exam"
        message={`Delete exam "${examToDelete?.name}"? Its timetable will be removed too. This cannot be undone.`}
        confirmLabel="Delete"
        variant="danger"
        isLoading={deleting}
        onConfirm={handleConfirmDelete}
        onCancel={() => setExamToDelete(null)}
      />
    </div>
  );
};

export default ManageExam;
