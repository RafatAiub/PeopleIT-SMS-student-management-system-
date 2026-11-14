import React, { useState } from 'react';
import toast from 'react-hot-toast';
import { BadgePercent, Plus } from 'lucide-react';
import { Badge, Button, Card, Modal, Select, Skeleton, Textarea } from '../../../components/ui';
import { formatCurrency, formatDate, useLocale, useT } from '../../../i18n';
import { useEndFeeProfile, useStudentFeeProfiles, type FeeProfile } from './studentFees.api';
import { FeeProfileForm } from './FeeProfileForm';
import { currentPeriod, monthLabel, periodOptions } from './studentFees.logic';

const STATUS_VARIANT = { ACTIVE: 'success', UPCOMING: 'info', ENDED: 'neutral', VOID: 'danger' } as const;

/** Student profile → Fees tab: the student's custom fee (history kept). */
export const StudentFeeProfilePanel: React.FC<{ studentId: string; canEdit: boolean }> = ({ studentId, canEdit }) => {
  const t = useT();
  const { lang } = useLocale();
  const { data, isLoading } = useStudentFeeProfiles(studentId);
  const [formOpen, setFormOpen] = useState(false);
  const [changeFrom, setChangeFrom] = useState<FeeProfile | null>(null);
  const [ending, setEnding] = useState<FeeProfile | null>(null);
  const items = data?.items ?? [];
  const live = items.filter((p) => p.status === 'ACTIVE' || p.status === 'UPCOMING');
  const past = items.filter((p) => p.status === 'ENDED' || p.status === 'VOID');

  const amountText = (p: FeeProfile) =>
    p.kind === 'YEARLY'
      ? `${formatCurrency(p.yearlyAmount)} / ${t('year')} (${p.yearlyMode === 'SPREAD' ? t('spread monthly') : t('billed once')})`
      : `${formatCurrency(p.monthlyAmount)} / ${t('month')}`;
  const range = (p: FeeProfile) => `${monthLabel(p.effectiveFrom, lang)} → ${p.effectiveTo ? monthLabel(p.effectiveTo, lang) : t('no end')}`;

  const row = (p: FeeProfile, actions: boolean) => (
    <li key={p.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-4 py-3">
      <div className="min-w-0">
        <p className="text-sm font-medium text-slate-900 dark:text-white">
          {p.categoryName ?? t('Whole monthly fee')} · <span className="tabular-nums">{amountText(p)}</span>
        </p>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          {range(p)} · {p.reason} · {formatDate(p.createdAt)}
          {p.endReason ? ` · ${t('Ended')}: ${p.endReason}` : ''}
        </p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <Badge variant={STATUS_VARIANT[p.status]}>{t(p.status === 'ACTIVE' ? 'Active' : p.status === 'UPCOMING' ? 'Upcoming' : p.status === 'ENDED' ? 'Ended' : 'Void')}</Badge>
        {actions && canEdit && (
          <>
            <Button size="xs" variant="ghost" onClick={() => { setChangeFrom(p); setFormOpen(true); }}>{t('Change')}</Button>
            <Button size="xs" variant="ghost" onClick={() => setEnding(p)}>{t('End')}</Button>
          </>
        )}
      </div>
    </li>
  );

  return (
    <Card className="p-0 overflow-hidden">
      <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-slate-200 dark:border-white/8">
        <div className="flex items-center gap-2">
          <BadgePercent className="w-4 h-4 text-primary-700 dark:text-primary-300" aria-hidden />
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">{t('Custom fee (student fee profile)')}</h3>
        </div>
        {canEdit && (
          <Button size="sm" variant="outline" leftIcon={<Plus className="w-3.5 h-3.5" />} onClick={() => { setChangeFrom(null); setFormOpen(true); }}>
            {t('Set custom fee')}
          </Button>
        )}
      </div>
      {isLoading ? (
        <Skeleton className="h-16 m-4" />
      ) : items.length === 0 ? (
        <p className="px-4 py-3 text-sm text-slate-500 dark:text-slate-400">{t('No custom fee — this student pays the class fees.')}</p>
      ) : (
        <ul className="divide-y divide-slate-100 dark:divide-white/5">
          {live.map((p) => row(p, true))}
          {past.length > 0 && (
            <li className="px-4 py-2">
              <details>
                <summary className="text-xs text-slate-500 dark:text-slate-400 cursor-pointer">{t('History ({n})', { n: past.length })}</summary>
                <ul className="divide-y divide-slate-100 dark:divide-white/5 mt-1">{past.map((p) => row(p, false))}</ul>
              </details>
            </li>
          )}
        </ul>
      )}

      <FeeProfileForm isOpen={formOpen} onClose={() => setFormOpen(false)} studentId={studentId} from={changeFrom} />
      <EndProfileModal profile={ending} onClose={() => setEnding(null)} />
    </Card>
  );
};

const EndProfileModal: React.FC<{ profile: FeeProfile | null; onClose: () => void }> = ({ profile, onClose }) => {
  const t = useT();
  const { lang } = useLocale();
  const end = useEndFeeProfile();
  const [month, setMonth] = useState(currentPeriod());
  const [reason, setReason] = useState('');
  if (!profile) return null;
  const submit = async () => {
    if (reason.trim().length < 3) return toast.error(t('Please give a reason'));
    try {
      await end.mutateAsync({ id: profile.id, effectiveTo: month === 'VOID' ? null : month, reason: reason.trim() });
      toast.success(t('Custom fee updated'));
      setReason('');
      onClose();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || t('Could not update'));
    }
  };
  return (
    <Modal
      isOpen
      onClose={onClose}
      title={t('End custom fee')}
      size="sm"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>{t('Cancel')}</Button>
          <Button onClick={submit} isLoading={end.isPending}>{t('Save')}</Button>
        </div>
      }
    >
      <div className="space-y-3">
        <Select
          label={t('Last month at this rate')}
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          options={[...periodOptions(new Date(), 6, 12, lang), { value: 'VOID', label: t('Void — it was entered by mistake') }]}
        />
        <Textarea label={t('Reason')} rows={2} value={reason} onChange={(e) => setReason(e.target.value)} required />
      </div>
    </Modal>
  );
};
