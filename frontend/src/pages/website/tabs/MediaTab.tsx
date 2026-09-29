import React from 'react';
import { Copy, ExternalLink, Image as ImageIcon, Trash2, Upload } from 'lucide-react';
import { Card, CardHeader, Button, Skeleton, ErrorState, Alert, Badge, Select } from '@/components/ui';
import { EmptyState } from '@/components/common/EmptyState';
import { ConfirmModal } from '@/components/common/ConfirmModal';
import { useT, formatDate } from '@/i18n';
import { useMedia, useDeleteMedia, apiError } from '../sites.queries';
import { copyText, formatBytes, isMediaUploadConfigured } from '../siteUtils';
import type { MediaKind, SiteMedia } from '../sites.types';
import { MediaUploadModal } from '../media/MediaUploadModal';
import { MediaThumb } from '../media/MediaPicker';

export const MediaTab: React.FC = () => {
  const t = useT();
  const q = useMedia();
  const del = useDeleteMedia();
  const [uploadOpen, setUploadOpen] = React.useState(false);
  const [kind, setKind] = React.useState<MediaKind | ''>('');
  const [toDelete, setToDelete] = React.useState<SiteMedia | null>(null);

  const items = (q.data ?? []).filter((m) => !kind || m.kind === kind);

  return (
    <div className="space-y-4">
      {!isMediaUploadConfigured() && (
        <Alert tone="warning" title={t('Uploads not configured')}>
          {t('Set VITE_CLOUDINARY_CLOUD_NAME and VITE_CLOUDINARY_UPLOAD_PRESET (an unsigned preset) in the frontend environment to upload files. You can still add files that are already online by URL.')}
        </Alert>
      )}
      <Card>
        <CardHeader
          icon={<ImageIcon className="w-4 h-4" />}
          title={t('Media library')}
          description={t('Every image needs alt text so the site stays accessible.')}
          actions={
            <Button leftIcon={<Upload className="w-4 h-4" />} onClick={() => setUploadOpen(true)}>
              {t('Add media')}
            </Button>
          }
        />
        <div className="mb-4 max-w-xs">
          <Select
            aria-label={t('Filter by type')}
            value={kind}
            onChange={(e) => setKind(e.target.value as MediaKind | '')}
            options={[
              { value: '', label: t('All types') },
              { value: 'IMAGE', label: t('Images') },
              { value: 'VIDEO', label: t('Videos') },
              { value: 'FILE', label: t('Documents') },
            ]}
          />
        </div>

        {q.isLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {Array.from({ length: 10 }).map((_, i) => <Skeleton key={i} className="aspect-square rounded-xl" />)}
          </div>
        ) : q.isError ? (
          <ErrorState message={apiError(q.error, t('Could not load the media library.'))} onRetry={() => q.refetch()} />
        ) : items.length === 0 ? (
          <EmptyState
            icon={<ImageIcon />}
            title={kind ? t('No files of this type') : t('No media yet')}
            description={t('Upload photos of your campus, events and staff to use them on your pages.')}
            action={<Button onClick={() => setUploadOpen(true)} leftIcon={<Upload className="w-4 h-4" />}>{t('Add media')}</Button>}
          />
        ) : (
          <ul className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {items.map((m) => (
              <li key={m.id} className="group rounded-xl border border-slate-200 dark:border-white/10 overflow-hidden bg-white dark:bg-white/3 flex flex-col">
                <div className="aspect-square bg-slate-50 dark:bg-white/5">
                  <MediaThumb media={m} />
                </div>
                <div className="p-2.5 space-y-1 min-w-0">
                  <p className="text-xs font-medium text-slate-800 dark:text-slate-100 truncate" title={m.name}>{m.name}</p>
                  {m.alt ? (
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 line-clamp-2" title={m.alt}>{m.alt}</p>
                  ) : (
                    <Badge variant="warning">{t('Missing alt text')}</Badge>
                  )}
                  <p className="text-[11px] text-slate-400 tabular-nums">
                    {[m.width && m.height ? `${m.width}×${m.height}` : null, formatBytes(m.size), formatDate(m.createdAt)].filter(Boolean).join(' · ')}
                  </p>
                  <div className="flex items-center gap-1 pt-1">
                    <Button size="icon-sm" variant="ghost" aria-label={t('Copy link')} title={t('Copy link')} onClick={() => copyText(m.url, t('Link copied'))}>
                      <Copy className="w-3.5 h-3.5" />
                    </Button>
                    <a
                      href={m.url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/6"
                      aria-label={t('Open file')}
                      title={t('Open file')}
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                    <Button size="icon-sm" variant="ghost" className="ml-auto text-red-600 dark:text-red-400" aria-label={t('Delete')} title={t('Delete')} onClick={() => setToDelete(m)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <MediaUploadModal isOpen={uploadOpen} onClose={() => setUploadOpen(false)} />
      <ConfirmModal
        isOpen={!!toDelete}
        title={t('Delete this file?')}
        message={t('It is removed from the library. Pages that still use its link may show a broken image until you replace it.')}
        confirmLabel={t('Delete')}
        isLoading={del.isPending}
        onCancel={() => setToDelete(null)}
        onConfirm={() => toDelete && del.mutate(toDelete.id, { onSuccess: () => setToDelete(null) })}
      />
    </div>
  );
};
