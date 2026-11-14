import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Alert, Button, Modal, Select } from '../../../components/ui';
import { formatCurrency, formatDate, useLocale, useT } from '../../../i18n';
import { useClassOptions } from '../feeExtras.queries';
import { useGenerateMonthly, usePreviewMonthly } from './studentFees.api';
import { currentPeriod, periodOptions } from './studentFees.logic';

/** "Generate for month X now": preview (count, total) → confirm. Works even with background jobs off. */
export const GenerateMonthlyModal: React.FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => {
  const t = useT();
  const { lang } = useLocale();
  const [period, setPeriod] = useState(currentPeriod());
  const [classId, setClassId] = useState('');
  const { data: classes } = useClassOptions(isOpen);
  const preview = usePreviewMonthly();
  const generate = useGenerateMonthly();

  useEffect(() => {
    if (isOpen) preview.mutate({ period, classId: classId || null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, period, classId]);

  const pv = preview.data;
  const run = async () => {
    try {
      const r = await generate.mutateAsync({ period, classId: classId || null });
      toast.success(t('{n} invoice(s) generated for {month}', { n: r.createdCount, month: r.label }));
      if (r.failedCount > 0) toast.error(t('{n} invoice(s) failed — run it again to retry', { n: r.failedCount }));
      onClose();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || t('Could not generate invoices'));
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t('Generate monthly invoices')}
      size="md"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>{t('Cancel')}</Button>
          <Button onClick={run} isLoading={generate.isPending} disabled={!pv || pv.invoiceCount === 0 || preview.isPending}>
            {pv ? t('Generate {n} invoice(s)', { n: pv.invoiceCount }) : t('Generate')}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Select label={t('Month')} value={period} onChange={(e) => setPeriod(e.target.value)} options={periodOptions(new Date(), 3, 2, lang)} />
          <Select label={t('Class')} value={classId} onChange={(e) => setClassId(e.target.value)} options={[{ value: '', label: t('All classes') }, ...(classes ?? []).map((c) => ({ value: c.id, label: c.name }))]} />
        </div>
        {preview.isError && <Alert tone="danger">{(preview.error as any)?.response?.data?.message || t('Could not load the preview')}</Alert>}
        {pv && (
          <div className="rounded-lg bg-slate-50 dark:bg-white/5 p-4 space-y-1.5 text-sm" aria-live="polite">
            <div className="flex justify-between"><span>{t('Invoices to create')}</span><span className="font-semibold tabular-nums">{pv.invoiceCount}</span></div>
            <div className="flex justify-between"><span>{t('Gross')}</span><span className="tabular-nums">{formatCurrency(pv.grossAmount)}</span></div>
            <div className="flex justify-between"><span>{t('Concessions')}</span><span className="tabular-nums">− {formatCurrency(pv.concessionAmount)}</span></div>
            <div className="flex justify-between border-t border-slate-200 dark:border-white/10 pt-1.5 font-semibold"><span>{t('Total')}</span><span className="tabular-nums">{formatCurrency(pv.totalAmount)}</span></div>
            <p className="text-xs text-slate-500 dark:text-slate-400 pt-1">
              {t('Due date')}: {formatDate(pv.dueDate)} · {t('Custom rates')}: {pv.customRateCount} · {t('Already billed')}: {pv.skipped.alreadyBilled} · {t('No class fees')}: {pv.skipped.noFees}
            </p>
            {pv.byClass.length > 1 && (
              <ul className="text-xs text-slate-600 dark:text-slate-300 pt-1">
                {pv.byClass.map((c) => (
                  <li key={c.className} className="flex justify-between"><span>{c.className}</span><span className="tabular-nums">{c.count} · {formatCurrency(c.total)}</span></li>
                ))}
              </ul>
            )}
          </div>
        )}
        <p className="text-xs text-slate-500 dark:text-slate-400">{t('Each student gets at most one invoice per month — running this again only fills the gaps. Guardians are notified as for any new invoice.')}</p>
      </div>
    </Modal>
  );
};
