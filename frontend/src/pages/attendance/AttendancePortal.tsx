import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle, RefreshCw, Download, CalendarRange, Inbox, History as HistoryIcon,
  X, Info,
} from 'lucide-react';
import toast from 'react-hot-toast';
import apiClient from '../../api/client';
import { useAuthStore } from '../../store/authStore';
import { DataTable, Column } from '../../components/DataTable/DataTable';
import { StatusBadge } from '../../components/common/StatusBadge';
import { EmptyState } from '../../components/common/EmptyState';
import { BarChart } from '../../components/Charts/BarChart';
import { downloadCsv } from '../../utils/csv';

// ── Types ────────────────────────────────────────────────────────────────

type Mark = 'PRESENT' | 'LATE' | 'ABSENT_EXCUSED' | 'ABSENT_UNEXCUSED' | 'LEAVE' | 'NOT_REQUIRED';
const MARK_OPTIONS: Mark[] = ['PRESENT', 'LATE', 'ABSENT_EXCUSED', 'ABSENT_UNEXCUSED', 'LEAVE', 'NOT_REQUIRED'];

interface AttendanceRecordRow {
  id: string;
  date: string;
  subject: string | null;
  mark: Mark;
  reasonId: string | null;
  note: string | null;
  minutesLate: number | null;
}

interface AttendanceSummary {
  counts: Record<Mark, number>;
  countedDays: number;
  presentEquivalentDays: number;
  percentage: number | null;
}

interface FeeSummary {
  countsMark: Mark;
  matchingCount: number;
  amountPerAbsence: number;
  totalDue: number;
  billingFrequency: string;
}

interface AttendanceResponse {
  records: AttendanceRecordRow[];
  summary: AttendanceSummary;
  feeSummary?: FeeSummary;
}

interface ChildSummary {
  id: string;
  studentId: string;
  firstName: string;
  lastName: string;
  class: { name: string } | null;
  section: { name: string } | null;
}

type CorrectionStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'WITHDRAWN';

interface CorrectionRequestRow {
  id: string;
  status: CorrectionStatus;
  requestedMark: Mark;
  requestNote: string;
  resolutionNote: string | null;
  createdAt: string;
}

type PresetKey = 'weekly' | 'monthly' | 'term' | 'custom';

// ── Helpers ─────────────────────────────────────────────────────────────

const toIso = (d: Date) => d.toISOString().split('T')[0];
const todayStr = () => toIso(new Date());

const presetRange = (preset: PresetKey): { startDate: string; endDate: string } => {
  const end = new Date();
  const start = new Date();
  if (preset === 'weekly') start.setDate(end.getDate() - 6);
  else if (preset === 'monthly') start.setDate(end.getDate() - 29);
  // "Term" has no institution-provided term-start date available to this
  // page's API contract, so this is approximated as the last 90 days and
  // labelled plainly — not a precise academic-term boundary.
  else if (preset === 'term') start.setDate(end.getDate() - 89);
  return { startDate: toIso(start), endDate: toIso(end) };
};

const displaySubject = (subject: string | null) => subject || 'Homeroom';

// ── Correction request modal ───────────────────────────────────────────

const CorrectionRequestModal: React.FC<{
  record: AttendanceRecordRow;
  onCancel: () => void;
  onSubmit: (payload: { requestedMark: Mark; requestNote: string }) => void;
  isLoading?: boolean;
}> = ({ record, onCancel, onSubmit, isLoading }) => {
  const [requestedMark, setRequestedMark] = useState<Mark>(record.mark);
  const [requestNote, setRequestNote] = useState('');

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center px-4 bg-slate-950/60 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="correction-modal-title">
      <div className="bg-white dark:bg-slate-900/95 backdrop-blur-xl border border-slate-200 dark:border-white/10 rounded-2xl w-full max-w-md shadow-2xl p-6">
        <div className="flex items-center justify-between mb-1">
          <h3 id="correction-modal-title" className="text-lg font-bold text-slate-900 dark:text-white">Request a correction</h3>
          <button onClick={onCancel} aria-label="Close" className="p-1.5 rounded-lg text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/10">
            <X className="w-4 h-4" />
          </button>
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
          {new Date(record.date).toLocaleDateString([], { year: 'numeric', month: 'long', day: 'numeric' })}
          {record.subject ? ` · ${record.subject}` : ''} — currently marked <StatusBadge status={record.mark} />
        </p>

        <label htmlFor="correction-mark" className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">Requested mark</label>
        <select
          id="correction-mark"
          value={requestedMark}
          onChange={(e) => setRequestedMark(e.target.value as Mark)}
          className="input-field w-full mb-3"
        >
          {MARK_OPTIONS.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>

        <label htmlFor="correction-note" className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">Note (required)</label>
        <textarea
          id="correction-note"
          value={requestNote}
          onChange={(e) => setRequestNote(e.target.value)}
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
              if (!requestNote.trim()) {
                toast.error('A note is required to submit a correction request.');
                return;
              }
              onSubmit({ requestedMark, requestNote: requestNote.trim() });
            }}
            disabled={isLoading}
            className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold py-2 px-5 rounded-xl transition-all shadow-lg shadow-blue-500/20 disabled:opacity-50 text-xs"
          >
            {isLoading ? 'Submitting…' : 'Submit request'}
          </button>
        </div>
      </div>
    </div>
  );
};

// ── Page ────────────────────────────────────────────────────────────────

const AttendancePortal: React.FC = () => {
  const { user } = useAuthStore();
  const isGuardian = user?.role === 'GUARDIAN';

  const [children, setChildren] = useState<ChildSummary[]>([]);
  const [selectedChildId, setSelectedChildId] = useState<string | null>(null);
  const [childrenLoading, setChildrenLoading] = useState(isGuardian);
  const [childrenError, setChildrenError] = useState<string | null>(null);

  const [preset, setPreset] = useState<PresetKey>('monthly');
  const [range, setRange] = useState(() => presetRange('monthly'));

  const [data, setData] = useState<AttendanceResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [tab, setTab] = useState<'history' | 'corrections'>('history');
  const [correctionRecord, setCorrectionRecord] = useState<AttendanceRecordRow | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [requests, setRequests] = useState<CorrectionRequestRow[]>([]);
  const [requestsLoading, setRequestsLoading] = useState(false);
  const [requestsError, setRequestsError] = useState<string | null>(null);

  // Load guardian's linked children (same source already used by
  // GuardianDashboard: /guardians/me/students).
  useEffect(() => {
    if (!isGuardian) return;
    const load = async () => {
      setChildrenLoading(true);
      setChildrenError(null);
      try {
        const res = await apiClient.get('/guardians/me/students');
        const list: ChildSummary[] = res.data.data || [];
        setChildren(list);
        setSelectedChildId((prev) => prev ?? (list.length > 0 ? list[0].id : null));
      } catch (err: any) {
        setChildrenError(err.response?.data?.message || 'Failed to load linked children.');
      } finally {
        setChildrenLoading(false);
      }
    };
    load();
  }, [isGuardian]);

  const loadAttendance = useCallback(async () => {
    if (isGuardian && !selectedChildId) return;
    setLoading(true);
    setError(null);
    try {
      const url = isGuardian ? `/attendance/child/${selectedChildId}` : '/attendance/my-attendance';
      const res = await apiClient.get(url, { params: { startDate: range.startDate, endDate: range.endDate } });
      setData(res.data.data || null);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load attendance.');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [isGuardian, selectedChildId, range]);

  useEffect(() => { loadAttendance(); }, [loadAttendance]);

  const loadRequests = useCallback(async () => {
    setRequestsLoading(true);
    setRequestsError(null);
    try {
      const res = await apiClient.get('/attendance/correction-requests', { params: { pageSize: 50 } });
      setRequests(res.data.data || []);
    } catch (err: any) {
      setRequestsError(err.response?.data?.message || 'Failed to load correction requests.');
    } finally {
      setRequestsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (tab === 'corrections') loadRequests();
  }, [tab, loadRequests]);

  const applyPreset = (p: PresetKey) => {
    setPreset(p);
    if (p !== 'custom') setRange(presetRange(p));
  };

  const submitCorrection = async (payload: { requestedMark: Mark; requestNote: string }) => {
    if (!correctionRecord) return;
    setSubmitting(true);
    try {
      await apiClient.post('/attendance/correction-requests', {
        recordId: correctionRecord.id,
        requestedMark: payload.requestedMark,
        requestNote: payload.requestNote,
      });
      toast.success('Correction request submitted');
      setCorrectionRecord(null);
      if (tab === 'corrections') loadRequests();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to submit correction request');
    } finally {
      setSubmitting(false);
    }
  };

  const historyRows = data?.records ?? [];

  // Trend chart: BarChart re-used from AdminAttendanceControlCenter's Reports
  // tab convention (only Recharts-backed chart component in this codebase —
  // a per-week bar count of "present-equivalent" days rather than a literal
  // day-by-day calendar heatmap, since no heatmap component exists here yet
  // and building one from scratch would be disproportionate for this page).
  const trendData = useMemo(() => {
    const weeks = new Map<string, { week: string; presentEquivalent: number; countedDays: number }>();
    for (const r of historyRows) {
      const d = new Date(r.date);
      const weekStart = new Date(d);
      weekStart.setDate(d.getDate() - d.getDay());
      const key = toIso(weekStart);
      if (!weeks.has(key)) weeks.set(key, { week: key, presentEquivalent: 0, countedDays: 0 });
      const bucket = weeks.get(key)!;
      if (r.mark === 'PRESENT' || r.mark === 'LATE') bucket.presentEquivalent += 1;
      if (r.mark === 'PRESENT' || r.mark === 'LATE' || r.mark === 'ABSENT_UNEXCUSED') bucket.countedDays += 1;
    }
    return Array.from(weeks.values())
      .sort((a, b) => a.week.localeCompare(b.week))
      .map((w) => ({
        week: new Date(w.week).toLocaleDateString([], { month: 'short', day: 'numeric' }),
        percentage: w.countedDays > 0 ? Math.round((w.presentEquivalent / w.countedDays) * 100) : 0,
      }));
  }, [historyRows]);

  const exportCsv = () => {
    if (historyRows.length === 0) {
      toast.error('Nothing to export yet.');
      return;
    }
    const headers = ['Date', 'Subject', 'Mark', 'Minutes late', 'Note'];
    const rows = historyRows.map((r) => [
      new Date(r.date).toLocaleDateString(),
      displaySubject(r.subject),
      r.mark,
      r.minutesLate ?? '',
      r.note ?? '',
    ]);
    downloadCsv(`attendance_${range.startDate}_to_${range.endDate}.csv`, headers, rows);
  };

  const historyColumns: Column<AttendanceRecordRow>[] = [
    { key: 'date', header: 'Date', render: (r) => new Date(r.date).toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' }) },
    { key: 'subject', header: 'Subject', accessor: 'subject', render: (r) => displaySubject(r.subject) },
    { key: 'mark', header: 'Mark', accessor: 'mark', render: (r) => <StatusBadge status={r.mark} /> },
    // `reasonId` is only an internal identifier (no label is included in this
    // API response) so it is not human-readable and is intentionally not
    // rendered here; the free-text `note` is shown instead as the reason/remark.
    { key: 'note', header: 'Note', accessor: 'note', render: (r) => <span className="max-w-xs truncate block">{r.note || '—'}</span> },
  ];

  const requestColumns: Column<CorrectionRequestRow>[] = [
    { key: 'requestedMark', header: 'Requested mark', render: (r) => <StatusBadge status={r.requestedMark} /> },
    { key: 'requestNote', header: 'Note', accessor: 'requestNote', render: (r) => <span className="max-w-xs truncate block">{r.requestNote}</span> },
    { key: 'status', header: 'Status', accessor: 'status', render: (r) => <StatusBadge status={r.status} /> },
    { key: 'resolutionNote', header: 'Resolution note', render: (r) => <span className="max-w-xs truncate block">{r.resolutionNote || '—'}</span> },
    { key: 'createdAt', header: 'Submitted', render: (r) => new Date(r.createdAt).toLocaleDateString() },
  ];

  const summary = data?.summary;
  const feeSummary = data?.feeSummary;

  if (isGuardian && childrenLoading) {
    return <div className="text-slate-500 dark:text-slate-400 p-8 text-center">Loading your children…</div>;
  }

  if (isGuardian && childrenError) {
    return (
      <div className="glass-card p-8 rounded-3xl border border-rose-200 dark:border-rose-500/10 bg-rose-50/50 dark:bg-rose-500/5 text-center flex flex-col items-center justify-center space-y-3">
        <AlertTriangle className="w-10 h-10 text-rose-500" />
        <p className="text-slate-700 dark:text-slate-300 text-sm max-w-md">{childrenError}</p>
        <button onClick={() => window.location.reload()} className="flex items-center gap-2 bg-rose-600 hover:bg-rose-500 text-white px-4 py-2 rounded-xl text-xs font-bold transition-all">
          <RefreshCw className="w-3.5 h-3.5" /> Retry
        </button>
      </div>
    );
  }

  if (isGuardian && children.length === 0) {
    return (
      <div className="glass-card p-8">
        <EmptyState
          title="No linked children found"
          description="Contact your school administrator to link your account to your child's student profile."
          icon={<Inbox className="w-10 h-10 text-slate-400 dark:text-slate-500" />}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight">Attendance Portal</h2>
          <p className="text-slate-600 dark:text-slate-400 mt-1">
            {isGuardian ? "Review your child's attendance history and request corrections." : 'Review your attendance history and request corrections.'}
          </p>
        </div>
        <button
          onClick={exportCsv}
          className="flex items-center gap-1.5 text-xs font-bold px-4 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white transition-all shadow-lg shadow-blue-500/20"
        >
          <Download className="w-3.5 h-3.5" /> Download report
        </button>
      </div>

      {/* Child switcher (Guardian only) */}
      {isGuardian && children.length > 1 && (
        <div className="flex gap-2 flex-wrap" role="tablist" aria-label="Select child">
          {children.map((child) => (
            <button
              key={child.id}
              role="tab"
              aria-selected={selectedChildId === child.id}
              onClick={() => setSelectedChildId(child.id)}
              className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${
                selectedChildId === child.id
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20'
                  : 'bg-slate-100 dark:bg-white/5 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-white/10'
              }`}
            >
              {child.firstName} {child.lastName}
              {child.class?.name ? ` · ${child.class.name}${child.section?.name ? ` - ${child.section.name}` : ''}` : ''}
            </button>
          ))}
        </div>
      )}

      {/* Date range presets */}
      <div className="glass-card p-4 rounded-2xl border border-slate-200/50 dark:border-white/5 bg-slate-50 dark:bg-slate-900/30 flex flex-wrap items-end gap-4">
        <div className="flex items-center gap-2">
          <CalendarRange className="w-4 h-4 text-slate-400" />
          {(['weekly', 'monthly', 'term'] as PresetKey[]).map((p) => (
            <button
              key={p}
              onClick={() => applyPreset(p)}
              className={`text-xs font-bold px-3.5 py-2 rounded-xl border transition-all capitalize ${
                preset === p
                  ? 'bg-indigo-600 text-white border-indigo-600'
                  : 'bg-white dark:bg-slate-800/50 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-white/10 hover:bg-slate-100 dark:hover:bg-white/5'
              }`}
            >
              {p}
            </button>
          ))}
        </div>
        <div className="flex flex-col">
          <label htmlFor="range-start" className="text-xs text-slate-500 font-semibold mb-1.5">Start date</label>
          <input
            id="range-start"
            type="date"
            value={range.startDate}
            max={range.endDate}
            onChange={(e) => { setPreset('custom'); setRange((r) => ({ ...r, startDate: e.target.value })); }}
            className="input-field min-w-[150px]"
          />
        </div>
        <div className="flex flex-col">
          <label htmlFor="range-end" className="text-xs text-slate-500 font-semibold mb-1.5">End date</label>
          <input
            id="range-end"
            type="date"
            value={range.endDate}
            min={range.startDate}
            max={todayStr()}
            onChange={(e) => { setPreset('custom'); setRange((r) => ({ ...r, endDate: e.target.value })); }}
            className="input-field min-w-[150px]"
          />
        </div>
        <button onClick={loadAttendance} className="ml-auto flex items-center gap-1.5 text-xs font-bold px-3 py-2.5 rounded-xl text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/5 transition-colors">
          <RefreshCw className="w-3.5 h-3.5" /> Refresh
        </button>
      </div>

      {error ? (
        <div className="glass-card p-8 rounded-3xl border border-rose-200 dark:border-rose-500/10 bg-rose-50/50 dark:bg-rose-500/5 text-center flex flex-col items-center justify-center space-y-3">
          <AlertTriangle className="w-10 h-10 text-rose-500" />
          <p className="text-slate-700 dark:text-slate-300 text-sm max-w-md">{error}</p>
          <button onClick={loadAttendance} className="flex items-center gap-2 bg-rose-600 hover:bg-rose-500 text-white px-4 py-2 rounded-xl text-xs font-bold transition-all">
            <RefreshCw className="w-3.5 h-3.5" /> Retry
          </button>
        </div>
      ) : loading ? (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[0, 1, 2, 3].map((i) => <div key={i} className="h-24 rounded-2xl bg-slate-100 dark:bg-slate-800/40 animate-pulse" />)}
          </div>
          <div className="h-64 rounded-2xl bg-slate-100 dark:bg-slate-800/40 animate-pulse" />
        </div>
      ) : (
        <>
          {/* Summary tiles */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            <div className="glass-card p-5 rounded-2xl border border-slate-200/50 dark:border-white/5 bg-white dark:bg-slate-900/40 sm:col-span-2 lg:col-span-1">
              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">Attendance rate</p>
              <p className="text-3xl font-black text-slate-900 dark:text-white">
                {summary?.percentage === null || summary?.percentage === undefined ? 'No data yet' : `${summary.percentage}%`}
              </p>
            </div>
            <div className="glass-card p-5 rounded-2xl border border-slate-200/50 dark:border-white/5 bg-white dark:bg-slate-900/40">
              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">Present</p>
              <p className="text-2xl font-black text-emerald-600 dark:text-emerald-400">{summary?.counts.PRESENT ?? 0}</p>
            </div>
            <div className="glass-card p-5 rounded-2xl border border-slate-200/50 dark:border-white/5 bg-white dark:bg-slate-900/40">
              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">Late</p>
              <p className="text-2xl font-black text-amber-600 dark:text-amber-400">{summary?.counts.LATE ?? 0}</p>
            </div>
            <div className="glass-card p-5 rounded-2xl border border-slate-200/50 dark:border-white/5 bg-white dark:bg-slate-900/40">
              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">Absent (excused)</p>
              <p className="text-2xl font-black text-sky-600 dark:text-sky-400">{summary?.counts.ABSENT_EXCUSED ?? 0}</p>
            </div>
            <div className="glass-card p-5 rounded-2xl border border-slate-200/50 dark:border-white/5 bg-white dark:bg-slate-900/40">
              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">Absent (unexcused)</p>
              <p className="text-2xl font-black text-rose-600 dark:text-rose-400">{summary?.counts.ABSENT_UNEXCUSED ?? 0}</p>
            </div>
          </div>

          {/* Fee/fine section — ONLY rendered if feeSummary is present in the
              API response, per the strict "no default fines" product rule. */}
          {feeSummary && (
            <div className="glass-card p-5 rounded-2xl border border-amber-200 dark:border-amber-500/20 bg-amber-50/50 dark:bg-amber-500/5 flex items-start gap-3">
              <Info className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-bold text-slate-900 dark:text-white">Institution attendance fee policy</p>
                <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                  This institution charges ৳{feeSummary.amountPerAbsence} per {feeSummary.countsMark.replace(/_/g, ' ').toLowerCase()} record ({feeSummary.billingFrequency.toLowerCase()}).
                  In the selected range: {feeSummary.matchingCount} matching record{feeSummary.matchingCount === 1 ? '' : 's'}, totalling ৳{feeSummary.totalDue}.
                </p>
              </div>
            </div>
          )}

          {/* Trend chart */}
          <div className="glass-card p-5 rounded-2xl border border-slate-200/50 dark:border-white/5 bg-white dark:bg-slate-900/40">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-3">Weekly attendance trend</h3>
            {trendData.length === 0 ? (
              <EmptyState title="No trend data yet" description="Once attendance is recorded for this range, a weekly trend will appear here." icon={<HistoryIcon className="w-8 h-8 text-slate-400" />} />
            ) : (
              <BarChart data={trendData} xKey="week" yKey="percentage" formatValue={(v) => `${v}%`} />
            )}
          </div>

          {/* Tabs */}
          <div className="flex items-center gap-1 border-b border-slate-200 dark:border-white/10">
            <button
              onClick={() => setTab('history')}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors ${
                tab === 'history' ? 'border-blue-600 text-blue-600 dark:text-blue-400' : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <HistoryIcon className="w-4 h-4" /> History
            </button>
            <button
              onClick={() => setTab('corrections')}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors ${
                tab === 'corrections' ? 'border-blue-600 text-blue-600 dark:text-blue-400' : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Inbox className="w-4 h-4" /> Correction requests
            </button>
          </div>

          {tab === 'history' ? (
            <DataTable
              data={historyRows}
              columns={historyColumns}
              searchPlaceholder="Search subject or note…"
              emptyTitle="No attendance records yet"
              emptyDescription="No attendance has been recorded for the selected date range."
              actions={[{
                label: 'Request correction',
                icon: 'edit',
                onClick: (r) => setCorrectionRecord(r),
              }]}
            />
          ) : requestsError ? (
            <div className="glass-card p-8 rounded-3xl border border-rose-200 dark:border-rose-500/10 bg-rose-50/50 dark:bg-rose-500/5 text-center text-sm text-slate-700 dark:text-slate-300">{requestsError}</div>
          ) : (
            <DataTable
              data={requests}
              columns={requestColumns}
              isLoading={requestsLoading}
              searchPlaceholder="Search note…"
              emptyTitle="No correction requests"
              emptyDescription="Correction requests you submit will appear here with their status."
            />
          )}
        </>
      )}

      {correctionRecord && (
        <CorrectionRequestModal
          record={correctionRecord}
          isLoading={submitting}
          onCancel={() => setCorrectionRecord(null)}
          onSubmit={submitCorrection}
        />
      )}
    </div>
  );
};

export default AttendancePortal;
