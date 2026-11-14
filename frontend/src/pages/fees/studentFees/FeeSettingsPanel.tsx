import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { CalendarClock, Plus, Trash2 } from 'lucide-react';
import { Badge, Button, Checkbox, Input, Modal, Select, Skeleton } from '../../../components/ui';
import { formatCurrency, formatDate, useT } from '../../../i18n';
import { useFeeCategoriesList } from '../hooks';
import {
  useDeleteFineRule,
  useFeeSettings,
  useFineRules,
  useSaveFeeSettings,
  useSaveFineRule,
  type FineRule,
  type FineRulePayload,
} from './studentFees.api';
import { GenerateMonthlyModal } from './GenerateMonthlyModal';
import { parseAmount } from './studentFees.logic';

const days = (n: number) => Array.from({ length: n }, (_, i) => ({ value: String(i + 1), label: String(i + 1) }));

/** Settings → Fees: monthly auto-invoices + late fine rules (ADMIN edits, accountant reads). */
export const FeeSettingsPanel: React.FC<{ canEdit: boolean }> = ({ canEdit }) => {
  const t = useT();
  const { data: settings, isLoading } = useFeeSettings();
  const { data: cats } = useFeeCategoriesList(false);
  const save = useSaveFeeSettings();
  const [form, setForm] = useState({ autoGenerate: false, generateDay: 1, dueDay: 10, monthlyCategoryIds: [] as string[], arrearsMode: 'SEPARATE' as 'SEPARATE' | 'ARREARS_LINE' });
  const [genOpen, setGenOpen] = useState(false);

  useEffect(() => {
    if (settings) {
      setForm({
        autoGenerate: settings.autoGenerate,
        generateDay: settings.generateDay,
        dueDay: settings.dueDay,
        monthlyCategoryIds: settings.monthlyCategoryIds,
        arrearsMode: settings.arrearsMode,
      });
    }
  }, [settings]);

  if (isLoading || !settings) return <Skeleton className="h-64" />;
  const activeCats = (cats?.data ?? []).filter((c) => c.isActive);
  const pickAll = form.monthlyCategoryIds.length === 0;

  const submit = async () => {
    try {
      await save.mutateAsync(form);
      toast.success(t('Fee settings saved'));
    } catch (err: any) {
      toast.error(err?.response?.data?.message || t('Could not save'));
    }
  };

  return (
    <div className="space-y-8">
      <section className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">{t('Monthly invoices')}</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">{t('Each active student gets one invoice per month from the class fees, their custom fee and concessions.')}</p>
          </div>
          <Button variant="outline" leftIcon={<CalendarClock className="w-4 h-4" />} onClick={() => setGenOpen(true)}>{t('Generate now')}</Button>
        </div>
        <Checkbox
          checked={form.autoGenerate}
          disabled={!canEdit}
          onChange={(e) => setForm({ ...form, autoGenerate: e.target.checked })}
          label={t('Generate monthly invoices automatically')}
          description={t('Runs on the chosen day (Asia/Dhaka time) when background jobs are on. "Generate now" always works.')}
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Select label={t('Generate on day')} disabled={!canEdit} value={String(form.generateDay)} onChange={(e) => setForm({ ...form, generateDay: Number(e.target.value) })} options={days(28)} />
          <Select label={t('Due on day')} disabled={!canEdit} value={String(form.dueDay)} onChange={(e) => setForm({ ...form, dueDay: Number(e.target.value) })} options={days(31)} helperText={t('Short months use their last day.')} />
        </div>
        <fieldset className="space-y-2">
          <legend className="field-label">{t('Monthly fee categories')}</legend>
          <Checkbox checked={pickAll} disabled={!canEdit} onChange={() => setForm({ ...form, monthlyCategoryIds: pickAll ? activeCats.filter((c) => c.frequency === 'MONTHLY').map((c) => c.id) : [] })} label={t('All categories marked Monthly')} />
          {!pickAll && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pl-6">
              {activeCats.map((c) => (
                <Checkbox
                  key={c.id}
                  disabled={!canEdit}
                  checked={form.monthlyCategoryIds.includes(c.id)}
                  onChange={(e) => setForm({ ...form, monthlyCategoryIds: e.target.checked ? [...form.monthlyCategoryIds, c.id] : form.monthlyCategoryIds.filter((x) => x !== c.id) })}
                  label={c.name}
                />
              ))}
            </div>
          )}
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {t('Billed now')}: {settings.effectiveMonthlyCategories.map((c) => c.name).join(', ') || t('none — mark a category Monthly or pick one')}
          </p>
        </fieldset>
        <Select
          label={t('Previous dues')}
          disabled={!canEdit}
          value={form.arrearsMode}
          onChange={(e) => setForm({ ...form, arrearsMode: e.target.value as 'SEPARATE' | 'ARREARS_LINE' })}
          options={[
            { value: 'SEPARATE', label: t('Keep separate invoices (recommended)') },
            { value: 'ARREARS_LINE', label: t('Carry unpaid months into the new invoice as arrears lines') },
          ]}
        />
        {settings.lastAutoRunAt && (
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {t('Last automatic run')}: {formatDate(settings.lastAutoRunAt, true)} · {settings.lastRunSummary?.createdCount ?? 0} {t('invoices')}
          </p>
        )}
        {canEdit && (
          <div className="flex justify-end">
            <Button onClick={submit} isLoading={save.isPending}>{t('Save')}</Button>
          </div>
        )}
      </section>

      <FineRulesSection canEdit={canEdit} />
      <GenerateMonthlyModal isOpen={genOpen} onClose={() => setGenOpen(false)} />
    </div>
  );
};

const FineRulesSection: React.FC<{ canEdit: boolean }> = ({ canEdit }) => {
  const t = useT();
  const { data: rules, isLoading } = useFineRules();
  const saveRule = useSaveFineRule();
  const del = useDeleteFineRule();
  const [editing, setEditing] = useState<FineRule | 'new' | null>(null);

  const describe = (r: FineRule) =>
    `${r.type === 'PERCENT' ? `${r.value}% ${t('of the due')}` : formatCurrency(r.value)} · ${t('after {n} day(s)', { n: r.graceDays })} · ${r.recurrence === 'MONTHLY' ? t('every month') : t('once')}${r.maxAmount !== null ? ` · ${t('max')} ${formatCurrency(r.maxAmount)}` : ''}`;

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">{t('Late fine')}</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">{t('Optional. Added as a separate line by the daily overdue check. A category rule wins over the school-wide rule.')}</p>
        </div>
        {canEdit && <Button variant="outline" leftIcon={<Plus className="w-4 h-4" />} onClick={() => setEditing('new')}>{t('Add rule')}</Button>}
      </div>
      {isLoading ? (
        <Skeleton className="h-16" />
      ) : (rules ?? []).length === 0 ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">{t('No late fine.')}</p>
      ) : (
        <ul className="rounded-lg border border-slate-200 dark:border-white/10 divide-y divide-slate-100 dark:divide-white/5">
          {(rules ?? []).map((r) => (
            <li key={r.id} className="px-3 py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-900 dark:text-white">{r.categoryName ?? t('School-wide')}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">{describe(r)}</p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={r.isActive ? 'success' : 'neutral'}>{r.isActive ? t('On') : t('Off')}</Badge>
                {canEdit && (
                  <>
                    <Button size="xs" variant="ghost" onClick={() => setEditing(r)}>{t('Edit')}</Button>
                    <Button
                      size="xs"
                      variant="ghost"
                      aria-label={t('Delete')}
                      onClick={() => del.mutate(r.id, { onError: (e: any) => toast.error(e?.response?.data?.message || t('Could not delete')) })}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      {editing && (
        <FineRuleModal
          rule={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSave={async (payload) => {
            try {
              await saveRule.mutateAsync({ ...(editing !== 'new' ? { id: editing.id } : {}), ...payload });
              toast.success(t('Fine rule saved'));
              setEditing(null);
            } catch (err: any) {
              toast.error(err?.response?.data?.message || t('Could not save'));
            }
          }}
          saving={saveRule.isPending}
        />
      )}
    </section>
  );
};

const FineRuleModal: React.FC<{ rule: FineRule | null; onClose: () => void; onSave: (p: FineRulePayload) => void; saving: boolean }> = ({ rule, onClose, onSave, saving }) => {
  const t = useT();
  const { data: cats } = useFeeCategoriesList(false);
  const [f, setF] = useState({
    feeCategoryId: rule?.feeCategoryId ?? '',
    type: rule?.type ?? 'FLAT',
    value: rule ? String(rule.value) : '',
    graceDays: rule ? String(rule.graceDays) : '0',
    recurrence: rule?.recurrence ?? 'ONCE',
    maxAmount: rule?.maxAmount !== null && rule?.maxAmount !== undefined ? String(rule.maxAmount) : '',
    isActive: rule?.isActive ?? true,
  });
  const [err, setErr] = useState<string | null>(null);
  const submit = () => {
    const value = parseAmount(f.value);
    const max = f.maxAmount ? parseAmount(f.maxAmount) : null;
    const grace = Number(f.graceDays);
    if (!Number.isFinite(value) || value <= 0) return setErr(t('Enter a fine amount above 0'));
    if (f.type === 'PERCENT' && value > 100) return setErr(t('A percentage fine cannot be more than 100%'));
    if (max !== null && !Number.isFinite(max)) return setErr(t('Enter a valid maximum'));
    if (!Number.isInteger(grace) || grace < 0) return setErr(t('Enter whole days (0 or more)'));
    onSave({ feeCategoryId: f.feeCategoryId || null, type: f.type as 'FLAT' | 'PERCENT', value, graceDays: grace, recurrence: f.recurrence as 'ONCE' | 'MONTHLY', maxAmount: max, isActive: f.isActive });
  };
  return (
    <Modal
      isOpen
      onClose={onClose}
      title={rule ? t('Edit late fine') : t('Add late fine')}
      size="md"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>{t('Cancel')}</Button>
          <Button onClick={submit} isLoading={saving}>{t('Save')}</Button>
        </div>
      }
    >
      <div className="space-y-3">
        {err && <p className="field-error" role="alert">{err}</p>}
        <Select label={t('Applies to')} value={f.feeCategoryId} onChange={(e) => setF({ ...f, feeCategoryId: e.target.value })} options={[{ value: '', label: t('School-wide') }, ...(cats?.data ?? []).filter((c) => c.isActive).map((c) => ({ value: c.id, label: c.name }))]} />
        <div className="grid grid-cols-2 gap-3">
          <Select label={t('Type')} value={f.type} onChange={(e) => setF({ ...f, type: e.target.value as 'FLAT' | 'PERCENT' })} options={[{ value: 'FLAT', label: t('Flat amount (৳)') }, { value: 'PERCENT', label: t('% of the due') }]} />
          <Input label={f.type === 'PERCENT' ? t('Percent') : t('Amount (৳)')} inputMode="decimal" value={f.value} onChange={(e) => setF({ ...f, value: e.target.value })} required />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Input label={t('Days after due date')} inputMode="numeric" value={f.graceDays} onChange={(e) => setF({ ...f, graceDays: e.target.value })} />
          <Select label={t('Charge')} value={f.recurrence} onChange={(e) => setF({ ...f, recurrence: e.target.value as 'ONCE' | 'MONTHLY' })} options={[{ value: 'ONCE', label: t('Once') }, { value: 'MONTHLY', label: t('Every month it stays unpaid') }]} />
        </div>
        <Input label={t('Maximum total fine per invoice (৳, optional)')} inputMode="decimal" value={f.maxAmount} onChange={(e) => setF({ ...f, maxAmount: e.target.value })} />
        <Checkbox checked={f.isActive} onChange={(e) => setF({ ...f, isActive: e.target.checked })} label={t('Rule is on')} />
      </div>
    </Modal>
  );
};
