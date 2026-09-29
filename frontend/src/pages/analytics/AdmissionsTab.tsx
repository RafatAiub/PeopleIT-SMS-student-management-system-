import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ClipboardList, FileCheck2, Percent, UserPlus } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Button, ErrorState, SkeletonStatGrid, StatCard } from '@/components/ui';
import { DataTable, type Column } from '@/components/DataTable/DataTable';
import { chartAxis, chartColors, chartGrid, chartTooltipStyle } from '@/lib/chartTheme';
import { formatNumber, useT } from '@/i18n';
// Reuses the Admissions CRM funnel endpoint (/enquiries/funnel) rather than re-implementing it.
import { useEnquiryFunnel } from '../admissions/enquiries.queries';
import { ChartCard } from './analyticsUi';
import { effectiveRange } from './analyticsRange';
import type { ReportFilters } from './analytics.types';

const STAGES = ['NEW', 'CONTACTED', 'VISITED', 'APPLIED', 'ENROLLED', 'LOST'] as const;
const STAGE_LABELS: Record<(typeof STAGES)[number], string> = {
  NEW: 'New',
  CONTACTED: 'Contacted',
  VISITED: 'Visited',
  APPLIED: 'Applied',
  ENROLLED: 'Enrolled',
  LOST: 'Lost',
};

export const AdmissionsTab: React.FC<{ filters: ReportFilters; printMode?: boolean }> = ({ filters, printMode }) => {
  const t = useT();
  const colors = chartColors();
  const navigate = useNavigate();
  const range = effectiveRange(filters);
  const funnel = useEnquiryFunnel({ from: range.from, to: range.to ? `${range.to}T23:59:59.999Z` : undefined });
  const d = funnel.data;

  if (funnel.isError && !d) {
    return <ErrorState message={t('Could not load the admissions funnel.')} onRetry={() => funnel.refetch()} />;
  }

  const stageRows = STAGES.map((s) => ({ id: s, stage: t(STAGE_LABELS[s]), count: d?.byStatus[s] ?? 0 }));
  const columns: Column<(typeof stageRows)[number]>[] = [
    { key: 'stage', header: t('Stage'), primary: true, accessor: 'stage' },
    { key: 'count', header: t('Enquiries'), align: 'right', accessor: 'count' },
    {
      key: 'share',
      header: t('Share'),
      align: 'right',
      render: (r) => (d && d.enquiries > 0 ? `${Math.round((r.count / d.enquiries) * 1000) / 10}%` : '—'),
      exportValue: (r) => (d && d.enquiries > 0 ? Math.round((r.count / d.enquiries) * 1000) / 10 : null),
    },
  ];

  return (
    <div className="space-y-4">
      {funnel.isLoading || !d ? (
        <SkeletonStatGrid count={4} />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <StatCard label={t('Enquiries')} value={formatNumber(d.enquiries)} icon={<ClipboardList />} tone="primary" hint={t('{n} open', { n: formatNumber(d.open) })} />
          <StatCard label={t('Applications')} value={formatNumber(d.applications.total)} icon={<FileCheck2 />} tone="info" hint={t('{n} pending review', { n: formatNumber(d.applications.pending) })} />
          <StatCard label={t('Enrolled')} value={formatNumber(d.enrolled)} icon={<UserPlus />} tone="success" />
          <StatCard label={t('Conversion rate')} value={`${formatNumber(d.conversionRate)}%`} icon={<Percent />} tone="accent" hint={t('Application rate {n}%', { n: d.applicationRate })} />
        </div>
      )}

      <ChartCard
        title={t('Enquiry pipeline')}
        isLoading={funnel.isLoading}
        isEmpty={!!d && d.enquiries === 0}
        emptyTitle={t('No enquiries in this period')}
        actions={
          <Button type="button" variant="link" size="sm" onClick={() => navigate('/admissions/enquiries')}>
            {t('Open Admissions CRM')}
          </Button>
        }
      >
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={stageRows}>
            <CartesianGrid {...chartGrid} />
            <XAxis dataKey="stage" {...chartAxis} />
            <YAxis {...chartAxis} allowDecimals={false} width={40} />
            <Tooltip contentStyle={chartTooltipStyle} />
            <Bar dataKey="count" name={t('Enquiries')} radius={[4, 4, 0, 0]} isAnimationActive={!printMode}>
              {stageRows.map((r, i) => (
                <Cell key={r.id} fill={r.id === 'LOST' ? colors[4] : colors[i % 4]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <div className="glass-card p-4 sm:p-6 space-y-3 break-inside-avoid">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-white">{t('Funnel by stage')}</h3>
        <DataTable data={stageRows} columns={columns} isLoading={funnel.isLoading} exportFileName="admissions-funnel" emptyTitle={t('No enquiries')} />
      </div>
    </div>
  );
};
