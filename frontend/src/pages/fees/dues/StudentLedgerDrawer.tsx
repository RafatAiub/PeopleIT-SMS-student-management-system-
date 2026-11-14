import React from 'react';
import toast from 'react-hot-toast';
import { Badge, Button, Drawer, ErrorState, SkeletonText, Textarea } from '@/components/ui';
import { formatCurrency, formatDate, useLocale, useT } from '@/i18n';
import { useAuthStore } from '@/store/authStore';
import { apiErrorMessage, useSetBlock, useSetExempt, useStudentLedger } from './dues.api';
import { CELL_STYLE, shortMonth, type CellStatus } from './dues.logic';

// =============================================================================
// Drill-down: one student's months, invoices, payments, reminders and
// restriction status, with block / unblock / exempt actions.
// =============================================================================

const ACT_ROLES = new Set(['SUPER_ADMIN', 'ADMIN', 'ACCOUNTANT']);

export const StudentLedgerDrawer: React.FC<{ studentId: string | null; range: { from: string; to: string }; onClose: () => void }> = ({ studentId, range, onClose }) => {
  const t = useT();
  const { lang } = useLocale();
  const q = useStudentLedger(studentId, range);
  const d = q.data;
  return (
    <Drawer isOpen={!!studentId} onClose={onClose} width="lg" title={d?.student.name ?? t('Student ledger')} description={d ? [d.student.studentCode, d.student.className, d.student.sectionName].filter(Boolean).join(' · ') : undefined}>
      {q.isLoading ? (
        <SkeletonText lines={8} />
      ) : q.isError || !d ? (
        <ErrorState title={t('Could not load the ledger')} onRetry={() => q.refetch()} />
      ) : (
        <div className="space-y-5 text-sm">
          <section aria-labelledby="ledger-guardians">
            <h3 id="ledger-guardians" className="font-semibold mb-1">{t('Guardians')}</h3>
            {d.student.guardians.length === 0 ? (
              <p className="text-slate-500">{t('No guardian linked')}</p>
            ) : (
              <ul className="space-y-1">
                {d.student.guardians.map((g: { id: string; name: string; phone: string; email: string | null; isPrimary: boolean; relationship: string }) => (
                  <li key={g.id} className="flex flex-wrap gap-x-2">
                    <span className="font-medium">{g.name}</span>
                    {g.isPrimary && <Badge variant="info">{t('Primary')}</Badge>}
                    <a className="text-primary-700 dark:text-primary-300 underline" href={`tel:${g.phone}`}>{g.phone}</a>
                    {g.email && <span className="text-slate-500">{g.email}</span>}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <RestrictionPanel studentId={d.student.id} r={d.restriction} />

          <section aria-labelledby="ledger-months">
            <h3 id="ledger-months" className="font-semibold mb-2">{t('Months')}</h3>
            <div className="grid grid-cols-4 sm:grid-cols-6 gap-1.5">
              {d.cells.map((c: { month: string; status: CellStatus; due: number; paid: number; billed: number }) => (
                <div key={c.month} className={`rounded-md px-1.5 py-1 text-center ${CELL_STYLE[c.status].cls}`} title={`${t('Billed')} ${formatCurrency(c.billed)} · ${t('Paid')} ${formatCurrency(c.paid)}`}>
                  <div className="text-[11px] font-semibold">{shortMonth(c.month, lang)} {c.month.slice(2, 4)}</div>
                  <div className="text-[11px]">{c.status === 'NO_INVOICE' ? '—' : c.due > 0 ? formatCurrency(c.due, { decimals: 0 }) : CELL_STYLE[c.status].symbol}</div>
                </div>
              ))}
            </div>
            <p className="mt-2">
              {t('Billed')}: <strong>{formatCurrency(d.totals.billed)}</strong> · {t('Paid')}: <strong>{formatCurrency(d.totals.paid)}</strong> · {t('Due')}: <strong className="text-rose-700 dark:text-rose-300">{formatCurrency(d.totals.due)}</strong>
            </p>
          </section>

          <section aria-labelledby="ledger-invoices">
            <h3 id="ledger-invoices" className="font-semibold mb-2">{t('Invoices')}</h3>
            <ul className="divide-y divide-slate-100 dark:divide-white/10">
              {d.invoices.map((i: { id: string; invoiceNo: string; dueDate: string; status: string; totalAmount: number; paidAmount: number; dueAmount: number; items: Array<{ description: string }>; payments: Array<{ id: string; amount: number; method: string; paidAt: string; status: string; receiptNo: string | null }> }) => (
                <li key={i.id} className="py-2">
                  <div className="flex flex-wrap justify-between gap-2">
                    <span className="font-medium">{i.invoiceNo}</span>
                    <Badge variant={i.status === 'PAID' ? 'success' : i.status === 'CANCELLED' ? 'neutral' : i.status === 'PARTIAL' ? 'warning' : 'danger'}>{t(i.status)}</Badge>
                  </div>
                  <div className="text-xs text-slate-500">{t('Due')} {formatDate(i.dueDate)} · {i.items.map((x) => x.description).join(', ')}</div>
                  <div className="text-xs">{formatCurrency(i.totalAmount)} · {t('Paid')} {formatCurrency(i.paidAmount)} · {t('Due')} {formatCurrency(i.dueAmount)}</div>
                  {i.payments.length > 0 && (
                    <ul className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                      {i.payments.map((p) => <li key={p.id}>{formatDate(p.paidAt)} · {p.method} · {formatCurrency(p.amount)} {p.receiptNo ? `· ${p.receiptNo}` : ''} {p.status !== 'COMPLETED' ? `(${p.status})` : ''}</li>)}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          </section>

          <section aria-labelledby="ledger-reminders">
            <h3 id="ledger-reminders" className="font-semibold mb-1">{t('Reminders sent')}</h3>
            {d.reminders.length === 0 ? <p className="text-slate-500">{t('None yet')}</p> : (
              <ul className="text-xs space-y-0.5">
                {d.reminders.map((r: { id: string; channel: string; recipient: string; status: string; createdAt: string; detail: string | null }) => (
                  <li key={r.id}>{formatDate(r.createdAt, true)} · {r.channel} · {r.recipient} · <span title={r.detail ?? ''}>{t(r.status)}</span></li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </Drawer>
  );
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const RestrictionPanel: React.FC<{ studentId: string; r: any }> = ({ studentId, r }) => {
  const t = useT();
  const role = useAuthStore((s) => s.user?.role);
  const canAct = !!role && ACT_ROLES.has(role);
  const block = useSetBlock();
  const exempt = useSetExempt();
  const [reason, setReason] = React.useState('');
  const run = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
      setReason('');
      toast.success(t('Saved'));
    } catch (e) {
      toast.error(apiErrorMessage(e, t('Could not save')));
    }
  };
  const needReason = reason.trim().length < 3;
  return (
    <section aria-labelledby="ledger-restriction" className="rounded-lg border border-slate-200 dark:border-white/10 p-3 space-y-2">
      <h3 id="ledger-restriction" className="font-semibold flex flex-wrap items-center gap-2">
        {t('Fee restriction')}
        {r.restricted ? <Badge variant="danger">{t('Restricted')}</Badge> : <Badge variant="success">{t('Not restricted')}</Badge>}
        {r.exempt && <Badge variant="info">{t('Exempt')}</Badge>}
        {r.manualState && <Badge variant="warning">{r.manualState === 'BLOCKED' ? t('Blocked by staff') : t('Unblocked by staff')}</Badge>}
      </h3>
      <p className="text-xs text-slate-600 dark:text-slate-300">
        {t('{m} months due · {a} · {d} days overdue', { m: r.monthsDue, a: formatCurrency(r.amountDue), d: r.daysOverdue })}
        {r.manualReason ? ` · ${t('Reason')}: ${r.manualReason}` : ''}
        {r.exemptReason ? ` · ${t('Exempt')}: ${r.exemptReason}` : ''}
      </p>
      {canAct && (
        <>
          <Textarea id={`reason-${studentId}`} label={t('Reason (required, kept in the audit log)')} rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="danger-soft" disabled={needReason} isLoading={block.isPending} onClick={() => run(() => block.mutateAsync({ studentId, state: 'BLOCKED', reason }))}>{t('Block')}</Button>
            <Button size="sm" variant="secondary" disabled={needReason} isLoading={block.isPending} onClick={() => run(() => block.mutateAsync({ studentId, state: 'UNBLOCKED', reason }))}>{t('Unblock')}</Button>
            {r.manualState && <Button size="sm" variant="ghost" disabled={needReason} onClick={() => run(() => block.mutateAsync({ studentId, state: 'AUTO', reason }))}>{t('Back to automatic')}</Button>}
            {r.exempt ? (
              <Button size="sm" variant="ghost" isLoading={exempt.isPending} onClick={() => run(() => exempt.mutateAsync({ studentId, exempt: false }))}>{t('Remove exemption')}</Button>
            ) : (
              <Button size="sm" variant="outline" disabled={needReason} isLoading={exempt.isPending} onClick={() => run(() => exempt.mutateAsync({ studentId, exempt: true, reason }))}>{t('Mark exempt')}</Button>
            )}
          </div>
        </>
      )}
    </section>
  );
};
