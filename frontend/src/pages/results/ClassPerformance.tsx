import React, { useState } from 'react';
import { BarChart3, CheckCircle2, Percent, Users, Award } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Alert, Card, ErrorState, PageHeader, SkeletonStatGrid, Skeleton, StatCard } from '../../components/ui';
import { DataTable, type Column } from '../../components/DataTable/DataTable';
import { EmptyState } from '../../components/common/EmptyState';
import { chartAxis, chartColors, chartGrid, chartTooltipStyle } from '../../lib/chartTheme';
import { useT, formatNumber } from '../../i18n';
import { ClassExamFilters, type ClassExamValue } from './ClassExamFilters';
import { useClassAnalytics, type ClassAnalytics } from './insights.queries';

type SubjectRow = ClassAnalytics['subjectAverages'][number] & { id: string };
const fmt = (n: number) => formatNumber(n, { maximumFractionDigits: 2 });

/** Route: /results/class-performance — SUPER_ADMIN, ADMIN, TEACHER (backend STAFF_ROLES). */
const ClassPerformance: React.FC = () => {
  const t = useT();
  const colors = chartColors();
  const [filters, setFilters] = useState<ClassExamValue>({ examId: '', classId: '', sectionId: '' });
  const ready = !!filters.examId && !!filters.classId;
  const q = useClassAnalytics(filters, ready);
  const d = q.data;

  const subjectColumns: Column<SubjectRow>[] = [
    { key: 'subject', header: t('Subject'), accessor: 'subject', primary: true, sortable: true },
    { key: 'entries', header: t('Students'), align: 'right', accessor: 'entries', sortable: true },
    { key: 'averagePercent', header: t('Average %'), align: 'right', render: (r) => fmt(r.averagePercent), exportValue: (r) => r.averagePercent, sortable: true, accessor: 'averagePercent' },
    { key: 'averageMarks', header: t('Average marks'), align: 'right', render: (r) => fmt(r.averageMarks), exportValue: (r) => r.averageMarks, hideOnMobile: true },
    { key: 'highestPercent', header: t('Highest %'), align: 'right', render: (r) => fmt(r.highestPercent), exportValue: (r) => r.highestPercent },
    { key: 'lowestPercent', header: t('Lowest %'), align: 'right', render: (r) => fmt(r.lowestPercent), exportValue: (r) => r.lowestPercent, hideOnMobile: true },
    { key: 'passRate', header: t('Pass rate'), align: 'right', render: (r) => `${fmt(r.passRate)}%`, exportValue: (r) => r.passRate, sortable: true, accessor: 'passRate' },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('Class performance')}
        description={t('Pass rate, grade distribution and subject averages for one exam.')}
        breadcrumbs={[{ label: t('Results'), to: '/results' }, { label: t('Class performance') }]}
      />

      <div className="glass-card p-4">
        <ClassExamFilters value={filters} onChange={setFilters} />
      </div>

      {!ready ? (
        <EmptyState icon={<BarChart3 className="w-6 h-6" />} title={t('Choose an exam and class')} description={t('The dashboard appears once an exam and class are selected.')} />
      ) : q.isLoading ? (
        <div className="space-y-4">
          <SkeletonStatGrid />
          <div className="grid gap-4 lg:grid-cols-2">
            <Skeleton className="h-72" />
            <Skeleton className="h-72" />
          </div>
        </div>
      ) : q.isError ? (
        <ErrorState onRetry={() => q.refetch()} />
      ) : !d || d.studentsWithResults === 0 ? (
        <EmptyState icon={<BarChart3 className="w-6 h-6" />} title={t('No results for this selection')} description={t('Marks have not been entered for this exam and class yet.')} />
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatCard
              label={t('Students with results')}
              value={formatNumber(d.studentsWithResults)}
              icon={<Users />}
              tone="info"
              hint={t('{n} active enrolled', { n: formatNumber(d.enrolledActiveStudents) })}
            />
            <StatCard label={t('Pass rate')} value={`${fmt(d.passRate)}%`} icon={<CheckCircle2 />} tone={d.passRate >= 80 ? 'success' : d.passRate >= 50 ? 'warning' : 'danger'} hint={t('{p} passed · {f} failed', { p: d.passCount, f: d.failCount })} />
            <StatCard label={t('Average %')} value={fmt(d.averagePercent)} icon={<Percent />} tone="accent" hint={t('High {h} · Low {l}', { h: fmt(d.highestPercent), l: fmt(d.lowestPercent) })} />
            <StatCard label={t('Average GPA')} value={formatNumber(d.averageGpa, { minimumFractionDigits: 2 })} icon={<Award />} tone="primary" />
          </div>

          {d.scale.isFallback && (
            <Alert tone="info">{t('Graded with the built-in Bangladesh standard scale (no default grading scale configured).')}</Alert>
          )}

          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="p-4">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-3">{t('Overall grade distribution (students)')}</h3>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={d.gradeDistribution} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                    <CartesianGrid {...chartGrid} />
                    <XAxis dataKey="grade" {...chartAxis} />
                    <YAxis allowDecimals={false} {...chartAxis} />
                    <Tooltip contentStyle={chartTooltipStyle} cursor={{ fill: 'var(--border-default)', opacity: 0.3 }} />
                    <Bar dataKey="count" name={t('Students')} radius={[4, 4, 0, 0]}>
                      {d.gradeDistribution.map((g, i) => (
                        <Cell key={g.grade} fill={colors[i % colors.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
            <Card className="p-4">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-3">{t('Subject averages (%)')}</h3>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={d.subjectAverages} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 0 }}>
                    <CartesianGrid {...chartGrid} vertical horizontal={false} />
                    <XAxis type="number" domain={[0, 100]} {...chartAxis} />
                    <YAxis type="category" dataKey="subject" width={96} {...chartAxis} tick={{ ...chartAxis.tick, fontSize: 11 }} />
                    <Tooltip contentStyle={chartTooltipStyle} formatter={(v: number) => `${fmt(v)}%`} cursor={{ fill: 'var(--border-default)', opacity: 0.3 }} />
                    <Bar dataKey="averagePercent" name={t('Average %')} fill={colors[1]} radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </div>

          <Card className="p-4">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-3">{t('Subject-result grade distribution')}</h3>
            <div className="flex flex-wrap gap-2">
              {d.subjectGradeDistribution.map((g) => (
                <span key={g.grade} className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 dark:border-white/10 px-3 py-1 text-sm">
                  <span className="font-semibold">{g.grade}</span>
                  <span className="tabular-nums text-slate-600 dark:text-slate-400">{formatNumber(g.count)}</span>
                </span>
              ))}
            </div>
          </Card>

          <DataTable
            data={d.subjectAverages.map((s) => ({ ...s, id: s.subject }))}
            columns={subjectColumns}
            exportFileName={`class-performance-${d.exam.name}-${d.className}${d.sectionName ? `-${d.sectionName}` : ''}`}
            emptyTitle={t('No subjects')}
          />
        </>
      )}
    </div>
  );
};

export default ClassPerformance;
