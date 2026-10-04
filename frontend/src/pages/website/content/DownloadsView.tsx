import React from 'react';
import { Download, FileText, Plus } from 'lucide-react';
import toast from 'react-hot-toast';
import { Card, CardHeader, Button, Badge, Drawer, Input, Select, ErrorState } from '@/components/ui';
import { DataTable, type Column } from '@/components/DataTable/DataTable';
import { ConfirmModal } from '@/components/common/ConfirmModal';
import { useT, formatDate } from '@/i18n';
import { useTableParams } from '@/hooks/useTableParams';
import { useDownloads, useSaveDownload, useDeleteDownload, apiError } from '../sites.queries';
import { MediaField } from '../media/MediaPicker';
import type { SiteDownload, DownloadPayload, SiteStatus } from '../sites.types';

interface DownloadForm {
  title: string;
  titleBn: string;
  category: string;
  fileUrl: string;
  publishedAt: string;
  status: SiteStatus;
}

const emptyForm: DownloadForm = { title: '', titleBn: '', category: '', fileUrl: '', publishedAt: '', status: 'DRAFT' };

const DownloadEditorDrawer: React.FC<{ open: boolean; item: SiteDownload | null; onClose: () => void }> = ({ open, item, onClose }) => {
  const t = useT();
  const save = useSaveDownload();
  const [form, setForm] = React.useState<DownloadForm>(emptyForm);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const set = <K extends keyof DownloadForm>(k: K, v: DownloadForm[K]) => setForm((f) => ({ ...f, [k]: v }));

  React.useEffect(() => {
    if (!open) return;
    setForm(
      item
        ? {
            title: item.title, titleBn: item.titleBn ?? '', category: item.category, fileUrl: item.fileUrl,
            publishedAt: item.publishedAt ? item.publishedAt.slice(0, 10) : '', status: item.status,
          }
        : emptyForm
    );
    setErrors({});
  }, [open, item]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!form.title.trim()) errs.title = t('Enter a title.');
    if (!form.category.trim()) errs.category = t('Enter a category, e.g. Syllabus, Notice, Form.');
    if (!form.fileUrl.trim()) errs.fileUrl = t('Choose or paste a file link.');
    setErrors(errs);
    if (Object.keys(errs).length) return;

    const data: DownloadPayload = {
      title: form.title.trim(),
      titleBn: form.titleBn.trim() || undefined,
      category: form.category.trim(),
      fileUrl: form.fileUrl.trim(),
      publishedAt: form.publishedAt || null,
      status: form.status,
    };
    save.mutate({ id: item?.id, data }, { onSuccess: () => { toast.success(t('Download saved.')); onClose(); } });
  };

  return (
    <Drawer
      isOpen={open}
      onClose={save.isPending ? () => {} : onClose}
      title={item ? t('Edit download') : t('New download')}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={save.isPending}>{t('Cancel')}</Button>
          <Button type="submit" form="download-editor-form" isLoading={save.isPending}>{t('Save')}</Button>
        </>
      }
    >
      <form id="download-editor-form" className="space-y-4" onSubmit={submit} noValidate>
        <div className="grid gap-3 sm:grid-cols-2">
          <Input id="download-title" label={t('Title')} required value={form.title} error={errors.title} onChange={(e) => set('title', e.target.value)} />
          <Input id="download-titleBn" label={t('Title (Bangla)')} lang="bn" value={form.titleBn} onChange={(e) => set('titleBn', e.target.value)} />
        </div>
        <Input
          id="download-category" label={t('Category')} required placeholder={t('e.g. Syllabus, Notice, Admit card, Form')}
          value={form.category} error={errors.category} onChange={(e) => set('category', e.target.value)}
        />
        <MediaField id="download-file" label={t('File')} kind="FILE" value={form.fileUrl} onChange={(v) => set('fileUrl', v)} helperText={t('Choose a PDF/document from the library, or paste a link.')} />
        {errors.fileUrl && <p className="field-error" role="alert">{errors.fileUrl}</p>}
        <div className="grid gap-3 sm:grid-cols-2">
          <Input id="download-publishedAt" type="date" label={t('Published date')} value={form.publishedAt} onChange={(e) => set('publishedAt', e.target.value)} />
          <Select
            id="download-status" label={t('Status')} value={form.status} onChange={(e) => set('status', e.target.value as SiteStatus)}
            options={[{ value: 'DRAFT', label: t('Draft (hidden)') }, { value: 'PUBLISHED', label: t('Published') }]}
          />
        </div>
      </form>
    </Drawer>
  );
};

/** Website > Content > Downloads — syllabi, notices, forms and similar files, grouped by category. */
export const DownloadsView: React.FC = () => {
  const t = useT();
  const { params, setPage, setPageSize, setFilter } = useTableParams(20);
  const q = useDownloads({ page: params.page, pageSize: params.pageSize, status: (params.filters.status || '') as SiteStatus | '', category: params.filters.category || undefined });
  const del = useDeleteDownload();
  const [editor, setEditor] = React.useState<{ open: boolean; item: SiteDownload | null }>({ open: false, item: null });
  const [toDelete, setToDelete] = React.useState<SiteDownload | null>(null);

  const columns: Column<SiteDownload>[] = [
    {
      key: 'title', header: t('File'), primary: true, accessor: 'title',
      render: (d) => (
        <div className="flex items-center gap-3 min-w-0">
          <FileText className="w-8 h-8 p-1.5 rounded-lg bg-slate-50 dark:bg-white/5 text-slate-400 shrink-0" aria-hidden />
          <div className="min-w-0">
            <p className="font-medium text-slate-900 dark:text-slate-50 truncate">{d.title}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{d.category}</p>
          </div>
        </div>
      ),
    },
    { key: 'publishedAt', header: t('Published'), hideOnMobile: true, render: (d) => (d.publishedAt ? formatDate(d.publishedAt) : '—') },
    { key: 'status', header: t('Status'), render: (d) => <Badge variant={d.status === 'PUBLISHED' ? 'success' : 'neutral'} dot>{d.status === 'PUBLISHED' ? t('Published') : t('Draft')}</Badge>, exportValue: (d) => d.status },
  ];

  return (
    <Card>
      <CardHeader
        icon={<Download className="w-4 h-4" />}
        title={t('Downloads')}
        description={t('Syllabi, notices, admit cards and forms parents and students can download.')}
        actions={<Button leftIcon={<Plus className="w-4 h-4" />} onClick={() => setEditor({ open: true, item: null })}>{t('New download')}</Button>}
      />
      {q.isError ? (
        <ErrorState message={apiError(q.error, t('Could not load downloads.'))} onRetry={() => q.refetch()} />
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
          onRowClick={(d) => setEditor({ open: true, item: d })}
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
            { label: t('Edit'), icon: 'edit', onClick: (d) => setEditor({ open: true, item: d }) },
            { label: t('Delete'), icon: 'delete', variant: 'danger', onClick: (d) => setToDelete(d) },
          ]}
          emptyTitle={t('No downloads yet')}
          emptyDescription={t('Add syllabi, notices or forms for visitors to download.')}
          emptyAction={<Button onClick={() => setEditor({ open: true, item: null })}>{t('New download')}</Button>}
        />
      )}
      <DownloadEditorDrawer open={editor.open} item={editor.item} onClose={() => setEditor({ open: false, item: null })} />
      <ConfirmModal
        isOpen={!!toDelete}
        title={t('Delete “{title}”?', { title: toDelete?.title ?? '' })}
        message={t('The file is removed from the website immediately.')}
        confirmLabel={t('Delete download')}
        isLoading={del.isPending}
        onCancel={() => setToDelete(null)}
        onConfirm={() => toDelete && del.mutate(toDelete.id, { onSuccess: () => setToDelete(null) })}
      />
    </Card>
  );
};
