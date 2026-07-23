import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle, ArrowLeft, Check, CheckCircle2, Clock, Lock, RefreshCw,
  Search, ShieldCheck, Users, XCircle, ClipboardList,
} from 'lucide-react';
import toast from 'react-hot-toast';
import apiClient from '../../api/client';
import { StatusBadge } from '../../components/common/StatusBadge';
import { EmptyState } from '../../components/common/EmptyState';

// ── Types ───────────────────────────────────────────────────────────────────

type LifecycleStatus = 'NOT_OPENED' | 'IN_PROGRESS' | 'SUBMITTED' | 'LOCKED' | 'REOPENED';
type Mark = 'PRESENT' | 'LATE' | 'ABSENT_EXCUSED' | 'ABSENT_UNEXCUSED' | 'LEAVE' | 'NOT_REQUIRED';

const DAILY_SUBJECT_SENTINEL = '__DAILY__';

interface RegisterSummary {
  registerId: string | null;
  sectionId: string;
  sectionName: string;
  className: string;
  subject: string;
  status: LifecycleStatus;
  studentCount: number;
  recordedCount: number;
}

interface RosterStudent {
  studentId: string;
  name: string;
  rollNumber: string | null;
  currentMark: Mark | null;
  reasonId: string | null;
  note: string | null;
  minutesLate: number | null;
}

interface RosterRegister {
  id: string;
  status: LifecycleStatus;
  version: number;
  sectionId: string;
  date: string;
  subject: string;
}

interface RosterResponse {
  register: RosterRegister;
  students: RosterStudent[];
}

interface StudentEdit {
  mark: Mark | null;
  reasonId?: string | null;
  note?: string | null;
  minutesLate?: number | null;
}

interface SelectedClass {
  sectionId: string;
  sectionName: string;
  className: string;
  subject: string;
  date: string;
}

// Placeholder reason list — there is no GET /attendance/reasons endpoint in
// this backend phase, so this is hardcoded here as a stand-in until an
// admin-configurable reasons endpoint exists. Each reason loosely implies
// which absence mark it should be paired with.
const REASON_OPTIONS: { id: string; label: string; impliedMark: 'ABSENT_EXCUSED' | 'ABSENT_UNEXCUSED' }[] = [
  { id: 'SICK', label: 'Sick', impliedMark: 'ABSENT_EXCUSED' },
  { id: 'FAMILY_EMERGENCY', label: 'Family emergency', impliedMark: 'ABSENT_EXCUSED' },
  { id: 'UNEXCUSED', label: 'Unexcused', impliedMark: 'ABSENT_UNEXCUSED' },
  { id: 'OTHER', label: 'Other', impliedMark: 'ABSENT_EXCUSED' },
];

const todayStr = () => new Date().toISOString().split('T')[0];

const displaySubject = (subject: string) => (subject === DAILY_SUBJECT_SENTINEL ? 'Homeroom' : subject);

const DRAFT_SAVE_DEBOUNCE_MS = 4000;

// ── View 1: Today's registers list ───────────────────────────────────────────

const RegisterListView: React.FC<{ onOpen: (sel: SelectedClass) => void }> = ({ onOpen }) => {
  const [date, setDate] = useState(todayStr());
  const [registers, setRegisters] = useState<RegisterSummary[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (d: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.get('/attendance/registers/today', { params: { date: d } });
      setRegisters(res.data.data || []);
    } catch (err: any) {
      const message = err.response?.data?.message || 'Failed to load today\'s classes.';
      setError(message);
      setRegisters(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(date);
  }, [date, load]);

  const sorted = useMemo(() => {
    if (!registers) return [];
    const rank = (status: LifecycleStatus) => (status === 'NOT_OPENED' || status === 'IN_PROGRESS' || status === 'REOPENED' ? 0 : 1);
    return [...registers].sort((a, b) => rank(a.status) - rank(b.status));
  }, [registers]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight">Today&apos;s Attendance</h2>
          <p className="text-slate-600 dark:text-slate-400 mt-1">Mark and submit attendance for your assigned classes.</p>
        </div>
        <div className="flex flex-col">
          <label htmlFor="attendance-date" className="text-xs text-slate-500 font-semibold mb-1.5">Date</label>
          <input
            id="attendance-date"
            type="date"
            value={date}
            max={todayStr()}
            onChange={(e) => setDate(e.target.value)}
            className="input-field min-w-[160px]"
          />
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[0, 1, 2].map((i) => (
            <div key={i} className="glass-card p-5 rounded-2xl border border-slate-200/50 dark:border-white/5 h-32 animate-pulse bg-slate-100 dark:bg-slate-800/40" />
          ))}
        </div>
      ) : error ? (
        <div className="glass-card p-8 rounded-3xl border border-rose-200 dark:border-rose-500/10 bg-rose-50/50 dark:bg-rose-500/5 text-center flex flex-col items-center justify-center space-y-3">
          <AlertTriangle className="w-10 h-10 text-rose-500" />
          <p className="text-slate-700 dark:text-slate-300 text-sm max-w-md">{error}</p>
          <button
            onClick={() => load(date)}
            className="flex items-center gap-2 bg-rose-600 hover:bg-rose-500 text-white px-4 py-2 rounded-xl text-xs font-bold transition-all"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Retry
          </button>
        </div>
      ) : !sorted.length ? (
        <EmptyState
          icon={<ClipboardList className="w-10 h-10 text-slate-400 dark:text-slate-500" />}
          title={date === todayStr() ? 'No classes today' : 'No classes assigned'}
          description="No attendance registers were found for this date. If you believe this is incorrect, contact your administrator to confirm your class/period assignments."
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {sorted.map((reg) => {
            const done = reg.status === 'SUBMITTED' || reg.status === 'LOCKED';
            const pct = reg.studentCount > 0 ? Math.round((reg.recordedCount / reg.studentCount) * 100) : 0;
            return (
              <button
                key={`${reg.sectionId}-${reg.subject}`}
                onClick={() => onOpen({
                  sectionId: reg.sectionId,
                  sectionName: reg.sectionName,
                  className: reg.className,
                  subject: reg.subject,
                  date,
                })}
                className={`text-left glass-card p-5 rounded-2xl border transition-all hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  done
                    ? 'border-slate-200/50 dark:border-white/5 bg-slate-50/50 dark:bg-slate-900/20 opacity-80'
                    : 'border-slate-200/50 dark:border-white/5 bg-white dark:bg-slate-900/40'
                }`}
              >
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div>
                    <div className="font-bold text-slate-900 dark:text-white">{reg.className} - {reg.sectionName}</div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">{displaySubject(reg.subject)}</div>
                  </div>
                  <StatusBadge status={reg.status} />
                </div>
                <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                  <Users className="w-3.5 h-3.5" />
                  <span>{reg.recordedCount} / {reg.studentCount} marked</span>
                </div>
                <div className="mt-2 h-1.5 w-full bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full ${done ? 'bg-teal-500' : 'bg-blue-500'}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

// ── Row mark controls ────────────────────────────────────────────────────────

const MARK_BUTTONS: { mark: Mark; label: string; icon: React.ReactNode; activeClass: string }[] = [
  { mark: 'PRESENT', label: 'Present', icon: <CheckCircle2 className="w-4 h-4" />, activeClass: 'bg-teal-50 dark:bg-teal-500/10 text-teal-700 dark:text-teal-400 border-teal-300 dark:border-teal-500/40' },
  { mark: 'LATE', label: 'Late', icon: <Clock className="w-4 h-4" />, activeClass: 'bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-300 dark:border-amber-500/40' },
  { mark: 'ABSENT_UNEXCUSED', label: 'Absent', icon: <XCircle className="w-4 h-4" />, activeClass: 'bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-300 dark:border-rose-500/40' },
];

// ── View 2: Roster workspace ──────────────────────────────────────────────

const RosterView: React.FC<{ selection: SelectedClass; onBack: () => void }> = ({ selection, onBack }) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [register, setRegister] = useState<RosterRegister | null>(null);
  const [students, setStudents] = useState<RosterStudent[]>([]);
  const [edits, setEdits] = useState<Record<string, StudentEdit>>({});
  const [dirty, setDirty] = useState(false);
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [missingIds, setMissingIds] = useState<Set<string>>(new Set());
  const [confirmSubmitOpen, setConfirmSubmitOpen] = useState(false);
  const [focusedRow, setFocusedRow] = useState<number>(-1);

  const draftTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rowRefs = useRef<Record<number, HTMLDivElement | null>>({});

  const readOnly = register ? (register.status === 'SUBMITTED' || register.status === 'LOCKED') : false;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.get('/attendance/registers/roster', {
        params: { sectionId: selection.sectionId, date: selection.date, subject: selection.subject },
      });
      const data: RosterResponse = res.data.data;
      setRegister(data.register);
      setStudents(data.students);
      setEdits({});
      setDirty(false);
      setMissingIds(new Set());
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load class roster.');
    } finally {
      setLoading(false);
    }
  }, [selection]);

  useEffect(() => {
    load();
  }, [load]);

  // Warn before navigating away / closing tab with unsaved edits.
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);

  const effectiveMark = useCallback((s: RosterStudent): Mark | null => {
    const e = edits[s.studentId];
    if (e) return e.mark;
    return s.currentMark;
  }, [edits]);

  const counts = useMemo(() => {
    const c = { present: 0, late: 0, absent: 0, unmarked: 0 };
    students.forEach((s) => {
      const m = effectiveMark(s);
      if (m === 'PRESENT') c.present += 1;
      else if (m === 'LATE') c.late += 1;
      else if (m === 'ABSENT_EXCUSED' || m === 'ABSENT_UNEXCUSED') c.absent += 1;
      else if (m === null || m === undefined) c.unmarked += 1;
    });
    return c;
  }, [students, effectiveMark]);

  const filteredStudents = useMemo(() => {
    if (!search.trim()) return students;
    const q = search.trim().toLowerCase();
    return students.filter((s) =>
      s.name.toLowerCase().includes(q) ||
      (s.rollNumber || '').toLowerCase().includes(q) ||
      s.studentId.toLowerCase().includes(q)
    );
  }, [students, search]);

  const applyEdit = useCallback((studentId: string, patch: Partial<StudentEdit>) => {
    setEdits((prev) => {
      const existing = prev[studentId] || { mark: students.find((s) => s.studentId === studentId)?.currentMark ?? null };
      return { ...prev, [studentId]: { ...existing, ...patch } };
    });
    setDirty(true);
    setMissingIds((prev) => {
      if (!prev.has(studentId)) return prev;
      const next = new Set(prev);
      next.delete(studentId);
      return next;
    });
  }, [students]);

  const setMark = useCallback((studentId: string, mark: Mark) => {
    if (mark === 'ABSENT_UNEXCUSED') {
      applyEdit(studentId, { mark: 'ABSENT_UNEXCUSED', reasonId: 'UNEXCUSED' });
    } else if (mark === 'LATE') {
      applyEdit(studentId, { mark: 'LATE', minutesLate: edits[studentId]?.minutesLate ?? 0 });
    } else {
      applyEdit(studentId, { mark, reasonId: null, note: null, minutesLate: null });
    }
  }, [applyEdit, edits]);

  const buildRecords = useCallback(() => {
    return students
      .filter((s) => effectiveMark(s) !== null)
      .map((s) => {
        const e = edits[s.studentId];
        const mark = effectiveMark(s) as Mark;
        return {
          studentId: s.studentId,
          mark,
          reasonId: e?.reasonId ?? s.reasonId ?? undefined,
          note: e?.note ?? s.note ?? undefined,
          minutesLate: e?.minutesLate ?? s.minutesLate ?? undefined,
        };
      });
  }, [students, edits, effectiveMark]);

  const saveDraft = useCallback(async (silent = true) => {
    if (!register || readOnly) return;
    setSaving(true);
    try {
      const res = await apiClient.put(`/attendance/registers/${register.id}/draft`, {
        version: register.version,
        records: buildRecords(),
      });
      const updatedVersion = res.data.data?.version ?? res.data.version;
      if (typeof updatedVersion === 'number') {
        setRegister((prev) => (prev ? { ...prev, version: updatedVersion } : prev));
      }
      setDirty(false);
      if (!silent) toast.success('Draft saved');
    } catch (err: any) {
      if (err.response?.data?.code === 'ATTENDANCE_CONFLICT') {
        toast.error('Someone else changed this register. Refresh to see the latest version.');
      } else if (!silent) {
        toast.error(err.response?.data?.message || 'Failed to save draft');
      }
    } finally {
      setSaving(false);
    }
  }, [register, readOnly, buildRecords]);

  // Debounced autosave a few seconds after each local edit.
  useEffect(() => {
    if (!dirty || readOnly) return;
    if (draftTimer.current) clearTimeout(draftTimer.current);
    draftTimer.current = setTimeout(() => {
      saveDraft(true);
    }, DRAFT_SAVE_DEBOUNCE_MS);
    return () => {
      if (draftTimer.current) clearTimeout(draftTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [edits, dirty, readOnly]);

  const markAllBlanksPresent = useCallback(() => {
    students.forEach((s) => {
      if (effectiveMark(s) === null) {
        applyEdit(s.studentId, { mark: 'PRESENT', reasonId: null, note: null, minutesLate: null });
      }
    });
  }, [students, effectiveMark, applyEdit]);

  const bulkApplyMark = useCallback((mark: Mark) => {
    selectedIds.forEach((id) => setMark(id, mark));
    setSelectedIds(new Set());
    setSelectMode(false);
  }, [selectedIds, setMark]);

  const toggleSelected = (studentId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(studentId)) next.delete(studentId);
      else next.add(studentId);
      return next;
    });
  };

  const scrollToRow = (index: number) => {
    const el = rowRefs.current[index];
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.focus();
    }
  };

  const handleSubmitClick = () => {
    const unmarked = students.filter((s) => effectiveMark(s) === null);
    if (unmarked.length > 0) {
      setMissingIds(new Set(unmarked.map((s) => s.studentId)));
      toast.error(`${unmarked.length} student${unmarked.length > 1 ? 's' : ''} still need${unmarked.length > 1 ? '' : 's'} to be marked before you can submit.`);
      const idx = students.findIndex((s) => s.studentId === unmarked[0].studentId);
      if (idx >= 0) scrollToRow(idx);
      return;
    }
    setConfirmSubmitOpen(true);
  };

  const doSubmit = async () => {
    if (!register) return;
    setSubmitting(true);
    try {
      // Save any pending local edits first so submit sees the latest state.
      if (dirty) {
        await saveDraft(true);
      }
      await apiClient.post(`/attendance/registers/${register.id}/submit`, { version: register.version });
      toast.success('Attendance submitted');
      setConfirmSubmitOpen(false);
      onBack();
    } catch (err: any) {
      const code = err.response?.data?.code;
      if (code === 'REGISTER_INCOMPLETE') {
        const missing: string[] = err.response?.data?.missingStudentIds || [];
        setMissingIds(new Set(missing));
        toast.error(`${missing.length} student${missing.length !== 1 ? 's' : ''} still need${missing.length === 1 ? 's' : ''} to be marked. They're highlighted below.`);
        if (missing.length) {
          const idx = students.findIndex((s) => s.studentId === missing[0]);
          if (idx >= 0) scrollToRow(idx);
        }
      } else if (code === 'ATTENDANCE_CONFLICT') {
        toast.error('This register changed elsewhere. Please refresh and re-apply your changes.');
      } else if (code === 'REGISTER_LOCKED' || code === 'REGISTER_ALREADY_SUBMITTED') {
        toast.error('This register is already locked or submitted.');
        onBack();
      } else {
        toast.error(err.response?.data?.message || 'Failed to submit attendance');
      }
      setConfirmSubmitOpen(false);
    } finally {
      setSubmitting(false);
    }
  };

  // Keyboard shortcuts: P/L/A to mark the focused row, arrow keys to move focus.
  // Purely additive — every action remains fully usable via touch/click.
  useEffect(() => {
    if (readOnly) return;
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (focusedRow < 0 || focusedRow >= filteredStudents.length) return;
      const student = filteredStudents[focusedRow];
      if (!student) return;
      if (e.key === 'p' || e.key === 'P') setMark(student.studentId, 'PRESENT');
      else if (e.key === 'l' || e.key === 'L') setMark(student.studentId, 'LATE');
      else if (e.key === 'a' || e.key === 'A') setMark(student.studentId, 'ABSENT_UNEXCUSED');
      else if (e.key === 'ArrowDown') { e.preventDefault(); setFocusedRow((i) => Math.min(i + 1, filteredStudents.length - 1)); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setFocusedRow((i) => Math.max(i - 1, 0)); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [focusedRow, filteredStudents, setMark, readOnly]);

  useEffect(() => {
    if (focusedRow >= 0) {
      const el = rowRefs.current[focusedRow];
      el?.focus();
    }
  }, [focusedRow]);

  if (loading) {
    return (
      <div className="space-y-4">
        <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900 dark:hover:text-white">
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
        <div className="glass-card rounded-3xl p-8 space-y-3">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="h-14 rounded-xl bg-slate-100 dark:bg-slate-800/40 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
        <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900 dark:hover:text-white">
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
        <div className="glass-card p-8 rounded-3xl border border-rose-200 dark:border-rose-500/10 bg-rose-50/50 dark:bg-rose-500/5 text-center flex flex-col items-center justify-center space-y-3">
          <AlertTriangle className="w-10 h-10 text-rose-500" />
          <p className="text-slate-700 dark:text-slate-300 text-sm max-w-md">{error}</p>
          <button
            onClick={load}
            className="flex items-center gap-2 bg-rose-600 hover:bg-rose-500 text-white px-4 py-2 rounded-xl text-xs font-bold transition-all"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Retry
          </button>
        </div>
      </div>
    );
  }

  if (!register) return null;

  return (
    <div className="space-y-4 pb-28">
      <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900 dark:hover:text-white">
        <ArrowLeft className="w-4 h-4" /> Back to today&apos;s classes
      </button>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
            {selection.className} - {selection.sectionName}
          </h2>
          <p className="text-slate-600 dark:text-slate-400 text-sm mt-0.5">
            {displaySubject(selection.subject)} • {new Date(selection.date).toLocaleDateString([], { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
        </div>
        <StatusBadge status={register.status} />
      </div>

      {readOnly && (
        <div className="glass-card p-4 rounded-2xl border border-slate-200/50 dark:border-white/5 bg-slate-50 dark:bg-slate-900/30 flex items-center gap-3 text-sm text-slate-600 dark:text-slate-400">
          <Lock className="w-4 h-4 flex-shrink-0" />
          <span>
            This register is <strong>{register.status === 'LOCKED' ? 'locked' : 'submitted'}</strong> and can no longer be edited here. Ask an administrator to reopen it if a correction is needed.
          </span>
        </div>
      )}

      {/* Live counts */}
      <div
        aria-live="polite"
        className="grid grid-cols-2 sm:grid-cols-4 gap-3"
      >
        <div className="glass-card p-3 rounded-xl border border-slate-200/50 dark:border-white/5 text-center">
          <div className="text-xl font-black text-teal-600 dark:text-teal-400">{counts.present}</div>
          <div className="text-[11px] text-slate-500 uppercase tracking-wide font-semibold">Present</div>
        </div>
        <div className="glass-card p-3 rounded-xl border border-slate-200/50 dark:border-white/5 text-center">
          <div className="text-xl font-black text-amber-600 dark:text-amber-400">{counts.late}</div>
          <div className="text-[11px] text-slate-500 uppercase tracking-wide font-semibold">Late</div>
        </div>
        <div className="glass-card p-3 rounded-xl border border-slate-200/50 dark:border-white/5 text-center">
          <div className="text-xl font-black text-rose-600 dark:text-rose-400">{counts.absent}</div>
          <div className="text-[11px] text-slate-500 uppercase tracking-wide font-semibold">Absent</div>
        </div>
        <div className="glass-card p-3 rounded-xl border border-slate-200/50 dark:border-white/5 text-center">
          <div className="text-xl font-black text-slate-500 dark:text-slate-400">{counts.unmarked}</div>
          <div className="text-[11px] text-slate-500 uppercase tracking-wide font-semibold">Unmarked</div>
        </div>
      </div>

      {!readOnly && (
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
          <div className="relative flex-1 max-w-sm">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, roll no, or ID"
              className="input-field pl-9 w-full"
              aria-label="Search students"
            />
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={markAllBlanksPresent}
              className="text-xs font-bold px-3 py-2 rounded-xl bg-teal-50 dark:bg-teal-500/10 text-teal-700 dark:text-teal-400 border border-teal-200 dark:border-teal-500/20 hover:bg-teal-100 dark:hover:bg-teal-500/20 transition-all"
            >
              Mark all blanks Present
            </button>
            <button
              onClick={() => { setSelectMode((v) => !v); setSelectedIds(new Set()); }}
              className={`text-xs font-bold px-3 py-2 rounded-xl border transition-all ${
                selectMode
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-slate-50 dark:bg-slate-800/50 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-white/10 hover:bg-slate-100 dark:hover:bg-white/5'
              }`}
            >
              {selectMode ? 'Cancel select' : 'Select students'}
            </button>
          </div>
        </div>
      )}

      {selectMode && !readOnly && (
        <div className="glass-card p-3 rounded-xl border border-blue-200 dark:border-blue-500/20 bg-blue-50/50 dark:bg-blue-500/5 flex flex-wrap items-center gap-2 text-xs">
          <span className="font-semibold text-slate-700 dark:text-slate-300">{selectedIds.size} selected</span>
          <button onClick={() => bulkApplyMark('PRESENT')} disabled={!selectedIds.size} className="px-3 py-1.5 rounded-lg bg-teal-600 text-white font-bold disabled:opacity-40">Present</button>
          <button onClick={() => bulkApplyMark('LATE')} disabled={!selectedIds.size} className="px-3 py-1.5 rounded-lg bg-amber-600 text-white font-bold disabled:opacity-40">Late</button>
          <button onClick={() => bulkApplyMark('ABSENT_UNEXCUSED')} disabled={!selectedIds.size} className="px-3 py-1.5 rounded-lg bg-rose-600 text-white font-bold disabled:opacity-40">Absent</button>
          <button onClick={() => bulkApplyMark('LEAVE')} disabled={!selectedIds.size} className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white font-bold disabled:opacity-40">Leave</button>
        </div>
      )}

      <div className="glass-card rounded-3xl border border-slate-200/50 dark:border-white/5 bg-white dark:bg-slate-900/20 divide-y divide-slate-100 dark:divide-white/5 overflow-hidden">
        {filteredStudents.length === 0 ? (
          <div className="p-8 text-center text-slate-500 text-sm italic">No students match your search.</div>
        ) : (
          filteredStudents.map((s) => {
            const index = students.indexOf(s);
            const mark = effectiveMark(s);
            const edit = edits[s.studentId];
            const isMissing = missingIds.has(s.studentId);
            const initials = s.name.split(' ').filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase();
            return (
              <div
                key={s.studentId}
                ref={(el) => { rowRefs.current[index] = el; }}
                tabIndex={0}
                onFocus={() => setFocusedRow(index)}
                className={`p-4 flex flex-col gap-3 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500 ${
                  isMissing ? 'bg-rose-50/60 dark:bg-rose-500/5' : ''
                }`}
              >
                <div className="flex items-center gap-3">
                  {selectMode && !readOnly && (
                    <input
                      type="checkbox"
                      checked={selectedIds.has(s.studentId)}
                      onChange={() => toggleSelected(s.studentId)}
                      className="w-5 h-5 rounded border-slate-300"
                      aria-label={`Select ${s.name}`}
                    />
                  )}
                  <div className="w-9 h-9 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-xs font-bold text-slate-600 dark:text-slate-300 flex-shrink-0">
                    {initials || '?'}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-slate-900 dark:text-white truncate">{s.name}</div>
                    <div className="text-xs text-slate-500 font-mono">Roll {s.rollNumber || '—'}</div>
                  </div>
                  {isMissing && (
                    <span className="text-[10px] font-bold text-rose-600 dark:text-rose-400 uppercase tracking-wide flex-shrink-0">Needs marking</span>
                  )}
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  {readOnly ? (
                    <StatusBadge status={mark ?? 'NOT_REQUIRED'} />
                  ) : (
                    <>
                      {MARK_BUTTONS.map((btn) => (
                        <button
                          key={btn.mark}
                          onClick={() => setMark(s.studentId, btn.mark)}
                          aria-pressed={mark === btn.mark}
                          aria-label={`Mark ${s.name} ${btn.label}`}
                          className={`min-w-[44px] min-h-[44px] flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-semibold transition-all ${
                            mark === btn.mark
                              ? `${btn.activeClass} shadow-sm`
                              : 'bg-transparent text-slate-400 dark:text-slate-500 border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-white/5'
                          }`}
                        >
                          {btn.icon}
                          {btn.label}
                        </button>
                      ))}
                      {mark === null && (
                        <span className="min-h-[44px] flex items-center px-3 py-2 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 text-xs font-semibold text-slate-400 dark:text-slate-500">
                          Unmarked
                        </span>
                      )}
                    </>
                  )}
                </div>

                {!readOnly && (mark === 'ABSENT_EXCUSED' || mark === 'ABSENT_UNEXCUSED') && (
                  <div className="flex flex-col sm:flex-row gap-2 pl-0 sm:pl-12">
                    <select
                      value={edit?.reasonId ?? s.reasonId ?? ''}
                      onChange={(e) => {
                        const reason = REASON_OPTIONS.find((r) => r.id === e.target.value);
                        applyEdit(s.studentId, { reasonId: e.target.value || null, mark: reason?.impliedMark ?? mark });
                      }}
                      className="input-field py-2 text-xs max-w-[200px]"
                      aria-label={`Reason for ${s.name}'s absence`}
                    >
                      <option value="">Select reason…</option>
                      {REASON_OPTIONS.map((r) => (
                        <option key={r.id} value={r.id}>{r.label}</option>
                      ))}
                    </select>
                    <input
                      type="text"
                      value={edit?.note ?? s.note ?? ''}
                      onChange={(e) => applyEdit(s.studentId, { note: e.target.value })}
                      placeholder="Optional note"
                      className="input-field py-2 text-xs flex-1"
                      aria-label={`Note for ${s.name}`}
                    />
                  </div>
                )}

                {!readOnly && mark === 'LATE' && (
                  <div className="flex items-center gap-2 pl-0 sm:pl-12">
                    <label className="text-xs text-slate-500 font-semibold" htmlFor={`minutes-late-${s.studentId}`}>Minutes late</label>
                    <input
                      id={`minutes-late-${s.studentId}`}
                      type="number"
                      min={0}
                      value={edit?.minutesLate ?? s.minutesLate ?? 0}
                      onChange={(e) => applyEdit(s.studentId, { minutesLate: Number(e.target.value) })}
                      className="input-field py-2 text-xs w-24"
                    />
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Sticky bottom bar */}
      {!readOnly && (
        <div className="fixed bottom-0 left-0 right-0 lg:left-60 z-40 bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl border-t border-slate-200 dark:border-white/10 px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-4 text-xs font-semibold text-slate-600 dark:text-slate-300" aria-live="polite">
            <span className="text-teal-600 dark:text-teal-400">Present {counts.present}</span>
            <span className="text-amber-600 dark:text-amber-400">Late {counts.late}</span>
            <span className="text-rose-600 dark:text-rose-400">Absent {counts.absent}</span>
            <span className="text-slate-500">Unmarked {counts.unmarked}</span>
            {saving && <span className="text-slate-400 italic">Saving draft…</span>}
            {!saving && dirty && <span className="text-slate-400 italic">Unsaved changes</span>}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => saveDraft(false)}
              disabled={saving || !dirty}
              className="text-xs font-bold px-4 py-2.5 rounded-xl border border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5 disabled:opacity-40 transition-all"
            >
              Save draft
            </button>
            <button
              onClick={handleSubmitClick}
              disabled={submitting || counts.unmarked > 0}
              className="flex items-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold py-2.5 px-5 rounded-xl transition-all shadow-lg shadow-blue-500/20 disabled:opacity-50 text-xs"
            >
              <Check className="w-4 h-4" /> Submit attendance
            </button>
          </div>
        </div>
      )}

      {/* Submit confirmation */}
      {confirmSubmitOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-slate-950/60 backdrop-blur-sm" role="dialog" aria-modal="true">
          <div className="bg-white dark:bg-slate-900/90 backdrop-blur-xl border border-slate-200 dark:border-white/10 rounded-2xl w-full max-w-md shadow-2xl p-6">
            <div className="flex items-center gap-2.5 mb-4">
              <ShieldCheck className="w-5 h-5 text-blue-500" />
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">Confirm submission</h3>
            </div>
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
              You are about to submit attendance for <strong>{selection.className} - {selection.sectionName}</strong> ({displaySubject(selection.subject)}). Once submitted, you will not be able to edit it without admin approval.
            </p>
            <div className="grid grid-cols-3 gap-2 mb-5 text-center text-sm">
              <div className="rounded-xl bg-teal-50 dark:bg-teal-500/10 p-2 font-bold text-teal-700 dark:text-teal-400">{counts.present} Present</div>
              <div className="rounded-xl bg-amber-50 dark:bg-amber-500/10 p-2 font-bold text-amber-700 dark:text-amber-400">{counts.late} Late</div>
              <div className="rounded-xl bg-rose-50 dark:bg-rose-500/10 p-2 font-bold text-rose-700 dark:text-rose-400">{counts.absent} Absent</div>
            </div>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setConfirmSubmitOpen(false)}
                className="px-4 py-2 rounded-xl text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-bold transition-all"
              >
                Cancel
              </button>
              <button
                onClick={doSubmit}
                disabled={submitting}
                className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold py-2 px-5 rounded-xl transition-all shadow-lg shadow-blue-500/20 disabled:opacity-50 text-xs"
              >
                {submitting ? 'Submitting…' : 'Confirm & submit'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ── Page ──────────────────────────────────────────────────────────────────

const TeacherAttendanceWorkspace: React.FC = () => {
  const [selection, setSelection] = useState<SelectedClass | null>(null);

  if (selection) {
    return <RosterView selection={selection} onBack={() => setSelection(null)} />;
  }
  return <RegisterListView onOpen={setSelection} />;
};

export default TeacherAttendanceWorkspace;
