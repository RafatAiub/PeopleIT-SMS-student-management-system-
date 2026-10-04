import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Users, TrendingUp, DollarSign, Activity } from 'lucide-react';
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import apiClient from '@/api/client';
import { PageHeader, StatCard, SkeletonStatGrid, Skeleton, ErrorState, IncompleteNotice } from '@/components/ui';
import { DataTable, Column } from '@/components/DataTable/DataTable';
import { chartColors, chartAxis, chartGrid, chartTooltipStyle } from '@/lib/chartTheme';
import { useT, formatCurrency, formatNumber, formatDate } from '@/i18n';

interface DashboardStats {
  totalStudents: number;
  totalTeachers: number;
  totalRevenue: number;
  attendanceRate: number;
  attendanceTrend: number[];
  feeTrend: number[];
}

interface TrendRow {
  id: string;
  date: string;
  attendancePercent: number;
  feesCollected: number;
}

const REPORTS_DASHBOARD_KEY = 'reports-dashboard';

export default function Reports() {
  const t = useT();
  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: [REPORTS_DASHBOARD_KEY],
    queryFn: async (): Promise<DashboardStats> => {
      const res = await apiClient.get('/reports/dashboard');
      return res.data.data;
    },
  });

  // The trend arrays are the last 7 days ending today, in order (see
  // reports.repository.ts `getDashboardStats`) — derive real calendar-day
  // labels for each index rather than inventing any data.
  const trendRows: TrendRow[] = useMemo(() => {
    const attendanceTrend = data?.attendanceTrend ?? [];
    const feeTrend = data?.feeTrend ?? [];
    const len = Math.max(attendanceTrend.length, feeTrend.length);
    const rows: TrendRow[] = [];
    for (let i = 0; i < len; i++) {
      const offsetFromToday = len - 1 - i;
      const day = new Date();
      day.setDate(day.getDate() - offsetFromToday);
      rows.push({
        id: String(i),
        date: day.toISOString().slice(0, 10),
        attendancePercent: attendanceTrend[i] ?? 0,
        feesCollected: feeTrend[i] ?? 0,
      });
    }
    return rows;
  }, [data]);

  const chartData = useMemo(
    () => trendRows.map((r) => ({ ...r, label: formatDate(r.date) })),
    [trendRows]
  );

  const colors = chartColors();

  const trendColumns: Column<TrendRow>[] = [
    { key: 'date', header: 'Date', accessor: 'date', render: (r) => formatDate(r.date) },
    {
      key: 'attendancePercent',
      header: 'Attendance %',
      align: 'right',
      exportValue: (r) => r.attendancePercent,
      render: (r) => `${formatNumber(r.attendancePercent)}%`,
    },
    {
      key: 'feesCollected',
      header: 'Fees Collected',
      align: 'right',
      exportValue: (r) => r.feesCollected,
      render: (r) => formatCurrency(r.feesCollected),
    },
  ];

  if (isError) {
    return (
      <div className="space-y-6">
        <PageHeader title={t('Reports & Analytics')} description={t('Overview of attendance, fees, and performance trends.')} />
        <ErrorState message={t('Something went wrong while fetching the analytics data.')} onRetry={() => refetch()} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title={t('Reports & Analytics')} description={t('Overview of attendance, fees, and performance trends.')} />

      {isLoading ? (
        <SkeletonStatGrid count={4} />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label={t('Total Students')} value={formatNumber(data?.totalStudents ?? 0)} icon={<Users />} tone="primary" />
          <StatCard label={t('Average Attendance')} value={`${formatNumber(data?.attendanceRate ?? 0)}%`} icon={<TrendingUp />} tone="success" />
          <StatCard label={t('Total Revenue')} value={formatCurrency(data?.totalRevenue ?? 0)} icon={<DollarSign />} tone="accent" />
          <StatCard label={t('Active Teaching Staff')} value={formatNumber(data?.totalTeachers ?? 0)} icon={<Activity />} tone="info" />
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="glass-card p-4 sm:p-6">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-4">{t('Fee Collections (last 7 days)')}</h3>
          {isLoading ? (
            <Skeleton className="h-64 w-full" />
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={chartData}>
                <CartesianGrid {...chartGrid} />
                <XAxis dataKey="label" {...chartAxis} />
                <YAxis {...chartAxis} />
                <Tooltip contentStyle={chartTooltipStyle} formatter={(v: number) => formatCurrency(v)} />
                <Bar dataKey="feesCollected" name={t('Fees Collected')} fill={colors[0]} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="glass-card p-4 sm:p-6">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-4">{t('Attendance Trend (last 7 days)')}</h3>
          {isLoading ? (
            <Skeleton className="h-64 w-full" />
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={chartData}>
                <CartesianGrid {...chartGrid} />
                <XAxis dataKey="label" {...chartAxis} />
                <YAxis {...chartAxis} domain={[0, 100]} />
                <Tooltip contentStyle={chartTooltipStyle} formatter={(v: number) => `${v}%`} />
                <Line type="monotone" dataKey="attendancePercent" name={t('Attendance %')} stroke={colors[3]} strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      <div className="glass-card p-4 sm:p-6 space-y-3">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-white">{t('Daily Breakdown')}</h3>
        <DataTable
          data={trendRows}
          columns={trendColumns}
          isLoading={isLoading || isFetching}
          exportFileName="reports-daily-breakdown"
          emptyTitle={t('No data yet')}
          emptyDescription={t('Attendance and fee records will appear here once recorded.')}
        />
      </div>

      <IncompleteNotice reason={t('Branch, class, section and date-range filters need report endpoint parameters (planned).')} />
    </div>
  );
}
