import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle, CheckCircle2, Clock, Download, Lock, RefreshCw,
  ShieldAlert, Unlock, Users, X, Pencil, Inbox,
} from 'lucide-react';
import toast from 'react-hot-toast';
import apiClient from '../../api/client';
import { DataTable, Column } from '../../components/DataTable/DataTable';
import { StatusBadge } from '../../components/common/StatusBadge';
import { EmptyState } from '../../components/common/EmptyState';
import { downloadCsv } from '../../utils/csv';

// ── Types ────────────────────────────────────────────────────────────────

type LifecycleStatus = 'NOT_OPENED' | 'IN_PROGRESS' | 'SUBMITTED' | 'LOCKED' | 'REOPENED';
type Mark = 'PRESENT' | 'LATE' | 'ABSENT_EXCUSED' | 'ABSENT_UNEXCUSED' | 'LEAVE' | 'NOT_REQUIRED';

const DAILY_SUBJECT_SENTINEL = '__DAILY__';
const NEEDS_ATTENTION_STATUSES: LifecycleStatus[] = ['NOT_OPENED', 'IN_PROGRESS', 'REOPENED'];

interface AdminRegisterRow {
  // `id` is null for virtual "not opened" rows synthesized by the backend
  // for sections that have never had a register opened on the queried date.
  id: string | null;
  date: string;
  subject: string;
  status: LifecycleStatus;
  version: number;
  sectionId: string;
  section: { name: string; class: { name: string } };
  assignment: { teacher: { user: { firstName: string; lastName: string } } } | null;
  studentCount: number;
  recordedCount: number;
  unmarkedCount: number;
  presentCount: number;
  lateCount: number;
  excusedAbsentCount: number;
  unexcusedAbsentCount: number;
}

interface RosterStudent {
  studentId: string;
  name: string;
  rollNumber: string | null;
  currentMark: Mark | null;
  reasonId: string | null;
  note: string | null;
  minutesLate: number | null;
  recordId: string | null;
  recordVersion: number | null;
}

interface RosterResponse {
  registerId: string;
  status: LifecycleStatus;
  version: number;
  subject: string | null;
  students: RosterStudent[];
}

interface ClassMeta { id: string; name: string; }
interface TeacherMeta { id: string; firstName: string; lastName: string; email: string; }

interface CorrectionRequestRow {
  id: string;
  status: string;
  requestedMark: Mark;
  requestNote: string;
  createdAt: string;
  record: { student: { id: string; firstName: string; lastName: string } };
}

interface ReportStudentRow {
  studentId: string;
  name: string;
  sectionName: string;
  counts: Record<Mark, number>;
  countedDays: number;
  presentEquivalentDays: number;
  percentage: number | null;
}

const todayStr = () => new Date().toISOString().split('T')[0];
const displaySubject = (subject: string | null) => (!subject || subject === DAILY_SUBJECT_SENTINEL ? 'Homeroom' : subject);

// ── Reason prompt modal (simple, for reopen reason / resolution note) ─────

const TextPromptModal: React.FC<{
  title: string;
  label: string;
  required?: boolean;
  confirmLabel?: string;
  onCancel: () => void;
  onConfirm: (value: string) => void;
  isLoading?: boolean;
}> = ({ title, label, required = true, confirmLabel = 'Confirm', onCancel, onConfirm, isLoading }) => {
  const [value, setValue] = useState('');
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center px-4 bg-slate-950/60 backdrop-blur-sm" role="dialog" aria-modal="true">
      <div className="bg-white dark:bg-slate-900/95 backdrop-blur-xl border border-slate-200 dark:border-white/10 rounded-2xl w-full max-w-md shadow-2xl p-6">
        <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-4">{title}</h3>
        <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">{label}</label>
        <textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          rows={3}
          className="input-field w-full resize-none"
          autoFocus
        />
        <div className="flex justify-end gap-3 mt-5">
          <button onClick={onCancel} disabled={isLoading} className="px-4 py-2 rounded-xl text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-bold transition-all">
            Cancel
          </button>
          <button
            onClick={() => {
              if (required && !value.trim()) {
                toast.error('This field is required.');
                return;
              }
              onConfirm(value.trim());
            }}
            disabled={isLoading}
            className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold py-2 px-5 rounded-xl transition-all shadow-lg shadow-blue-500/20 disabled:opacity-50 text-xs"
          >
            {isLoading ? 'Submitting…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

// ── Admin correction modal (per-student mark correction in register detail) ─

const MARK_OPTIONS: Mark[] = ['PRESENT', 'LATE', 'ABSENT_EXCUSED', 'ABSENT_UNEXCUSED', 'LEAVE', 'NOT_REQUIRED'];

const AdminCorrectionModal: React.FC<{
  student: RosterStudent;
  onCancel: () => void;
  onConfirm: (payload: { mark: Mark; note?: string; minutesLate?: number; correctionReason: string }) => void;
  isLoading?: boolean;
}> = ({ student, onCancel, onConfirm, isLoading }) => {
  const [mark, setMark] = useState<Mark>(student.currentMark ?? 'PRESENT');
  const [note, setNote] = useState(student.note ?? '');
  const [minutesLate, setMinutesLate] = useState<number>(student.minutesLate ?? 0);
  const [correctionReason, setCorrectionReason] = useState('');

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center px-4 bg-slate-950/60 backdrop-blur-sm" role="dialog" aria-modal="true">
      <div className="bg-white dark:bg-slate-900/95 backdrop-blur-xl border border-slate-200 dark:border-white/10 rounded-2xl w-full max-w-md shadow-2xl p-6">
        <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-1">Correct attendance record</h3>
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">{student.name}</p>

        <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">Mark</label>
        <select value={mark} onChange={(e) => setMark(e.target.value as Mark)} className="input-field w-full mb-3">
          {MARK_OPTIONS.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>

        {mark === 'LATE' && (
          <>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">Minutes late</label>
            <input
              type="number"
              min={0}
              value={minutesLate}
              onChange={(e) => setMinutesLate(Number(e.target.value))}
              className="input-field w-full mb-3"
            />
          </>
        )}

        <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">Note (optional)</label>
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className="input-field w-full resize-none mb-3" />

        <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">Reason for correction (required)</label>
        <textarea
          value={correctionReason}
          onChange={(e) => setCorrectionReason(e.target.value)}
          rows={2}
          className="input-field w-full resize-none"
          autoFocus
        />

        <div className="flex justify-end gap-3 mt-5">
          <button onClick={onCancel} disabled={isLoading} className="px-4 py-2 rounded-xl text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-bold transition-all">
            Cancel
          </button>
          <button
            onClick={() => {
              if (!correctionReason.trim()) {
                toast.error('Reason for correction is required.');
                return;
              }
              onConfirm({
                mark,
                note: note.trim() || undefined,
                minutesLate: mark === 'LATE' ? minutesLate : undefined,
                correctionReason: correctionReason.trim(),
              });
            }}
            disabled={isLoading}
            className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold py-2 px-5 rounded-xl transition-all shadow-lg shadow-blue-500/20 disabled:opacity-50 text-xs"
          >
            {isLoading ? 'Submitting…' : 'Save correction'}
          </button>
        </div>
      </div>
    </div>
  );
};

// ── Register detail drawer ─────────────────────────────────────────────────

const RegisterDetailDrawer: React.FC<{
  register: AdminRegisterRow;
  onClose: () => void;
  onChanged: () => void;
}> = ({ register, onClose, onChanged }) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [roster, setRoster] = useState<RosterResponse | null>(null);
  const [promptMode, setPromptMode] = useState<'reopen' | null>(null);
  const [correctingStudent, setCorrectingStudent] = useState<RosterStudent | null>(null);
  const [busy, setBusy] = useState(false);

  const subjectParam = register.subject === DAILY_SUBJECT_SENTINEL ? undefined : register.subject;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.get('/attendance/registers/roster', {
        params: { sectionId: register.sectionId, date: register.date.split('T')[0], subject: subjectParam },
      });
      setRoster(res.data.data);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load register detail.');
    } finally {
      setLoading(false);
    }
  }, [register, subjectParam]);

  useEffect(() => { load(); }, [load]);

  const doReopen = async (reason: string) => {
    setBusy(true);
    try {
      await apiClient.post(`/attendance/admin/registers/${register.id}/reopen`, { reason });
      toast.success('Register reopened');
      setPromptMode(null);
      onChanged();
      load();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to reopen register');
    } finally {
      setBusy(false);
    }
  };

  const doLock = async () => {
    if (!roster) return;
    setBusy(true);
    try {
      await apiClient.post(`/attendance/admin/registers/${register.id}/lock`, { version: roster.version });
      toast.success('Register locked');
      onChanged();
      load();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to lock register');
    } finally {
      setBusy(false);
    }
  };

  const doCorrect = async (payload: { mark: Mark; note?: string; minutesLate?: number; correctionReason: string }) => {
    if (!correctingStudent?.recordId) return;
    setBusy(true);
    try {
      await apiClient.patch(`/attendance/admin/records/${correctingStudent.recordId}`, {
        mark: payload.mark,
        note: payload.note,
        minutesLate: payload.minutesLate,
        version: correctingStudent.recordVersion,
        correctionReason: payload.correctionReason,
      });
      toast.success('Attendance record corrected');
      setCorrectingStudent(null);
      onChanged();
      load();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to correct attendance record');
    } finally {
      setBusy(false);
    }
  };

  const status = roster?.status ?? register.status;
  const canReopen = status === 'SUBMITTED' || status === 'LOCKED';
  const canLock = status === 'SUBMITTED' || status === 'REOPENED';

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg h-full bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-white/10 shadow-2xl overflow-y-auto animate-in slide-in-from-right duration-200">
        <div className="sticky top-0 z-10 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-200 dark:border-white/10 px-5 py-4 flex items-center justify-between">
          <div>
            <h3 className="font-black text-slate-900 dark:text-white">
              {register.section.class.name} - {register.section.name}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {displaySubject(register.subject)} • {new Date(register.date).toLocaleDateString([], { year: 'numeric', month: 'long', day: 'numeric' })}
            </p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/5">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-5">
          <div className="flex items-center justify-between">
            <StatusBadge status={status} />
            <div className="flex items-center gap-2">
              {canReopen && (
                <button
                  onClick={() => setPromptMode('reopen')}
                  className="flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-xl bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-500/20 hover:bg-amber-100 dark:hover:bg-amber-500/20 transition-all"
                >
                  <Unlock className="w-3.5 h-3.5" /> Reopen
                </button>
              )}
              {canLock && (
                <button
                  onClick={doLock}
                  disabled={busy}
                  className="flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-xl bg-slate-100 dark:bg-white/5 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-white/10 hover:bg-slate-200 dark:hover:bg-white/10 transition-all disabled:opacity-50"
                >
                  <Lock className="w-3.5 h-3.5" /> Lock
                </button>
              )}
            </div>
          </div>

          {loading ? (
            <div className="space-y-2">
              {[0, 1, 2, 3].map((i) => <div key={i} className="h-12 rounded-xl bg-slate-100 dark:bg-slate-800/40 animate-pulse" />)}
            </div>
          ) : error ? (
            <div className="p-6 text-center text-sm text-rose-600 dark:text-rose-400">{error}</div>
          ) : !roster || roster.students.length === 0 ? (
            <EmptyState icon={<Users className="w-10 h-10 text-slate-400" />} title="No students" description="No active students found in this section." />
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-white/5 rounded-xl border border-slate-200 dark:border-white/5 overflow-hidden">
              {roster.students.map((s) => (
                <div key={s.studentId} className="p-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-slate-900 dark:text-white truncate">{s.name}</div>
                    <div className="text-xs text-slate-500 font-mono">Roll {s.rollNumber || '—'}</div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <StatusBadge status={s.currentMark ?? 'NOT_REQUIRED'} />
                    <button
                      disabled={!s.recordId}
                      onClick={() => s.recordId && setCorrectingStudent(s)}
                      title={s.recordId ? 'Correct this attendance record' : 'Not yet marked — no attendance record exists for this student yet.'}
                      className={`p-1.5 rounded-lg transition-colors ${
                        s.recordId
                          ? 'text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/10'
                          : 'text-slate-300 dark:text-slate-700 cursor-not-allowed'
                      }`}
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {promptMode === 'reopen' && (
        <TextPromptModal
          title="Reopen register"
          label="Reason for reopening (required)"
          confirmLabel="Reopen"
          isLoading={busy}
          onCancel={() => setPromptMode(null)}
          onConfirm={doReopen}
        />
      )}

      {correctingStudent && (
        <AdminCorrectionModal
          student={correctingStudent}
          isLoading={busy}
          onCancel={() => setCorrectingStudent(null)}
          onConfirm={doCorrect}
        />
      )}
    </div>
  );
};

// ── Registers tab ───────────────────────────────────────────────────────────

const RegistersTab: React.FC = () => {
  const [date, setDate] = useState(todayStr());
  const [classId, setClassId] = useState('');
  const [sectionId, setSectionId] = useState('');
  const [teacherId, setTeacherId] = useState('');
  const [needsAttentionOnly, setNeedsAttentionOnly] = useState(false);

  const [classes, setClasses] = useState<ClassMeta[]>([]);
  const [sections, setSections] = useState<ClassMeta[]>([]);
  const [teachers, setTeachers] = useState<TeacherMeta[]>([]);

  const [registers, setRegisters] = useState<AdminRegisterRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<AdminRegisterRow | null>(null);

  useEffect(() => {
    apiClient.get('/students/meta/classes').then((res) => setClasses(res.data.data || [])).catch(() => {});
    apiClient.get('/users?role=TEACHER&pageSize=100').then((res) => setTeachers(res.data.data || [])).catch(() => {});
  }, []);

  useEffect(() => {
    if (!classId) { setSections([]); setSectionId(''); return; }
    apiClient.get(`/students/meta/sections?classId=${classId}`).then((res) => setSections(res.data.data || [])).catch(() => setSections([]));
    setSectionId('');
  }, [classId]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.get('/attendance/admin/registers', {
        params: {
          date,
          classId: classId || undefined,
          sectionId: sectionId || undefined,
          pageSize: 200,
          page: 1,
        },
      });
      let rows: AdminRegisterRow[] = res.data.data || [];
      if (teacherId) {
        rows = rows.filter((r) => (r.assignment as any)?.teacher?.id === teacherId || (r.assignment as any)?.teacherId === teacherId);
      }
      setRegisters(rows);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load registers.');
      setRegisters([]);
    } finally {
      setLoading(false);
    }
  }, [date, classId, sectionId, teacherId]);

  useEffect(() => { load(); }, [load]);

  const stats = useMemo(() => {
    const total = registers.length;
    const submitted = registers.filter((r) => r.status === 'SUBMITTED' || r.status === 'LOCKED').length;
    const needsAttention = registers.filter((r) => NEEDS_ATTENTION_STATUSES.includes(r.status)).length;
    const totalRecorded = registers.reduce((sum, r) => sum + (r.recordedCount || 0), 0);
    const totalPresent = registers.reduce((sum, r) => sum + (r.presentCount || 0), 0);
    const totalLate = registers.reduce((sum, r) => sum + (r.lateCount || 0), 0);
    const totalExcusedAbsent = registers.reduce((sum, r) => sum + (r.excusedAbsentCount || 0), 0);
    const totalUnexcusedAbsent = registers.reduce((sum, r) => sum + (r.unexcusedAbsentCount || 0), 0);
    const attendancePct = totalRecorded > 0 ? Math.round(((totalPresent + totalLate) / totalRecorded) * 1000) / 10 : null;
    return { total, submitted, needsAttention, totalRecorded, totalPresent, totalLate, totalExcusedAbsent, totalUnexcusedAbsent, attendancePct };
  }, [registers]);

  const visibleRows = useMemo(() => {
    if (!needsAttentionOnly) return registers;
    return registers.filter((r) => NEEDS_ATTENTION_STATUSES.includes(r.status));
  }, [registers, needsAttentionOnly]);

  // DataTable requires a non-null string `id` per row; virtual "not opened"
  // rows have `id: null` from the API, so we synthesize a stable table key
  // while preserving the real (nullable) register id as `registerId`.
  const tableRows = useMemo(
    () => visibleRows.map((r) => ({ ...r, id: r.id ?? `virtual:${r.sectionId}:${r.date}`, registerId: r.id })),
    [visibleRows]
  );
  type TableRow = (typeof tableRows)[number];

  const columns: Column<TableRow>[] = [
    { key: 'date', header: 'Date', render: (r) => new Date(r.date).toLocaleDateString() },
    { key: 'class', header: 'Class / Section', render: (r) => `${r.section.class.name} - ${r.section.name}` },
    { key: 'subject', header: 'Subject', render: (r) => displaySubject(r.subject) },
    {
      key: 'teacher',
      header: 'Teacher',
      render: (r) => r.assignment?.teacher?.user
        ? `${r.assignment.teacher.user.firstName} ${r.assignment.teacher.user.lastName}`
        : <span className="text-slate-400 italic">Unassigned</span>,
    },
    { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
    { key: 'present', header: 'Present', render: (r) => r.presentCount },
    { key: 'late', header: 'Late', render: (r) => r.lateCount },
    { key: 'absentExcused', header: 'Absent (Ex.)', render: (r) => r.excusedAbsentCount },
    { key: 'absentUnexcused', header: 'Absent (Unex.)', render: (r) => r.unexcusedAbsentCount },
    { key: 'unmarked', header: 'Unmarked', render: (r) => r.unmarkedCount },
  ];

  return (
    <div className="space-y-6">
      {/* KPI strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="glass-card p-4 rounded-2xl border border-slate-200/50 dark:border-white/5 bg-white dark:bg-slate-900/40">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-500/10 flex items-center justify-center text-blue-600 dark:text-blue-400"><Users className="w-5 h-5" /></div>
            <div>
              <div className="text-xl font-black text-slate-900 dark:text-white">
                {stats.attendancePct === null ? '—' : `${stats.attendancePct}%`}
              </div>
              <div className="text-xs text-slate-500">Overall attendance for {date}</div>
            </div>
          </div>
        </div>
        <div className="glass-card p-4 rounded-2xl border border-slate-200/50 dark:border-white/5 bg-white dark:bg-slate-900/40">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-teal-50 dark:bg-teal-500/10 flex items-center justify-center text-teal-600 dark:text-teal-400"><CheckCircle2 className="w-5 h-5" /></div>
            <div>
              <div className="text-xl font-black text-slate-900 dark:text-white">{stats.submitted} / {stats.total}</div>
              <div className="text-xs text-slate-500">Registers submitted</div>
            </div>
          </div>
        </div>
        <div className="glass-card p-4 rounded-2xl border border-slate-200/50 dark:border-white/5 bg-white dark:bg-slate-900/40">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-50 dark:bg-amber-500/10 flex items-center justify-center text-amber-600 dark:text-amber-400"><Clock className="w-5 h-5" /></div>
            <div>
              <div className="text-xl font-black text-slate-900 dark:text-white">{stats.totalPresent} / {stats.totalLate}</div>
              <div className="text-xs text-slate-500">Present / Late</div>
            </div>
          </div>
        </div>
        <div className="glass-card p-4 rounded-2xl border border-slate-200/50 dark:border-white/5 bg-white dark:bg-slate-900/40">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-rose-50 dark:bg-rose-500/10 flex items-center justify-center text-rose-600 dark:text-rose-400"><ShieldAlert className="w-5 h-5" /></div>
            <div>
              <div className="text-xl font-black text-slate-900 dark:text-white">{stats.totalExcusedAbsent} / {stats.totalUnexcusedAbsent}</div>
              <div className="text-xs text-slate-500">Absent excused / unexcused</div>
            </div>
          </div>
        </div>
      </div>
      <p className="text-xs text-slate-400 dark:text-slate-500 -mt-2">
        {stats.needsAttention} of {stats.total} sections still need attention (not opened, in progress, or reopened) for {date}.
      </p>

      {/* Filters */}
      <div className="glass-card p-4 rounded-2xl border border-slate-200/50 dark:border-white/5 bg-slate-50 dark:bg-slate-900/30 flex flex-wrap items-end gap-4">
        <div className="flex flex-col">
          <label className="text-xs text-slate-500 font-semibold mb-1.5">Date</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="input-field min-w-[150px]" />
        </div>
        <div className="flex flex-col">
          <label className="text-xs text-slate-500 font-semibold mb-1.5">Class</label>
          <select value={classId} onChange={(e) => setClassId(e.target.value)} className="input-field min-w-[140px]">
            <option value="">All classes</option>
            {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div className="flex flex-col">
          <label className="text-xs text-slate-500 font-semibold mb-1.5">Section</label>
          <select value={sectionId} onChange={(e) => setSectionId(e.target.value)} disabled={!classId} className="input-field min-w-[120px] disabled:opacity-50">
            <option value="">All sections</option>
            {sections.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div className="flex flex-col">
          <label className="text-xs text-slate-500 font-semibold mb-1.5">Teacher</label>
          <select value={teacherId} onChange={(e) => setTeacherId(e.target.value)} className="input-field min-w-[160px]">
            <option value="">All teachers</option>
            {teachers.map((t) => <option key={t.id} value={t.id}>{t.firstName} {t.lastName}</option>)}
          </select>
        </div>
        <button
          onClick={() => setNeedsAttentionOnly((v) => !v)}
          className={`text-xs font-bold px-4 py-2.5 rounded-xl border transition-all ${
            needsAttentionOnly
              ? 'bg-rose-600 text-white border-rose-600'
              : 'bg-white dark:bg-slate-800/50 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-white/10 hover:bg-slate-100 dark:hover:bg-white/5'
          }`}
        >
          Needs attention ({stats.needsAttention})
        </button>
        <button
          disabled
          title="No teacher-reminder endpoint exists in the attendance module yet — this is a placeholder for when one is added."
          className="flex items-center gap-1.5 text-xs font-bold px-4 py-2.5 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 text-slate-400 dark:text-slate-600 cursor-not-allowed"
        >
          Remind teachers (coming soon)
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
          data={tableRows}
          columns={columns}
          isLoading={loading}
          searchPlaceholder="Search class, section, subject, teacher…"
          emptyTitle="No registers found"
          emptyDescription="No attendance registers match the current filters for this date."
          actions={[{
            label: 'View',
            icon: 'view',
            onClick: (r) => {
              if (!r.registerId) {
                toast('Not opened yet — no attendance has been recorded for this class today', { icon: 'ℹ️' });
                return;
              }
              const { registerId, ...rest } = r;
              setDetail({ ...rest, id: registerId });
            },
          }]}
        />
      )}

      {detail && (
        <RegisterDetailDrawer register={detail} onClose={() => setDetail(null)} onChanged={load} />
      )}
    </div>
  );
};

// ── Reports tab ─────────────────────────────────────────────────────────────

const ReportsTab: React.FC = () => {
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 6);
    return d.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState(todayStr());
  const [classId, setClassId] = useState('');
  const [sectionId, setSectionId] = useState('');
  const [classes, setClasses] = useState<ClassMeta[]>([]);
  const [sections, setSections] = useState<ClassMeta[]>([]);
  const [rows, setRows] = useState<ReportStudentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiClient.get('/students/meta/classes').then((res) => setClasses(res.data.data || [])).catch(() => {});
  }, []);

  useEffect(() => {
    if (!classId) { setSections([]); setSectionId(''); return; }
    apiClient.get(`/students/meta/sections?classId=${classId}`).then((res) => setSections(res.data.data || [])).catch(() => setSections([]));
    setSectionId('');
  }, [classId]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.get('/attendance/reports/summary', {
        params: { startDate, endDate, classId: classId || undefined, sectionId: sectionId || undefined },
      });
      const sections2: { sectionId: string; students: ReportStudentRow[] }[] = res.data.data || [];
      const flat = sections2.flatMap((s) => s.students);
      setRows(flat);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load report.');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate, classId, sectionId]);

  useEffect(() => { load(); }, [load]);

  const exportCsv = () => {
    if (!rows.length) {
      toast.error('Nothing to export yet.');
      return;
    }
    const headers = ['Student', 'Section', 'Present', 'Late', 'Absent (Excused)', 'Absent (Unexcused)', 'Leave', 'Counted Days', 'Attendance %'];
    const data = rows.map((r) => [
      r.name,
      r.sectionName,
      r.counts.PRESENT,
      r.counts.LATE,
      r.counts.ABSENT_EXCUSED,
      r.counts.ABSENT_UNEXCUSED,
      r.counts.LEAVE,
      r.countedDays,
      r.percentage ?? '',
    ]);
    downloadCsv(`attendance_report_${startDate}_to_${endDate}.csv`, headers, data);
  };

  const columns: Column<ReportStudentRow & { id: string }>[] = [
    { key: 'name', header: 'Student', accessor: 'name' },
    { key: 'sectionName', header: 'Section', accessor: 'sectionName' },
    { key: 'present', header: 'Present', render: (r) => r.counts.PRESENT },
    { key: 'late', header: 'Late', render: (r) => r.counts.LATE },
    { key: 'absentExcused', header: 'Absent (Ex.)', render: (r) => r.counts.ABSENT_EXCUSED },
    { key: 'absentUnexcused', header: 'Absent (Unex.)', render: (r) => r.counts.ABSENT_UNEXCUSED },
    { key: 'percentage', header: 'Attendance %', render: (r) => (r.percentage === null ? '—' : `${r.percentage}%`) },
  ];

  return (
    <div className="space-y-6">
      <div className="glass-card p-4 rounded-2xl border border-slate-200/50 dark:border-white/5 bg-slate-50 dark:bg-slate-900/30 flex flex-wrap items-end gap-4">
        <div className="flex flex-col">
          <label className="text-xs text-slate-500 font-semibold mb-1.5">Start date</label>
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="input-field min-w-[150px]" />
        </div>
        <div className="flex flex-col">
          <label className="text-xs text-slate-500 font-semibold mb-1.5">End date</label>
          <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="input-field min-w-[150px]" />
        </div>
        <div className="flex flex-col">
          <label className="text-xs text-slate-500 font-semibold mb-1.5">Class</label>
          <select value={classId} onChange={(e) => setClassId(e.target.value)} className="input-field min-w-[140px]">
            <option value="">All classes</option>
            {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div className="flex flex-col">
          <label className="text-xs text-slate-500 font-semibold mb-1.5">Section</label>
          <select value={sectionId} onChange={(e) => setSectionId(e.target.value)} disabled={!classId} className="input-field min-w-[120px] disabled:opacity-50">
            <option value="">All sections</option>
            {sections.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <button onClick={exportCsv} className="flex items-center gap-1.5 ml-auto text-xs font-bold px-4 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white transition-all shadow-lg shadow-blue-500/20">
          <Download className="w-3.5 h-3.5" /> Export CSV
        </button>
      </div>

      {error ? (
        <div className="glass-card p-8 rounded-3xl border border-rose-200 dark:border-rose-500/10 bg-rose-50/50 dark:bg-rose-500/5 text-center text-sm text-slate-700 dark:text-slate-300">{error}</div>
      ) : (
        <DataTable
          data={rows.map((r) => ({ ...r, id: r.studentId }))}
          columns={columns}
          isLoading={loading}
          searchPlaceholder="Search student or section…"
          emptyTitle="No report data"
          emptyDescription="No attendance records found for the selected range and filters."
        />
      )}
    </div>
  );
};

// ── Correction requests tab ─────────────────────────────────────────────────

const CorrectionRequestsTab: React.FC = () => {
  const [rows, setRows] = useState<CorrectionRequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [promptFor, setPromptFor] = useState<{ id: string; decision: 'APPROVED' | 'REJECTED' } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.get('/attendance/correction-requests', { params: { status: 'PENDING', pageSize: 100 } });
      setRows(res.data.data || []);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load correction requests.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const resolve = async (id: string, decision: 'APPROVED' | 'REJECTED', resolutionNote: string) => {
    setBusy(true);
    try {
      await apiClient.patch(`/attendance/correction-requests/${id}/resolve`, { decision, resolutionNote });
      toast.success(decision === 'APPROVED' ? 'Correction approved' : 'Correction rejected');
      setPromptFor(null);
      load();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to resolve request');
    } finally {
      setBusy(false);
    }
  };

  const columns: Column<CorrectionRequestRow>[] = [
    { key: 'student', header: 'Student', render: (r) => `${r.record.student.firstName} ${r.record.student.lastName}` },
    { key: 'requestedMark', header: 'Requested mark', render: (r) => <StatusBadge status={r.requestedMark} /> },
    { key: 'requestNote', header: 'Note', render: (r) => <span className="max-w-xs truncate block">{r.requestNote}</span> },
    { key: 'createdAt', header: 'Submitted', render: (r) => new Date(r.createdAt).toLocaleDateString() },
  ];

  return (
    <div className="space-y-6">
      {error ? (
        <div className="glass-card p-8 rounded-3xl border border-rose-200 dark:border-rose-500/10 bg-rose-50/50 dark:bg-rose-500/5 text-center text-sm text-slate-700 dark:text-slate-300">{error}</div>
      ) : (
        <DataTable
          data={rows}
          columns={columns}
          isLoading={loading}
          searchPlaceholder="Search student or note…"
          emptyTitle="No pending correction requests"
          emptyDescription="Student/guardian-submitted attendance correction requests will appear here."
          actions={[
            { label: 'Approve', icon: 'edit', onClick: (r) => setPromptFor({ id: r.id, decision: 'APPROVED' }) },
            { label: 'Reject', icon: 'delete', variant: 'danger', onClick: (r) => setPromptFor({ id: r.id, decision: 'REJECTED' }) },
          ]}
        />
      )}

      {promptFor && (
        <TextPromptModal
          title={promptFor.decision === 'APPROVED' ? 'Approve correction request' : 'Reject correction request'}
          label="Resolution note (required)"
          confirmLabel={promptFor.decision === 'APPROVED' ? 'Approve' : 'Reject'}
          isLoading={busy}
          onCancel={() => setPromptFor(null)}
          onConfirm={(note) => resolve(promptFor.id, promptFor.decision, note)}
        />
      )}
    </div>
  );
};

// ── Page ──────────────────────────────────────────────────────────────────

type TabKey = 'registers' | 'reports' | 'corrections';

const AdminAttendanceControlCenter: React.FC = () => {
  const [tab, setTab] = useState<TabKey>('registers');

  const tabs: { key: TabKey; label: string; icon: React.ReactNode }[] = [
    { key: 'registers', label: 'Registers', icon: <Clock className="w-4 h-4" /> },
    { key: 'reports', label: 'Reports', icon: <Users className="w-4 h-4" /> },
    { key: 'corrections', label: 'Correction requests', icon: <Inbox className="w-4 h-4" /> },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight">Attendance Control Center</h2>
        <p className="text-slate-600 dark:text-slate-400 mt-1">Monitor register completion, review reports, and resolve correction requests institution-wide.</p>
      </div>

      <div className="flex items-center gap-1 border-b border-slate-200 dark:border-white/10">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors ${
              tab === t.key
                ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {tab === 'registers' && <RegistersTab />}
      {tab === 'reports' && <ReportsTab />}
      {tab === 'corrections' && <CorrectionRequestsTab />}
    </div>
  );
};

export default AdminAttendanceControlCenter;
