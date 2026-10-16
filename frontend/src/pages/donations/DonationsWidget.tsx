import React from 'react';
import { Link } from 'react-router-dom';
import { HandHeart } from 'lucide-react';
import { Card, CardHeader, SkeletonText } from '@/components/ui';
import { ModuleGate } from '@/components/common/ModuleGate';
import { formatDate, formatNumber, useT } from '@/i18n';
import { MODULE_KEY, useDonationSummary } from './donations.api';
import { Money, useBi } from './shared';

/**
 * Dashboard widget (admin / accountant): this month's donations and the
 * Zakat balance. Renders nothing while the Donations module is off.
 */
const Inner: React.FC = () => {
  const t = useT();
  const bi = useBi();
  const q = useDonationSummary();
  return (
    <Card>
      <CardHeader
        icon={<HandHeart className="w-5 h-5" />}
        title={t('Donations')}
        actions={<Link to="/donations" className="text-sm font-semibold text-primary-700 dark:text-primary-400 hover:underline">{t('Open')}</Link>}
      />
      {q.isLoading ? <SkeletonText lines={3} /> : !q.data ? (
        <p className="text-sm text-slate-500 mt-3">{t('Could not load donations')}</p>
      ) : (
        <div className="mt-3 space-y-4">
          <dl className="grid grid-cols-2 gap-3">
            <div>
              <dt className="text-xs text-slate-500 dark:text-slate-400">{t('This month')}</dt>
              <dd className="text-xl font-bold"><Money value={q.data.thisMonth.total} /></dd>
              <dd className="text-xs text-slate-500">{t('{n} donations', { n: formatNumber(q.data.thisMonth.count) })}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500 dark:text-slate-400">{t('Zakat balance')}</dt>
              <dd className="text-xl font-bold text-primary-700 dark:text-primary-400"><Money value={q.data.zakat.balance} /></dd>
              {q.data.pledgesDueThisMonth > 0 && <dd className="text-xs text-slate-500">{t('{n} pledges due this month', { n: formatNumber(q.data.pledgesDueThisMonth) })}</dd>}
            </div>
          </dl>
          {q.data.recent.length > 0 && (
            <ul className="divide-y divide-slate-100 dark:divide-white/6 text-sm">
              {q.data.recent.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-2 py-2">
                  <span className="min-w-0 truncate">{r.donorName || t('Anonymous')} · <span className="text-slate-500">{bi(r.fund.name, r.fund.nameBn)}</span></span>
                  <span className="shrink-0 tabular-nums"><Money value={r.amount} /> <span className="text-xs text-slate-500">{formatDate(r.paidAt)}</span></span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Card>
  );
};

const DonationsWidget: React.FC = () => (
  <ModuleGate module={MODULE_KEY}>
    <Inner />
  </ModuleGate>
);

export default DonationsWidget;
