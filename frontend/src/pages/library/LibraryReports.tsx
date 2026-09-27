import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BookOpen, BookCopy, AlertTriangle, Wallet } from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import { Card, CardHeader, Input, StatCard, SkeletonStatGrid, Skeleton, ErrorState } from '../../components/ui';
import { EmptyState } from '../../components/common/EmptyState';
import { DataTable, type Column } from '../../components/DataTable/DataTable';
import { chartColors, chartAxis, chartGrid, chartTooltipStyle } from '../../lib/chartTheme';
import { useT, formatCurrency, formatDate, formatNumber } from '../../i18n';
import apiClient from '../../api/client';

interface OverdueRow {
  id: string;
  dueDate: string;
  status: string;
  daysOverdue: number;
  suggestedFine: number;
  book: { title: string; author: string; shelfLocation: string | null } | null;
  student: { studentId: string; firstName: string; lastName: string; class: { name: string } | null; section: { name: string } | null } | null;
}

interface LibraryReport {
  range: { from: string; to: string };
  summary: { titles: number; totalCopies: number; availableCopies: number; activeLoans: number; overdueLoans: number };
  mostBorrowed: { bookId: string; count: number; book: { title: string; author: string; category: string | null } | null }[];
  overdue: OverdueRow[];
  finesCollected: { total: number; count: number; byMonth: { period: string; amount: number }[] };
}

const shortMonth = (period: string) => {
  const [y, m] = period.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleString('en', { month: 'short', year: '2-digit', timeZone: 'UTC' });
};

/** Library reports tab — most borrowed, overdue list, fines collected. */
export const LibraryReports: React.FC = () => {
  const t = useT();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const report = useQuery({
    queryKey: ['library', 'reports', from, to],
    queryFn: async (): Promise<LibraryReport> =>
      (await apiClient.get('/library/reports', { params: { ...(from ? { from } : {}), ...(to ? { to } : {}) } })).data.data,
  });
  const colors = chartColors();

  const filters = (
    <div className="flex flex-wrap items-end gap-3">
      <Input label={t('From')} type="date" value={from} onChange={(e) => setFrom(e.target.value)} containerClassName="w-40" />
      <Input label={t('To')} type="date" value={to} onChange={(e) => setTo(e.target.value)} containerClassName="w-40" />
      <p className="text-xs text-slate-500 dark:text-slate-400 pb-2">{t('Range applies to most borrowed and fines (default: last 6 months). Overdue is always current.')}</p>
    </div>
  );

  if (report.isLoading) {
    return (
      <div className="space-y-4">
        {filters}
        <SkeletonStatGrid count={4} />
        <Skeleton className="h-72" />
      </div>
    );
  }
  if (report.isError || !report.data) {
    return (
      <div className="space-y-4">
        {filters}
        <ErrorState message={t('Could not load library reports.')} onRetry={() => report.refetch()} />
      </div>
    );
  }

  const r = report.data;
  const overdueCols: Column<OverdueRow>[] = [
    { key: 'book', header: t('Book'), primary: true, render: (o) => o.book?.title || '—', exportValue: (o) => o.book?.title || '' },
    {
      key: 'student',
      header: t('Student'),
      render: (o) => (o.student ? `${o.student.firstName} ${o.student.lastName}` : '—'),
      exportValue: (o) => (o.student ? `${o.student.firstName} ${o.student.lastName}` : ''),
    },
    {
      key: 'class',
      header: t('Class'),
      hideOnMobile: true,
      render: (o) => [o.student?.class?.name, o.student?.section?.name].filter(Boolean).join(' · ') || '—',
      exportValue: (o) => [o.student?.class?.name, o.student?.section?.name].filter(Boolean).join(' '),
    },
    { key: 'dueDate', header: t('Due'), render: (o) => formatDate(o.dueDate), exportValue: (o) => o.dueDate.slice(0, 10) },
    { key: 'days', header: t('Days late'), align: 'right', exportValue: (o) => o.daysOverdue, render: (o) => <span className="tabular-nums font-semibold text-red-600 dark:text-red-400">{formatNumber(o.daysOverdue)}</span> },
    { key: 'fine', header: t('Suggested fine'), align: 'right', exportValue: (o) => o.suggestedFine, render: (o) => <span className="tabular-nums">{formatCurrency(o.suggestedFine)}</span> },
  ];

  return (
    <div className="space-y-4">
      {filters}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatCard label={t('Titles')} value={formatNumber(r.summary.titles)} icon={<BookOpen />} hint={t('{a} of {b} copies available', { a: formatNumber(r.summary.availableCopies), b: formatNumber(r.summary.totalCopies) })} />
        <StatCard label={t('On loan')} value={formatNumber(r.summary.activeLoans)} icon={<BookCopy />} tone="info" />
        <StatCard label={t('Overdue')} value={formatNumber(r.summary.overdueLoans)} icon={<AlertTriangle />} tone={r.summary.overdueLoans > 0 ? 'danger' : 'success'} />
        <StatCard label={t('Fines collected')} value={formatCurrency(r.finesCollected.total)} icon={<Wallet />} tone="accent" hint={t('{n} returns in range', { n: formatNumber(r.finesCollected.count) })} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader title={t('Most borrowed')} />
          {r.mostBorrowed.length === 0 ? (
            <EmptyState compact title={t('No loans in this range')} description={t('Books issued in the selected range appear here.')} />
          ) : (
            <ol className="space-y-2">
              {r.mostBorrowed.map((b, i) => {
                const max = r.mostBorrowed[0].count || 1;
                return (
                  <li key={b.bookId} className="text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-slate-900 dark:text-white"><span className="text-slate-400 tabular-nums mr-2">{i + 1}.</span>{b.book?.title ?? t('Deleted book')}</span>
                      <span className="tabular-nums text-slate-600 dark:text-slate-300 shrink-0">{formatNumber(b.count)}</span>
                    </div>
                    <div className="mt-1 h-1.5 rounded-full bg-slate-100 dark:bg-white/10 overflow-hidden" aria-hidden>
                      <div className="h-full rounded-full" style={{ width: `${(b.count / max) * 100}%`, background: colors[0] }} />
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </Card>

        <Card>
          <CardHeader title={t('Fines collected by month')} />
          {r.finesCollected.byMonth.length === 0 ? (
            <EmptyState compact title={t('No fines collected in this range')} description={t('Fines recorded on returns appear here.')} />
          ) : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={r.finesCollected.byMonth.map((m) => ({ ...m, label: shortMonth(m.period) }))}>
                  <CartesianGrid {...chartGrid} />
                  <XAxis dataKey="label" {...chartAxis} />
                  <YAxis {...chartAxis} width={60} tickFormatter={(v: number) => formatNumber(v)} />
                  <Tooltip contentStyle={chartTooltipStyle} formatter={(v: number) => formatCurrency(v)} />
                  <Bar dataKey="amount" name={t('Fines')} fill={colors[2]} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-white">{t('Overdue loans')}</h3>
        <DataTable
          data={r.overdue}
          columns={overdueCols}
          exportFileName="library-overdue"
          emptyTitle={t('No overdue loans')}
          emptyDescription={t('Every issued book is within its due date.')}
        />
      </div>
    </div>
  );
};
