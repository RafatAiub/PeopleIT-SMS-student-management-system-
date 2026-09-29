import React, { useState } from 'react';
import { CalendarCheck, UserX, Users, CalendarDays } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ErrorState, SkeletonStatGrid, StatCard } from '@/components/ui';
import { DataTable, type Column } from '@/components/DataTable/DataTable';
import { chartAxis, chartColors, chartGrid, chartTooltipStyle } from '@/lib/chartTheme';
import { formatDate, formatNumber, useT } from '@/i18n';
import { useAttendanceAnalytics, useChronicAbsentees } from './analytics.queries';
import { ChartCard } from './analyticsUi';
import { pct } from './analyticsRange';
import type { AttendanceAnalytics, ChronicAbsentee, ReportFilters } from './analytics.types';

type ClassRow = AttendanceAnalytics['byClass'][number];

export const AttendanceTab: React.FC<{ filters: ReportFilters; printMode?: boolean }> = ({ filters, printMode }) => {
  const t = useT();
  const colors = chartColors();
  const q = useAttendanceAnalytics(filters);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(printMode ? 50 : 10);
  const chronic = useChronicAbsentees(filters, page, pageSize);
  const d = q.data;

  const classColumns: Column<ClassRow>[] = [
    { key: 'className', header: t('Class'), primary: true, sortable: true, accessor: 'className' },
    { key: 'sectionName', header: t('Section'), render: (r) => r.sectionName ?? '—', exportValue: (r) => r.sectionName },
    { key: 'students', header: t('Students'), align: 'right', accessor: 'students' },
    { key: 'rate', header: t('Attendance'), align: 'right', sortable: true, render: (r) => pct(r.rate), exportValue: (r) => r.rate },
    { key: 'present', header: t('Present'), align: 'right', hideOnMobile: true, accessor: 'present' },
    { key: 'absent', header: t('Absent'), align: 'right', hideOnMobile: true, accessor: 'absent' },
    { key: 'late', header: t('Late'), align: 'right', hideOnMobile: true, accessor: 'late' },
    { key: 'halfDay', header: t('Half day'), align: 'right', defaultHidden: true, accessor: 'halfDay' },
  ];

  const chronicColumns: Column<ChronicAbsentee>[] = [
    { key: 'name', header: t('Student'), primary: true, render: (r) => (
      <div className="min-w-0">
        <p className="font-medium text-slate-900 dark:text-white truncate">{r.name}</p>
        <p className="text-xs text-slate-500 dark:text-slate-400">{r.studentCode ?? '—'}</p>
      </div>
    ), exportValue: (r) => r.name },
    { key: 'studentCode', header: t('Student ID'), accessor: 'studentCode', defaultHidden: true },
    { key: 'class', header: t('Class'), render: (r) => [r.className, r.sectionName].filter(Boolean).join(' · ') || '—', exportValue: (r) => [r.className, r.sectionName].filter(Boolean).join(' ') },
    { key: 'rollNumber', header: t('Roll'), accessor: 'rollNumber', hideOnMobile: true },
    { key: 'absent', header: t('Absent'), align: 'right', accessor: 'absent' },
    { key: 'total', header: t('Marked days'), align: 'right', hideOnMobile: true, accessor: 'total' },
    { key: 'absenceRate', header: t('Absence rate'), align: 'right', render: (r) => pct(r.absenceRate), exportValue: (r) => r.absenceRate },
  ];

  if (q.isError && !d) {
    return <ErrorState message={t('Could not load attendance analytics.')} onRetry={() => q.refetch()} />;
  }

  const k = d?.kpis;
  const trendData = (d?.trend ?? []).map((r) => ({ ...r, label: formatDate(r.date) }));
  const weekdayData = (d?.weekday ?? []).filter((w) => w.total > 0).map((w) => ({ ...w, label: t(w.label).slice(0, 3) }));
  const noRecords = !!d && d.kpis.records === 0;

  return (
    <div className="space-y-4">
      {q.isLoading || !k ? (
        <SkeletonStatGrid count={4} />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <StatCard label={t('Attendance rate')} value={pct(k.rate)} icon={<CalendarCheck />} tone="success" hint={t('Late counts as present, half day as ½')} />
          <StatCard label={t('Days recorded')} value={formatNumber(k.daysRecorded)} icon={<CalendarDays />} tone="info" hint={t('{n} records', { n: formatNumber(k.records) })} />
          <StatCard label={t('Students counted')} value={formatNumber(k.studentsCounted)} icon={<Users />} tone="primary" />
          <StatCard label={t('Chronic absentees')} value={formatNumber(k.chronicAbsentees)} icon={<UserX />} tone="danger" hint={t('≥ {n}% absent', { n: k.threshold })} />
        </div>
      )}

      <ChartCard title={t('Daily attendance rate')} isLoading={q.isLoading} isEmpty={noRecords} emptyTitle={t('No attendance recorded in this period')}>
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={trendData}>
            <CartesianGrid {...chartGrid} />
            <XAxis dataKey="label" {...chartAxis} minTickGap={16} />
            <YAxis {...chartAxis} domain={[0, 100]} unit="%" width={48} />
            <Tooltip contentStyle={chartTooltipStyle} formatter={(v: number) => `${v}%`} />
            <Line type="monotone" dataKey="rate" name={t('Attendance')} stroke={colors[3]} strokeWidth={2} dot={false} connectNulls isAnimationActive={!printMode} />
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title={t('By day of week')} isLoading={q.isLoading} isEmpty={noRecords}>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={weekdayData}>
              <CartesianGrid {...chartGrid} />
              <XAxis dataKey="label" {...chartAxis} />
              <YAxis {...chartAxis} domain={[0, 100]} unit="%" width={48} />
              <Tooltip contentStyle={chartTooltipStyle} formatter={(v: number) => `${v}%`} />
              <Bar dataKey="rate" name={t('Attendance')} fill={colors[1]} radius={[4, 4, 0, 0]} isAnimationActive={!printMode} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title={t('By class / section')} isLoading={q.isLoading} isEmpty={noRecords}>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={(d?.byClass ?? []).slice(0, 20).map((c) => ({ ...c, label: [c.className, c.sectionName].filter(Boolean).join(' ') }))}>
              <CartesianGrid {...chartGrid} />
              <XAxis dataKey="label" {...chartAxis} interval={0} angle={-30} textAnchor="end" height={56} />
              <YAxis {...chartAxis} domain={[0, 100]} unit="%" width={48} />
              <Tooltip contentStyle={chartTooltipStyle} formatter={(v: number) => `${v}%`} />
              <Bar dataKey="rate" name={t('Attendance')} fill={colors[0]} radius={[4, 4, 0, 0]} isAnimationActive={!printMode} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <div className="glass-card p-4 sm:p-6 space-y-3 break-inside-avoid">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-white">{t('Class / section breakdown')}</h3>
        <DataTable
          data={d?.byClass ?? []}
          columns={classColumns}
          isLoading={q.isLoading}
          pageSize={printMode ? 100 : 10}
          exportFileName="attendance-by-class"
          emptyTitle={t('No attendance recorded')}
          emptyDescription={t('Attendance for these filters will appear here once marked.')}
        />
      </div>

      <div className="glass-card p-4 sm:p-6 space-y-3 break-inside-avoid">
        <div>
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">{t('Chronic absentees')}</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {t('Absent at least {n}% of marked days (minimum {m} days).', { n: k?.threshold ?? filters.threshold ?? 20, m: k?.minDays ?? 5 })}
          </p>
        </div>
        {chronic.isError ? (
          <ErrorState compact message={t('Could not load chronic absentees.')} onRetry={() => chronic.refetch()} />
        ) : (
          <DataTable
            data={chronic.data?.items ?? []}
            columns={chronicColumns}
            isLoading={chronic.isLoading}
            serverPagination
            totalCount={chronic.data?.meta.total ?? 0}
            page={page}
            pageSize={pageSize}
            onPageChange={setPage}
            onPageSizeChange={(s) => {
              setPageSize(s);
              setPage(1);
            }}
            exportFileName="chronic-absentees"
            emptyTitle={t('No chronic absentees')}
            emptyDescription={t('No student crosses the absence threshold for these filters.')}
          />
        )}
      </div>
    </div>
  );
};
