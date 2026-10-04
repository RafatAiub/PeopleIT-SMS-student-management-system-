import React, { useCallback, useMemo, useState } from 'react';
import { DataTable, type Column } from '@/components/DataTable/DataTable';
import { ErrorState } from '@/components/ui';
import { useT } from '@/i18n';
import ClassSectionPicker from './ClassSectionPicker';
import { todayIso, useSubjectReport, type SubjectReport } from './subjectAttendance.queries';

type Row = SubjectReport['students'][number];

const pct = (p: number | null | undefined) => (p === null || p === undefined ? '—' : `${p}%`);
const tone = (p: number | null | undefined) =>
  p === null || p === undefined ? 'text-slate-500' : p < 75 ? 'text-rose-700 dark:text-rose-400 font-semibold' : 'text-slate-900 dark:text-white';

function monthStart() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

export default function SubjectReportPanel({ isTeacher }: { isTeacher: boolean }) {
  const t = useT();
  const [className, setClassName] = useState('');
  const [sectionName, setSectionName] = useState('');
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(todayIso());
  const onClassChange = useCallback((c: string, s: string) => {
    setClassName(c);
    setSectionName(s);
  }, []);

  const { data, isLoading, isError, refetch } = useSubjectReport({ className, sectionName, from, to });

  const columns = useMemo<Column<Row>[]>(() => {
    const base: Column<Row>[] = [
      {
        key: 'name',
        header: t('Student'),
        accessor: 'name',
        primary: true,
        sortable: true,
        render: (r) => (
          <>
            <div className="font-semibold text-slate-900 dark:text-white">{r.name}</div>
            <div className="text-xs text-slate-500">{r.rollNumber ? `#${r.rollNumber} · ` : ''}{r.studentId}</div>
          </>
        ),
        exportValue: (r) => r.name,
      },
    ];
    const subjectCols: Column<Row>[] = (data?.subjects ?? []).map((name) => ({
      key: `subj-${name}`,
      header: name,
      align: 'right' as const,
      render: (r: Row) => {
        const c = r.bySubject[name];
        return c ? <span className={tone(c.percentage)} title={`${c.present + c.late}/${c.total}`}>{pct(c.percentage)}</span> : <span className="text-slate-400">—</span>;
      },
      exportValue: (r: Row) => r.bySubject[name]?.percentage ?? '',
    }));
    return [
      ...base,
      ...subjectCols,
      {
        key: 'overall',
        header: t('Overall'),
        align: 'right',
        render: (r) => <span className={tone(r.overall.percentage)}>{pct(r.overall.percentage)}</span>,
        exportValue: (r) => r.overall.percentage ?? '',
      },
    ];
  }, [data, t]);

  return (
    <div className="space-y-4">
      <div className="glass-card rounded-2xl p-4 flex flex-wrap items-end gap-3">
        <ClassSectionPicker isTeacher={isTeacher} className={className} sectionName={sectionName} onChange={onClassChange} idPrefix="subj-report" />
        <div className="flex flex-col">
          <label htmlFor="subj-report-from" className="field-label">{t('From')}</label>
          <input id="subj-report-from" type="date" value={from} max={to} onChange={(e) => e.target.value && setFrom(e.target.value)} className="input-field py-2" />
        </div>
        <div className="flex flex-col">
          <label htmlFor="subj-report-to" className="field-label">{t('To')}</label>
          <input id="subj-report-to" type="date" value={to} min={from} max={todayIso()} onChange={(e) => e.target.value && setTo(e.target.value)} className="input-field py-2" />
        </div>
      </div>

      {data && data.subjectTotals.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {data.subjectTotals.map((s) => (
            <div key={s.subjectName} className="glass-card rounded-xl p-3">
              <p className="text-xs text-slate-500 truncate">{s.subjectName}</p>
              <p className={`text-lg font-semibold ${tone(s.percentage)}`}>{pct(s.percentage)}</p>
              <p className="text-[11px] text-slate-500">{t('{n} sessions', { n: s.sessions })}</p>
            </div>
          ))}
        </div>
      )}

      {isError ? (
        <div className="glass-card rounded-2xl"><ErrorState message={t('Could not load the subject report.')} onRetry={() => refetch()} /></div>
      ) : (
        <div className="glass-card rounded-2xl p-4">
          <DataTable
            data={data?.students ?? []}
            columns={columns}
            isLoading={isLoading && !!className && !!sectionName}
            exportFileName={`subject-attendance-${className}-${sectionName}-${from}-${to}`}
            emptyTitle={t('No students or subject attendance yet')}
            emptyDescription={t('Mark subject attendance to see per-subject percentages here.')}
          />
        </div>
      )}
    </div>
  );
}
