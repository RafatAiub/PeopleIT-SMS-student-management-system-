import React from 'react';
import { Card, CardHeader, ErrorState, SkeletonText } from '@/components/ui';
import { EmptyState } from '@/components/common/EmptyState';
import { formatNumber, useT } from '@/i18n';
import { useStudentCharacter } from './character.api';
import { SummaryBody } from './shared';

/** Student profile → Character tab (rendered only while the module is on). */
const StudentCharacterTab: React.FC<{ studentId: string }> = ({ studentId }) => {
  const t = useT();
  const q = useStudentCharacter(studentId);
  if (q.isLoading) return <SkeletonText lines={6} />;
  if (q.isError) return <ErrorState title={t('Could not load character records')} onRetry={() => q.refetch()} />;
  if (!q.data) return <EmptyState title={t('Nothing here yet')} />;
  const s = q.data;
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <Card className="lg:col-span-2">
        <CardHeader title={s.latest ? s.latest.period.name : t('Character (Akhlaq)')} description={t('Latest assessment, badges and points.')} />
        <div className="mt-4"><SummaryBody s={s} /></div>
      </Card>
      <Card>
        <CardHeader title={t('Recent periods')} />
        {s.history.length === 0 ? (
          <p className="text-sm text-slate-500 mt-3">{t('Not assessed yet')}</p>
        ) : (
          <ul className="mt-3 divide-y divide-slate-100 dark:divide-white/6 text-sm">
            {s.history.map((h) => (
              <li key={h.periodId} className="flex justify-between py-2">
                <span>{h.name}</span>
                <span className="tabular-nums font-semibold">{h.overall == null ? '—' : `${formatNumber(h.overall)}%`}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
};

export default StudentCharacterTab;
