import React from 'react';
import { Alert, Badge, Button, Modal } from '../../components/ui';
import { useT, formatNumber } from '../../i18n';
import { PROMOTION_STATUSES, type PlanResult, type PromotionStatus } from './promotion.queries';

export const STATUS_VARIANT: Record<PromotionStatus, 'success' | 'warning' | 'info' | 'neutral'> = {
  PROMOTED: 'success',
  RETAINED: 'warning',
  GRADUATED: 'info',
  TRANSFERRED: 'neutral',
};

export const statusLabel = (t: (k: string) => string, s: PromotionStatus) =>
  ({ PROMOTED: t('Promoted'), RETAINED: t('Retained'), GRADUATED: t('Graduated'), TRANSFERRED: t('Transferred') })[s];

interface Props {
  plan: PlanResult | null;
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  isExecuting: boolean;
}

export const PromotionPreviewModal: React.FC<Props> = ({ plan, isOpen, onClose, onConfirm, isExecuting }) => {
  const t = useT();
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="2xl"
      title={t('Review promotion')}
      description={plan?.fromSession && plan?.toSession ? t('{from} → {to}', { from: plan.fromSession, to: plan.toSession }) : undefined}
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose} disabled={isExecuting}>
            {t('Back')}
          </Button>
          <Button type="button" onClick={onConfirm} isLoading={isExecuting} disabled={!plan || plan.actions.length === 0}>
            {t('Confirm and apply ({n})', { n: plan?.actions.length ?? 0 })}
          </Button>
        </>
      }
    >
      {plan && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {PROMOTION_STATUSES.map((s) => (
              <Badge key={s} variant={STATUS_VARIANT[s]}>
                {statusLabel(t, s)}: {formatNumber(plan.counts[s])}
              </Badge>
            ))}
          </div>
          <Alert tone="info">
            {t('Students are moved in one transaction. Re-running for the same target session skips students already processed. You can undo this batch within 24 hours from History.')}
          </Alert>
          {plan.skipped.length > 0 && (
            <Alert tone="warning" title={t('{n} student(s) will be skipped', { n: plan.skipped.length })}>
              <ul className="list-disc pl-4 space-y-0.5 max-h-32 overflow-y-auto">
                {plan.skipped.map((s) => (
                  <li key={s.studentId}>
                    {s.name}
                    {s.studentCode ? ` (${s.studentCode})` : ''} — {s.reason}
                  </li>
                ))}
              </ul>
            </Alert>
          )}
          <div className="max-h-[50vh] overflow-y-auto rounded-lg border border-slate-200 dark:border-white/10">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-white/5 sticky top-0">
                <tr className="text-left text-xs text-slate-500 dark:text-slate-400">
                  <th className="px-3 py-2 font-medium">{t('Student')}</th>
                  <th className="px-3 py-2 font-medium">{t('Decision')}</th>
                  <th className="px-3 py-2 font-medium hidden sm:table-cell">{t('From')}</th>
                  <th className="px-3 py-2 font-medium">{t('To')}</th>
                </tr>
              </thead>
              <tbody>
                {plan.actions.map((a) => (
                  <tr key={a.studentId} className="border-t border-slate-100 dark:border-white/5">
                    <td className="px-3 py-2">
                      <div className="font-medium text-slate-900 dark:text-white">{a.name}</div>
                      <div className="text-xs text-slate-500">{a.studentCode}{a.rollNumber ? ` · ${t('Roll')} ${a.rollNumber}` : ''}</div>
                    </td>
                    <td className="px-3 py-2"><Badge variant={STATUS_VARIANT[a.status]}>{statusLabel(t, a.status)}</Badge></td>
                    <td className="px-3 py-2 hidden sm:table-cell">{a.fromClass ?? '—'}{a.fromSection ? ` ${a.fromSection}` : ''}</td>
                    <td className="px-3 py-2">
                      {a.status === 'GRADUATED' || a.status === 'TRANSFERRED'
                        ? t('Leaves active roll')
                        : `${a.toClass ?? '—'}${a.toSection ? ` ${a.toSection}` : ''}`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Modal>
  );
};
