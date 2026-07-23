import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Plus, RefreshCw, UserCog } from 'lucide-react';
import toast from 'react-hot-toast';
import apiClient from '../../api/client';
import { DataTable, Column } from '../../components/DataTable/DataTable';
import { ConfirmModal } from '../../components/common/ConfirmModal';

// ── Types ────────────────────────────────────────────────────────────────

type AssignmentRole = 'PRIMARY' | 'SUBSTITUTE';

interface ClassMeta { id: string; name: string; }

interface TeacherMeta { id: string; firstName: string; lastName: string; email: string; }

interface AssignmentRow {
  id: string;
  teacherId: string;
  sectionId: string;
  subject: string | null;
  role: AssignmentRole;
  effectiveFrom: string;
  effectiveTo: string | null;
  teacher: { user: { firstName: string; lastName: string; email: string } };
  section: { name: string; class: { name: string } };
}

const todayStr = () => new Date().toISOString().split('T')[0];

// ── End-assignment modal (single date input) ────────────────────────────

const EndAssignmentModal: React.FC<{
  assignment: AssignmentRow;
  onCancel: () => void;
  onConfirm: (effectiveTo: string) => void;
  isLoading: boolean;
}> = ({ assignment, onCancel, onConfirm, isLoading }) => {
  const [date, setDate] = useState(todayStr());
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-slate-950/60 backdrop-blur-sm" role="dialog" aria-modal="true">
      <div className="bg-white dark:bg-slate-900/95 backdrop-blur-xl border border-slate-200 dark:border-white/10 rounded-2xl w-full max-w-sm shadow-2xl p-6">
        <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2">End assignment</h3>
        <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
          {assignment.teacher.user.firstName} {assignment.teacher.user.lastName} — {assignment.section.class.name} / {assignment.section.name}
        </p>
        <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">Effective to</label>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="input-field w-full" />
        <div className="flex justify-end gap-3 mt-5">
          <button onClick={onCancel} disabled={isLoading} className="px-4 py-2 rounded-xl text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-bold transition-all">
            Cancel
          </button>
          <button
            onClick={() => onConfirm(date)}
            disabled={isLoading}
            className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold py-2 px-5 rounded-xl transition-all shadow-lg shadow-blue-500/20 disabled:opacity-50 text-xs"
          >
            {isLoading ? 'Saving…' : 'End assignment'}
          </button>
        </div>
      </div>
    </div>
  );
};

// ── Create assignment form ──────────────────────────────────────────────

const CreateAssignmentForm: React.FC<{
  classes: ClassMeta[];
  teachers: TeacherMeta[];
  onCreated: () => void;
}> = ({ classes, teachers, onCreated }) => {
  const [classId, setClassId] = useState('');
  const [sections, setSections] = useState<ClassMeta[]>([]);
  const [sectionId, setSectionId] = useState('');
  const [teacherId, setTeacherId] = useState('');
  const [subject, setSubject] = useState('');
  const [role, setRole] = useState<AssignmentRole>('PRIMARY');
  const [effectiveFrom, setEffectiveFrom] = useState(todayStr());
  const [effectiveTo, setEffectiveTo] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!classId) { setSections([]); setSectionId(''); return; }
    apiClient.get(`/students/meta/sections?classId=${classId}`).then((res) => setSections(res.data.data || [])).catch(() => setSections([]));
    setSectionId('');
  }, [classId]);

  const resetForm = () => {
    setClassId(''); setSectionId(''); setTeacherId(''); setSubject('');
    setRole('PRIMARY'); setEffectiveFrom(todayStr()); setEffectiveTo('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!teacherId || !sectionId || !effectiveFrom) {
      toast.error('Teacher, section, and effective-from date are required.');
      return;
    }
    setSubmitting(true);
    try {
      await apiClient.post('/attendance/assignments', {
        teacherId,
        sectionId,
        subject: subject.trim() || undefined,
        role,
        effectiveFrom,
        effectiveTo: effectiveTo || undefined,
      });
      toast.success('Assignment created');
      resetForm();
      onCreated();
    } catch (err: any) {
      const code = err.response?.data?.code;
      const status = err.response?.status;
      if (code === 'ATTENDANCE_CONFLICT' && status === 409) {
        toast.error(role === 'PRIMARY'
          ? 'This section already has a primary teacher for this period — end-date the existing assignment or adjust the date range.'
          : 'An identical assignment already exists for this teacher/section/subject/date range.');
      } else if (status === 422) {
        toast.error('This user does not have a teacher profile yet — create the teacher profile before assigning them.');
      } else {
        toast.error(err.response?.data?.message || 'Failed to create assignment');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="glass-card p-5 rounded-3xl border border-slate-200/50 dark:border-white/5 bg-white dark:bg-slate-900/40 space-y-4">
      <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
        <Plus className="w-5 h-5 text-blue-500" /> New assignment
      </h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">Teacher</label>
          <select required value={teacherId} onChange={(e) => setTeacherId(e.target.value)} className="input-field w-full">
            <option value="">-- Select teacher --</option>
            {teachers.map((t) => <option key={t.id} value={t.id}>{t.firstName} {t.lastName} ({t.email})</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">Role</label>
          <select value={role} onChange={(e) => setRole(e.target.value as AssignmentRole)} className="input-field w-full">
            <option value="PRIMARY">Primary</option>
            <option value="SUBSTITUTE">Substitute</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">Class</label>
          <select required value={classId} onChange={(e) => setClassId(e.target.value)} className="input-field w-full">
            <option value="">-- Select class --</option>
            {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">Section</label>
          <select required disabled={!classId} value={sectionId} onChange={(e) => setSectionId(e.target.value)} className="input-field w-full disabled:opacity-50">
            <option value="">-- Select section --</option>
            {sections.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">Subject (optional — blank = homeroom/daily)</label>
          <input type="text" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="e.g. Mathematics" className="input-field w-full" />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">Effective from</label>
            <input required type="date" value={effectiveFrom} onChange={(e) => setEffectiveFrom(e.target.value)} className="input-field w-full" />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">Effective to (optional)</label>
            <input type="date" value={effectiveTo} onChange={(e) => setEffectiveTo(e.target.value)} className="input-field w-full" />
          </div>
        </div>
      </div>
      <div className="flex justify-end">
        <button
          type="submit"
          disabled={submitting}
          className="flex items-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold py-2.5 px-6 rounded-xl transition-all shadow-lg shadow-blue-500/20 disabled:opacity-50 text-sm"
        >
          {submitting ? 'Creating…' : 'Create assignment'}
        </button>
      </div>
    </form>
  );
};

// ── Page ──────────────────────────────────────────────────────────────────

const TeacherAssignments: React.FC = () => {
  const [classes, setClasses] = useState<ClassMeta[]>([]);
  const [teachers, setTeachers] = useState<TeacherMeta[]>([]);
  const [assignments, setAssignments] = useState<AssignmentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [filterSectionId, setFilterSectionId] = useState('');
  const [filterTeacherId, setFilterTeacherId] = useState('');
  const [activeOnly, setActiveOnly] = useState(false);
  const [filterClassId, setFilterClassId] = useState('');
  const [filterSections, setFilterSections] = useState<ClassMeta[]>([]);

  const [endTarget, setEndTarget] = useState<AssignmentRow | null>(null);
  const [endBusy, setEndBusy] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<AssignmentRow | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  useEffect(() => {
    apiClient.get('/students/meta/classes').then((res) => setClasses(res.data.data || [])).catch(() => {});
    apiClient.get('/users?role=TEACHER&pageSize=100').then((res) => setTeachers(res.data.data || [])).catch(() => {});
  }, []);

  useEffect(() => {
    if (!filterClassId) { setFilterSections([]); setFilterSectionId(''); return; }
    apiClient.get(`/students/meta/sections?classId=${filterClassId}`).then((res) => setFilterSections(res.data.data || [])).catch(() => setFilterSections([]));
    setFilterSectionId('');
  }, [filterClassId]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.get('/attendance/assignments', {
        params: {
          sectionId: filterSectionId || undefined,
          teacherId: filterTeacherId || undefined,
          activeOnly: activeOnly ? 'true' : undefined,
        },
      });
      setAssignments(res.data.data || []);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load assignments.');
      setAssignments([]);
    } finally {
      setLoading(false);
    }
  }, [filterSectionId, filterTeacherId, activeOnly]);

  useEffect(() => { load(); }, [load]);

  const handleEnd = async (effectiveTo: string) => {
    if (!endTarget) return;
    setEndBusy(true);
    try {
      await apiClient.patch(`/attendance/assignments/${endTarget.id}`, { effectiveTo });
      toast.success('Assignment ended');
      setEndTarget(null);
      load();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to end assignment');
    } finally {
      setEndBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleteBusy(true);
    try {
      await apiClient.delete(`/attendance/assignments/${deleteTarget.id}`);
      toast.success('Assignment deleted');
      setDeleteTarget(null);
      load();
    } catch (err: any) {
      const status = err.response?.status;
      if (status === 409) {
        toast.error('This assignment has already been used by an attendance register — end-date it instead of deleting.');
      } else {
        toast.error(err.response?.data?.message || 'Failed to delete assignment');
      }
      setDeleteTarget(null);
    } finally {
      setDeleteBusy(false);
    }
  };

  const columns: Column<AssignmentRow>[] = [
    { key: 'teacher', header: 'Teacher', render: (a) => `${a.teacher.user.firstName} ${a.teacher.user.lastName}` },
    { key: 'section', header: 'Class / Section', render: (a) => `${a.section.class.name} - ${a.section.name}` },
    { key: 'subject', header: 'Subject', render: (a) => a.subject || <span className="text-slate-400 italic">Homeroom</span> },
    { key: 'role', header: 'Role', render: (a) => (
      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide ${
        a.role === 'PRIMARY'
          ? 'bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400'
          : 'bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400'
      }`}>{a.role}</span>
    ) },
    { key: 'effective', header: 'Effective range', render: (a) => `${new Date(a.effectiveFrom).toLocaleDateString()} — ${a.effectiveTo ? new Date(a.effectiveTo).toLocaleDateString() : 'Open'}` },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight flex items-center gap-3">
          <UserCog className="w-7 h-7 text-blue-500" /> Teacher Assignments
        </h2>
        <p className="text-slate-600 dark:text-slate-400 mt-1">Configure which teachers own which class sections and subjects for attendance — separate from daily attendance entry.</p>
      </div>

      <CreateAssignmentForm classes={classes} teachers={teachers} onCreated={load} />

      <div className="glass-card p-4 rounded-2xl border border-slate-200/50 dark:border-white/5 bg-slate-50 dark:bg-slate-900/30 flex flex-wrap items-end gap-4">
        <div className="flex flex-col">
          <label className="text-xs text-slate-500 font-semibold mb-1.5">Class</label>
          <select value={filterClassId} onChange={(e) => setFilterClassId(e.target.value)} className="input-field min-w-[140px]">
            <option value="">All classes</option>
            {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div className="flex flex-col">
          <label className="text-xs text-slate-500 font-semibold mb-1.5">Section</label>
          <select value={filterSectionId} onChange={(e) => setFilterSectionId(e.target.value)} disabled={!filterClassId} className="input-field min-w-[120px] disabled:opacity-50">
            <option value="">All sections</option>
            {filterSections.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div className="flex flex-col">
          <label className="text-xs text-slate-500 font-semibold mb-1.5">Teacher</label>
          <select value={filterTeacherId} onChange={(e) => setFilterTeacherId(e.target.value)} className="input-field min-w-[160px]">
            <option value="">All teachers</option>
            {teachers.map((t) => <option key={t.id} value={t.id}>{t.firstName} {t.lastName}</option>)}
          </select>
        </div>
        <button
          onClick={() => setActiveOnly((v) => !v)}
          className={`text-xs font-bold px-4 py-2.5 rounded-xl border transition-all ${
            activeOnly
              ? 'bg-blue-600 text-white border-blue-600'
              : 'bg-white dark:bg-slate-800/50 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-white/10 hover:bg-slate-100 dark:hover:bg-white/5'
          }`}
        >
          Active only
        </button>
        <button onClick={load} className="ml-auto flex items-center gap-1.5 text-xs font-bold px-3 py-2.5 rounded-xl text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/5 transition-colors">
          <RefreshCw className="w-3.5 h-3.5" /> Refresh
        </button>
      </div>

      {error ? (
        <div className="glass-card p-8 rounded-3xl border border-rose-200 dark:border-rose-500/10 bg-rose-50/50 dark:bg-rose-500/5 text-center flex flex-col items-center justify-center space-y-3">
          <AlertTriangle className="w-10 h-10 text-rose-500" />
          <p className="text-slate-700 dark:text-slate-300 text-sm max-w-md">{error}</p>
          <button onClick={load} className="flex items-center gap-2 bg-rose-600 hover:bg-rose-500 text-white px-4 py-2 rounded-xl text-xs font-bold transition-all">
            <RefreshCw className="w-3.5 h-3.5" /> Retry
          </button>
        </div>
      ) : (
        <DataTable
          data={assignments}
          columns={columns}
          isLoading={loading}
          searchPlaceholder="Search teacher, class, section, subject…"
          emptyTitle="No assignments found"
          emptyDescription="Create a teacher assignment above to get started."
          actions={[
            { label: 'End assignment', icon: 'edit', onClick: (a) => setEndTarget(a) },
            { label: 'Delete', icon: 'delete', variant: 'danger', onClick: (a) => setDeleteTarget(a) },
          ]}
        />
      )}

      {endTarget && (
        <EndAssignmentModal
          assignment={endTarget}
          isLoading={endBusy}
          onCancel={() => setEndTarget(null)}
          onConfirm={handleEnd}
        />
      )}

      <ConfirmModal
        isOpen={!!deleteTarget}
        title="Delete assignment?"
        message={deleteTarget ? `Delete the assignment for ${deleteTarget.teacher.user.firstName} ${deleteTarget.teacher.user.lastName} on ${deleteTarget.section.class.name} - ${deleteTarget.section.name}? If it has ever been used by an attendance register, the server will reject this and ask you to end-date it instead.` : ''}
        confirmLabel="Delete"
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
        isLoading={deleteBusy}
        variant="danger"
      />
    </div>
  );
};

export default TeacherAssignments;
