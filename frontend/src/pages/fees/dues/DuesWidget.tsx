import React from 'react';
import { Link } from 'react-router-dom';
import { Wallet } from 'lucide-react';
import { Card, CardHeader, SkeletonText } from '@/components/ui';
import { formatCurrency, formatNumber, useT } from '@/i18n';
import { useDuesWidget } from './dues.api';
import { rateText } from './dues.logic';

// =============================================================================
// Admin dashboard widget: this month collected vs billed + top defaulter
// classes, linking to Fees → Dues. Renders nothing if the API fails.
// =============================================================================

export const DuesWidget: React.FC = () => {
  const t = useT();
  const q = useDuesWidget();
  if (q.isError) return null;
  const d = q.data;
  const pct = d && d.billedThisMonth > 0 ? Math.min(100, Math.round((d.collectedForThisMonth / d.billedThisMonth) * 100)) : 0;
  return (
    <Card>
      <CardHeader
        icon={<Wallet className="w-4 h-4" />}
        title={t('Fee collection this month')}
        actions={<Link to="/fees/dues" className="text-sm font-medium underline text-primary-700 dark:text-primary-300">{t('Open dues')}</Link>}
      />
      {!d ? <SkeletonText lines={4} /> : (
        <div className="space-y-3 text-sm">
          <div>
            <div className="flex justify-between gap-2">
              <span>{t('Collected for this month')}</span>
              <strong>{formatCurrency(d.collectedForThisMonth)} / {formatCurrency(d.billedThisMonth)}</strong>
            </div>
            <div className="h-2 rounded-full bg-slate-100 dark:bg-white/10 mt-1" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={t('Collection rate')}>
              <div className="h-2 rounded-full bg-emerald-600" style={{ width: `${pct}%` }} />
            </div>
            <p className="text-xs text-slate-500 mt-1">
              {t('Collection rate')} {rateText(d.collectionRate)} · {t('All cash received this month')}: {formatCurrency(d.collectedThisMonth)}
            </p>
          </div>
          {d.topDefaulterClasses.length > 0 && (
            <div>
              <p className="font-semibold mb-1">{t('Classes with most dues')}</p>
              <ul className="space-y-1">
                {d.topDefaulterClasses.map((c) => (
                  <li key={c.classId ?? 'none'} className="flex justify-between gap-2">
                    <span className="truncate">{c.className} <span className="text-xs text-slate-500">({t('{n} students', { n: formatNumber(c.students) })})</span></span>
                    <span className="font-medium text-rose-700 dark:text-rose-300 whitespace-nowrap">{formatCurrency(c.due)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </Card>
  );
};

export default DuesWidget;
