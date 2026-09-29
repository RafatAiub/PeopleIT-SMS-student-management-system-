import React, { useMemo, useState } from 'react';
import { Plus, Trash2, CheckCircle2, AlertTriangle } from 'lucide-react';
import toast from 'react-hot-toast';
import { Modal, Button, Input, Select, Checkbox, Skeleton, Alert, DescriptionList, ErrorState } from '../../components/ui';
import { useT, formatCurrency, formatNumber } from '../../i18n';
import { useClassOptions, useSectionOptions, usePreviewBulkInvoices, useGenerateBulkInvoices } from './feeExtras.queries';
import type { BulkInvoicePayload, BulkPreview, BulkResult, FeeCategory } from './types';

type Step = 'scope' | 'items' | 'preview' | 'result';

interface ItemDraft {
  key: string;
  feeCategoryId: string;
  amount: string;
  description: string;
}

const newItem = (): ItemDraft => ({ key: Math.random().toString(36).slice(2), feeCategoryId: '', amount: '', description: '' });

const currentPeriod = () => new Date().toISOString().slice(0, 7); // YYYY-MM

interface BulkInvoiceWizardProps {
  isOpen: boolean;
  onClose: () => void;
  categories: FeeCategory[];
}

// Bulk invoice generation: class/section → items → dry-run preview → confirm → result.
// Backend: POST /fees/invoices/bulk/preview and POST /fees/invoices/bulk (SA/A/ACC).
// Idempotent per (student, fee category, period): re-running skips students
// already billed for that period.
export const BulkInvoiceWizard: React.FC<BulkInvoiceWizardProps> = ({ isOpen, onClose, categories }) => {
  const t = useT();
  const activeCategories = categories.filter((c) => c.isActive !== false);

  const [step, setStep] = useState<Step>('scope');
  const [classId, setClassId] = useState('');
  const [sectionId, setSectionId] = useState('');
  const [period, setPeriod] = useState(currentPeriod());
  const [dueDate, setDueDate] = useState(new Date().toISOString().split('T')[0]);
  const [useSchedule, setUseSchedule] = useState(false);
  const [applyConcessions, setApplyConcessions] = useState(true);
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<ItemDraft[]>([newItem()]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<BulkPreview | null>(null);
  const [result, setResult] = useState<BulkResult | null>(null);

  const classes = useClassOptions(isOpen);
  const sections = useSectionOptions(classId || null);
  const previewMut = usePreviewBulkInvoices();
  const generateMut = useGenerateBulkInvoices();

  const reset = () => {
    setStep('scope');
    setClassId('');
    setSectionId('');
    setPeriod(currentPeriod());
    setDueDate(new Date().toISOString().split('T')[0]);
    setUseSchedule(false);
    setApplyConcessions(true);
    setNotes('');
    setItems([newItem()]);
    setErrors({});
    setPreview(null);
    setResult(null);
  };

  const close = () => {
    reset();
    onClose();
  };

  const payload = useMemo<BulkInvoicePayload>(
    () => ({
      classId,
      sectionId: sectionId || null,
      period: period.trim(),
      dueDate: new Date(dueDate).toISOString(),
      useFeeSchedule: useSchedule || undefined,
      applyConcessions,
      notes: notes.trim() || undefined,
      items: items
        .filter((i) => i.feeCategoryId && Number(i.amount) > 0)
        .map((i) => ({ feeCategoryId: i.feeCategoryId, amount: Number(i.amount), description: i.description.trim() || undefined })),
    }),
    [classId, sectionId, period, dueDate, useSchedule, applyConcessions, notes, items],
  );

  const validateScope = () => {
    const next: Record<string, string> = {};
    if (!classId) next.classId = t('Choose a class');
    if (!period.trim()) next.period = t('Period is required');
    else if (!/^[\p{L}\p{N} _\-/.]+$/u.test(period.trim())) next.period = t('Use letters, numbers, spaces, - _ / . only');
    if (!dueDate) next.dueDate = t('Due date is required');
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const validateItems = () => {
    const next: Record<string, string> = {};
    items.forEach((i, idx) => {
      const touched = i.feeCategoryId || i.amount;
      if (!touched) return;
      if (!i.feeCategoryId) next[`cat-${idx}`] = t('Choose a fee category');
      if (!(Number(i.amount) > 0)) next[`amt-${idx}`] = t('Amount must be greater than ৳ 0');
    });
    if (!useSchedule && payload.items!.length === 0) next.items = t('Add at least one fee item or use the fee schedule');
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const runPreview = async () => {
    if (!validateItems()) return;
    try {
      const res = await previewMut.mutateAsync(payload);
      setPreview(res);
      setStep('preview');
    } catch (err: any) {
      toast.error(err.response?.data?.message || t('Failed to preview bulk invoices'));
    }
  };

  const confirm = async () => {
    try {
      const res = await generateMut.mutateAsync(payload);
      setResult(res);
      setStep('result');
    } catch (err: any) {
      toast.error(err.response?.data?.message || t('Failed to generate invoices'));
    }
  };

  const updateItem = (key: string, patch: Partial<ItemDraft>) => setItems((prev) => prev.map((i) => (i.key === key ? { ...i, ...patch } : i)));

  const stepLabel: Record<Step, string> = {
    scope: t('Step 1 of 3 — Class & period'),
    items: t('Step 2 of 3 — Fee items'),
    preview: t('Step 3 of 3 — Review'),
    result: t('Done'),
  };

  let body: React.ReactNode;
  let footer: React.ReactNode;

  if (step === 'scope') {
    body = (
      <div className="space-y-4">
        {classes.isError ? (
          <ErrorState compact onRetry={() => classes.refetch()} message={t('Failed to load classes.')} />
        ) : classes.isLoading ? (
          <Skeleton className="h-10" />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Select
              label={t('Class')}
              required
              value={classId}
              onChange={(e) => { setClassId(e.target.value); setSectionId(''); }}
              placeholder={t('-- Choose --')}
              options={(classes.data ?? []).map((c) => ({ value: c.id, label: c.name }))}
              error={errors.classId}
            />
            <Select
              label={t('Section')}
              value={sectionId}
              onChange={(e) => setSectionId(e.target.value)}
              disabled={!classId || sections.isLoading}
              placeholder={t('All sections')}
              options={(sections.data ?? []).map((s) => ({ value: s.id, label: s.name }))}
            />
          </div>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input
            label={t('Billing period')}
            required
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            error={errors.period}
            helperText={t('e.g. 2026-10 or "Term 1 2026". Students already billed for this period are skipped.')}
          />
          <Input label={t('Due date')} type="date" required value={dueDate} onChange={(e) => setDueDate(e.target.value)} error={errors.dueDate} />
        </div>
        <Input label={t('Notes')} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={t('Optional note on every invoice')} />
      </div>
    );
    footer = (
      <>
        <Button variant="secondary" onClick={close}>{t('Cancel')}</Button>
        <Button onClick={() => validateScope() && setStep('items')}>{t('Next')}</Button>
      </>
    );
  } else if (step === 'items') {
    body = (
      <div className="space-y-4">
        <Checkbox
          label={t('Use fee schedule')}
          description={t('Adds every active fee-schedule entry for this class (items below override the schedule for the same category).')}
          checked={useSchedule}
          onChange={(e) => setUseSchedule(e.target.checked)}
        />
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="field-label mb-0">{t('Fee items')}</span>
            <Button type="button" variant="outline" size="sm" leftIcon={<Plus className="w-3.5 h-3.5" />} onClick={() => setItems((p) => [...p, newItem()])}>
              {t('Add row')}
            </Button>
          </div>
          {items.map((item, idx) => (
            <div key={item.key} className="rounded-lg border border-slate-200 dark:border-white/10 p-3 grid grid-cols-1 sm:grid-cols-12 gap-2 items-start">
              <div className="sm:col-span-5">
                <Select
                  label={t('Fee category')}
                  value={item.feeCategoryId}
                  onChange={(e) => {
                    const cat = activeCategories.find((c) => c.id === e.target.value);
                    updateItem(item.key, { feeCategoryId: e.target.value, amount: cat ? String(Number(cat.amount)) : item.amount });
                  }}
                  placeholder={t('-- Choose --')}
                  options={activeCategories.map((c) => ({ value: c.id, label: `${c.name} (${formatCurrency(c.amount)})` }))}
                  error={errors[`cat-${idx}`]}
                />
              </div>
              <div className="sm:col-span-3">
                <Input label={t('Amount (৳)')} type="number" min={0} step="0.01" value={item.amount} onChange={(e) => updateItem(item.key, { amount: e.target.value })} error={errors[`amt-${idx}`]} />
              </div>
              <div className="sm:col-span-3">
                <Input label={t('Label')} value={item.description} onChange={(e) => updateItem(item.key, { description: e.target.value })} placeholder={t('Optional')} />
              </div>
              <button
                type="button"
                onClick={() => setItems((p) => (p.length > 1 ? p.filter((i) => i.key !== item.key) : [newItem()]))}
                aria-label={t('Remove row')}
                className="sm:col-span-1 sm:mt-6 p-2 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/10 justify-self-end"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
          {errors.items && <p className="field-error">{errors.items}</p>}
        </div>
        <Checkbox
          label={t('Apply student concessions')}
          description={t('Each student\'s active concessions are applied as line discounts.')}
          checked={applyConcessions}
          onChange={(e) => setApplyConcessions(e.target.checked)}
        />
      </div>
    );
    footer = (
      <>
        <Button variant="secondary" onClick={() => setStep('scope')}>{t('Back')}</Button>
        <Button onClick={runPreview} isLoading={previewMut.isPending}>{t('Preview')}</Button>
      </>
    );
  } else if (step === 'preview' && preview) {
    body = (
      <div className="space-y-4">
        <DescriptionList
          columns={2}
          items={[
            { label: t('Class'), value: `${preview.className}${preview.sectionName ? ` — ${preview.sectionName}` : ` (${t('all sections')})`}` },
            { label: t('Period'), value: preview.period },
            { label: t('Active students'), value: formatNumber(preview.studentCount) },
            { label: t('Invoices to create'), value: <span className="font-semibold">{formatNumber(preview.invoiceCount)}</span> },
            { label: t('Already billed (skipped)'), value: formatNumber(preview.skippedStudentCount) },
            { label: t('Gross amount'), value: formatCurrency(preview.grossAmount) },
            { label: t('Concessions'), value: preview.concessionAmount > 0 ? `− ${formatCurrency(preview.concessionAmount)}` : formatCurrency(0) },
            { label: t('Total to invoice'), value: <span className="font-bold">{formatCurrency(preview.totalAmount)}</span> },
          ]}
        />
        <div className="rounded-lg border border-slate-200 dark:border-white/10 divide-y divide-slate-100 dark:divide-white/5">
          {preview.items.map((i) => (
            <div key={i.feeCategoryId} className="flex justify-between gap-3 px-3 py-2 text-sm">
              <span className="text-slate-700 dark:text-slate-300 min-w-0 break-words">{i.description || i.categoryName} [{preview.period}]</span>
              <span className="tabular-nums font-medium shrink-0">{formatCurrency(i.amount)}</span>
            </div>
          ))}
        </div>
        {preview.invoiceCount === 0 ? (
          <Alert tone="info" title={t('Nothing to create')}>
            {preview.studentCount === 0
              ? t('There are no active students in this class/section.')
              : t('Every student has already been billed for these items in this period.')}
          </Alert>
        ) : (
          <Alert tone="warning">
            {t('This creates {count} invoices and notifies each student. It cannot be undone in bulk.', { count: preview.invoiceCount })}
          </Alert>
        )}
      </div>
    );
    footer = (
      <>
        <Button variant="secondary" onClick={() => setStep('items')}>{t('Back')}</Button>
        <Button onClick={confirm} isLoading={generateMut.isPending} disabled={preview.invoiceCount === 0}>
          {t('Generate {count} invoices', { count: preview.invoiceCount })}
        </Button>
      </>
    );
  } else if (result) {
    const ok = result.status === 'COMPLETED';
    body = (
      <div className="space-y-4">
        <div className={`rounded-lg border p-4 flex gap-3 ${ok ? 'border-emerald-200 bg-emerald-50 dark:border-emerald-500/30 dark:bg-emerald-500/10' : 'border-amber-200 bg-amber-50 dark:border-amber-500/30 dark:bg-amber-500/10'}`}>
          {ok ? <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" /> : <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />}
          <div className="text-sm">
            <p className="font-semibold text-slate-900 dark:text-white">{result.label}</p>
            <p className="text-slate-600 dark:text-slate-300">
              {ok ? t('All invoices were generated.') : t('Some invoices could not be generated — run the same batch again to retry; already-created invoices are skipped.')}
            </p>
          </div>
        </div>
        <DescriptionList
          columns={2}
          items={[
            { label: t('Created'), value: formatNumber(result.createdCount) },
            { label: t('Skipped'), value: formatNumber(result.skippedCount) },
            { label: t('Failed'), value: formatNumber(result.failedCount) },
            { label: t('Total invoiced'), value: formatCurrency(result.totalAmount) },
          ]}
        />
      </div>
    );
    footer = <Button onClick={close}>{t('Close')}</Button>;
  }

  return (
    <Modal isOpen={isOpen} onClose={close} title={t('Bulk generate invoices')} description={stepLabel[step]} size="xl" footer={footer}>
      {body}
    </Modal>
  );
};
