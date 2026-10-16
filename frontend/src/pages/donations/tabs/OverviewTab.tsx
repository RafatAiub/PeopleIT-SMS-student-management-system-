import React from 'react';
import { CalendarClock, HandCoins, Landmark, Scale } from 'lucide-react';
import { Card, CardHeader, ErrorState, Input, SkeletonStatGrid, SkeletonText, StatCard, Table, TableCell, TableHead, TableHeaderCell, TableRow } from '@/components/ui';
import { EmptyState } from '@/components/common/EmptyState';
import { formatNumber, useT } from '@/i18n';
import { useDonationReport, useDonationSummary } from '../donations.api';
import { FundTypeBadge, GoalBar, Money, useBi } from '../shared';

const OverviewTab: React.FC = () => {
  const t = useT();
  const bi = useBi();
  const [from, setFrom] = React.useState('');
  const [to, setTo] = React.useState('');
  const summary = useDonationSummary();
  const report = useDonationReport({ from: from || undefined, to: to ? `${to}T23:59:59.999Z` : undefined });

  if (summary.isLoading || report.isLoading) return <div className="space-y-6"><SkeletonStatGrid count={4} /><SkeletonText lines={6} /></div>;
  if (summary.isError || report.isError || !summary.data || !report.data) {
    return <ErrorState title={t('Could not load donation reports')} onRetry={() => { void summary.refetch(); void report.refetch(); }} />;
  }
  const s = summary.data;
  const r = report.data;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard label={t('This month')} value={<Money value={s.thisMonth.total} />} hint={t('{n} donations', { n: formatNumber(s.thisMonth.count) })} icon={<HandCoins className="w-5 h-5" />} />
        <StatCard label={t('Zakat balance')} value={<Money value={s.zakat.balance} />} hint={t('Collected minus distributed')} icon={<Scale className="w-5 h-5" />} tone="accent" />
        <StatCard label={t('Selected period')} value={<Money value={r.total} />} hint={t('{n} donations', { n: formatNumber(r.count) })} icon={<Landmark className="w-5 h-5" />} tone="info" />
        <StatCard label={t('Pledges due this month')} value={formatNumber(s.pledgesDueThisMonth)} icon={<CalendarClock className="w-5 h-5" />} tone="warning" />
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <Input type="date" label={t('From')} value={from} onChange={(e) => setFrom(e.target.value)} containerClassName="w-44" />
        <Input type="date" label={t('To')} value={to} onChange={(e) => setTo(e.target.value)} containerClassName="w-44" />
      </div>

      <Card>
        <CardHeader title={t('Zakat: collected vs distributed')} description={t('Zakat must reach eligible recipients — keep the balance moving.')} />
        <dl className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-4">
          <div><dt className="text-xs text-slate-500 dark:text-slate-400">{t('Collected (period)')}</dt><dd className="text-xl font-bold"><Money value={r.zakat.collected} /></dd></div>
          <div><dt className="text-xs text-slate-500 dark:text-slate-400">{t('Distributed (period)')}</dt><dd className="text-xl font-bold"><Money value={r.zakat.distributed} /></dd></div>
          <div><dt className="text-xs text-slate-500 dark:text-slate-400">{t('Balance to distribute (all time)')}</dt><dd className="text-xl font-bold text-primary-700 dark:text-primary-400"><Money value={r.zakat.balance} /></dd></div>
        </dl>
      </Card>

      <Card>
        <CardHeader title={t('Fund balances')} description={t('All time: paid donations minus payouts.')} />
        {r.fundBalances.length === 0 ? (
          <EmptyState compact title={t('No funds yet')} description={t('Create a fund (e.g. Zakat, Sadaqah) in the Funds tab.')} />
        ) : (
          <div className="overflow-x-auto mt-3">
            <Table>
              <TableHead>
                <tr>
                  <TableHeaderCell>{t('Fund')}</TableHeaderCell>
                  <TableHeaderCell className="text-right">{t('Collected')}</TableHeaderCell>
                  <TableHeaderCell className="text-right">{t('Paid out')}</TableHeaderCell>
                  <TableHeaderCell className="text-right">{t('Balance')}</TableHeaderCell>
                </tr>
              </TableHead>
              <tbody>
                {r.fundBalances.map((f, i) => (
                  <TableRow key={f.fundId} index={i}>
                    <TableCell>
                      <div className="flex flex-col gap-1.5 min-w-40">
                        <span className="flex items-center gap-2 font-medium">{bi(f.name, f.nameBn)} <FundTypeBadge type={f.type} /></span>
                        <GoalBar progress={f.progress} label={t('Goal progress')} />
                      </div>
                    </TableCell>
                    <TableCell className="text-right"><Money value={f.collected} /></TableCell>
                    <TableCell className="text-right"><Money value={f.disbursed} /></TableCell>
                    <TableCell className="text-right font-semibold"><Money value={f.balance} /></TableCell>
                  </TableRow>
                ))}
              </tbody>
            </Table>
          </div>
        )}
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader title={t('By payment method')} />
          <Table className="mt-3">
            <TableHead><tr><TableHeaderCell>{t('Method')}</TableHeaderCell><TableHeaderCell className="text-right">{t('Count')}</TableHeaderCell><TableHeaderCell className="text-right">{t('Total')}</TableHeaderCell></tr></TableHead>
            <tbody>
              {r.byMethod.length === 0 ? (
                <tr><TableCell colSpan={3} className="text-center text-slate-500">{t('No donations in this period')}</TableCell></tr>
              ) : r.byMethod.map((m, i) => (
                <TableRow key={m.method} index={i}><TableCell>{t(m.label)}</TableCell><TableCell className="text-right tabular-nums">{formatNumber(m.count)}</TableCell><TableCell className="text-right"><Money value={m.total} /></TableCell></TableRow>
              ))}
            </tbody>
          </Table>
        </Card>
        <Card>
          <CardHeader title={t('By month')} />
          <Table className="mt-3">
            <TableHead><tr><TableHeaderCell>{t('Month')}</TableHeaderCell><TableHeaderCell className="text-right">{t('Count')}</TableHeaderCell><TableHeaderCell className="text-right">{t('Total')}</TableHeaderCell></tr></TableHead>
            <tbody>
              {r.byMonth.length === 0 ? (
                <tr><TableCell colSpan={3} className="text-center text-slate-500">{t('No donations in this period')}</TableCell></tr>
              ) : r.byMonth.map((m, i) => (
                <TableRow key={m.month} index={i}><TableCell>{m.month}</TableCell><TableCell className="text-right tabular-nums">{formatNumber(m.count)}</TableCell><TableCell className="text-right"><Money value={m.total} /></TableCell></TableRow>
              ))}
            </tbody>
          </Table>
        </Card>
      </div>
    </div>
  );
};

export default OverviewTab;
