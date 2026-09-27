import React, { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Modal, Button, Input, SkeletonText, ErrorState } from '../../components/ui';
import { useT, formatCurrency } from '../../i18n';
import apiClient from '../../api/client';

interface FineRule {
  finePerDay: number;
  graceDays: number;
  maxFine: number | null;
}

/** Per-school late-fine rule used to suggest a fine when a book is returned late. */
export const FineRuleModal: React.FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => {
  const t = useT();
  const qc = useQueryClient();
  const rule = useQuery({
    queryKey: ['library', 'fine-rule'],
    queryFn: async (): Promise<FineRule | null> => (await apiClient.get('/library/fine-rule')).data.data,
    enabled: isOpen,
  });
  const [finePerDay, setFinePerDay] = useState('');
  const [graceDays, setGraceDays] = useState('0');
  const [maxFine, setMaxFine] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!isOpen || rule.isLoading) return;
    setErrors({});
    setFinePerDay(rule.data ? String(rule.data.finePerDay) : '');
    setGraceDays(rule.data ? String(rule.data.graceDays) : '0');
    setMaxFine(rule.data?.maxFine !== null && rule.data?.maxFine !== undefined ? String(rule.data.maxFine) : '');
  }, [isOpen, rule.isLoading, rule.data]);

  const save = useMutation({
    mutationFn: async (body: FineRule) => (await apiClient.put('/library/fine-rule', body)).data.data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['library'] });
      toast.success(t('Fine rule saved'));
      onClose();
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onError: (e: any) => toast.error(e?.response?.data?.message || t('Could not save the fine rule')),
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const next: Record<string, string> = {};
    const fpd = Number(finePerDay);
    if (finePerDay === '' || isNaN(fpd) || fpd < 0) next.finePerDay = t('Enter an amount of 0 or more');
    if (!/^\d+$/.test(graceDays) || Number(graceDays) > 365) next.graceDays = t('Enter whole days between 0 and 365');
    if (maxFine !== '' && (isNaN(Number(maxFine)) || Number(maxFine) < 0)) next.maxFine = t('Enter an amount of 0 or more');
    setErrors(next);
    if (Object.keys(next).length) return;
    save.mutate({ finePerDay: fpd, graceDays: Number(graceDays), maxFine: maxFine === '' ? null : Number(maxFine) });
  };

  const example = Number(finePerDay) > 0 ? Math.max(0, 10 - Number(graceDays || 0)) * Number(finePerDay) : 0;
  const exampleCapped = maxFine !== '' ? Math.min(example, Number(maxFine)) : example;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t('Fine settings')}
      description={t('Used to suggest a late fine when a book is returned. Staff can always change the amount.')}
      size="sm"
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose}>{t('Cancel')}</Button>
          <Button type="submit" form="fine-rule-form" variant="gradient" isLoading={save.isPending} disabled={rule.isLoading || rule.isError}>{t('Save')}</Button>
        </>
      }
    >
      {rule.isLoading ? (
        <SkeletonText lines={4} />
      ) : rule.isError ? (
        <ErrorState message={t('Could not load the fine rule.')} onRetry={() => rule.refetch()} />
      ) : (
        <form id="fine-rule-form" onSubmit={submit} className="space-y-4" noValidate>
          <Input label={t('Fine per day (৳)')} type="number" min={0} step="0.01" required value={finePerDay} onChange={(e) => setFinePerDay(e.target.value)} error={errors.finePerDay} />
          <Input label={t('Grace days')} type="number" min={0} max={365} step={1} value={graceDays} onChange={(e) => setGraceDays(e.target.value)} error={errors.graceDays} helperText={t('Late days that are not charged')} />
          <Input label={t('Maximum fine (৳)')} type="number" min={0} step="0.01" value={maxFine} onChange={(e) => setMaxFine(e.target.value)} error={errors.maxFine} helperText={t('Optional — leave empty for no cap')} />
          {Number(finePerDay) > 0 && (
            <p className="text-xs text-slate-600 dark:text-slate-300">
              {t('Example: a book returned 10 days late is fined {amount}.', { amount: formatCurrency(exampleCapped) })}
            </p>
          )}
        </form>
      )}
    </Modal>
  );
};
