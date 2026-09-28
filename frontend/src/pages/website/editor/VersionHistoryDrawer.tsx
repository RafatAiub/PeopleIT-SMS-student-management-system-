import React from 'react';
import { History, RotateCcw } from 'lucide-react';
import toast from 'react-hot-toast';
import { Drawer, Button, Skeleton, ErrorState } from '@/components/ui';
import { EmptyState } from '@/components/common/EmptyState';
import { ConfirmModal } from '@/components/common/ConfirmModal';
import { useT, formatDate } from '@/i18n';
import { usePageVersions, useRestoreVersion, apiError } from '../sites.queries';
import type { SitePage, SitePageVersion } from '../sites.types';

/** Last 30 versions of a page; restoring replaces the draft (the current draft is saved as a version first). */
export const VersionHistoryDrawer: React.FC<{
  page: SitePage;
  isOpen: boolean;
  onClose: () => void;
  hasUnsaved: boolean;
  onRestored: (page: SitePage) => void;
}> = ({ page, isOpen, onClose, hasUnsaved, onRestored }) => {
  const t = useT();
  const q = usePageVersions(page.id, isOpen);
  const restore = useRestoreVersion();
  const [target, setTarget] = React.useState<SitePageVersion | null>(null);

  return (
    <>
      <Drawer isOpen={isOpen} onClose={onClose} title={t('Version history')} description={t('The last 30 saved versions of this page.')} width="md">
        {q.isLoading ? (
          <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-lg" />)}</div>
        ) : q.isError ? (
          <ErrorState compact message={apiError(q.error, t('Could not load versions.'))} onRetry={() => q.refetch()} />
        ) : !q.data?.length ? (
          <EmptyState compact icon={<History />} title={t('No versions yet')} description={t('A version is saved every time you publish, restore or save a checkpoint.')} />
        ) : (
          <ol className="space-y-2">
            {q.data.map((v, i) => (
              <li key={v.id} className="rounded-lg border border-slate-200 dark:border-white/10 p-3 flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">{v.note || t('Saved version')}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {formatDate(v.createdAt, true)}
                    {v.createdByName ? ` · ${v.createdByName}` : ''}
                    {i === 0 ? ` · ${t('Latest')}` : ''}
                  </p>
                </div>
                <Button size="sm" variant="secondary" leftIcon={<RotateCcw className="w-3.5 h-3.5" />} onClick={() => setTarget(v)}>{t('Restore')}</Button>
              </li>
            ))}
          </ol>
        )}
      </Drawer>
      <ConfirmModal
        isOpen={!!target}
        variant="warning"
        title={t('Restore this version?')}
        message={
          hasUnsaved
            ? t('Your unsaved changes will be lost. The saved draft is kept as a version, then replaced by the one you picked. The public page does not change until you publish.')
            : t('The current draft is kept as a version, then replaced by the one you picked. The public page does not change until you publish.')
        }
        confirmLabel={t('Restore')}
        isLoading={restore.isPending}
        onCancel={() => setTarget(null)}
        onConfirm={() =>
          target &&
          restore.mutate(
            { pageId: page.id, versionId: target.id },
            {
              onSuccess: (p) => {
                setTarget(null);
                onClose();
                toast.success(t('Version restored to the draft.'));
                onRestored(p);
              },
            }
          )
        }
      />
    </>
  );
};
