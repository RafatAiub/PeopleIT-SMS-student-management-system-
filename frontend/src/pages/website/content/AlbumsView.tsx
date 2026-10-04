import React from 'react';
import { Images, ImagePlus, Plus } from 'lucide-react';
import toast from 'react-hot-toast';
import { Card, CardHeader, Button, Badge, Drawer, Input, Textarea, Select, ErrorState } from '@/components/ui';
import { DataTable, type Column } from '@/components/DataTable/DataTable';
import { ConfirmModal } from '@/components/common/ConfirmModal';
import { useT, formatDate, formatNumber } from '@/i18n';
import { useTableParams } from '@/hooks/useTableParams';
import { useAlbums, useSaveAlbum, useDeleteAlbum, apiError } from '../sites.queries';
import { MediaField, MediaThumb } from '../media/MediaPicker';
import { AlbumPhotosDrawer } from './AlbumPhotosDrawer';
import type { SiteAlbum, AlbumPayload, SiteStatus } from '../sites.types';

interface AlbumForm {
  title: string;
  titleBn: string;
  coverUrl: string;
  description: string;
  eventDate: string;
  status: SiteStatus;
}

const emptyForm: AlbumForm = { title: '', titleBn: '', coverUrl: '', description: '', eventDate: '', status: 'DRAFT' };

const AlbumEditorDrawer: React.FC<{ open: boolean; album: SiteAlbum | null; onClose: () => void }> = ({ open, album, onClose }) => {
  const t = useT();
  const save = useSaveAlbum();
  const [form, setForm] = React.useState<AlbumForm>(emptyForm);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const set = <K extends keyof AlbumForm>(k: K, v: AlbumForm[K]) => setForm((f) => ({ ...f, [k]: v }));

  React.useEffect(() => {
    if (!open) return;
    setForm(
      album
        ? {
            title: album.title, titleBn: album.titleBn ?? '', coverUrl: album.coverUrl ?? '',
            description: album.description ?? '', eventDate: album.eventDate ? album.eventDate.slice(0, 10) : '', status: album.status,
          }
        : emptyForm
    );
    setErrors({});
  }, [open, album]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!form.title.trim()) errs.title = t('Enter a title.');
    setErrors(errs);
    if (Object.keys(errs).length) return;

    const data: AlbumPayload = {
      title: form.title.trim(),
      titleBn: form.titleBn.trim() || undefined,
      coverUrl: form.coverUrl.trim() || undefined,
      description: form.description.trim() || undefined,
      eventDate: form.eventDate || null,
      status: form.status,
    };
    save.mutate({ id: album?.id, data }, { onSuccess: () => { toast.success(t('Album saved.')); onClose(); } });
  };

  return (
    <Drawer
      isOpen={open}
      onClose={save.isPending ? () => {} : onClose}
      title={album ? t('Edit album') : t('New album')}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={save.isPending}>{t('Cancel')}</Button>
          <Button type="submit" form="album-editor-form" isLoading={save.isPending}>{t('Save album')}</Button>
        </>
      }
    >
      <form id="album-editor-form" className="space-y-4" onSubmit={submit} noValidate>
        <div className="grid gap-3 sm:grid-cols-2">
          <Input id="album-title" label={t('Title')} required value={form.title} error={errors.title} onChange={(e) => set('title', e.target.value)} />
          <Input id="album-titleBn" label={t('Title (Bangla)')} lang="bn" value={form.titleBn} onChange={(e) => set('titleBn', e.target.value)} />
        </div>
        <MediaField id="album-cover" label={t('Cover photo')} value={form.coverUrl} onChange={(v) => set('coverUrl', v)} helperText={t('Shown on the gallery listing. You can also set a cover from any photo once added.')} />
        <Textarea id="album-description" label={t('Description')} rows={3} value={form.description} onChange={(e) => set('description', e.target.value)} />
        <div className="grid gap-3 sm:grid-cols-2">
          <Input id="album-eventDate" type="date" label={t('Event date')} value={form.eventDate} onChange={(e) => set('eventDate', e.target.value)} />
          <Select
            id="album-status" label={t('Status')} value={form.status} onChange={(e) => set('status', e.target.value as SiteStatus)}
            options={[{ value: 'DRAFT', label: t('Draft (hidden)') }, { value: 'PUBLISHED', label: t('Published') }]}
          />
        </div>
      </form>
    </Drawer>
  );
};

/** Website > Content > Albums — cover, title, description, publish status; photos managed in a separate drawer. */
export const AlbumsView: React.FC = () => {
  const t = useT();
  const { params, setPage, setPageSize, setFilter } = useTableParams(20);
  const q = useAlbums({ page: params.page, pageSize: params.pageSize, status: (params.filters.status || '') as SiteStatus | '' });
  const del = useDeleteAlbum();
  const [editor, setEditor] = React.useState<{ open: boolean; album: SiteAlbum | null }>({ open: false, album: null });
  const [photosFor, setPhotosFor] = React.useState<string | null>(null);
  const [toDelete, setToDelete] = React.useState<SiteAlbum | null>(null);

  const columns: Column<SiteAlbum>[] = [
    {
      key: 'title', header: t('Album'), primary: true, accessor: 'title',
      render: (a) => (
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-lg overflow-hidden border border-slate-200 dark:border-white/10 shrink-0 bg-slate-50 dark:bg-white/5">
            {a.coverUrl ? <MediaThumb media={{ url: a.coverUrl, kind: 'IMAGE', name: a.title, alt: a.title }} /> : <Images className="w-full h-full p-2 text-slate-300" aria-hidden />}
          </div>
          <div className="min-w-0">
            <p className="font-medium text-slate-900 dark:text-slate-50 truncate">{a.title}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{t('{n} photos', { n: formatNumber(a.photoCount ?? 0) })}</p>
          </div>
        </div>
      ),
    },
    { key: 'eventDate', header: t('Event date'), hideOnMobile: true, render: (a) => (a.eventDate ? formatDate(a.eventDate) : '—') },
    { key: 'status', header: t('Status'), render: (a) => <Badge variant={a.status === 'PUBLISHED' ? 'success' : 'neutral'} dot>{a.status === 'PUBLISHED' ? t('Published') : t('Draft')}</Badge>, exportValue: (a) => a.status },
  ];

  return (
    <Card>
      <CardHeader
        icon={<Images className="w-4 h-4" />}
        title={t('Photo albums')}
        description={t('Event galleries for the public website.')}
        actions={<Button leftIcon={<Plus className="w-4 h-4" />} onClick={() => setEditor({ open: true, album: null })}>{t('New album')}</Button>}
      />
      {q.isError ? (
        <ErrorState message={apiError(q.error, t('Could not load albums.'))} onRetry={() => q.refetch()} />
      ) : (
        <DataTable
          data={q.data?.items ?? []}
          columns={columns}
          isLoading={q.isLoading}
          serverPagination
          totalCount={q.data?.total ?? 0}
          page={params.page}
          pageSize={params.pageSize}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
          onRowClick={(a) => setEditor({ open: true, album: a })}
          toolbar={
            <Select
              aria-label={t('Filter by status')}
              value={params.filters.status || ''}
              onChange={(e) => setFilter('status', e.target.value)}
              className="w-auto min-w-36"
              placeholder={t('All statuses')}
              options={[{ value: 'DRAFT', label: t('Draft') }, { value: 'PUBLISHED', label: t('Published') }]}
            />
          }
          actions={[
            { label: t('Photos'), icon: 'view', onClick: (a) => setPhotosFor(a.id) },
            { label: t('Edit'), icon: 'edit', onClick: (a) => setEditor({ open: true, album: a }) },
            { label: t('Delete'), icon: 'delete', variant: 'danger', onClick: (a) => setToDelete(a) },
          ]}
          emptyTitle={t('No albums yet')}
          emptyDescription={t('Create an album, then add photos to it.')}
          emptyAction={<Button leftIcon={<ImagePlus className="w-4 h-4" />} onClick={() => setEditor({ open: true, album: null })}>{t('New album')}</Button>}
        />
      )}
      <AlbumEditorDrawer open={editor.open} album={editor.album} onClose={() => setEditor({ open: false, album: null })} />
      <AlbumPhotosDrawer albumId={photosFor} onClose={() => setPhotosFor(null)} />
      <ConfirmModal
        isOpen={!!toDelete}
        title={t('Delete “{title}”?', { title: toDelete?.title ?? '' })}
        message={t('The album and all its photos are removed from the website immediately.')}
        confirmLabel={t('Delete album')}
        isLoading={del.isPending}
        onCancel={() => setToDelete(null)}
        onConfirm={() => toDelete && del.mutate(toDelete.id, { onSuccess: () => setToDelete(null) })}
      />
    </Card>
  );
};
