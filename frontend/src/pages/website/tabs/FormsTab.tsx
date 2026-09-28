import React from 'react';
import { ArrowDown, ArrowUp, ClipboardList, Inbox, Pencil, Plus, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { Card, CardHeader, Button, Badge, Modal, Input, Select, Checkbox, Drawer, Skeleton, ErrorState, Alert } from '@/components/ui';
import { EmptyState } from '@/components/common/EmptyState';
import { ConfirmModal } from '@/components/common/ConfirmModal';
import { useT, formatDate, formatNumber } from '@/i18n';
import { useForms, useSaveForm, useDeleteForm, useFormSubmissions, useMarkSubmissionRead, apiError } from '../sites.queries';
import type { FormTarget, SiteForm, SiteFormField } from '../sites.types';

const FIELD_TYPES = ['text', 'textarea', 'email', 'phone', 'number', 'date', 'select', 'radio', 'checkbox'] as const;
const FIELD_TYPE_LABEL: Record<string, string> = {
  text: 'Short text', textarea: 'Long text', email: 'Email', phone: 'Phone', number: 'Number', date: 'Date', select: 'Drop-down', radio: 'Choice (one of)', checkbox: 'Tick box',
};

const DEFAULT_ENQUIRY_FIELDS: SiteFormField[] = [
  { key: 'studentName', label: 'Student name', type: 'text', required: true },
  { key: 'guardianName', label: 'Guardian name', type: 'text', required: true },
  { key: 'phone', label: 'Phone', type: 'phone', required: true },
  { key: 'email', label: 'Email', type: 'email', required: false },
  { key: 'classInterested', label: 'Class applying for', type: 'text', required: false },
  { key: 'message', label: 'Message', type: 'textarea', required: false },
];

const keyFrom = (label: string) =>
  label.trim().toLowerCase().replace(/[^a-z0-9]+(.)?/g, (_, c: string | undefined) => (c ? c.toUpperCase() : '')).replace(/^[^a-z]+/, '').slice(0, 40) || 'field';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const FormBuilderModal: React.FC<{ isOpen: boolean; onClose: () => void; form: SiteForm | null }> = ({ isOpen, onClose, form }) => {
  const t = useT();
  const save = useSaveForm();
  const [name, setName] = React.useState('');
  const [target, setTarget] = React.useState<FormTarget>('INBOX');
  const [emails, setEmails] = React.useState('');
  const [fields, setFields] = React.useState<SiteFormField[]>([]);
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  React.useEffect(() => {
    if (!isOpen) return;
    setName(form?.name ?? '');
    setTarget(form?.target ?? 'INBOX');
    setEmails((form?.notifyEmails ?? []).join(', '));
    setFields(form?.fields?.length ? form.fields.map((f) => ({ ...f })) : [{ key: 'name', label: 'Name', type: 'text', required: true }]);
    setErrors({});
  }, [isOpen, form]);

  const patch = (i: number, p: Partial<SiteFormField>) => setFields((fs) => fs.map((f, j) => (j === i ? { ...f, ...p } : f)));
  const move = (i: number, to: number) =>
    setFields((fs) => {
      if (to < 0 || to >= fs.length) return fs;
      const n = [...fs];
      const [x] = n.splice(i, 1);
      n.splice(to, 0, x);
      return n;
    });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!name.trim()) errs.name = t('Give the form a name.');
    const list = emails.split(/[,\s]+/).map((s) => s.trim()).filter(Boolean);
    const badEmail = list.find((m) => !EMAIL_RE.test(m));
    if (badEmail) errs.emails = t('“{email}” is not a valid email address.', { email: badEmail });
    if (fields.length === 0) errs.fields = t('Add at least one field.');
    const keys = new Set<string>();
    fields.forEach((f, i) => {
      if (!f.label.trim()) errs[`f${i}.label`] = t('Enter a label.');
      if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(f.key)) errs[`f${i}.key`] = t('Letters, numbers and _ only.');
      else if (keys.has(f.key)) errs[`f${i}.key`] = t('Each field needs a different key.');
      keys.add(f.key);
      if ((f.type === 'select' || f.type === 'radio') && !(f.options ?? []).filter(Boolean).length) errs[`f${i}.options`] = t('Add at least one option.');
      if (f.key === 'website') errs[`f${i}.key`] = t('“website” is reserved for spam protection.');
    });
    if (target === 'ENQUIRY') {
      const missing = ['studentName', 'phone'].filter((k) => !fields.some((f) => f.key === k && f.required));
      if (missing.length) errs.fields = t('An admission-enquiry form needs required fields with the keys: {keys}.', { keys: missing.join(', ') });
    }
    setErrors(errs);
    if (Object.keys(errs).length) return;

    save.mutate(
      {
        id: form?.id,
        data: {
          name: name.trim(),
          target,
          notifyEmails: list,
          fields: fields.map((f) => ({ ...f, label: f.label.trim(), options: f.type === 'select' || f.type === 'radio' ? (f.options ?? []).map((o) => o.trim()).filter(Boolean) : undefined })),
        },
      },
      { onSuccess: () => { toast.success(t('Form saved.')); onClose(); } }
    );
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={save.isPending ? () => {} : onClose}
      title={form ? t('Edit form') : t('New form')}
      description={t('Add this form to a page with the “Admission enquiry form” block.')}
      size="2xl"
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose} disabled={save.isPending}>{t('Cancel')}</Button>
          <Button type="submit" form="site-form-builder" isLoading={save.isPending}>{t('Save form')}</Button>
        </>
      }
    >
      <form id="site-form-builder" onSubmit={submit} className="space-y-4" noValidate>
        <div className="grid gap-3 sm:grid-cols-2">
          <Input id="site-form-name" label={t('Form name')} required value={name} onChange={(e) => setName(e.target.value)} error={errors.name} />
          <Select
            id="site-form-target"
            label={t('Where submissions go')}
            value={target}
            onChange={(e) => {
              const v = e.target.value as FormTarget;
              setTarget(v);
              if (v === 'ENQUIRY' && !form && fields.length <= 1) setFields(DEFAULT_ENQUIRY_FIELDS.map((f) => ({ ...f })));
            }}
            options={[
              { value: 'INBOX', label: t('Website inbox only') },
              { value: 'ENQUIRY', label: t('Admission enquiries (and inbox)') },
            ]}
          />
        </div>
        {target === 'ENQUIRY' && (
          <Alert tone="info">
            {t('Each submission also creates an admission enquiry. The form must have required fields with the keys “studentName” and “phone”; “guardianName”, “email”, “classInterested” and “message” are copied too.')}
          </Alert>
        )}
        <Input
          id="site-form-emails"
          label={t('Email me new submissions')}
          placeholder="office@school.edu.bd, principal@school.edu.bd"
          value={emails}
          onChange={(e) => setEmails(e.target.value)}
          error={errors.emails}
          helperText={t('Optional. Separate several addresses with commas.')}
        />

        <fieldset className="space-y-2">
          <legend className="field-label">{t('Fields')}</legend>
          {errors.fields && <p className="field-error" role="alert">{errors.fields}</p>}
          {fields.map((f, i) => (
            <div key={i} className="rounded-lg border border-slate-200 dark:border-white/10 p-3 space-y-2">
              <div className="grid gap-2 sm:grid-cols-[1.3fr_1fr_1fr]">
                <Input
                  id={`site-form-f${i}-label`}
                  label={t('Label')}
                  value={f.label}
                  error={errors[`f${i}.label`]}
                  onChange={(e) => {
                    const label = e.target.value;
                    const autoKey = !form && (f.key === keyFrom(f.label) || f.key === 'field');
                    patch(i, { label, ...(autoKey ? { key: keyFrom(label) } : {}) });
                  }}
                />
                <Input id={`site-form-f${i}-labelBn`} label={t('Label (Bangla)')} lang="bn" value={f.labelBn ?? ''} onChange={(e) => patch(i, { labelBn: e.target.value || undefined })} />
                <Select
                  id={`site-form-f${i}-type`}
                  label={t('Type')}
                  value={f.type}
                  onChange={(e) => patch(i, { type: e.target.value })}
                  options={FIELD_TYPES.map((v) => ({ value: v, label: t(FIELD_TYPE_LABEL[v]) }))}
                />
              </div>
              {(f.type === 'select' || f.type === 'radio') && (
                <Input
                  id={`site-form-f${i}-options`}
                  label={t('Options')}
                  value={(f.options ?? []).join(', ')}
                  onChange={(e) => patch(i, { options: e.target.value.split(',') })}
                  error={errors[`f${i}.options`]}
                  helperText={t('Separate options with commas.')}
                />
              )}
              <div className="flex flex-wrap items-center gap-3">
                <Input
                  id={`site-form-f${i}-key`}
                  aria-label={t('Field key')}
                  value={f.key}
                  onChange={(e) => patch(i, { key: e.target.value.replace(/[^a-zA-Z0-9_]/g, '') })}
                  error={errors[`f${i}.key`]}
                  className="font-mono text-xs"
                  containerClassName="w-40"
                  title={t('Field key (used in exports)')}
                />
                <Checkbox label={t('Required')} checked={f.required} onChange={(e) => patch(i, { required: e.target.checked })} />
                <div className="ml-auto flex items-center gap-0.5">
                  <Button type="button" size="icon-sm" variant="ghost" aria-label={t('Move up')} disabled={i === 0} onClick={() => move(i, i - 1)}><ArrowUp className="w-4 h-4" /></Button>
                  <Button type="button" size="icon-sm" variant="ghost" aria-label={t('Move down')} disabled={i === fields.length - 1} onClick={() => move(i, i + 1)}><ArrowDown className="w-4 h-4" /></Button>
                  <Button type="button" size="icon-sm" variant="ghost" className="text-red-600 dark:text-red-400" aria-label={t('Remove field')} onClick={() => setFields((fs) => fs.filter((_, j) => j !== i))}><Trash2 className="w-4 h-4" /></Button>
                </div>
              </div>
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            size="sm"
            leftIcon={<Plus className="w-4 h-4" />}
            onClick={() => setFields((fs) => [...fs, { key: `field${fs.length + 1}`, label: '', type: 'text', required: false }])}
          >
            {t('Add field')}
          </Button>
        </fieldset>
      </form>
    </Modal>
  );
};

const SubmissionsDrawer: React.FC<{ form: SiteForm | null; onClose: () => void }> = ({ form, onClose }) => {
  const t = useT();
  const q = useFormSubmissions(form?.id);
  const markRead = useMarkSubmissionRead();
  const labelFor = (k: string) => form?.fields.find((f) => f.key === k)?.label ?? k;

  const exportCsv = async () => {
    if (!form || !q.data?.length) return;
    const XLSX = await import('xlsx');
    const rows = q.data.map((s) => ({
      [t('Received')]: formatDate(s.createdAt, true),
      ...Object.fromEntries(form.fields.map((f) => [f.label, String(s.data?.[f.key] ?? '')])),
    }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Submissions');
    XLSX.writeFile(wb, `${form.name.replace(/[^\w-]+/g, '_')}-submissions.xlsx`);
  };

  return (
    <Drawer
      isOpen={!!form}
      onClose={onClose}
      title={form ? t('Submissions — {name}', { name: form.name }) : ''}
      width="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>{t('Close')}</Button>
          <Button onClick={exportCsv} disabled={!q.data?.length}>{t('Export to Excel')}</Button>
        </>
      }
    >
      {q.isLoading ? (
        <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}</div>
      ) : q.isError ? (
        <ErrorState compact message={apiError(q.error, t('Could not load submissions.'))} onRetry={() => q.refetch()} />
      ) : !q.data?.length ? (
        <EmptyState icon={<Inbox />} title={t('No submissions yet')} description={t('Submissions appear here as soon as visitors send the form.')} />
      ) : (
        <ul className="space-y-3">
          {q.data.map((s) => (
            <li key={s.id} className="rounded-xl border border-slate-200 dark:border-white/10 p-4">
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="text-xs text-slate-500 dark:text-slate-400">{formatDate(s.createdAt, true)}</span>
                <span className="flex items-center gap-2">
                  {!s.readAt && <Badge variant="info">{t('New')}</Badge>}
                  <Button
                    size="xs"
                    variant="ghost"
                    disabled={markRead.isPending}
                    onClick={() => form && markRead.mutate({ formId: form.id, submissionId: s.id, read: !s.readAt })}
                  >
                    {s.readAt ? t('Mark unread') : t('Mark read')}
                  </Button>
                </span>
              </div>
              <dl className="grid gap-2 sm:grid-cols-2">
                {Object.entries(s.data ?? {}).map(([k, v]) => (
                  <div key={k} className="min-w-0">
                    <dt className="text-xs font-medium text-slate-500 dark:text-slate-400">{labelFor(k)}</dt>
                    <dd className="text-sm text-slate-900 dark:text-slate-100 break-words whitespace-pre-wrap">{v === true ? t('Yes') : v === false ? t('No') : String(v ?? '—')}</dd>
                  </div>
                ))}
              </dl>
            </li>
          ))}
        </ul>
      )}
    </Drawer>
  );
};

export const FormsTab: React.FC = () => {
  const t = useT();
  const q = useForms();
  const del = useDeleteForm();
  const [edit, setEdit] = React.useState<{ open: boolean; form: SiteForm | null }>({ open: false, form: null });
  const [inbox, setInbox] = React.useState<SiteForm | null>(null);
  const [toDelete, setToDelete] = React.useState<SiteForm | null>(null);

  return (
    <Card>
      <CardHeader
        icon={<ClipboardList className="w-4 h-4" />}
        title={t('Forms')}
        description={t('Contact and admission forms for your website. Spam protection and rate limits are built in.')}
        actions={<Button leftIcon={<Plus className="w-4 h-4" />} onClick={() => setEdit({ open: true, form: null })}>{t('New form')}</Button>}
      />
      {q.isLoading ? (
        <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-lg" />)}</div>
      ) : q.isError ? (
        <ErrorState message={apiError(q.error, t('Could not load forms.'))} onRetry={() => q.refetch()} />
      ) : !q.data?.length ? (
        <EmptyState
          icon={<ClipboardList />}
          title={t('No forms yet')}
          description={t('Without a custom form, the enquiry block uses the default admission enquiry form.')}
          action={<Button onClick={() => setEdit({ open: true, form: null })}>{t('New form')}</Button>}
        />
      ) : (
        <ul className="divide-y divide-slate-100 dark:divide-white/6 -mx-5">
          {q.data.map((f) => (
            <li key={f.id} className="px-5 py-3 flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-slate-900 dark:text-slate-50">{f.name}</span>
                  <Badge variant={f.target === 'ENQUIRY' ? 'primary' : 'neutral'}>{f.target === 'ENQUIRY' ? t('Admission enquiry') : t('Inbox')}</Badge>
                  {!!f.unreadCount && <Badge variant="info">{t('{n} new', { n: formatNumber(f.unreadCount) })}</Badge>}
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  {t('{n} fields', { n: formatNumber(f.fields?.length ?? 0) })}
                  {typeof f.submissionCount === 'number' && ` · ${t('{n} submissions', { n: formatNumber(f.submissionCount) })}`}
                  {f.notifyEmails?.length ? ` · ${t('Notifies {emails}', { emails: f.notifyEmails.join(', ') })}` : ''}
                </p>
              </div>
              <div className="flex flex-wrap gap-1">
                <Button size="sm" variant="secondary" leftIcon={<Inbox className="w-3.5 h-3.5" />} onClick={() => setInbox(f)}>{t('Submissions')}</Button>
                <Button size="sm" variant="ghost" leftIcon={<Pencil className="w-3.5 h-3.5" />} onClick={() => setEdit({ open: true, form: f })}>{t('Edit')}</Button>
                <Button size="icon-sm" variant="ghost" className="text-red-600 dark:text-red-400" aria-label={t('Delete {name}', { name: f.name })} onClick={() => setToDelete(f)}><Trash2 className="w-4 h-4" /></Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <FormBuilderModal isOpen={edit.open} form={edit.form} onClose={() => setEdit({ open: false, form: null })} />
      <SubmissionsDrawer form={inbox} onClose={() => setInbox(null)} />
      <ConfirmModal
        isOpen={!!toDelete}
        title={t('Delete “{name}”?', { name: toDelete?.name ?? '' })}
        message={t('The form and all of its submissions are deleted. Blocks that use it fall back to the default enquiry form.')}
        confirmLabel={t('Delete form')}
        isLoading={del.isPending}
        onCancel={() => setToDelete(null)}
        onConfirm={() => toDelete && del.mutate(toDelete.id, { onSuccess: () => setToDelete(null) })}
      />
    </Card>
  );
};
