import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import toast from 'react-hot-toast';
import { AlertTriangle, Banknote, Percent, Receipt, RefreshCw } from 'lucide-react';
import { platformBillingApi } from '@/api/platformBilling.api';
import { Button, ErrorState, Skeleton, StatCard } from '@/components/ui';
import { formatCurrency, useT } from '@/i18n';
import { currentPeriod, periodLabel, shortPeriod } from '@/pages/billing/platform/platformBilling.logic';

// =============================================================================
// P1 — super-admin platform billing dashboard: this month billed / collected /
// outstanding / overdue, collection rate, last 12 months, top overdue schools.
// Lazy-loaded (recharts). Colours validated for CVD + contrast in both modes.
// =============================================================================

const COLORS = {
  light: { billed: '#1a6fa8', collected: '#c2550a' },
  dark: { billed: '#3d95cc', collected: '#d9692c' },
};

const isDark = () => typeof document !== 'undefined' && document.documentElement.classList.contains('dark');

const PlatformDashboardTab: React.FC<{ onOpenSchool?: (institutionId: string) => void }> = ({ onOpenSchool }) => {
  const t = useT();
  const qc = useQueryClient();
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: ['platform-dashboard'], queryFn: platformBillingApi.dashboard });
  const [generating, setGenerating] = useState(false);
  const [showTable, setShowTable] = useState(false);
  const palette = isDark() ? COLORS.dark : COLORS.light;

  const generateAll = async () => {
    setGenerating(true);
    try {
      const r = await platformBillingApi.generate({ period: currentPeriod() });
      toast.success(t('{created} new invoices, {existing} already existed', { created: r.created ?? 0, existing: r.existing ?? 0 }));
      qc.invalidateQueries({ queryKey: ['platform-dashboard'] });
      qc.invalidateQueries({ queryKey: ['platform-invoices'] });
      qc.invalidateQueries({ queryKey: ['platform-collections'] });
    } catch (err: any) {
      toast.error(err?.response?.data?.message || t('Could not generate invoices'));
    } finally {
      setGenerating(false);
    }
  };

  if (isLoading) return <Skeleton className="h-96 rounded-2xl" />;
  if (isError || !data) return <ErrorState onRetry={() => refetch()} message={t('Could not load the billing dashboard.')} />;

  const chart = data.months.map((m) => ({ ...m, label: shortPeriod(m.period) }));

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <p className="text-sm text-slate-600 dark:text-slate-300">
          {t('{month} · {n} schools billed monthly', { month: periodLabel(data.period), n: data.schoolsBilled })}
        </p>
        <Button leftIcon={<RefreshCw className="w-4 h-4" />} isLoading={generating} onClick={generateAll}>
          {t("Generate this month's invoices")}
        </Button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label={t('Billed this month')} value={formatCurrency(data.thisMonth.billed)} icon={<Receipt />} tone="primary" />
        <StatCard label={t('Collected this month')} value={formatCurrency(data.thisMonth.collected)} icon={<Banknote />} tone="success" />
        <StatCard label={t('Outstanding')} value={formatCurrency(data.outstanding)} icon={<AlertTriangle />} tone="warning" hint={t('{n} overdue invoices · {amount}', { n: data.overdueCount, amount: formatCurrency(data.overdueAmount) })} />
        <StatCard
          label={t('Collection rate')}
          value={data.thisMonth.collectionRate === null ? '—' : `${data.thisMonth.collectionRate}%`}
          icon={<Percent />}
          tone="info"
          hint={t("Paid or waived share of this month's bills")}
        />
      </div>

      <div className="glass-card rounded-2xl p-4 sm:p-5">
        <div className="flex items-center justify-between gap-2 mb-3">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">{t('Last 12 months: billed vs collected')}</h3>
          <Button variant="ghost" size="sm" onClick={() => setShowTable((v) => !v)} aria-pressed={showTable}>
            {showTable ? t('Show chart') : t('Show table')}
          </Button>
        </div>
        {showTable ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-500">
                  <th scope="col" className="py-2">{t('Month')}</th>
                  <th scope="col" className="py-2 text-right">{t('Billed')}</th>
                  <th scope="col" className="py-2 text-right">{t('Collected')}</th>
                </tr>
              </thead>
              <tbody>
                {data.months.map((m) => (
                  <tr key={m.period} className="border-t border-slate-100 dark:border-slate-800">
                    <td className="py-1.5">{periodLabel(m.period)}</td>
                    <td className="py-1.5 text-right tabular-nums">{formatCurrency(m.billed)}</td>
                    <td className="py-1.5 text-right tabular-nums">{formatCurrency(m.collected)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="h-72" role="img" aria-label={t('Bar chart of amounts billed and collected for each of the last 12 months')}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chart} margin={{ top: 8, right: 8, left: 0, bottom: 4 }} barGap={2}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" className="stroke-slate-200 dark:stroke-white/10" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} className="fill-slate-500" />
                <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={64} tickFormatter={(v: number) => formatCurrency(v)} />
                <Tooltip
                  cursor={{ fill: 'rgba(148,163,184,0.12)' }}
                  formatter={(v: number, name: string) => [formatCurrency(v), name]}
                  labelFormatter={(_l, p) => (p?.[0]?.payload?.period ? periodLabel(p[0].payload.period) : '')}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="billed" name={t('Billed')} fill={palette.billed} radius={[4, 4, 0, 0]} maxBarSize={18} />
                <Bar dataKey="collected" name={t('Collected')} fill={palette.collected} radius={[4, 4, 0, 0]} maxBarSize={18} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      <div className="glass-card rounded-2xl p-4 sm:p-5">
        <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-3">{t('Top overdue schools')}</h3>
        {data.topOverdue.length === 0 ? (
          <p className="text-sm text-slate-500">{t('No overdue schools. 🎉')}</p>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {data.topOverdue.map((s) => (
              <li key={s.institutionId}>
                <button
                  type="button"
                  onClick={() => onOpenSchool?.(s.institutionId)}
                  className="w-full py-2.5 flex items-center gap-3 text-left rounded-lg hover:bg-slate-50 dark:hover:bg-white/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-600"
                >
                  <span className="flex-1 min-w-0">
                    <span className="block font-semibold text-slate-900 dark:text-white truncate">{s.name}</span>
                    <span className="block text-xs text-slate-500">{t('{n} days overdue · {count} invoices', { n: s.maxDaysOverdue, count: s.invoices })}</span>
                  </span>
                  <span className="tabular-nums font-semibold text-rose-700 dark:text-rose-300">{formatCurrency(s.amountDue)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

export default PlatformDashboardTab;
