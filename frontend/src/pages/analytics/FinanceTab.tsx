import React, { useState } from 'react';
import { AlertTriangle, Banknote, Percent, Wallet } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ErrorState, SkeletonStatGrid, StatCard } from '@/components/ui';
import { DataTable, type Column } from '@/components/DataTable/DataTable';
import { chartAxis, chartColors, chartGrid, chartTooltipStyle } from '@/lib/chartTheme';
import { formatCurrency, formatDate, formatNumber, useT } from '@/i18n';
import { useDefaulters, useFinanceAnalytics } from './analytics.queries';
import { ChartCard } from './analyticsUi';
import type { Defaulter, ReportFilters } from './analytics.types';

const METHOD_LABELS: Record<string, string> = {
  CASH: 'Cash',
  BKASH: 'bKash',
  NAGAD: 'Nagad',
  SSLCOMMERZ: 'SSLCommerz',
  BANK_TRANSFER: 'Bank transfer',
};

const compactMoney = (v: number) => (Math.abs(v) >= 100000 ? `${formatNumber(Math.round(v / 1000))}k` : formatNumber(v));

export const FinanceTab: React.FC<{ filters: ReportFilters; printMode?: boolean }> = ({ filters, printMode }) => {
  const t = useT();
  const colors = chartColors();
  const q = useFinanceAnalytics(filters);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(printMode ? 50 : 10);
  const defaulters = useDefaulters(filters, page, pageSize);
  const d = q.data;

  const defaulterColumns: Column<Defaulter>[] = [
    { key: 'name', header: t('Student'), primary: true, render: (r) => (
      <div className="min-w-0">
        <p className="font-medium text-slate-900 dark:text-white truncate">{r.name}</p>
        <p className="text-xs text-slate-500 dark:text-slate-400">{r.studentCode ?? '—'}</p>
      </div>
    ), exportValue: (r) => r.name },
    { key: 'studentCode', header: t('Student ID'), accessor: 'studentCode', defaultHidden: true },
    { key: 'class', header: t('Class'), render: (r) => [r.className, r.sectionName].filter(Boolean).join(' · ') || '—', exportValue: (r) => [r.className, r.sectionName].filter(Boolean).join(' ') },
    { key: 'phone', header: t('Phone'), accessor: 'phone', hideOnMobile: true },
    { key: 'overdueAmount', header: t('Overdue'), align: 'right', sortable: true, render: (r) => formatCurrency(r.overdueAmount), exportValue: (r) => r.overdueAmount },
    { key: 'overdueInvoices', header: t('Invoices'), align: 'right', hideOnMobile: true, accessor: 'overdueInvoices' },
    { key: 'oldestDueDate', header: t('Oldest due'), hideOnMobile: true, render: (r) => (r.oldestDueDate ? formatDate(r.oldestDueDate) : '—'), exportValue: (r) => r.oldestDueDate },
    { key: 'daysOverdue', header: t('Days overdue'), align: 'right', accessor: 'daysOverdue' },
  ];

  if (q.isError && !d) {
    return <ErrorState message={t('Could not load finance analytics.')} onRetry={() => q.refetch()} />;
  }

  const k = d?.kpis;
  const collectionsData = (d?.collections ?? []).map((c) => ({
    ...c,
    label: d?.granularity === 'month' ? c.period : formatDate(c.period),
  }));

  return (
    <div className="space-y-4">
      {q.isLoading || !k ? (
        <SkeletonStatGrid count={4} />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <StatCard label={t('Collected')} value={formatCurrency(k.totalCollected)} icon={<Banknote />} tone="success" hint={t('{n} payments', { n: formatNumber(k.paymentsCount) })} />
          <StatCard label={t('Collection rate')} value={`${formatNumber(k.collectionRate)}%`} icon={<Percent />} tone="info" hint={t('of {amount} due in range', { amount: formatCurrency(k.billedDueInRange) })} />
          <StatCard label={t('Outstanding (today)')} value={formatCurrency(k.totalOutstanding)} icon={<Wallet />} tone="accent" />
          <StatCard label={t('Overdue (today)')} value={formatCurrency(k.totalOverdue)} icon={<AlertTriangle />} tone="danger" hint={t('{n} students', { n: formatNumber(k.defaulterCount) })} />
        </div>
      )}

      <ChartCard
        title={d?.granularity === 'month' ? t('Collections by month') : t('Collections by day')}
        isLoading={q.isLoading}
        isEmpty={!!d && d.kpis.paymentsCount === 0}
        emptyTitle={t('No payments in this period')}
      >
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={collectionsData}>
            <CartesianGrid {...chartGrid} />
            <XAxis dataKey="label" {...chartAxis} minTickGap={16} />
            <YAxis {...chartAxis} tickFormatter={compactMoney} width={56} />
            <Tooltip contentStyle={chartTooltipStyle} formatter={(v: number) => formatCurrency(v)} />
            <Bar dataKey="amount" name={t('Collected')} fill={colors[0]} radius={[4, 4, 0, 0]} isAnimationActive={!printMode} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title={t('By payment method')} isLoading={q.isLoading} isEmpty={!!d && d.byMethod.length === 0}>
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie
                data={(d?.byMethod ?? []).map((m) => ({ ...m, label: t(METHOD_LABELS[m.method] ?? m.method) }))}
                dataKey="amount"
                nameKey="label"
                innerRadius="55%"
                outerRadius="80%"
                paddingAngle={2}
                isAnimationActive={!printMode}
              >
                {(d?.byMethod ?? []).map((m, i) => (
                  <Cell key={m.method} fill={colors[i % colors.length]} />
                ))}
              </Pie>
              <Tooltip contentStyle={chartTooltipStyle} formatter={(v: number) => formatCurrency(v)} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title={t('Outstanding aging')}
          description={d ? t('As of {date}', { date: formatDate(d.aging.asOf) }) : undefined}
          isLoading={q.isLoading}
          isEmpty={!!d && d.aging.totalOutstanding === 0}
          emptyTitle={t('Nothing outstanding')}
        >
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={(d?.aging.buckets ?? []).map((b) => ({ ...b, fullLabel: t(b.label), label: b.bucket === 'current' ? t('Not due') : b.bucket }))}>
              <CartesianGrid {...chartGrid} />
              <XAxis dataKey="label" {...chartAxis} />
              <YAxis {...chartAxis} tickFormatter={compactMoney} width={56} />
              <Tooltip contentStyle={chartTooltipStyle} formatter={(v: number) => formatCurrency(v)} labelFormatter={(l, p) => (p?.[0]?.payload?.fullLabel as string) ?? l} />
              <Bar dataKey="amount" name={t('Outstanding')} radius={[4, 4, 0, 0]} isAnimationActive={!printMode}>
                {(d?.aging.buckets ?? []).map((b, i) => (
                  <Cell key={b.bucket} fill={i === 0 ? colors[4] : colors[i === 4 ? 5 : 2]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <ChartCard
        title={t('By fee head')}
        description={t('Billed = dues falling in the range; collected = payments in the range split across invoice lines.')}
        isLoading={q.isLoading}
        isEmpty={!!d && d.byFeeHead.length === 0}
        height={300}
      >
        <ResponsiveContainer width="100%" height={Math.max(220, (d?.byFeeHead.length ?? 0) * 44)}>
          <BarChart data={d?.byFeeHead ?? []} layout="vertical" margin={{ left: 8 }}>
            <CartesianGrid {...chartGrid} horizontal={false} vertical />
            <XAxis type="number" {...chartAxis} tickFormatter={compactMoney} />
            <YAxis type="category" dataKey="name" {...chartAxis} width={110} />
            <Tooltip contentStyle={chartTooltipStyle} formatter={(v: number) => formatCurrency(v)} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="billed" name={t('Billed')} fill={colors[1]} radius={[0, 4, 4, 0]} isAnimationActive={!printMode} />
            <Bar dataKey="collected" name={t('Collected')} fill={colors[3]} radius={[0, 4, 4, 0]} isAnimationActive={!printMode} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <div className="glass-card p-4 sm:p-6 space-y-3 break-inside-avoid">
        <div>
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">{t('Top defaulters')}</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">{t('Students with overdue balances, largest first.')}</p>
        </div>
        {defaulters.isError ? (
          <ErrorState compact message={t('Could not load defaulters.')} onRetry={() => defaulters.refetch()} />
        ) : (
          <DataTable
            data={defaulters.data?.items ?? []}
            columns={defaulterColumns}
            isLoading={defaulters.isLoading}
            serverPagination
            totalCount={defaulters.data?.meta.total ?? 0}
            page={page}
            pageSize={pageSize}
            onPageChange={setPage}
            onPageSizeChange={(s) => {
              setPageSize(s);
              setPage(1);
            }}
            exportFileName="top-defaulters"
            emptyTitle={t('No overdue balances')}
            emptyDescription={t('No student in these filters has an overdue invoice.')}
          />
        )}
      </div>
    </div>
  );
};
