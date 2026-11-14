import React from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Alert, Badge, Button, Card, ErrorState, Input, Modal, SkeletonText, Tabs } from '@/components/ui';
import { EmptyState } from '@/components/common/EmptyState';
import { formatCurrency, formatDate, formatNumber, useT } from '@/i18n';
import { useAuthStore } from '@/store/authStore';
import { apiErrorMessage, useRestricted, useSetBlock, useSetExempt, type FilterOptions, type RestrictedRow } from './dues.api';
import { ClassSectionSearch, Pager, useDebounced, type ClassFilterValue } from './DuesFilters';

// =============================================================================
// Fees → Dues → Restricted students (and staff overrides) with unblock.
// =============================================================================

const ACT_ROLES = new Set(['SUPER_ADMIN', 'ADMIN', 'ACCOUNTANT']);
const SOURCE_LABEL: Record<string, string> = {
  AUTO: 'Automatic rule',
  MANUAL_BLOCK: 'Blocked by staff',
  MANUAL_UNBLOCK: 'Unblocked by staff',
  EXEMPT: 'Exempt',
  NONE: 'Not restricted',
};
const REASON_LABEL: Record<string, string> = { MONTHS: 'months due', AMOUNT: 'amount due', OVERDUE_DAYS: 'days overdue' };

export const RestrictedTab: React.FC<{ options?: FilterOptions }> = ({ options }) => {
  const t = useT();
  const role = useAuthStore((s) => s.user?.role);
  const canAct = !!role && ACT_ROLES.has(role);
  const [view, setView] = React.useState<'RESTRICTED' | 'OVERRIDES'>('RESTRICTED');
  const [cls, setCls] = React.useState<ClassFilterValue>({ classId: '', sectionId: '', search: '' });
  const [page, setPage] = React.useState(1);
  const [action, setAction] = React.useState<{ row: RestrictedRow; kind: 'UNBLOCKED' | 'AUTO' | 'UNEXEMPT' } | null>(null);
  const search = useDebounced(cls.search.trim());
  React.useEffect(() => setPage(1), [view, cls.classId, search]);
  const q = useRestricted({ view, classId: cls.classId || undefined, search: search || undefined, page });
  const items = q.data?.items ?? [];

  return (
    <div className="space-y-4">
      <Tabs
        idPrefix="restricted"
        variant="pills"
        value={view}
        onChange={(v) => setView(v as 'RESTRICTED' | 'OVERRIDES')}
        tabs={[{ id: 'RESTRICTED', label: t('Restricted now') }, { id: 'OVERRIDES', label: t('Staff overrides & exemptions') }]}
      />
      {q.data && !q.data.settings.restrictionsEnabled && view === 'RESTRICTED' && (
        <Alert tone="info" action={role === 'ADMIN' || role === 'SUPER_ADMIN' ? <Link className="underline font-semibold" to="/fees/dues/settings">{t('Open settings')}</Link> : undefined}>
          {t('Automatic restrictions are off. Only students blocked by staff are listed.')}
        </Alert>
      )}
      <Card className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <ClassSectionSearch idPrefix="res" options={options} value={cls} onChange={setCls} />
      </Card>
      {q.isLoading ? (
        <SkeletonText lines={6} />
      ) : q.isError ? (
        <ErrorState title={t('Could not load restricted students')} onRetry={() => q.refetch()} />
      ) : items.length === 0 ? (
        <EmptyState title={view === 'RESTRICTED' ? t('No restricted students') : t('No overrides')} />
      ) : (
        <Card flush className="overflow-hidden">
          <ul className="divide-y divide-slate-100 dark:divide-white/10">
            {items.map((r) => (
              <li key={r.id} className="p-3 flex flex-col sm:flex-row sm:items-center gap-2 justify-between">
                <div className="min-w-0">
                  <p className="font-medium">{r.name} <span className="text-xs text-slate-500">{[r.studentCode, r.className, r.sectionName].filter(Boolean).join(' · ')}</span></p>
                  <p className="text-xs text-slate-600 dark:text-slate-300">
                    {t('{m} months due · {a} · {d} days overdue', { m: formatNumber(r.monthsDue), a: formatCurrency(r.amountDue), d: formatNumber(r.daysOverdue) })}
                    {r.lastPaymentAt ? ` · ${t('Last payment')} ${formatDate(r.lastPaymentAt)}` : ''}
                  </p>
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    <Badge variant={r.restricted ? 'danger' : 'success'}>{t(SOURCE_LABEL[r.source] ?? r.source)}</Badge>
                    {r.reasons.map((x) => <Badge key={x} variant="warning">{t(REASON_LABEL[x] ?? x)}</Badge>)}
                    {r.exempt && <Badge variant="info">{t('Exempt')}{r.exemptReason ? `: ${r.exemptReason}` : ''}</Badge>}
                    {r.manualReason && <span className="text-xs text-slate-500">{t('Reason')}: {r.manualReason}</span>}
                  </div>
                </div>
                {canAct && (
                  <div className="flex flex-wrap gap-2 shrink-0">
                    {r.restricted && <Button size="sm" variant="secondary" onClick={() => setAction({ row: r, kind: 'UNBLOCKED' })}>{t('Unblock')}</Button>}
                    {r.manualState && <Button size="sm" variant="ghost" onClick={() => setAction({ row: r, kind: 'AUTO' })}>{t('Back to automatic')}</Button>}
                    {r.exempt && <Button size="sm" variant="ghost" onClick={() => setAction({ row: r, kind: 'UNEXEMPT' })}>{t('Remove exemption')}</Button>}
                  </div>
                )}
              </li>
            ))}
          </ul>
          <div className="p-3 border-t border-slate-100 dark:border-white/10">
            <Pager page={q.data!.page} pageSize={q.data!.pageSize} total={q.data!.total} onPage={setPage} />
          </div>
        </Card>
      )}
      {action && <OverrideDialog action={action} onClose={() => setAction(null)} />}
    </div>
  );
};

const OverrideDialog: React.FC<{ action: { row: RestrictedRow; kind: 'UNBLOCKED' | 'AUTO' | 'UNEXEMPT' }; onClose: () => void }> = ({ action, onClose }) => {
  const t = useT();
  const block = useSetBlock();
  const exempt = useSetExempt();
  const [reason, setReason] = React.useState('');
  const needsReason = action.kind !== 'UNEXEMPT';
  const submit = async () => {
    try {
      if (action.kind === 'UNEXEMPT') await exempt.mutateAsync({ studentId: action.row.id, exempt: false });
      else await block.mutateAsync({ studentId: action.row.id, state: action.kind, reason });
      toast.success(t('Saved'));
      onClose();
    } catch (e) {
      toast.error(apiErrorMessage(e, t('Could not save')));
    }
  };
  const title = action.kind === 'UNBLOCKED' ? t('Unblock {name}', { name: action.row.name }) : action.kind === 'AUTO' ? t('Back to automatic rules') : t('Remove exemption');
  return (
    <Modal
      isOpen
      onClose={onClose}
      title={title}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>{t('Cancel')}</Button>
          <Button onClick={submit} isLoading={block.isPending || exempt.isPending} disabled={needsReason && reason.trim().length < 3}>{t('Confirm')}</Button>
        </div>
      }
    >
      {action.kind === 'UNBLOCKED' && <p className="text-sm mb-3">{t('The student keeps access even while fees are due, until you set it back to automatic.')}</p>}
      {needsReason && <Input id="override-reason" label={t('Reason (kept in the audit log)')} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} required />}
    </Modal>
  );
};
