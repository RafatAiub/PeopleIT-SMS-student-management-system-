import React, { useState } from 'react';
import { Card, Drawer, ErrorState, PageHeader, SkeletonStatGrid } from '@/components/ui';
import { DataTable, type Column } from '@/components/DataTable/DataTable';
import { formatCurrency, formatNumber, useT } from '@/i18n';
import { currentMonth, errMsg, usePlatformUsage, type Metric, type PlatformUsage } from './usage.api';
import { EstimateNotice, MonthPicker, UsageBreakdown, UsageStatGrid } from './UsageShared';

type Row = PlatformUsage['institutions'][number] & { id: string };

const units = (r: Row, m: Metric) => r.items.find((i) => i.metric === m)?.billableUnits ?? 0;

/**
 * Cross-tenant usage & estimated cost. Route: /super-admin/usage
 * (SUPER_ADMIN only — mirrors GET /api/v1/usage/platform/summary).
 */
const PlatformUsageReport: React.FC = () => {
  const t = useT();
  const [month, setMonth] = useState(currentMonth());
  const [selected, setSelected] = useState<Row | null>(null);
  const query = usePlatformUsage(month);
  const rows: Row[] = (query.data?.institutions ?? []).map((r) => ({ ...r, id: r.institutionId }));

  const columns: Column<Row>[] = [
    { key: 'institutionName', header: t('Institution'), accessor: 'institutionName', primary: true },
    { key: 'sms', header: t('SMS'), align: 'right', render: (r) => formatNumber(units(r, 'SMS')), exportValue: (r) => units(r, 'SMS') },
    { key: 'email', header: t('Email'), align: 'right', render: (r) => formatNumber(units(r, 'EMAIL')), exportValue: (r) => units(r, 'EMAIL') },
    { key: 'ai', header: t('AI calls'), align: 'right', render: (r) => formatNumber(units(r, 'AI_CALL')), exportValue: (r) => units(r, 'AI_CALL') },
    {
      key: 'cost',
      header: t('Est. cost'),
      align: 'right',
      render: (r) => (r.estimatedTotalBdt !== null ? <span className="font-semibold tabular-nums">{formatCurrency(r.estimatedTotalBdt, { decimals: 2 })}</span> : '—'),
      exportValue: (r) => r.estimatedTotalBdt ?? '',
    },
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        title={t('Platform usage & costs')}
        description={t('Metered usage across every institution, with estimated costs.')}
        breadcrumbs={[{ label: t('Super admin') }, { label: t('Usage') }]}
        actions={<MonthPicker value={month} onChange={setMonth} />}
      />
      {query.isLoading ? (
        <SkeletonStatGrid count={4} />
      ) : query.isError || !query.data ? (
        <ErrorState message={errMsg(query.error, t('Could not load usage.'))} onRetry={() => query.refetch()} />
      ) : (
        <>
          <EstimateNotice unpriced={query.data.unpricedMetrics} schemaMissing={query.data.usageSchemaMissing} />
          <UsageStatGrid lines={query.data.totals} />
          <Card>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-3">{t('Platform totals for {month}', { month: query.data.month })}</h2>
            <UsageBreakdown lines={query.data.totals} />
          </Card>
          <DataTable
            data={rows}
            columns={columns}
            onRowClick={setSelected}
            exportFileName={`usage-${query.data.month}`}
            emptyTitle={t('No usage this month')}
            emptyDescription={t('No institution sent SMS/email or used AI in this month.')}
          />
        </>
      )}
      <Drawer isOpen={!!selected} onClose={() => setSelected(null)} title={selected?.institutionName} description={query.data?.month} width="lg">
        {selected && <UsageBreakdown lines={selected} />}
      </Drawer>
    </div>
  );
};

export default PlatformUsageReport;
