import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Modal, Button, Input, Select, Textarea } from '../../../components/ui';
import { formatCurrency, useLocale, useT } from '../../../i18n';
import { useFeeCategoriesList } from '../hooks';
import { useSaveFeeProfile, type FeeProfile } from './studentFees.api';
import { currentPeriod, parseAmount, periodOptions, yearlySpreadPreview } from './studentFees.logic';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  /** One student … */
  studentId?: string;
  /** … or many (bulk set). */
  studentIds?: string[];
  title?: string;
  /** Prefill from an existing profile ("change rate"). */
  from?: FeeProfile | null;
  onSaved?: () => void;
}

/** Set a custom monthly fee or yearly total for one or many students. */
export const FeeProfileForm: React.FC<Props> = ({ isOpen, onClose, studentId, studentIds, title, from, onSaved }) => {
  const t = useT();
  const { lang } = useLocale();
  const save = useSaveFeeProfile();
  const { data: cats } = useFeeCategoriesList(false);
  const [categoryId, setCategoryId] = useState('');
  const [kind, setKind] = useState<'MONTHLY' | 'YEARLY'>('MONTHLY');
  const [amount, setAmount] = useState('');
  const [yearlyMode, setYearlyMode] = useState<'SPREAD' | 'ONE_TIME'>('SPREAD');
  const [effectiveFrom, setEffectiveFrom] = useState(currentPeriod());
  const [effectiveTo, setEffectiveTo] = useState('');
  const [reason, setReason] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!isOpen) return;
    setCategoryId(from?.feeCategoryId ?? '');
    setKind(from?.kind ?? 'MONTHLY');
    setAmount(from ? String((from.kind === 'YEARLY' ? from.yearlyAmount : from.monthlyAmount) ?? '') : '');
    setYearlyMode(from?.yearlyMode ?? 'SPREAD');
    setEffectiveFrom(currentPeriod());
    setEffectiveTo('');
    setReason('');
    setErrors({});
  }, [isOpen, from]);

  const months = periodOptions(new Date(), 12, 12, lang);
  const value = parseAmount(amount);
  const spread = kind === 'YEARLY' && yearlySpreadPreview(Number.isFinite(value) ? value : 0);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (!Number.isFinite(value) || value < 0) next.amount = t('Enter a valid amount (0 or more)');
    if (reason.trim().length < 3) next.reason = t('Please give a reason');
    if (effectiveTo && effectiveTo < effectiveFrom) next.effectiveTo = t('Effective-to must be on or after effective-from');
    setErrors(next);
    if (Object.keys(next).length) return;
    try {
      await save.mutateAsync({
        ...(studentIds ? { studentIds } : { studentId }),
        feeCategoryId: categoryId || null,
        kind,
        monthlyAmount: kind === 'MONTHLY' ? value : null,
        yearlyAmount: kind === 'YEARLY' ? value : null,
        yearlyMode,
        effectiveFrom,
        effectiveTo: effectiveTo || null,
        reason: reason.trim(),
      });
      toast.success(studentIds ? t('Custom fee set for {n} student(s)', { n: studentIds.length }) : t('Custom fee saved'));
      onSaved?.();
      onClose();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || t('Could not save the custom fee'));
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title ?? t('Set custom fee')} size="md">
      <form onSubmit={submit} noValidate className="space-y-4">
        <Select
          label={t('Applies to')}
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
          options={[
            { value: '', label: t('Whole monthly fee (all monthly categories)') },
            ...(cats?.data ?? []).filter((c) => c.isActive).map((c) => ({ value: c.id, label: c.name })),
          ]}
        />
        <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label={t('Rate type')}>
          {(['MONTHLY', 'YEARLY'] as const).map((k) => (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={kind === k}
              onClick={() => setKind(k)}
              className={`rounded-lg border px-3 py-2 text-sm font-medium ${kind === k ? 'border-primary-600 bg-primary-50 text-primary-800 dark:bg-primary-500/15 dark:text-primary-200' : 'border-slate-300 text-slate-700 dark:border-white/15 dark:text-slate-200'}`}
            >
              {k === 'MONTHLY' ? t('Monthly fee') : t('Yearly total')}
            </button>
          ))}
        </div>
        <Input
          label={kind === 'MONTHLY' ? t('Monthly amount (৳)') : t('Yearly total (৳)')}
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          error={errors.amount}
          helperText={kind === 'MONTHLY' ? t('0 = free (full scholarship).') : undefined}
          required
        />
        {kind === 'YEARLY' && (
          <>
            <Select
              label={t('How to bill the yearly total')}
              value={yearlyMode}
              onChange={(e) => setYearlyMode(e.target.value as 'SPREAD' | 'ONE_TIME')}
              options={[
                { value: 'SPREAD', label: t('Spread over 12 months') },
                { value: 'ONE_TIME', label: t('Once, in the first month') },
              ]}
            />
            {spread && yearlyMode === 'SPREAD' && Number.isFinite(value) && value > 0 && (
              <p className="text-xs text-slate-600 dark:text-slate-300">
                {t('{monthly} per month for 11 months, {last} in the 12th month.', { monthly: formatCurrency(spread.monthly), last: formatCurrency(spread.last) })}
              </p>
            )}
          </>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Select label={t('Effective from')} value={effectiveFrom} onChange={(e) => setEffectiveFrom(e.target.value)} options={months} />
          <Select
            label={t('Effective to (optional)')}
            value={effectiveTo}
            onChange={(e) => setEffectiveTo(e.target.value)}
            options={[{ value: '', label: t('No end') }, ...months]}
            error={errors.effectiveTo}
          />
        </div>
        <Textarea label={t('Reason')} rows={2} value={reason} onChange={(e) => setReason(e.target.value)} error={errors.reason} placeholder={t('e.g. orphan rate, sibling discount, scholarship')} required />
        <p className="text-xs text-slate-500 dark:text-slate-400">{t('An earlier rate for the same fee ends the month before this one starts. History is kept.')}</p>
        <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-white/5">
          <Button type="button" variant="secondary" onClick={onClose}>{t('Cancel')}</Button>
          <Button type="submit" isLoading={save.isPending}>{t('Save')}</Button>
        </div>
      </form>
    </Modal>
  );
};
