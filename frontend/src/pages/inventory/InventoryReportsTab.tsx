import React, { useState } from 'react';
import { Boxes, Wallet, Wrench, Package, AlertTriangle } from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, PieChart, Pie, Cell, Legend } from 'recharts';
import { Card, CardHeader, Input, StatCard, SkeletonStatGrid, Skeleton, ErrorState, Badge, Alert } from '../../components/ui';
import { EmptyState } from '../../components/common/EmptyState';
import { DataTable, type Column } from '../../components/DataTable/DataTable';
import { chartColors, chartAxis, chartGrid, chartTooltipStyle } from '../../lib/chartTheme';
import { useT, formatCurrency, formatNumber } from '../../i18n';
import { useInventoryReport, type InventoryReport } from './inventory.api';

type ValRow = InventoryReport['stockValuation']['rows'][number] & { id: string };

const shortMonth = (period: string) => {
  const [y, m] = period.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleString('en', { month: 'short', year: '2-digit', timeZone: 'UTC' });
};

export const InventoryReportsTab: React.FC = () => {
  const t = useT();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const report = useInventoryReport(from, to);
  const colors = chartColors();

  const filters = (
    <div className="flex flex-wrap items-end gap-3">
      <Input label={t('From')} type="date" value={from} onChange={(e) => setFrom(e.target.value)} containerClassName="w-40" />
      <Input label={t('To')} type="date" value={to} onChange={(e) => setTo(e.target.value)} containerClassName="w-40" />
      <p className="text-xs text-slate-500 dark:text-slate-400 pb-2">{t('The date range applies to maintenance cost. Asset and stock values are as of today.')}</p>
    </div>
  );

  if (report.isLoading) {
    return (
      <div className="space-y-4">
        {filters}
        <SkeletonStatGrid count={4} />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Skeleton className="h-72" />
          <Skeleton className="h-72" />
        </div>
      </div>
    );
  }
  if (report.isError || !report.data) {
    return (
      <div className="space-y-4">
        {filters}
        <ErrorState message={t('Could not load inventory reports.')} onRetry={() => report.refetch()} />
      </div>
    );
  }

  const r = report.data;
  const valuationRows: ValRow[] = r.stockValuation.rows.map((x) => ({ ...x, id: x.stockItemId }));
  const valuationCols: Column<ValRow>[] = [
    { key: 'name', header: t('Item'), accessor: 'name', primary: true },
    { key: 'quantity', header: t('Qty'), align: 'right', exportValue: (x) => x.quantity, render: (x) => `${formatNumber(x.quantity)} ${x.unit}` },
    { key: 'avg', header: t('Avg. unit cost'), align: 'right', exportValue: (x) => x.averageUnitCost ?? '', render: (x) => (x.averageUnitCost === null ? '—' : formatCurrency(x.averageUnitCost)) },
    { key: 'value', header: t('Value'), align: 'right', exportValue: (x) => x.value ?? '', render: (x) => (x.value === null ? <span className="text-slate-400">{t('No cost data')}</span> : <span className="tabular-nums font-semibold">{formatCurrency(x.value)}</span>) },
  ];
  const hasAssets = r.totals.assetCount > 0;
  const hasMaint = r.maintenanceByMonth.some((m) => m.cost > 0);

  return (
    <div className="space-y-4">
      {filters}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatCard label={t('Assets')} value={formatNumber(r.totals.assetCount)} icon={<Boxes />} tone="primary" />
        <StatCard label={t('Asset value (cost)')} value={formatCurrency(r.totals.assetValue)} icon={<Wallet />} tone="info" />
        <StatCard label={t('Maintenance cost')} value={formatCurrency(r.totals.maintenanceCost)} icon={<Wrench />} tone="accent" hint={t('In selected range')} />
        <StatCard label={t('Stock value')} value={formatCurrency(r.totals.stockValue)} icon={<Package />} tone="success" hint={t('{n} items', { n: formatNumber(r.totals.stockItems) })} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader title={t('Asset value by category')} />
          {hasAssets ? (
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={r.assetValueByCategory} margin={{ left: 8, right: 8 }}>
                  <CartesianGrid {...chartGrid} />
                  <XAxis dataKey="category" {...chartAxis} interval={0} tickFormatter={(v: string) => (v.length > 10 ? `${v.slice(0, 9)}…` : v)} />
                  <YAxis {...chartAxis} width={70} tickFormatter={(v: number) => formatNumber(v)} />
                  <Tooltip contentStyle={chartTooltipStyle} formatter={(v: number) => formatCurrency(v)} />
                  <Bar dataKey="value" name={t('Value')} fill={colors[0]} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyState compact title={t('No assets yet')} description={t('Asset values appear once assets are recorded.')} />
          )}
        </Card>

        <Card>
          <CardHeader title={t('Assets by status')} />
          {hasAssets ? (
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={r.assetValueByStatus} dataKey="count" nameKey="status" innerRadius="50%" outerRadius="80%" paddingAngle={2}>
                    {r.assetValueByStatus.map((s, i) => <Cell key={s.status} fill={colors[i % colors.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={chartTooltipStyle} formatter={(v: number, _n, item) => [`${formatNumber(v)} · ${formatCurrency((item?.payload as { value: number }).value)}`, t('Assets')]} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyState compact title={t('No assets yet')} description={t('Status breakdown appears once assets are recorded.')} />
          )}
        </Card>
      </div>

      <Card>
        <CardHeader title={t('Maintenance cost by month')} />
        {hasMaint ? (
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={r.maintenanceByMonth.map((m) => ({ ...m, label: shortMonth(m.period) }))}>
                <CartesianGrid {...chartGrid} />
                <XAxis dataKey="label" {...chartAxis} />
                <YAxis {...chartAxis} width={70} tickFormatter={(v: number) => formatNumber(v)} />
                <Tooltip contentStyle={chartTooltipStyle} formatter={(v: number) => formatCurrency(v)} />
                <Bar dataKey="cost" name={t('Cost')} fill={colors[2]} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <EmptyState compact title={t('No maintenance cost in this range')} description={t('Costs from maintenance records appear here by month.')} />
        )}
      </Card>

      <Card>
        <CardHeader
          title={t('Low stock')}
          actions={r.totals.lowStockCount > 0 ? <Badge variant="danger" dot>{formatNumber(r.totals.lowStockCount)}</Badge> : undefined}
        />
        {r.lowStock.length === 0 ? (
          <EmptyState compact title={t('Nothing is low on stock')} description={t('Every item is above its reorder level.')} />
        ) : (
          <ul className="divide-y divide-slate-200 dark:divide-white/10">
            {r.lowStock.map((i) => (
              <li key={i.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span className="flex items-center gap-2 min-w-0">
                  <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                  <span className="truncate text-slate-900 dark:text-white">{i.name}</span>
                </span>
                <span className="tabular-nums text-red-600 dark:text-red-400 shrink-0">
                  {formatNumber(i.quantity)} / {formatNumber(i.reorderLevel)} {i.unit}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-white">{t('Stock valuation')}</h3>
        {r.stockValuation.unvaluedItems > 0 && (
          <Alert tone="info">{t('{n} item(s) in stock have no purchase cost recorded, so they are not included in the stock value.', { n: r.stockValuation.unvaluedItems })}</Alert>
        )}
        <DataTable
          data={valuationRows}
          columns={valuationCols}
          exportFileName="stock-valuation"
          emptyTitle={t('No stock items')}
          emptyDescription={t('Add stock items to see their valuation.')}
        />
        <p className="text-xs text-slate-500 dark:text-slate-400">{t('Valuation uses the weighted average cost of stock received with a unit cost.')}</p>
      </div>
    </div>
  );
};
