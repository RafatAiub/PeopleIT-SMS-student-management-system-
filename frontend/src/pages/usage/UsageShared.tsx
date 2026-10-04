import React from 'react';
import { Bot, HardDrive, Mail, MessageSquare } from 'lucide-react';
import { Alert, Input, StatCard } from '@/components/ui';
import { formatCurrency, formatNumber, useT } from '@/i18n';
import { METRIC_LABEL, type Metric, type UsageLines } from './usage.api';

const ICON: Record<Metric, React.ReactNode> = {
  SMS: <MessageSquare />,
  EMAIL: <Mail />,
  AI_CALL: <Bot />,
  STORAGE_MB: <HardDrive />,
};

export const MonthPicker: React.FC<{ value: string; onChange: (v: string) => void }> = ({ value, onChange }) => {
  const t = useT();
  return (
    <Input
      type="month"
      aria-label={t('Month')}
      value={value}
      max={new Date().toISOString().slice(0, 7)}
      onChange={(e) => e.target.value && onChange(e.target.value)}
      containerClassName="w-44"
    />
  );
};

export const UsageStatGrid: React.FC<{ lines: UsageLines }> = ({ lines }) => {
  const t = useT();
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {lines.items.map((l) => (
        <StatCard
          key={l.metric}
          label={t(METRIC_LABEL[l.metric])}
          value={formatNumber(l.billableUnits)}
          icon={ICON[l.metric]}
          tone="info"
          hint={
            l.estimatedCostBdt !== null
              ? t('≈ {cost} (estimate)', { cost: formatCurrency(l.estimatedCostBdt) })
              : l.notBilled
                ? t('{n} not billed (demo / skipped)', { n: formatNumber(l.notBilled) })
                : t('No unit price set')
          }
        />
      ))}
    </div>
  );
};

/** Per-metric breakdown table (units, not billed, unit price, estimated cost). */
export const UsageBreakdown: React.FC<{ lines: UsageLines }> = ({ lines }) => {
  const t = useT();
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-white/10">
            <th className="py-2 pr-3 font-medium">{t('Metric')}</th>
            <th className="py-2 px-3 font-medium text-right">{t('Billable units')}</th>
            <th className="py-2 px-3 font-medium text-right">{t('Not billed')}</th>
            <th className="py-2 px-3 font-medium text-right">{t('Unit price')}</th>
            <th className="py-2 pl-3 font-medium text-right">{t('Estimated cost')}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-white/5">
          {lines.items.map((l) => (
            <tr key={l.metric}>
              <td className="py-2 pr-3">{t(METRIC_LABEL[l.metric])}</td>
              <td className="py-2 px-3 text-right tabular-nums">{formatNumber(l.billableUnits)}</td>
              <td className="py-2 px-3 text-right tabular-nums text-slate-500">{formatNumber(l.notBilled)}</td>
              <td className="py-2 px-3 text-right tabular-nums">{l.unitPrice !== null ? formatCurrency(l.unitPrice, { decimals: 2 }) : '—'}</td>
              <td className="py-2 pl-3 text-right tabular-nums font-medium">{l.estimatedCostBdt !== null ? formatCurrency(l.estimatedCostBdt, { decimals: 2 }) : '—'}</td>
            </tr>
          ))}
          <tr className="font-semibold">
            <td className="py-2 pr-3" colSpan={4}>
              {t('Estimated total')}
            </td>
            <td className="py-2 pl-3 text-right tabular-nums">{lines.estimatedTotalBdt !== null ? formatCurrency(lines.estimatedTotalBdt, { decimals: 2 }) : '—'}</td>
          </tr>
        </tbody>
      </table>
      <p className="mt-2 text-xs text-slate-500">{t('In-app notifications this month: {n} (free)', { n: formatNumber(lines.inAppNotifications) })}</p>
    </div>
  );
};

export const EstimateNotice: React.FC<{ unpriced: Metric[]; schemaMissing: boolean }> = ({ unpriced, schemaMissing }) => {
  const t = useT();
  return (
    <>
      <Alert tone="info" title={t('Costs are estimates')}>
        {t('Figures are calculated from unit prices set by the platform and may differ from provider invoices. Demo-mode and skipped messages are not billed.')}
        {unpriced.length > 0 && (
          <span className="block mt-1">
            {t('No unit price configured for: {list}.', { list: unpriced.map((m) => t(METRIC_LABEL[m])).join(', ') })}
          </span>
        )}
      </Alert>
      {schemaMissing && (
        <Alert tone="warning" title={t('Usage records unavailable')}>
          {t('The usage table has not been created yet (database migration pending). SMS and email counts below come from delivery logs only.')}
        </Alert>
      )}
    </>
  );
};
