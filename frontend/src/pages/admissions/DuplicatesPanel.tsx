import React, { useState } from 'react';
import { GitMerge } from 'lucide-react';
import { Badge, Button, ErrorState, Skeleton } from '@/components/ui';
import { EmptyState } from '@/components/common/EmptyState';
import { ConfirmModal } from '@/components/common/ConfirmModal';
import { formatDate, formatNumber, useT } from '@/i18n';
import { useDuplicateGroups, useMerge, type DupRow } from './crm.api';

const REASON: Record<string, string> = { PHONE: 'Same phone', EMAIL: 'Same email', NAME: 'Similar name' };

/** Duplicate clusters (phone / email / similar name). Pick the record to keep and merge the others into it. */
export default function DuplicatesPanel({ onOpen }: { onOpen: (id: string) => void }) {
  const t = useT();
  const { data, isLoading, isError, refetch } = useDuplicateGroups();
  const merge = useMerge();
  const [pending, setPending] = useState<{ keep: DupRow; drop: DupRow } | null>(null);

  if (isError) return <ErrorState message={t('Could not check for duplicates.')} onRetry={() => refetch()} />;
  if (isLoading) return <Skeleton className="h-32 w-full rounded-xl" />;
  const groups = data?.groups ?? [];
  if (!groups.length) {
    return <EmptyState title={t('No duplicates found')} description={t('Checked {n} enquiries by phone, email and name.', { n: formatNumber(data?.scanned ?? 0) })} />;
  }
  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-700 dark:text-slate-300">
        {t('{groups} possible duplicate groups among {n} enquiries. Merging keeps the chosen record and moves the other’s timeline, tasks and missing details into it.', {
          groups: formatNumber(groups.length),
          n: formatNumber(data?.scanned ?? 0),
        })}
      </p>
      {groups.map((g) => {
        const keep = g.items[0];
        return (
          <div key={g.items.map((i) => i.id).join(':')} className="glass-card rounded-xl p-3 space-y-2">
            <div className="flex flex-wrap gap-1.5">
              {g.reasons.map((r) => (
                <Badge key={r} variant="warning">{t(REASON[r] ?? r)}</Badge>
              ))}
            </div>
            <ul className="divide-y divide-slate-100 dark:divide-white/6">
              {g.items.map((row, idx) => (
                <li key={row.id} className="py-2 flex flex-col sm:flex-row sm:items-center gap-2">
                  <button type="button" onClick={() => onOpen(row.id)} className="flex-1 min-w-0 text-left">
                    <p className="text-sm font-semibold text-slate-900 dark:text-slate-50 truncate">{row.studentName}</p>
                    <p className="text-xs text-slate-600 dark:text-slate-400 truncate">
                      {[row.phone, row.email, row.classInterested, row.stage?.name, formatDate(row.createdAt)].filter(Boolean).join(' · ')}
                    </p>
                  </button>
                  {idx === 0 ? (
                    <Badge variant="success">{t('Kept (newest)')}</Badge>
                  ) : (
                    <div className="flex gap-2">
                      <Button size="xs" variant="outline" leftIcon={<GitMerge className="w-3 h-3" />} onClick={() => setPending({ keep, drop: row })}>
                        {t('Merge into first')}
                      </Button>
                      <Button size="xs" variant="ghost" onClick={() => setPending({ keep: row, drop: keep })}>
                        {t('Keep this one')}
                      </Button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </div>
        );
      })}
      <ConfirmModal
        isOpen={!!pending}
        title={t('Merge duplicate')}
        message={t('"{other}" will be merged into "{name}": its timeline, tasks and any missing details move here, and the duplicate is removed.', {
          other: pending?.drop.studentName ?? '',
          name: pending?.keep.studentName ?? '',
        })}
        confirmLabel={t('Merge')}
        variant="warning"
        isLoading={merge.isPending}
        onConfirm={() => pending && merge.mutate({ keepId: pending.keep.id, dropId: pending.drop.id }, { onSuccess: () => setPending(null) })}
        onCancel={() => setPending(null)}
      />
    </div>
  );
}
