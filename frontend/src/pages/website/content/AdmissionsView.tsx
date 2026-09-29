import React from 'react';
import { ClipboardList, Plus } from 'lucide-react';
import toast from 'react-hot-toast';
import { Card, CardHeader, Button, Badge, Drawer, Input, Textarea, Select, Skeleton, ErrorState } from '@/components/ui';
import { DataTable, type Column } from '@/components/DataTable/DataTable';
import { ConfirmModal } from '@/components/common/ConfirmModal';
import { useT, formatDate } from '@/i18n';
import { useTableParams } from '@/hooks/useTableParams';
import { useAdmissions, useAdmission, useSaveAdmission, useDeleteAdmission, useForms, apiError } from '../sites.queries';
import { MediaField } from '../media/MediaPicker';
import { htmlToText, textToHtml } from '../blog/postBody';
import type { SiteAdmissionCircular, AdmissionPayload, SiteStatus } from '../sites.types';

type ApplyMode = 'none' | 'url' | 'form';

interface AdmissionForm {
  session: string;
  classNames: string;
  title: string;
  titleBn: string;
  body: string;
  startDate: string;
  endDate: string;
  fee: string;
  pdfUrl: string;
  applyMode: ApplyMode;
  applyUrl: string;
  formId: string;
  status: SiteStatus;
}

const emptyForm: AdmissionForm = {
  session: '', classNames: '', title: '', titleBn: '', body: '', startDate: '', endDate: '', fee: '',
  pdfUrl: '', applyMode: 'none', applyUrl: '', formId: '', status: 'DRAFT',
};

const AdmissionEditorDrawer: React.FC<{ open: boolean; id: string | null; onClose: () => void }> = ({ open, id, onClose }) => {
  const t = useT();
  const q = useAdmission(open && id ? id : undefined);
  const forms = useForms(open);
  const save = useSaveAdmission();
  const [form, setForm] = React.useState<AdmissionForm>(emptyForm);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const loaded = React.useRef<string | null>(null);
  const set = <K extends keyof AdmissionForm>(k: K, v: AdmissionForm[K]) => setForm((f) => ({ ...f, [k]: v }));

  React.useEffect(() => {
    if (!open) { loaded.current = null; return; }
    if (!id) {
      if (loaded.current === 'new') return;
      loaded.current = 'new';
      setForm(emptyForm);
      setErrors({});
      return;
    }
    const a = q.data;
    if (!a || loaded.current === a.id) return;
    loaded.current = a.id;
    setForm({
      session: a.session, classNames: a.classNames.join(', '), title: a.title, titleBn: a.titleBn ?? '',
      body: htmlToText(a.body), startDate: a.startDate ? a.startDate.slice(0, 10) : '', endDate: a.endDate ? a.endDate.slice(0, 10) : '',
      fee: a.fee != null ? String(a.fee) : '', pdfUrl: a.pdfUrl ?? '',
      applyMode: a.formId ? 'form' : a.applyUrl ? 'url' : 'none', applyUrl: a.applyUrl ?? '', formId: a.formId ?? '', status: a.status,
    });
    setErrors({});
  }, [open, id, q.data]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!form.session.trim()) errs.session = t('Enter an admission session, e.g. 2026.');
    const classNames = form.classNames.split(',').map((c) => c.trim()).filter(Boolean);
    if (classNames.length === 0) errs.classNames = t('Enter at least one class, separated by commas.');
    if (!form.title.trim()) errs.title = t('Enter a title.');
    if (!form.body.trim()) errs.body = t('Enter the circular text.');
    if (form.applyMode === 'url' && !form.applyUrl.trim()) errs.applyUrl = t('Enter the apply link.');
    if (form.applyMode === 'form' && !form.formId) errs.formId = t('Choose a form.');
    setErrors(errs);
    if (Object.keys(errs).length) return;

    const data: AdmissionPayload = {
      session: form.session.trim(),
      classNames,
      title: form.title.trim(),
      titleBn: form.titleBn.trim() || undefined,
      body: textToHtml(form.body),
      startDate: form.startDate || null,
      endDate: form.endDate || null,
      fee: form.fee ? Number(form.fee) : null,
      pdfUrl: form.pdfUrl.trim() || undefined,
      applyUrl: form.applyMode === 'url' ? form.applyUrl.trim() : undefined,
      formId: form.applyMode === 'form' ? form.formId : undefined,
      status: form.status,
    };
    save.mutate({ id: id ?? undefined, data }, { onSuccess: () => { toast.success(t('Admission circular saved.')); onClose(); } });
  };

  const loading = !!id && q.isLoading;
  return (
    <Drawer
      isOpen={open}
      onClose={save.isPending ? () => {} : onClose}
      title={id ? t('Edit admission circular') : t('New admission circular')}
      width="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={save.isPending}>{t('Cancel')}</Button>
          <Button type="submit" form="admission-editor-form" isLoading={save.isPending} disabled={loading || q.isError}>{t('Save')}</Button>
        </>
      }
    >
      {loading ? (
        <div className="space-y-3"><Skeleton className="h-10" /><Skeleton className="h-10" /><Skeleton className="h-40" /></div>
      ) : id && q.isError ? (
        <ErrorState compact message={apiError(q.error, t('Could not load the circular.'))} onRetry={() => q.refetch()} />
      ) : (
        <form id="admission-editor-form" className="space-y-4" onSubmit={submit} noValidate>
          <div className="grid gap-3 sm:grid-cols-2">
            <Input id="admission-session" label={t('Session')} required placeholder={t('e.g. 2026')} value={form.session} error={errors.session} onChange={(e) => set('session', e.target.value)} />
            <Input
              id="admission-classNames" label={t('Classes')} required placeholder={t('e.g. Six, Seven, Eight')}
              value={form.classNames} error={errors.classNames} helperText={t('Separate multiple classes with commas.')}
              onChange={(e) => set('classNames', e.target.value)}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Input id="admission-title" label={t('Title')} required value={form.title} error={errors.title} onChange={(e) => set('title', e.target.value)} />
            <Input id="admission-titleBn" label={t('Title (Bangla)')} lang="bn" value={form.titleBn} onChange={(e) => set('titleBn', e.target.value)} />
          </div>
          <Textarea
            id="admission-body" label={t('Circular text')} required rows={6} value={form.body} error={errors.body}
            helperText={t('Leave an empty line between paragraphs.')} onChange={(e) => set('body', e.target.value)}
          />
          <div className="grid gap-3 sm:grid-cols-3">
            <Input id="admission-startDate" type="date" label={t('Starts')} value={form.startDate} onChange={(e) => set('startDate', e.target.value)} />
            <Input id="admission-endDate" type="date" label={t('Ends')} value={form.endDate} onChange={(e) => set('endDate', e.target.value)} />
            <Input id="admission-fee" label={t('Admission fee')} inputMode="decimal" value={form.fee} onChange={(e) => set('fee', e.target.value.replace(/[^0-9.]/g, ''))} />
          </div>
          <MediaField id="admission-pdf" label={t('Circular PDF')} kind="FILE" value={form.pdfUrl} onChange={(v) => set('pdfUrl', v)} />

          <fieldset className="space-y-2">
            <legend className="field-label">{t('How do applicants apply?')}</legend>
            <div className="flex flex-wrap gap-2">
              {([['none', t('No link yet')], ['url', t('External link')], ['form', t('A website form')]] as [ApplyMode, string][]).map(([mode, label]) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => set('applyMode', mode)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                    form.applyMode === mode
                      ? 'border-primary-500 bg-primary-50 text-primary-800 dark:bg-primary-500/10 dark:text-primary-200'
                      : 'border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300 hover:border-slate-300'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            {form.applyMode === 'url' && (
              <Input id="admission-applyUrl" label={t('Apply link')} value={form.applyUrl} error={errors.applyUrl} onChange={(e) => set('applyUrl', e.target.value)} />
            )}
            {form.applyMode === 'form' && (
              <Select
                id="admission-formId" label={t('Form')} value={form.formId} error={errors.formId}
                onChange={(e) => set('formId', e.target.value)}
                placeholder={t('Choose a form')}
                options={(forms.data ?? []).map((f) => ({ value: f.id, label: f.name }))}
              />
            )}
          </fieldset>

          <Select
            id="admission-status" label={t('Status')} value={form.status} onChange={(e) => set('status', e.target.value as SiteStatus)}
            options={[{ value: 'DRAFT', label: t('Draft (hidden)') }, { value: 'PUBLISHED', label: t('Published') }]}
          />
        </form>
      )}
    </Drawer>
  );
};

/** Website > Content > Admission circulars — session, classes, dates, fee, PDF, and an apply link or a `SiteForm`. */
export const AdmissionsView: React.FC = () => {
  const t = useT();
  const { params, setPage, setPageSize, setFilter } = useTableParams(20);
  const q = useAdmissions({ page: params.page, pageSize: params.pageSize, status: (params.filters.status || '') as SiteStatus | '' });
  const del = useDeleteAdmission();
  const [editor, setEditor] = React.useState<{ open: boolean; id: string | null }>({ open: false, id: null });
  const [toDelete, setToDelete] = React.useState<SiteAdmissionCircular | null>(null);

  const columns: Column<SiteAdmissionCircular>[] = [
    {
      key: 'title', header: t('Circular'), primary: true, accessor: 'title',
      render: (a) => (
        <div className="min-w-0">
          <p className="font-medium text-slate-900 dark:text-slate-50 truncate">{a.title}</p>
          <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{t('Session {session} · {classes}', { session: a.session, classes: a.classNames.join(', ') })}</p>
        </div>
      ),
    },
    {
      key: 'dates', header: t('Dates'), hideOnMobile: true, sortable: false,
      render: (a) => (a.startDate || a.endDate ? `${a.startDate ? formatDate(a.startDate) : '—'} – ${a.endDate ? formatDate(a.endDate) : '—'}` : '—'),
    },
    { key: 'status', header: t('Status'), render: (a) => <Badge variant={a.status === 'PUBLISHED' ? 'success' : 'neutral'} dot>{a.status === 'PUBLISHED' ? t('Published') : t('Draft')}</Badge>, exportValue: (a) => a.status },
  ];

  return (
    <Card>
      <CardHeader
        icon={<ClipboardList className="w-4 h-4" />}
        title={t('Admission circulars')}
        description={t('Session, classes, dates, fee and how to apply.')}
        actions={<Button leftIcon={<Plus className="w-4 h-4" />} onClick={() => setEditor({ open: true, id: null })}>{t('New circular')}</Button>}
      />
      {q.isError ? (
        <ErrorState message={apiError(q.error, t('Could not load admission circulars.'))} onRetry={() => q.refetch()} />
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
          onRowClick={(a) => setEditor({ open: true, id: a.id })}
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
            { label: t('Edit'), icon: 'edit', onClick: (a) => setEditor({ open: true, id: a.id }) },
            { label: t('Delete'), icon: 'delete', variant: 'danger', onClick: (a) => setToDelete(a) },
          ]}
          emptyTitle={t('No admission circulars yet')}
          emptyDescription={t('Publish a circular so applicants know how and when to apply.')}
          emptyAction={<Button onClick={() => setEditor({ open: true, id: null })}>{t('New circular')}</Button>}
        />
      )}
      <AdmissionEditorDrawer open={editor.open} id={editor.id} onClose={() => setEditor({ open: false, id: null })} />
      <ConfirmModal
        isOpen={!!toDelete}
        title={t('Delete “{title}”?', { title: toDelete?.title ?? '' })}
        message={t('The circular is removed from the website immediately.')}
        confirmLabel={t('Delete circular')}
        isLoading={del.isPending}
        onCancel={() => setToDelete(null)}
        onConfirm={() => toDelete && del.mutate(toDelete.id, { onSuccess: () => setToDelete(null) })}
      />
    </Card>
  );
};
