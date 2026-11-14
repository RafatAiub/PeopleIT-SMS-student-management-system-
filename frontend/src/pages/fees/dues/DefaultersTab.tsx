import React from 'react';
import { MessageSquare, Phone } from 'lucide-react';
import { Alert, Button, Card, ErrorState, Input, SkeletonText } from '@/components/ui';
import { EmptyState } from '@/components/common/EmptyState';
import { formatCurrency, formatDate, formatNumber, useLocale, useT } from '@/i18n';
import { useAuthStore } from '@/store/authStore';
import { useDefaulters, type FilterOptions } from './dues.api';
import { shortMonth } from './dues.logic';
import { ClassSectionSearch, Pager, useDebounced, type ClassFilterValue } from './DuesFilters';
import { ReminderModal, type ReminderTarget } from './ReminderModal';
import { StudentLedgerDrawer } from './StudentLedgerDrawer';

// =============================================================================
// Fees → Dues → Defaulters: who owes ≥ X months or ≥ ৳Y, with guardian
// contact, and one-click / bulk SMS + email reminders.
// =============================================================================

const ACT_ROLES = new Set(['SUPER_ADMIN', 'ADMIN', 'ACCOUNTANT']);

export const DefaultersTab: React.FC<{ options?: FilterOptions; ledgerRange: { from: string; to: string } }> = ({ options, ledgerRange }) => {
  const t = useT();
  const { lang } = useLocale();
  const role = useAuthStore((s) => s.user?.role);
  const canSend = !!role && ACT_ROLES.has(role);
  const [cls, setCls] = React.useState<ClassFilterValue>({ classId: '', sectionId: '', search: '' });
  const [minMonths, setMinMonths] = React.useState('1');
  const [minAmount, setMinAmount] = React.useState('');
  const [page, setPage] = React.useState(1);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [target, setTarget] = React.useState<ReminderTarget | null>(null);
  const [ledger, setLedger] = React.useState<string | null>(null);
  const search = useDebounced(cls.search.trim());
  const months = Number(minMonths) || undefined;
  const amount = Number(minAmount) || undefined;
  const filter = { classId: cls.classId || undefined, sectionId: cls.sectionId || undefined, search: search || undefined, minMonths: months, minAmount: amount };

  React.useEffect(() => {
    setPage(1);
    setSelected(new Set());
  }, [cls.classId, cls.sectionId, search, minMonths, minAmount]);

  const q = useDefaulters({ ...filter, page, pageSize: 50 });
  const items = q.data?.items ?? [];
  const allOnPage = items.length > 0 && items.every((i) => selected.has(i.id));
  const toggle = (id: string) => setSelected((s) => {
    const n = new Set(s);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    return n;
  });

  return (
    <div className="space-y-4">
      <Card className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        <ClassSectionSearch idPrefix="def" options={options} value={cls} onChange={setCls} />
        <Input id="def-months" type="number" min={0} max={120} inputMode="numeric" label={t('Dues of at least (months)')} value={minMonths} onChange={(e) => setMinMonths(e.target.value)} />
        <Input id="def-amount" type="number" min={0} inputMode="decimal" label={t('…or at least (৳)')} value={minAmount} onChange={(e) => setMinAmount(e.target.value)} helperText={t('A student matching either is listed.')} />
      </Card>

      {q.data && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-slate-700 dark:text-slate-200">
            {t('{n} students owe {amount} in total', { n: formatNumber(q.data.total), amount: formatCurrency(q.data.totalAmount) })}
          </p>
          {canSend && q.data.total > 0 && (
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" leftIcon={<MessageSquare className="w-4 h-4" />} disabled={selected.size === 0} onClick={() => setTarget({ kind: 'ids', ids: [...selected], label: t('{n} selected', { n: selected.size }) })}>
                {t('Remind selected ({n})', { n: selected.size })}
              </Button>
              <Button size="sm" leftIcon={<MessageSquare className="w-4 h-4" />} onClick={() => setTarget({ kind: 'filter', filter, label: t('all {n} defaulters', { n: q.data!.total }) })}>
                {t('Remind all {n}', { n: formatNumber(q.data.total) })}
              </Button>
            </div>
          )}
        </div>
      )}

      {q.isLoading ? (
        <SkeletonText lines={8} />
      ) : q.isError ? (
        <ErrorState title={t('Could not load defaulters')} onRetry={() => q.refetch()} />
      ) : items.length === 0 ? (
        <EmptyState title={t('No defaulters')} description={t('Nobody owes fees with these filters.')} />
      ) : (
        <Card flush className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <caption className="sr-only">{t('Defaulters')}</caption>
              <thead className="bg-slate-50 dark:bg-slate-800 text-xs text-left">
                <tr>
                  {canSend && (
                    <th scope="col" className="px-3 py-2 w-8">
                      <input type="checkbox" aria-label={t('Select all on this page')} className="w-4 h-4 accent-primary-600" checked={allOnPage}
                        onChange={() => setSelected((s) => { const n = new Set(s); items.forEach((i) => (allOnPage ? n.delete(i.id) : n.add(i.id))); return n; })} />
                    </th>
                  )}
                  <th scope="col" className="px-3 py-2">{t('Student')}</th>
                  <th scope="col" className="px-3 py-2">{t('Guardian')}</th>
                  <th scope="col" className="px-3 py-2">{t('Months due')}</th>
                  <th scope="col" className="px-3 py-2 text-right">{t('Amount due')}</th>
                  <th scope="col" className="px-3 py-2">{t('Last payment')}</th>
                  <th scope="col" className="px-3 py-2">{t('Last reminded')}</th>
                  {canSend && <th scope="col" className="px-3 py-2"><span className="sr-only">{t('Actions')}</span></th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-white/10">
                {items.map((r) => (
                  <tr key={r.id}>
                    {canSend && (
                      <td className="px-3 py-2"><input type="checkbox" className="w-4 h-4 accent-primary-600" aria-label={t('Select {name}', { name: r.name })} checked={selected.has(r.id)} onChange={() => toggle(r.id)} /></td>
                    )}
                    <td className="px-3 py-2">
                      <button type="button" className="font-medium hover:underline text-left" onClick={() => setLedger(r.id)}>{r.name}</button>
                      <div className="text-xs text-slate-500">{[r.studentCode, r.className, r.sectionName, r.rollNumber && `${t('Roll')} ${r.rollNumber}`].filter(Boolean).join(' · ')}</div>
                    </td>
                    <td className="px-3 py-2">
                      <div>{r.guardianName ?? '—'}</div>
                      {r.guardianPhone && <a href={`tel:${r.guardianPhone}`} className="text-xs inline-flex items-center gap-1 text-primary-700 dark:text-primary-300 underline"><Phone className="w-3 h-3" aria-hidden />{r.guardianPhone}</a>}
                    </td>
                    <td className="px-3 py-2">
                      <strong>{formatNumber(r.monthsDue)}</strong>
                      <div className="text-xs text-slate-500">{r.months.map((m) => `${shortMonth(m, lang)} ${m.slice(2, 4)}`).join(', ')}</div>
                    </td>
                    <td className="px-3 py-2 text-right font-semibold text-rose-700 dark:text-rose-300 whitespace-nowrap">{formatCurrency(r.amountDue)}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{r.lastPaymentAt ? formatDate(r.lastPaymentAt) : t('Never')}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{r.lastRemindedAt ? formatDate(r.lastRemindedAt, true) : '—'}</td>
                    {canSend && (
                      <td className="px-3 py-2">
                        <Button size="xs" variant="outline" onClick={() => setTarget({ kind: 'ids', ids: [r.id], label: r.name })}>{t('Remind')}</Button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="p-3 border-t border-slate-100 dark:border-white/10">
            <Pager page={q.data!.page} pageSize={q.data!.pageSize} total={q.data!.total} onPage={setPage} />
          </div>
        </Card>
      )}

      {!canSend && <Alert tone="info">{t('Only admins and accountants can send reminders.')}</Alert>}

      {target && <ReminderModal target={target} onClose={() => setTarget(null)} onDone={() => { setSelected(new Set()); q.refetch(); }} />}
      <StudentLedgerDrawer studentId={ledger} range={ledgerRange} onClose={() => setLedger(null)} />
    </div>
  );
};
