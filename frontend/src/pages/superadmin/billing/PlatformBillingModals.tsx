import React, { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Plus, Trash2 } from 'lucide-react';
import {
  platformBillingApi,
  type AccessLevel,
  type ManualMethod,
  type PlatformInvoice,
  type ProfileInput,
} from '@/api/platformBilling.api';
import { Button, Checkbox, Input, Modal, Select, Skeleton, Textarea } from '@/components/ui';
import { formatCurrency, useT } from '@/i18n';
import { currentPeriod, lineTotals, previewMonthly } from '@/pages/billing/platform/platformBilling.logic';

// =============================================================================
// P1 super-admin modals: billing profile, manual payment, edit invoice lines,
// waive/cancel reason, access override. Every write is audit-logged server-side.
// =============================================================================

const apiError = (err: any, fallback: string) => {
  const errors = err?.response?.data?.errors;
  if (Array.isArray(errors) && errors[0]?.message) return `${errors[0].message}`;
  return err?.response?.data?.message || fallback;
};

export function invalidatePlatformAdmin(qc: ReturnType<typeof useQueryClient>) {
  for (const k of ['platform-dashboard', 'platform-invoices', 'platform-collections', 'platform-school', 'platform-invoice', 'platform-profile']) {
    qc.invalidateQueries({ queryKey: [k] });
  }
}

// ── Billing profile ─────────────────────────────────────────────────────────

const EMPTY: ProfileInput = {
  isActive: true,
  pricingModel: 'PER_STUDENT',
  flatAmount: null,
  perStudentRate: 30,
  minimumCharge: 500,
  discountType: null,
  discountValue: null,
  discountNote: null,
  dueDay: 10,
  billingStartMonth: currentPeriod(),
  serviceStartDate: null,
  firstMonthMode: 'PRORATE',
  freeMonths: 0,
  remindSms: true,
  remindEmail: true,
  smsLanguage: 'bn',
  autoRestrictAfterDays: null,
  billingPhone: null,
  billingEmail: null,
  notes: null,
};

const num = (v: string | null | undefined) => (v === null || v === undefined || v === '' ? null : Number(v));

export const BillingProfileModal: React.FC<{ institutionId: string; institutionName?: string; isOpen: boolean; onClose: () => void }> = ({
  institutionId,
  institutionName,
  isOpen,
  onClose,
}) => {
  const t = useT();
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['platform-profile', institutionId], queryFn: () => platformBillingApi.profile(institutionId), enabled: isOpen });
  const [form, setForm] = useState<ProfileInput>(EMPTY);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!data) return;
    const p = data.profile;
    setForm(
      p
        ? {
            isActive: p.isActive,
            pricingModel: p.pricingModel,
            flatAmount: num(p.flatAmount),
            perStudentRate: num(p.perStudentRate),
            minimumCharge: Number(p.minimumCharge ?? 0),
            discountType: p.discountType,
            discountValue: num(p.discountValue),
            discountNote: p.discountNote,
            dueDay: p.dueDay,
            billingStartMonth: p.billingStartMonth,
            serviceStartDate: p.serviceStartDate ? p.serviceStartDate.slice(0, 10) : null,
            firstMonthMode: p.firstMonthMode,
            freeMonths: p.freeMonths,
            remindSms: p.remindSms,
            remindEmail: p.remindEmail,
            smsLanguage: p.smsLanguage,
            autoRestrictAfterDays: p.autoRestrictAfterDays,
            billingPhone: p.billingPhone,
            billingEmail: p.billingEmail,
            notes: p.notes,
          }
        : { ...EMPTY, serviceStartDate: new Date().toISOString().slice(0, 10) },
    );
  }, [data]);

  const set = <K extends keyof ProfileInput>(k: K, v: ProfileInput[K]) => setForm((f) => ({ ...f, [k]: v }));
  const preview = useMemo(() => previewMonthly(form, data?.activeStudents ?? 0), [form, data?.activeStudents]);

  const save = async () => {
    setSaving(true);
    try {
      await platformBillingApi.saveProfile(institutionId, { ...form, reason: reason || undefined, billingEmail: form.billingEmail || null, billingPhone: form.billingPhone || null });
      toast.success(t('Billing profile saved'));
      invalidatePlatformAdmin(qc);
      onClose();
    } catch (err) {
      toast.error(apiError(err, t('Could not save the billing profile')));
    } finally {
      setSaving(false);
    }
  };

  const numberInput = (label: string, key: keyof ProfileInput, opts: { step?: string; min?: number; max?: number; helper?: string } = {}) => (
    <Input
      label={label}
      type="number"
      inputMode="decimal"
      step={opts.step ?? '0.01'}
      min={opts.min ?? 0}
      max={opts.max}
      helperText={opts.helper}
      value={(form[key] as number | null) ?? ''}
      onChange={(e) => set(key, (e.target.value === '' ? null : Number(e.target.value)) as never)}
    />
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="xl"
      title={t('Billing profile')}
      description={institutionName ? t('How PeopleNIT bills {name} every month', { name: institutionName }) : undefined}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>{t('Cancel')}</Button>
          <Button isLoading={saving} onClick={save} disabled={isLoading}>{t('Save')}</Button>
        </>
      }
    >
      {isLoading ? (
        <Skeleton className="h-80" />
      ) : (
        <div className="space-y-5">
          <div className="grid sm:grid-cols-2 gap-4">
            <Select
              label={t('Pricing model')}
              value={form.pricingModel}
              onChange={(e) => set('pricingModel', e.target.value as ProfileInput['pricingModel'])}
              options={[
                { value: 'PER_STUDENT', label: t('Per active student') },
                { value: 'FLAT', label: t('Flat monthly amount') },
              ]}
            />
            {form.pricingModel === 'FLAT'
              ? numberInput(t('Monthly amount (৳)'), 'flatAmount')
              : numberInput(t('Rate per student (৳)'), 'perStudentRate', { helper: t('{n} active students today', { n: data?.activeStudents ?? 0 }) })}
            {form.pricingModel === 'PER_STUDENT' && numberInput(t('Minimum monthly charge (৳)'), 'minimumCharge')}
            <Select
              label={t('Discount')}
              value={form.discountType ?? ''}
              onChange={(e) => set('discountType', (e.target.value || null) as ProfileInput['discountType'])}
              options={[
                { value: '', label: t('No discount') },
                { value: 'PERCENT', label: t('Percentage (%)') },
                { value: 'FIXED', label: t('Fixed amount (৳)') },
              ]}
            />
            {form.discountType && numberInput(form.discountType === 'PERCENT' ? t('Discount %') : t('Discount (৳)'), 'discountValue', { max: form.discountType === 'PERCENT' ? 100 : undefined })}
            {form.discountType && <Input label={t('Discount note')} value={form.discountNote ?? ''} onChange={(e) => set('discountNote', e.target.value || null)} />}
          </div>

          <p className="text-sm rounded-lg bg-slate-50 dark:bg-white/5 px-3 py-2 text-slate-700 dark:text-slate-200">
            {t('Estimated monthly bill now: {amount}', { amount: formatCurrency(preview) })}
          </p>

          <div className="grid sm:grid-cols-3 gap-4">
            <Input label={t('Billing starts (month)')} type="month" value={form.billingStartMonth} onChange={(e) => set('billingStartMonth', e.target.value)} />
            <Input label={t('Service start date')} type="date" value={form.serviceStartDate ?? ''} helperText={t('Used to prorate the first month')} onChange={(e) => set('serviceStartDate', e.target.value || null)} />
            <Select
              label={t('First month')}
              value={form.firstMonthMode}
              onChange={(e) => set('firstMonthMode', e.target.value as ProfileInput['firstMonthMode'])}
              options={[
                { value: 'PRORATE', label: t('Prorate (remaining days)') },
                { value: 'FREE', label: t('Free') },
                { value: 'FULL', label: t('Full month') },
              ]}
            />
            {numberInput(t('Free months'), 'freeMonths', { step: '1', max: 24, helper: t('Counted from the start month') })}
            {numberInput(t('Due day of the month'), 'dueDay', { step: '1', min: 1, max: 28 })}
            <Input
              label={t('Auto-restrict after (days overdue)')}
              type="number"
              min={1}
              max={365}
              placeholder={t('Off')}
              helperText={t('Leave empty to keep it off (default)')}
              value={form.autoRestrictAfterDays ?? ''}
              onChange={(e) => set('autoRestrictAfterDays', e.target.value === '' ? null : Number(e.target.value))}
            />
          </div>

          <fieldset className="space-y-3">
            <legend className="text-sm font-bold text-slate-900 dark:text-white">{t('Reminders and billing contacts')}</legend>
            <div className="flex flex-wrap gap-4">
              <Checkbox label={t('SMS reminders')} checked={form.remindSms} onChange={(e) => set('remindSms', e.target.checked)} />
              <Checkbox label={t('Email reminders')} checked={form.remindEmail} onChange={(e) => set('remindEmail', e.target.checked)} />
            </div>
            <div className="grid sm:grid-cols-3 gap-4">
              <Select
                label={t('SMS language')}
                value={form.smsLanguage}
                onChange={(e) => set('smsLanguage', e.target.value as 'bn' | 'en')}
                options={[
                  { value: 'bn', label: 'বাংলা' },
                  { value: 'en', label: 'English' },
                ]}
              />
              <Input
                label={t('Billing phone')}
                inputMode="tel"
                placeholder={data?.defaults.phones[0] ?? '01XXXXXXXXX'}
                helperText={t('Empty = school phone and admin phones')}
                value={form.billingPhone ?? ''}
                onChange={(e) => set('billingPhone', e.target.value || null)}
              />
              <Input
                label={t('Billing email')}
                type="email"
                placeholder={data?.defaults.emails[0] ?? ''}
                helperText={t('Empty = school admin emails')}
                value={form.billingEmail ?? ''}
                onChange={(e) => set('billingEmail', e.target.value || null)}
              />
            </div>
          </fieldset>

          <Checkbox
            label={t('Billing active')}
            description={t('Untick to pause: no new invoices, reminders or automatic restriction.')}
            checked={form.isActive}
            onChange={(e) => set('isActive', e.target.checked)}
          />
          <Textarea label={t('Internal notes')} rows={2} value={form.notes ?? ''} onChange={(e) => set('notes', e.target.value || null)} />
          {data?.profile && <Input label={t('Reason for this change (audit log)')} value={reason} onChange={(e) => setReason(e.target.value)} />}
        </div>
      )}
    </Modal>
  );
};

// ── Manual payment ──────────────────────────────────────────────────────────

const METHODS: ManualMethod[] = ['CASH', 'BANK_TRANSFER', 'BKASH_PERSONAL', 'NAGAD_PERSONAL', 'OTHER'];

export const ManualPaymentModal: React.FC<{ invoice: PlatformInvoice | null; onClose: () => void }> = ({ invoice, onClose }) => {
  const t = useT();
  const qc = useQueryClient();
  const [method, setMethod] = useState<ManualMethod>('CASH');
  const [amount, setAmount] = useState<string>('');
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');
  const [paidAt, setPaidAt] = useState(new Date().toISOString().slice(0, 10));
  const [notify, setNotify] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (invoice) setAmount(String(invoice.amountDue));
  }, [invoice]);

  const save = async () => {
    if (!invoice) return;
    setSaving(true);
    try {
      const r = await platformBillingApi.recordPayment(invoice.id, {
        method,
        amount: Number(amount),
        reference: reference || undefined,
        note: note || undefined,
        paidAt,
        notify,
      });
      toast.success(t('Payment recorded — receipt {n}', { n: r.receiptNumber }));
      invalidatePlatformAdmin(qc);
      onClose();
    } catch (err) {
      toast.error(apiError(err, t('Could not record the payment')));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen={!!invoice}
      onClose={onClose}
      title={t('Record a payment')}
      description={invoice ? `${invoice.invoiceNumber} · ${t('Due')} ${formatCurrency(invoice.amountDue)}` : undefined}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>{t('Cancel')}</Button>
          <Button isLoading={saving} onClick={save} disabled={!(Number(amount) > 0)}>{t('Record payment')}</Button>
        </>
      }
    >
      <div className="grid sm:grid-cols-2 gap-4">
        <Select
          label={t('Method')}
          value={method}
          onChange={(e) => setMethod(e.target.value as ManualMethod)}
          options={METHODS.map((m) => ({ value: m, label: t(m.replace(/_/g, ' ')) }))}
        />
        <Input label={t('Amount (৳)')} type="number" step="0.01" min={0.01} max={invoice?.amountDue} value={amount} helperText={t('Part payments are allowed')} onChange={(e) => setAmount(e.target.value)} />
        <Input label={t('Reference (slip / TrxID)')} value={reference} onChange={(e) => setReference(e.target.value)} />
        <Input label={t('Paid on')} type="date" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} />
        <div className="sm:col-span-2">
          <Textarea label={t('Note')} rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        <div className="sm:col-span-2">
          <Checkbox label={t('Send the receipt to the school by SMS and email')} checked={notify} onChange={(e) => setNotify(e.target.checked)} />
        </div>
      </div>
    </Modal>
  );
};

// ── Edit invoice lines ──────────────────────────────────────────────────────

interface EditableLine {
  description: string;
  quantity: number;
  unitPrice: number;
}

export const EditLinesModal: React.FC<{ invoice: PlatformInvoice | null; onClose: () => void }> = ({ invoice, onClose }) => {
  const t = useT();
  const qc = useQueryClient();
  const [lines, setLines] = useState<EditableLine[]>([]);
  const [dueDate, setDueDate] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!invoice) return;
    setLines(invoice.lines.map((l) => ({ description: l.description, quantity: l.quantity, unitPrice: l.unitPrice })));
    setDueDate(invoice.dueDate.slice(0, 10));
    setReason('');
  }, [invoice]);

  const totals = lineTotals(lines);
  const update = (i: number, patch: Partial<EditableLine>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  const save = async () => {
    if (!invoice) return;
    setSaving(true);
    try {
      await platformBillingApi.editLines(invoice.id, { lines, dueDate, reason });
      toast.success(t('Invoice updated'));
      invalidatePlatformAdmin(qc);
      onClose();
    } catch (err) {
      toast.error(apiError(err, t('Could not update the invoice')));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen={!!invoice}
      onClose={onClose}
      size="xl"
      title={t('Edit invoice lines')}
      description={invoice?.invoiceNumber}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>{t('Cancel')}</Button>
          <Button isLoading={saving} onClick={save} disabled={reason.trim().length < 3 || totals.total <= 0}>{t('Save')}</Button>
        </>
      }
    >
      <div className="space-y-3">
        {lines.map((l, i) => (
          <div key={i} className="grid grid-cols-12 gap-2 items-end">
            <Input containerClassName="col-span-12 sm:col-span-6" label={i === 0 ? t('Description') : undefined} aria-label={t('Description')} value={l.description} onChange={(e) => update(i, { description: e.target.value })} />
            <Input containerClassName="col-span-4 sm:col-span-2" label={i === 0 ? t('Qty') : undefined} aria-label={t('Qty')} type="number" min={0} value={l.quantity} onChange={(e) => update(i, { quantity: Number(e.target.value) })} />
            <Input containerClassName="col-span-6 sm:col-span-3" label={i === 0 ? t('Unit price (৳)') : undefined} aria-label={t('Unit price (৳)')} type="number" step="0.01" value={l.unitPrice} onChange={(e) => update(i, { unitPrice: Number(e.target.value) })} />
            <Button className="col-span-2 sm:col-span-1" variant="ghost" size="icon" aria-label={t('Remove line')} onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))} disabled={lines.length <= 1}>
              <Trash2 className="w-4 h-4" aria-hidden="true" />
            </Button>
          </div>
        ))}
        <Button variant="secondary" size="sm" leftIcon={<Plus className="w-4 h-4" />} onClick={() => setLines((ls) => [...ls, { description: '', quantity: 1, unitPrice: 0 }])}>
          {t('Add line')}
        </Button>
        <p className="text-xs text-slate-500">{t('Use a negative unit price for a discount line.')}</p>
        <p className="text-sm font-semibold">{t('New total: {amount}', { amount: formatCurrency(totals.total) })}</p>
        <div className="grid sm:grid-cols-2 gap-4">
          <Input label={t('Due date')} type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          <Input label={t('Reason (required, audit log)')} value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>
      </div>
    </Modal>
  );
};

// ── Waive / cancel ──────────────────────────────────────────────────────────

export const ReasonModal: React.FC<{ action: 'waive' | 'cancel' | null; invoice: PlatformInvoice | null; onClose: () => void }> = ({ action, invoice, onClose }) => {
  const t = useT();
  const qc = useQueryClient();
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => setReason(''), [action, invoice]);

  const run = async () => {
    if (!invoice || !action) return;
    setSaving(true);
    try {
      if (action === 'waive') await platformBillingApi.waive(invoice.id, reason);
      else await platformBillingApi.cancel(invoice.id, reason);
      toast.success(action === 'waive' ? t('Invoice waived') : t('Invoice cancelled'));
      invalidatePlatformAdmin(qc);
      onClose();
    } catch (err) {
      toast.error(apiError(err, t('Could not update the invoice')));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen={!!invoice && !!action}
      onClose={onClose}
      title={action === 'waive' ? t('Waive the remaining amount') : t('Cancel this invoice')}
      description={invoice ? `${invoice.invoiceNumber} · ${formatCurrency(invoice.amountDue)}` : undefined}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>{t('Close')}</Button>
          <Button variant="danger" isLoading={saving} onClick={run} disabled={reason.trim().length < 3}>
            {action === 'waive' ? t('Waive') : t('Cancel invoice')}
          </Button>
        </>
      }
    >
      <Textarea label={t('Reason (required, audit log)')} rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
    </Modal>
  );
};

// ── Access override ─────────────────────────────────────────────────────────

export const OverrideModal: React.FC<{
  institutionId: string | null;
  current: { level: AccessLevel | null; keep: boolean; reason: string | null } | null;
  onClose: () => void;
}> = ({ institutionId, current, onClose }) => {
  const t = useT();
  const qc = useQueryClient();
  const [level, setLevel] = useState<AccessLevel | ''>('');
  const [reason, setReason] = useState('');
  const [keep, setKeep] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setLevel(current?.level ?? '');
    setKeep(current?.keep ?? false);
    setReason('');
  }, [current, institutionId]);

  const save = async () => {
    if (!institutionId) return;
    setSaving(true);
    try {
      await platformBillingApi.setOverride(institutionId, { level: level || null, reason: reason || undefined, keep });
      toast.success(t('Access updated'));
      invalidatePlatformAdmin(qc);
      onClose();
    } catch (err) {
      toast.error(apiError(err, t('Could not change access')));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen={!!institutionId}
      onClose={onClose}
      title={t('School access')}
      description={t('Restricted = read-only with a pay banner. Disabled = only the billing page works. Payment always stays possible.')}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>{t('Cancel')}</Button>
          <Button isLoading={saving} onClick={save} disabled={!!level && reason.trim().length < 3}>{t('Save')}</Button>
        </>
      }
    >
      <div className="space-y-4">
        <Select
          label={t('Access')}
          value={level}
          onChange={(e) => setLevel(e.target.value as AccessLevel | '')}
          options={[
            { value: '', label: t('Automatic (no override)') },
            { value: 'ACTIVE', label: t('Active — full access') },
            { value: 'RESTRICTED', label: t('Restricted — read-only') },
            { value: 'DISABLED', label: t('Disabled — billing page only') },
          ]}
        />
        {current?.reason && <p className="text-xs text-slate-500">{t('Current reason: {r}', { r: current.reason })}</p>}
        <Textarea label={level ? t('Reason (required, audit log)') : t('Reason (optional)')} rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
        {level && level !== 'ACTIVE' && (
          <Checkbox
            label={t('Keep until I change it')}
            description={t('Without this, the restriction lifts by itself once every overdue bill is paid.')}
            checked={keep}
            onChange={(e) => setKeep(e.target.checked)}
          />
        )}
      </div>
    </Modal>
  );
};
