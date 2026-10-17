import React, { useState } from 'react';
import toast from 'react-hot-toast';
import { Download } from 'lucide-react';
import { Alert, Button, ErrorState, Select, SkeletonStatGrid, StatCard } from '@/components/ui';
import { formatNumber, useT } from '@/i18n';
import { downloadReportCsv, useCrmReport, type GroupBy } from './crm.api';
import { barWidth } from './crm.logic';
import { SOURCE_OPTIONS } from './enquiries.types';

/** Funnel by stage + conversion by source / class / owner / month, with CSV export. */
export default function ConversionReport() {
  const t = useT();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [groupBy, setGroupBy] = useState<GroupBy>('source');
  const params = { from: from || undefined, to: to || undefined, groupBy };
  const { data, isLoading, isError, refetch } = useCrmReport(params);
  const [downloading, setDownloading] = useState(false);

  const label = (key: string, fallback: string) => {
    if (groupBy === 'source') return t(SOURCE_OPTIONS.find((o) => o.value === key)?.label ?? fallback);
    if (key === '—' || key === 'UNKNOWN') return t('Not set');
    return fallback;
  };

  const download = async () => {
    setDownloading(true);
    try {
      await downloadReportCsv(params);
    } catch {
      toast.error(t('Could not download the CSV'));
    } finally {
      setDownloading(false);
    }
  };

  const max = data?.funnel.total ?? 0;
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
          {t('From')}
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="input-field mt-1 h-9" />
        </label>
        <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
          {t('To')}
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="input-field mt-1 h-9" />
        </label>
        <Select
          label={t('Group by')}
          value={groupBy}
          onChange={(e) => setGroupBy(e.target.value as GroupBy)}
          containerClassName="w-40"
          options={[
            { value: 'source', label: t('Source') },
            { value: 'class', label: t('Class') },
            { value: 'owner', label: t('Owner') },
            { value: 'month', label: t('Month') },
          ]}
        />
        <Button variant="secondary" leftIcon={<Download className="w-4 h-4" />} isLoading={downloading} onClick={download}>
          {t('Download CSV')}
        </Button>
      </div>

      {isError ? (
        <ErrorState message={t('Could not load the report.')} onRetry={() => refetch()} />
      ) : isLoading || !data ? (
        <SkeletonStatGrid count={4} />
      ) : (
        <>
          {data.truncated && <Alert tone="warning">{t('Only the first 20,000 enquiries in this range are counted. Narrow the dates for exact numbers.')}</Alert>}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatCard label={t('Enquiries')} value={formatNumber(data.overall.total)} tone="primary" />
            <StatCard label={t('Admitted')} value={formatNumber(data.overall.won)} tone="success" />
            <StatCard label={t('Conversion rate')} value={`${formatNumber(data.overall.conversionRate)}%`} tone="warning" />
            <StatCard label={t('Avg days to admit')} value={data.overall.avgDaysToAdmit === null ? '—' : formatNumber(data.overall.avgDaysToAdmit)} tone="info" />
          </div>

          <section className="glass-card rounded-2xl p-4 space-y-3">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-50">{t('Funnel by stage')}</h3>
            <p className="text-xs text-slate-600 dark:text-slate-400">{t('How many enquiries reached each stage (including ones that moved further).')}</p>
            <ul className="space-y-2">
              {data.funnel.steps.map((s) => {
                const color = data.stages.find((x) => x.id === s.stageId)?.color ?? '#64748b';
                return (
                  <li key={s.stageId}>
                    <div className="flex items-center justify-between text-xs text-slate-700 dark:text-slate-300">
                      <span className="font-semibold">{s.name}</span>
                      <span className="tabular-nums">
                        {formatNumber(s.reached)} · {formatNumber(s.rate)}%
                      </span>
                    </div>
                    <div className="h-3 rounded-full bg-slate-100 dark:bg-white/6 overflow-hidden" role="presentation">
                      <div className="h-full rounded-full" style={{ width: `${barWidth(s.reached, max)}%`, background: color }} />
                    </div>
                  </li>
                );
              })}
              <li className="text-xs text-slate-600 dark:text-slate-400">{t('Lost: {n}', { n: formatNumber(data.funnel.lost) })}</li>
            </ul>
          </section>

          <section className="glass-card rounded-2xl p-4 overflow-x-auto">
            <table className="w-full text-sm">
              <caption className="sr-only">{t('Conversion by group')}</caption>
              <thead>
                <tr className="text-left text-xs text-slate-600 dark:text-slate-400 border-b border-slate-200 dark:border-white/10">
                  <th scope="col" className="py-2 pr-3">{t(groupBy === 'source' ? 'Source' : groupBy === 'class' ? 'Class' : groupBy === 'owner' ? 'Owner' : 'Month')}</th>
                  <th scope="col" className="py-2 px-2 text-right">{t('Enquiries')}</th>
                  <th scope="col" className="py-2 px-2 text-right">{t('Admitted')}</th>
                  <th scope="col" className="py-2 px-2 text-right hidden sm:table-cell">{t('Lost')}</th>
                  <th scope="col" className="py-2 px-2 text-right">{t('Rate')}</th>
                  <th scope="col" className="py-2 pl-2 text-right hidden sm:table-cell">{t('Avg days')}</th>
                </tr>
              </thead>
              <tbody>
                {data.groups.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-4 text-center text-slate-600">{t('No enquiries in this range.')}</td>
                  </tr>
                ) : (
                  data.groups.map((g) => (
                    <tr key={g.key || 'none'} className="border-b border-slate-100 dark:border-white/6">
                      <th scope="row" className="py-2 pr-3 text-left font-medium text-slate-900 dark:text-slate-50">{label(g.key, g.label)}</th>
                      <td className="py-2 px-2 text-right tabular-nums">{formatNumber(g.total)}</td>
                      <td className="py-2 px-2 text-right tabular-nums">{formatNumber(g.won)}</td>
                      <td className="py-2 px-2 text-right tabular-nums hidden sm:table-cell">{formatNumber(g.lost)}</td>
                      <td className="py-2 px-2 text-right tabular-nums">{formatNumber(g.conversionRate)}%</td>
                      <td className="py-2 pl-2 text-right tabular-nums hidden sm:table-cell">{g.avgDaysToAdmit === null ? '—' : formatNumber(g.avgDaysToAdmit)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </section>
        </>
      )}
    </div>
  );
}
