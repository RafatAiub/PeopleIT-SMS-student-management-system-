import React, { useState } from 'react';
import { Card, ErrorState, PageHeader, SkeletonStatGrid, SkeletonText } from '@/components/ui';
import { useT } from '@/i18n';
import { currentMonth, errMsg, useTenantUsage } from './usage.api';
import { EstimateNotice, MonthPicker, UsageBreakdown, UsageStatGrid } from './UsageShared';

/**
 * Usage & estimated cost for the signed-in institution. Route: /usage
 * (SUPER_ADMIN, ADMIN — mirrors GET /api/v1/usage/summary).
 */
const UsageReport: React.FC = () => {
  const t = useT();
  const [month, setMonth] = useState(currentMonth());
  const query = useTenantUsage(month);

  return (
    <div className="space-y-4">
      <PageHeader
        title={t('Usage & costs')}
        description={t('SMS, email and AI usage for your institution, with estimated costs.')}
        breadcrumbs={[{ label: t('Settings') }, { label: t('Usage') }]}
        actions={<MonthPicker value={month} onChange={setMonth} />}
      />
      {query.isLoading ? (
        <>
          <SkeletonStatGrid count={4} />
          <Card>
            <SkeletonText lines={5} />
          </Card>
        </>
      ) : query.isError || !query.data ? (
        <ErrorState message={errMsg(query.error, t('Could not load usage.'))} onRetry={() => query.refetch()} />
      ) : (
        <>
          <EstimateNotice unpriced={query.data.unpricedMetrics} schemaMissing={query.data.usageSchemaMissing} />
          <UsageStatGrid lines={query.data} />
          <Card>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-3">{t('Breakdown for {month}', { month: query.data.month })}</h2>
            <UsageBreakdown lines={query.data} />
          </Card>
        </>
      )}
    </div>
  );
};

export default UsageReport;
