import React from 'react';
import { ArrowDown, ArrowUp, ImagePlus, Star, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { Button, Drawer, Input, Skeleton, ErrorState } from '@/components/ui';
import { EmptyState } from '@/components/common/EmptyState';
import { useT } from '@/i18n';
import {
  useAlbum, useAddAlbumPhoto, useUpdateAlbumPhoto, useDeleteAlbumPhoto, useReorderAlbumPhotos, useSaveAlbum, apiError,
} from '../sites.queries';
import { MediaPickerModal, MediaThumb } from '../media/MediaPicker';
import type { SiteAlbumPhoto } from '../sites.types';

const CaptionInput: React.FC<{ photo: SiteAlbumPhoto; albumId: string }> = ({ photo, albumId }) => {
  const t = useT();
  const update = useUpdateAlbumPhoto();
  const [value, setValue] = React.useState(photo.caption ?? '');
  React.useEffect(() => setValue(photo.caption ?? ''), [photo.caption]);
  return (
    <Input
      id={`album-photo-caption-${photo.id}`}
      aria-label={t('Caption')}
      placeholder={t('Caption (optional)')}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => {
        if (value !== (photo.caption ?? '')) update.mutate({ albumId, photoId: photo.id, data: { caption: value.trim() || undefined } });
      }}
    />
  );
};

/**
 * Website > Content > Albums — photo manager: MediaPicker multi-select add,
 * per-photo caption, reorder (arrows persist via the bulk order endpoint),
 * cover selection and delete. `PUT /albums/:id/photos/order` (§7.2).
 */
export const AlbumPhotosDrawer: React.FC<{ albumId: string | null; onClose: () => void }> = ({ albumId, onClose }) => {
  const t = useT();
  const open = !!albumId;
  const q = useAlbum(albumId ?? undefined);
  const addPhoto = useAddAlbumPhoto();
  const deletePhoto = useDeleteAlbumPhoto();
  const reorder = useReorderAlbumPhotos();
  const saveAlbum = useSaveAlbum();
  const [pickerOpen, setPickerOpen] = React.useState(false);

  const album = q.data;
  const photos = album?.photos ?? [];

  const move = (from: number, to: number) => {
    if (!albumId || to < 0 || to >= photos.length) return;
    const ids = photos.map((p) => p.id);
    const [id] = ids.splice(from, 1);
    ids.splice(to, 0, id);
    reorder.mutate({ albumId, ids });
  };

  return (
    <>
      <Drawer isOpen={open} onClose={onClose} title={t('Photos — {title}', { title: album?.title ?? '' })} width="lg">
        {q.isLoading ? (
          <div className="grid grid-cols-2 gap-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="aspect-square rounded-lg" />)}</div>
        ) : q.isError ? (
          <ErrorState compact message={apiError(q.error, t('Could not load the album.'))} onRetry={() => q.refetch()} />
        ) : (
          <div className="space-y-4">
            <Button leftIcon={<ImagePlus className="w-4 h-4" />} onClick={() => setPickerOpen(true)}>{t('Add photos')}</Button>
            {photos.length === 0 ? (
              <EmptyState compact icon={<ImagePlus />} title={t('No photos yet')} description={t('Add photos from your media library.')} />
            ) : (
              <ul className="space-y-2">
                {photos.map((p, i) => {
                  const isCover = album?.coverUrl === p.url;
                  return (
                    <li key={p.id} className="flex items-center gap-3 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-white/3 p-2.5">
                      <div className="w-14 h-14 rounded-lg overflow-hidden border border-slate-200 dark:border-white/10 shrink-0 bg-slate-50 dark:bg-white/5">
                        <MediaThumb media={{ url: p.url, kind: 'IMAGE', name: '', alt: p.caption ?? '' }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <CaptionInput photo={p} albumId={albumId!} />
                      </div>
                      <div className="flex items-center gap-0.5 shrink-0">
                        <Button size="icon-sm" variant="ghost" aria-label={t('Move up')} disabled={i === 0 || reorder.isPending} onClick={() => move(i, i - 1)}><ArrowUp className="w-4 h-4" /></Button>
                        <Button size="icon-sm" variant="ghost" aria-label={t('Move down')} disabled={i === photos.length - 1 || reorder.isPending} onClick={() => move(i, i + 1)}><ArrowDown className="w-4 h-4" /></Button>
                        <Button
                          size="icon-sm"
                          variant={isCover ? 'primary' : 'ghost'}
                          aria-label={isCover ? t('Cover photo') : t('Set as cover')}
                          title={isCover ? t('Cover photo') : t('Set as cover')}
                          disabled={saveAlbum.isPending}
                          onClick={() => albumId && saveAlbum.mutate({ id: albumId, data: { coverUrl: p.url } })}
                        >
                          <Star className="w-4 h-4" />
                        </Button>
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          className="text-red-600 dark:text-red-400"
                          aria-label={t('Delete photo')}
                          onClick={() => albumId && deletePhoto.mutate({ albumId, photoId: p.id })}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}
      </Drawer>
      <MediaPickerModal
        isOpen={pickerOpen}
        onClose={() => setPickerOpen(false)}
        kind="IMAGE"
        multiple
        title={t('Add photos')}
        onSelectMultiple={async (media) => {
          if (!albumId) return;
          try {
            for (const m of media) await addPhoto.mutateAsync({ albumId, url: m.url });
            toast.success(t('{n} photo(s) added.', { n: media.length }));
          } catch {
            /* useAddAlbumPhoto already toasts individual failures */
          }
        }}
      />
    </>
  );
};
