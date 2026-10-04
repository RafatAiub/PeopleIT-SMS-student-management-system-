import React from 'react';
import { Award, GraduationCap, Percent, Users } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Alert, ErrorState, SkeletonStatGrid, StatCard } from '@/components/ui';
import { EmptyState } from '@/components/common/EmptyState';
import { DataTable, type Column } from '@/components/DataTable/DataTable';
import { chartAxis, chartColors, chartGrid, chartTooltipStyle } from '@/lib/chartTheme';
import { formatDate, formatNumber, useT } from '@/i18n';
import { useAcademicAnalytics } from './analytics.queries';
import { ChartCard } from './analyticsUi';
import { pct } from './analyticsRange';
import type { AcademicAnalytics, ReportFilters } from './analytics.types';

type ClassRow = AcademicAnalytics['byClass'][number];
type SubjectRow = AcademicAnalytics['subjects'][number];

export const AcademicTab: React.FC<{ filters: ReportFilters; printMode?: boolean }> = ({ filters, printMode }) => {
  const t = useT();
  const colors = chartColors();
  const q = useAcademicAnalytics(filters);
  const d = q.data;

  const classColumns: Column<ClassRow>[] = [
    { key: 'className', header: t('Class'), primary: true, sortable: true, accessor: 'className' },
    { key: 'sectionName', header: t('Section'), render: (r) => r.sectionName ?? '—', exportValue: (r) => r.sectionName },
    { key: 'students', header: t('Students'), align: 'right', accessor: 'students' },
    { key: 'passRate', header: t('Pass rate'), align: 'right', sortable: true, render: (r) => pct(r.passRate), exportValue: (r) => r.passRate },
    { key: 'averagePercent', header: t('Average'), align: 'right', sortable: true, render: (r) => pct(r.averagePercent), exportValue: (r) => r.averagePercent },
    { key: 'averageGpa', header: t('Avg GPA'), align: 'right', hideOnMobile: true, accessor: 'averageGpa' },
    { key: 'failCount', header: t('Failed'), align: 'right', hideOnMobile: true, accessor: 'failCount' },
  ];

  const subjectColumns: Column<SubjectRow>[] = [
    { key: 'subject', header: t('Subject'), primary: true, sortable: true, accessor: 'subject' },
    { key: 'entries', header: t('Entries'), align: 'right', hideOnMobile: true, accessor: 'entries' },
    { key: 'passRate', header: t('Pass rate'), align: 'right', sortable: true, render: (r) => pct(r.passRate), exportValue: (r) => r.passRate },
    { key: 'averagePercent', header: t('Average'), align: 'right', sortable: true, render: (r) => pct(r.averagePercent), exportValue: (r) => r.averagePercent },
    { key: 'highestPercent', header: t('Highest'), align: 'right', hideOnMobile: true, render: (r) => pct(r.highestPercent), exportValue: (r) => r.highestPercent },
    { key: 'lowestPercent', header: t('Lowest'), align: 'right', hideOnMobile: true, render: (r) => pct(r.lowestPercent), exportValue: (r) => r.lowestPercent },
  ];

  if (q.isError && !d) {
    return <ErrorState message={t('Could not load academic analytics.')} onRetry={() => q.refetch()} />;
  }
  if (d && !d.exam) {
    return <EmptyState title={t('No exams found')} description={t('No exams match these filters. Try another session or date range.')} />;
  }

  const o = d?.overall;
  const noResults = !!o && o.studentsWithResults === 0;

  return (
    <div className="space-y-4">
      {d?.exam && (
        <p className="text-sm text-slate-600 dark:text-slate-300">
          {t('Exam')}: <span className="font-semibold text-slate-900 dark:text-white">{d.exam.name}</span>
          <span className="text-slate-500 dark:text-slate-400"> · {formatDate(d.exam.startDate)} · {t('Grading')}: {t(d.scale.name)}</span>
        </p>
      )}
      {q.isLoading || !o ? (
        <SkeletonStatGrid count={4} />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <StatCard label={t('Pass rate')} value={pct(o.passRate)} icon={<Percent />} tone="success" hint={t('{p} passed, {f} failed', { p: formatNumber(o.passCount), f: formatNumber(o.failCount) })} />
          <StatCard label={t('Average score')} value={pct(o.averagePercent)} icon={<GraduationCap />} tone="info" />
          <StatCard label={t('Average GPA')} value={formatNumber(o.averageGpa)} icon={<Award />} tone="accent" />
          <StatCard label={t('Students with results')} value={formatNumber(o.studentsWithResults)} icon={<Users />} tone="primary" />
        </div>
      )}

      {noResults && <Alert tone="info" title={t('No results yet')}>{t('No marks have been entered for this exam within these filters.')}</Alert>}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title={t('Grade distribution')} description={t('Students by overall grade')} isLoading={q.isLoading} isEmpty={noResults}>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={d?.gradeDistribution ?? []}>
              <CartesianGrid {...chartGrid} />
              <XAxis dataKey="grade" {...chartAxis} />
              <YAxis {...chartAxis} allowDecimals={false} width={40} />
              <Tooltip contentStyle={chartTooltipStyle} />
              <Bar dataKey="count" name={t('Students')} fill={colors[0]} radius={[4, 4, 0, 0]} isAnimationActive={!printMode} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title={t('Exam-over-exam trend')} isLoading={q.isLoading} isEmpty={(d?.trend.filter((x) => x.students > 0).length ?? 0) === 0}>
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={d?.trend ?? []}>
              <CartesianGrid {...chartGrid} />
              <XAxis dataKey="name" {...chartAxis} />
              <YAxis {...chartAxis} domain={[0, 100]} unit="%" width={48} />
              <Tooltip contentStyle={chartTooltipStyle} formatter={(v: number) => `${v}%`} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Line type="monotone" dataKey="passRate" name={t('Pass rate')} stroke={colors[3]} strokeWidth={2} connectNulls isAnimationActive={!printMode} />
              <Line type="monotone" dataKey="averagePercent" name={t('Average')} stroke={colors[1]} strokeWidth={2} connectNulls isAnimationActive={!printMode} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <ChartCard title={t('Subject averages')} isLoading={q.isLoading} isEmpty={noResults}>
        <ResponsiveContainer width="100%" height={Math.max(220, (d?.subjects.length ?? 0) * 36)}>
          <BarChart data={d?.subjects ?? []} layout="vertical" margin={{ left: 8 }}>
            <CartesianGrid {...chartGrid} horizontal={false} vertical />
            <XAxis type="number" {...chartAxis} domain={[0, 100]} unit="%" />
            <YAxis type="category" dataKey="subject" {...chartAxis} width={100} />
            <Tooltip contentStyle={chartTooltipStyle} formatter={(v: number) => `${v}%`} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="averagePercent" name={t('Average')} fill={colors[1]} radius={[0, 4, 4, 0]} isAnimationActive={!printMode} />
            <Bar dataKey="passRate" name={t('Pass rate')} fill={colors[3]} radius={[0, 4, 4, 0]} isAnimationActive={!printMode} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div className="glass-card p-4 sm:p-6 space-y-3 min-w-0 break-inside-avoid">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">{t('By class / section')}</h3>
          <DataTable data={d?.byClass ?? []} columns={classColumns} isLoading={q.isLoading} pageSize={printMode ? 100 : 10} exportFileName="exam-results-by-class" emptyTitle={t('No results')} />
        </div>
        <div className="glass-card p-4 sm:p-6 space-y-3 min-w-0 break-inside-avoid">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">{t('By subject')}</h3>
          <DataTable data={d?.subjects ?? []} columns={subjectColumns} isLoading={q.isLoading} pageSize={printMode ? 100 : 10} exportFileName="exam-results-by-subject" emptyTitle={t('No results')} />
        </div>
      </div>
    </div>
  );
};
