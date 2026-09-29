import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Save, CheckCheck, CalendarOff, Download, Keyboard, Search } from 'lucide-react';
import { Alert, Button, ErrorState, Kbd, Skeleton, StatCard } from '@/components/ui';
import { EmptyState } from '@/components/common/EmptyState';
import { useT, formatNumber } from '@/i18n';
import { cn } from '@/lib/cn';
import { todayIso, useStaffRegister, useSubmitStaffAttendance, type StaffStatus } from './staffAttendance.queries';
import { STAFF_STATUS_BY_KEY, STAFF_STATUS_OPTIONS, formatTime, staffStatusOption } from './staffStatus';
import { exportSheet } from './exportSheet';

type Marks = Record<string, { status: StaffStatus | null; note: string }>;

const isTypingTarget = (el: EventTarget | null) => {
  const tag = (el as HTMLElement)?.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
};

export default function StaffAttendanceRegister() {
  const t = useT();
  const [date, setDate] = useState(todayIso());
  const [search, setSearch] = useState('');
  const [marks, setMarks] = useState<Marks>({});
  const [baseline, setBaseline] = useState<Marks>({});
  const [active, setActive] = useState(0);
  const [showHelp, setShowHelp] = useState(false);
  const rowRefs = useRef<Record<number, HTMLDivElement | null>>({});

  const { data, isLoading, isError, refetch } = useStaffRegister(date);
  const submit = useSubmitStaffAttendance();

  // Initialise from the saved register; unmarked staff on approved leave get
  // LEAVE pre-filled (a suggestion — nothing is saved until "Save").
  useEffect(() => {
    if (!data) return;
    const next: Marks = {};
    const base: Marks = {};
    data.staff.forEach((s) => {
      next[s.userId] = { status: s.status ?? s.suggestedStatus ?? null, note: s.note ?? '' };
      base[s.userId] = { status: s.status, note: s.note ?? '' };
    });
    setMarks(next);
    setBaseline(base);
    setActive(0);
  }, [data]);

  const isDirty = useMemo(() => JSON.stringify(marks) !== JSON.stringify(baseline), [marks, baseline]);

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (!isDirty) return;
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (data?.staff ?? []).filter(
      (s) => !q || s.name.toLowerCase().includes(q) || (s.department ?? '').toLowerCase().includes(q) || (s.designation ?? '').toLowerCase().includes(q),
    );
  }, [data, search]);

  const setStatus = (userId: string, status: StaffStatus) =>
    setMarks((prev) => ({ ...prev, [userId]: { note: prev[userId]?.note ?? '', status } }));

  // Keyboard: ↑/↓ (or J/K) move, P/A/L/V/H mark the active row and advance.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
      if (rows.length === 0) return;
      const key = e.key.toUpperCase();
      if (e.key === 'ArrowDown' || key === 'J') {
        e.preventDefault();
        setActive((i) => Math.min(rows.length - 1, i + 1));
      } else if (e.key === 'ArrowUp' || key === 'K') {
        e.preventDefault();
        setActive((i) => Math.max(0, i - 1));
      } else if (STAFF_STATUS_BY_KEY[key]) {
        e.preventDefault();
        const row = rows[Math.min(active, rows.length - 1)];
        if (row) setStatus(row.userId, STAFF_STATUS_BY_KEY[key]);
        setActive((i) => Math.min(rows.length - 1, i + 1));
      } else if (e.key === '?') {
        setShowHelp((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [rows, active]);

  useEffect(() => {
    rowRefs.current[active]?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const counts = useMemo(() => {
    const c = { PRESENT: 0, ABSENT: 0, LATE: 0, LEAVE: 0, HALF_DAY: 0, unmarked: 0 };
    (data?.staff ?? []).forEach((s) => {
      const st = marks[s.userId]?.status;
      if (st) c[st]++;
      else c.unmarked++;
    });
    return c;
  }, [data, marks]);

  const changeDate = (value: string) => {
    if (value > todayIso()) return;
    if (isDirty && !window.confirm(t('You have unsaved changes. Discard them and switch date?'))) return;
    setDate(value);
  };

  const markAllUnmarked = (status: StaffStatus) =>
    setMarks((prev) => {
      const next = { ...prev };
      (data?.staff ?? []).forEach((s) => {
        if (!next[s.userId]?.status) next[s.userId] = { note: next[s.userId]?.note ?? '', status };
      });
      return next;
    });

  const applyLeaveSuggestions = () =>
    setMarks((prev) => {
      const next = { ...prev };
      (data?.staff ?? []).forEach((s) => {
        if (s.suggestedStatus) next[s.userId] = { note: next[s.userId]?.note ?? '', status: 'LEAVE' };
      });
      return next;
    });

  const handleSave = async () => {
    const records = Object.entries(marks)
      .filter(([, m]) => m.status)
      .map(([staffUserId, m]) => ({ staffUserId, status: m.status as StaffStatus, note: m.note.trim() || null }));
    if (records.length === 0) return;
    await submit.mutateAsync({ date, records });
    refetch();
  };

  const handleExport = () =>
    exportSheet(
      (data?.staff ?? []).map((s) => ({
        Name: s.name,
        Role: s.role,
        Department: s.department ?? '',
        Designation: s.designation ?? '',
        Status: staffStatusOption(marks[s.userId]?.status)?.label ?? 'Unmarked',
        'Check in': s.checkIn ? formatTime(s.checkIn) : '',
        'Check out': s.checkOut ? formatTime(s.checkOut) : '',
        Note: marks[s.userId]?.note ?? '',
      })),
      `staff-attendance-${date}`,
      date,
    );

  const leaveCount = (data?.staff ?? []).filter((s) => s.suggestedStatus).length;

  return (
    <div className="space-y-4">
      <div className="glass-card rounded-2xl p-4 flex flex-wrap items-end gap-3">
        <div className="flex flex-col">
          <label htmlFor="staff-att-date" className="field-label">{t('Date')}</label>
          <input
            id="staff-att-date"
            type="date"
            value={date}
            max={todayIso()}
            onChange={(e) => changeDate(e.target.value)}
            className="input-field py-2 min-w-[150px]"
          />
        </div>
        <div className="flex-1 min-w-[180px] relative">
          <label htmlFor="staff-att-search" className="field-label">{t('Search')}</label>
          <Search className="w-4 h-4 absolute left-3 bottom-3 text-slate-500" aria-hidden />
          <input
            id="staff-att-search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('Name, department or designation')}
            className="input-field py-2 pl-9 w-full"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" leftIcon={<CheckCheck className="w-4 h-4" />} onClick={() => markAllUnmarked('PRESENT')} disabled={!data}>
            {t('Unmarked → Present')}
          </Button>
          {leaveCount > 0 && (
            <Button variant="outline" size="sm" leftIcon={<CalendarOff className="w-4 h-4" />} onClick={applyLeaveSuggestions}>
              {t('Apply approved leave ({n})', { n: leaveCount })}
            </Button>
          )}
          <Button variant="ghost" size="sm" leftIcon={<Download className="w-4 h-4" />} onClick={handleExport} disabled={!data?.staff.length}>
            {t('Export')}
          </Button>
          <Button variant="ghost" size="icon-sm" onClick={() => setShowHelp((v) => !v)} aria-label={t('Keyboard shortcuts')}>
            <Keyboard className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {showHelp && (
        <Alert tone="info" title={t('Keyboard shortcuts')}>
          <span className="inline-flex flex-wrap gap-x-4 gap-y-1">
            <span><Kbd>↑</Kbd>/<Kbd>↓</Kbd> {t('move')}</span>
            {STAFF_STATUS_OPTIONS.map((o) => (
              <span key={o.key}><Kbd>{o.key}</Kbd> {t(o.label)}</span>
            ))}
            <span><Kbd>?</Kbd> {t('toggle help')}</span>
          </span>
        </Alert>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatCard label={t('Present')} value={formatNumber(counts.PRESENT)} tone="success" />
        <StatCard label={t('Absent')} value={formatNumber(counts.ABSENT)} tone="danger" />
        <StatCard label={t('Late')} value={formatNumber(counts.LATE)} tone="warning" />
        <StatCard label={t('Leave')} value={formatNumber(counts.LEAVE)} tone="accent" />
        <StatCard label={t('Half day')} value={formatNumber(counts.HALF_DAY)} tone="info" />
        <StatCard label={t('Unmarked')} value={formatNumber(counts.unmarked)} tone="neutral" />
      </div>

      {isError ? (
        <div className="glass-card rounded-2xl">
          <ErrorState message={t('Could not load the staff register.')} onRetry={() => refetch()} />
        </div>
      ) : isLoading ? (
        <div className="glass-card rounded-2xl p-4 space-y-2">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-xl" />)}
        </div>
      ) : rows.length === 0 ? (
        <div className="glass-card rounded-2xl">
          <EmptyState
            title={search ? t('No staff match your search') : t('No active staff found')}
            description={search ? undefined : t('Staff accounts (teachers, accountants, librarians…) and HR staff profiles appear here.')}
          />
        </div>
      ) : (
        <div className="glass-card rounded-2xl divide-y divide-slate-100 dark:divide-white/5" role="grid" aria-label={t('Staff attendance register')}>
          {rows.map((s, i) => {
            const mark = marks[s.userId];
            return (
              <div
                key={s.userId}
                ref={(el) => { rowRefs.current[i] = el; }}
                role="row"
                aria-selected={i === active}
                onClick={() => setActive(i)}
                className={cn(
                  'p-3 sm:px-4 flex flex-col md:flex-row md:items-center gap-3 transition-colors',
                  i === active && 'bg-primary-50/60 dark:bg-primary-500/10 ring-1 ring-inset ring-primary-300 dark:ring-primary-500/30',
                )}
              >
                <div className="min-w-0 md:w-64">
                  <p className="font-semibold text-slate-900 dark:text-white truncate">{s.name}</p>
                  <p className="text-xs text-slate-500 truncate">
                    {[s.designation || s.role, s.department].filter(Boolean).join(' · ')}
                  </p>
                  {s.suggestedStatus && (
                    <p className="text-xs text-violet-700 dark:text-violet-400 mt-0.5">
                      {t('Approved leave')}{s.leaveType ? ` · ${s.leaveType}` : ''}
                    </p>
                  )}
                </div>
                <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={t('Status for {name}', { name: s.name })}>
                  {STAFF_STATUS_OPTIONS.map((o) => (
                    <button
                      key={o.value}
                      type="button"
                      role="radio"
                      aria-checked={mark?.status === o.value}
                      onClick={(e) => { e.stopPropagation(); setStatus(s.userId, o.value); setActive(i); }}
                      className={cn(
                        'min-h-9 px-3 rounded-lg text-xs font-semibold transition-colors',
                        mark?.status === o.value
                          ? o.activeClass
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700',
                      )}
                    >
                      <span className="sr-only sm:not-sr-only">{t(o.label)}</span>
                      <span className="sm:hidden" aria-hidden>{o.key}</span>
                    </button>
                  ))}
                </div>
                <div className="text-xs text-slate-500 md:w-32 shrink-0">
                  {s.checkIn || s.checkOut ? `${formatTime(s.checkIn)} – ${formatTime(s.checkOut)}` : t('No QR check-in')}
                </div>
                <input
                  aria-label={t('Note for {name}', { name: s.name })}
                  value={mark?.note ?? ''}
                  onChange={(e) => setMarks((prev) => ({ ...prev, [s.userId]: { status: prev[s.userId]?.status ?? null, note: e.target.value } }))}
                  placeholder={t('Note')}
                  maxLength={500}
                  className="input-field py-1.5 text-sm md:flex-1 min-w-0"
                />
              </div>
            );
          })}
        </div>
      )}

      <div className="sticky bottom-3 z-10 flex justify-end">
        <div className="glass-card rounded-xl px-3 py-2 flex items-center gap-3 shadow-lg">
          {isDirty && <span className="text-xs text-amber-700 dark:text-amber-400">{t('Unsaved changes')}</span>}
          <Button leftIcon={<Save className="w-4 h-4" />} onClick={handleSave} isLoading={submit.isPending} disabled={!data || !isDirty}>
            {t('Save register')}
          </Button>
        </div>
      </div>
    </div>
  );
}
