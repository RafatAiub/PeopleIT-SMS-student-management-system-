import React from 'react';
import { Trophy } from 'lucide-react';
import { Avatar, Card, CardHeader, ErrorState, PageHeader, SkeletonText } from '@/components/ui';
import { EmptyState } from '@/components/common/EmptyState';
import { formatNumber, useT } from '@/i18n';
import { useLeaderboard, useMyCharacter } from './character.api';
import { SummaryBody } from './shared';

// =============================================================================
// T2 — "My character" for students (self) and guardians (each child).
// Route gated by <ProtectedRoute module="islamic.character">.
// =============================================================================

const ClassBoard: React.FC<{ classId?: string }> = ({ classId }) => {
  const t = useT();
  const q = useLeaderboard({ classId });
  if (q.isLoading) return <SkeletonText lines={3} />;
  if (q.isError || !q.data || q.data.rows.length === 0) return <p className="text-sm text-slate-500">{t('No points in this class yet.')}</p>;
  return (
    <ol className="divide-y divide-slate-100 dark:divide-white/6 text-sm">
      {q.data.rows.map((r) => (
        <li key={`${r.rank}-${r.name}-${r.points}`} className={`flex items-center justify-between gap-2 py-2 ${r.isMine ? 'font-semibold text-primary-700 dark:text-primary-400' : ''}`}>
          <span className="flex items-center gap-2 min-w-0">
            <span className="w-6 text-right tabular-nums text-slate-500">{formatNumber(r.rank)}</span>
            <span className="truncate">{r.name}</span>
          </span>
          <span className="tabular-nums">{formatNumber(r.points)}</span>
        </li>
      ))}
    </ol>
  );
};

const MyCharacter: React.FC = () => {
  const t = useT();
  const q = useMyCharacter();
  return (
    <div className="space-y-6">
      <PageHeader title={t('Character & badges')} description={t('Akhlaq scores, badges and points from your teachers.')} />
      {q.isLoading ? (
        <SkeletonText lines={6} />
      ) : q.isError ? (
        <ErrorState title={t('Could not load character records')} onRetry={() => q.refetch()} />
      ) : (q.data?.children ?? []).length === 0 ? (
        <EmptyState title={t('Nothing here yet')} description={t('Character scores and badges appear here once a teacher records them.')} />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {q.data!.children.map((s) => (
            <Card key={s.student.id} className="space-y-4">
              <div className="flex items-center gap-3">
                <Avatar name={`${s.student.firstName} ${s.student.lastName}`} src={s.student.avatarUrl} />
                <div className="min-w-0">
                  <h2 className="font-bold text-slate-900 dark:text-white truncate">{s.student.firstName} {s.student.lastName}</h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{[s.student.class?.name, s.student.section?.name].filter(Boolean).join(' · ')}</p>
                </div>
              </div>
              <SummaryBody s={s} />
              {s.history.length > 1 && (
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">{t('Recent periods')}</h3>
                  <ul className="flex flex-wrap gap-2 text-xs">
                    {s.history.map((h) => (
                      <li key={h.periodId} className="rounded-full border border-slate-200 dark:border-white/10 px-2.5 py-1">
                        {h.name}: <span className="font-semibold tabular-nums">{h.overall == null ? '—' : `${formatNumber(h.overall)}%`}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {s.leaderboardVisible && s.student.class && (
                <div>
                  <CardHeader icon={<Trophy className="w-5 h-5" />} title={t('Class leaderboard')} />
                  <div className="mt-2"><ClassBoard classId={s.student.class.id} /></div>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default MyCharacter;
