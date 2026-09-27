import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Save, CheckCheck, Keyboard } from 'lucide-react';
import { Alert, Button, ErrorState, Kbd, Select, Skeleton } from '@/components/ui';
import { EmptyState } from '@/components/common/EmptyState';
import { useT } from '@/i18n';
import { cn } from '@/lib/cn';
import ClassSectionPicker from './ClassSectionPicker';
import {
  todayIso,
  useSubjectOptions,
  useSubjectSheet,
  useSubmitSubjectAttendance,
  weekdayOf,
  type SubjectStatus,
} from './subjectAttendance.queries';

const STATUSES: { value: SubjectStatus; label: string; key: string; active: string }[] = [
  { value: 'PRESENT', label: 'Present', key: 'P', active: 'bg-emerald-600 text-white' },
  { value: 'ABSENT', label: 'Absent', key: 'A', active: 'bg-rose-600 text-white' },
  { value: 'LATE', label: 'Late', key: 'L', active: 'bg-amber-600 text-white' },
  { value: 'HALF_DAY', label: 'Half day', key: 'H', active: 'bg-blue-600 text-white' },
];

const isTypingTarget = (el: EventTarget | null) => {
  const tag = (el as HTMLElement)?.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
};

export default function SubjectMarkPanel({ isTeacher }: { isTeacher: boolean }) {
  const t = useT();
  const [className, setClassName] = useState('');
  const [sectionName, setSectionName] = useState('');
  const [subjectName, setSubjectName] = useState('');
  const [date, setDate] = useState(todayIso());
  const [period, setPeriod] = useState<number | null>(null);
  const [marks, setMarks] = useState<Record<string, SubjectStatus>>({});
  const [active, setActive] = useState(0);
  const [showHelp, setShowHelp] = useState(false);
  const rowRefs = useRef<Record<number, HTMLLIElement | null>>({});

  const onClassChange = useCallback((c: string, s: string) => {
    setClassName(c);
    setSectionName(s);
    setSubjectName('');
    setPeriod(null);
  }, []);

  const options = useSubjectOptions(className, sectionName);
  const subjects = useMemo(() => options.data?.subjects ?? [], [options.data]);
  const selected = subjects.find((s) => s.subjectName === subjectName);
  const todaysPeriods = useMemo(
    () => (selected?.periods ?? []).filter((p) => p.dayOfWeek === weekdayOf(date)).sort((a, b) => a.period - b.period),
    [selected, date],
  );

  useEffect(() => {
    if (subjects.length && !subjects.some((s) => s.subjectName === subjectName)) setSubjectName(subjects[0].subjectName);
  }, [subjects, subjectName]);

  // Default the period to the first timetabled period for that weekday.
  useEffect(() => {
    if (todaysPeriods.length && !todaysPeriods.some((p) => p.period === period)) setPeriod(todaysPeriods[0].period);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [todaysPeriods]);

  const sheet = useSubjectSheet({ className, sectionName, subjectName, date, period });
  const submit = useSubmitSubjectAttendance();

  useEffect(() => {
    if (!sheet.data) return;
    const next: Record<string, SubjectStatus> = {};
    sheet.data.students.forEach((s) => {
      if (s.status) next[s.id] = s.status;
    });
    setMarks(next);
    setActive(0);
  }, [sheet.data]);

  const students = useMemo(() => sheet.data?.students ?? [], [sheet.data]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target) || e.metaKey || e.ctrlKey || e.altKey || students.length === 0) return;
      const key = e.key.toUpperCase();
      const status = STATUSES.find((s) => s.key === key)?.value;
      if (e.key === 'ArrowDown' || key === 'J') {
        e.preventDefault();
        setActive((i) => Math.min(students.length - 1, i + 1));
      } else if (e.key === 'ArrowUp' || key === 'K') {
        e.preventDefault();
        setActive((i) => Math.max(0, i - 1));
      } else if (status) {
        e.preventDefault();
        const row = students[Math.min(active, students.length - 1)];
        if (row) setMarks((m) => ({ ...m, [row.id]: status }));
        setActive((i) => Math.min(students.length - 1, i + 1));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [students, active]);

  useEffect(() => {
    rowRefs.current[active]?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const unmarked = students.filter((s) => !marks[s.id]).length;

  const handleSave = async () => {
    const records = students.map((s) => ({ studentId: s.id, status: marks[s.id] ?? 'PRESENT' }));
    await submit.mutateAsync({ className, sectionName, subjectName, date, period, records });
    sheet.refetch();
  };

  return (
    <div className="space-y-4">
      <div className="glass-card rounded-2xl p-4 flex flex-wrap items-end gap-3">
        <ClassSectionPicker isTeacher={isTeacher} className={className} sectionName={sectionName} onChange={onClassChange} idPrefix="subj-mark" />
        {options.isLoading && className ? (
          <Skeleton className="h-11 w-48" />
        ) : (
          <Select
            id="subj-mark-subject"
            label={t('Subject')}
            value={subjectName}
            onChange={(e) => { setSubjectName(e.target.value); setPeriod(null); }}
            options={subjects.map((s) => ({ value: s.subjectName, label: s.subjectName }))}
            placeholder={subjects.length ? undefined : t('No subjects')}
            containerClassName="min-w-[180px]"
          />
        )}
        <div className="flex flex-col">
          <label htmlFor="subj-mark-date" className="field-label">{t('Date')}</label>
          <input
            id="subj-mark-date"
            type="date"
            value={date}
            max={todayIso()}
            onChange={(e) => e.target.value && e.target.value <= todayIso() && setDate(e.target.value)}
            className="input-field py-2 min-w-[150px]"
          />
        </div>
        <Select
          id="subj-mark-period"
          label={t('Period')}
          value={period === null ? '' : String(period)}
          onChange={(e) => setPeriod(e.target.value ? Number(e.target.value) : null)}
          options={[
            { value: '', label: t('Whole day / not set') },
            ...Array.from({ length: 10 }, (_, i) => i + 1).map((n) => {
              const slot = todaysPeriods.find((p) => p.period === n);
              return { value: String(n), label: slot ? `${t('Period')} ${n} (${slot.startTime}–${slot.endTime})` : `${t('Period')} ${n}` };
            }),
          ]}
          containerClassName="min-w-[170px]"
        />
        <div className="flex gap-2 ml-auto">
          <Button
            variant="outline"
            size="sm"
            leftIcon={<CheckCheck className="w-4 h-4" />}
            onClick={() => setMarks((m) => { const n = { ...m }; students.forEach((s) => { if (!n[s.id]) n[s.id] = 'PRESENT'; }); return n; })}
            disabled={!students.length}
          >
            {t('Unmarked → Present')}
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
            {STATUSES.map((s) => <span key={s.key}><Kbd>{s.key}</Kbd> {t(s.label)}</span>)}
          </span>
        </Alert>
      )}

      {selected && selected.source === 'CURRICULUM' && (
        <p className="text-xs text-slate-500">{t('This subject is in the curriculum but has no timetable periods for this section.')}</p>
      )}
      {sheet.data?.alreadyMarked && (
        <Alert tone="info">{t('Attendance for this subject/period was already taken — saving updates it.')}</Alert>
      )}

      {!className || !sectionName ? null : options.isError ? (
        <div className="glass-card rounded-2xl"><ErrorState message={t('Could not load subjects.')} onRetry={() => options.refetch()} /></div>
      ) : subjects.length === 0 && !options.isLoading ? (
        <div className="glass-card rounded-2xl">
          <EmptyState title={t('No subjects for this section')} description={t('Add timetable periods or curriculum subjects for this class first.')} />
        </div>
      ) : sheet.isError ? (
        <div className="glass-card rounded-2xl"><ErrorState message={t('Could not load the student list.')} onRetry={() => sheet.refetch()} /></div>
      ) : sheet.isLoading ? (
        <div className="glass-card rounded-2xl p-4 space-y-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
      ) : students.length === 0 ? (
        <div className="glass-card rounded-2xl"><EmptyState title={t('No active students in this section')} /></div>
      ) : (
        <ul className="glass-card rounded-2xl divide-y divide-slate-100 dark:divide-white/5" aria-label={t('Subject attendance sheet')}>
          {students.map((s, i) => (
            <li
              key={s.id}
              ref={(el) => { rowRefs.current[i] = el; }}
              onClick={() => setActive(i)}
              className={cn(
                'p-3 sm:px-4 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4',
                i === active && 'bg-primary-50/60 dark:bg-primary-500/10 ring-1 ring-inset ring-primary-300 dark:ring-primary-500/30',
              )}
            >
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-slate-900 dark:text-white truncate">
                  {s.rollNumber ? <span className="text-slate-500 font-normal mr-2">#{s.rollNumber}</span> : null}
                  {s.name}
                </p>
                <p className="text-xs text-slate-500">{s.studentId}</p>
              </div>
              <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={t('Status for {name}', { name: s.name })}>
                {STATUSES.map((o) => (
                  <button
                    key={o.value}
                    type="button"
                    role="radio"
                    aria-checked={marks[s.id] === o.value}
                    onClick={(e) => { e.stopPropagation(); setMarks((m) => ({ ...m, [s.id]: o.value })); setActive(i); }}
                    className={cn(
                      'min-h-9 px-3 rounded-lg text-xs font-semibold',
                      marks[s.id] === o.value ? o.active : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700',
                    )}
                  >
                    {t(o.label)}
                  </button>
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}

      {students.length > 0 && (
        <div className="sticky bottom-3 z-10 flex justify-end">
          <div className="glass-card rounded-xl px-3 py-2 flex items-center gap-3 shadow-lg">
            {unmarked > 0 && <span className="text-xs text-slate-600 dark:text-slate-400">{t('{n} unmarked will be saved as Present', { n: unmarked })}</span>}
            <Button leftIcon={<Save className="w-4 h-4" />} onClick={handleSave} isLoading={submit.isPending} disabled={!subjectName}>
              {t('Save')}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
