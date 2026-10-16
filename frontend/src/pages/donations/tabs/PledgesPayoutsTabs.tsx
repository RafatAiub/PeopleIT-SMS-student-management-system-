import React from 'react';
import toast from 'react-hot-toast';
import { BellRing, HandCoins, Pause, Play, Plus, Trash2 } from 'lucide-react';
import { Button, Checkbox, ErrorState, Input, Modal, Select, SkeletonText, Table, TableCell, TableHead, TableHeaderCell, TableRow, Textarea } from '@/components/ui';
import { EmptyState } from '@/components/common/EmptyState';
import { formatDate, useT } from '@/i18n';
import {
  apiErrorMessage, useDeleteDisbursement, useDeletePledge, useDisbursements, useDonors, useFunds, usePledges, useSaveDisbursement,
  useSavePledge, useSendReminders, type Pledge,
} from '../donations.api';
import { DueBadge, Money, toDateInput, useBi } from '../shared';
import { RecordDonationModal } from './RecordsTab';

/* ── Monthly pledges ────────────────────────────────────────────────────── */

const PledgeModal: React.FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => {
  const t = useT();
  const bi = useBi();
  const donors = useDonors({ pageSize: 200 });
  const funds = useFunds();
  const save = useSavePledge();
  const [f, setF] = React.useState({ donorId: '', fundId: '', amount: '', dayOfMonth: '5', startDate: toDateInput(new Date()), remindEmail: true, remindSms: false, note: '' });
  const set = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }));
  const activeFunds = (funds.data ?? []).filter((x) => x.active);
  const donorId = f.donorId || donors.data?.items[0]?.id || '';
  const fundId = f.fundId || activeFunds[0]?.id || '';
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!donorId) return toast.error(t('Add the donor first (Donors tab)'));
    save.mutate(
      {
        body: {
          donorId, fundId, amount: Number(f.amount), dayOfMonth: Number(f.dayOfMonth),
          startDate: f.startDate ? new Date(`${f.startDate}T00:00:00Z`).toISOString() : undefined,
          remindEmail: f.remindEmail, remindSms: f.remindSms, note: f.note || null,
        },
      },
      { onSuccess: () => { toast.success(t('Monthly pledge added')); onClose(); }, onError: (err) => toast.error(apiErrorMessage(err, t('Could not save the pledge'))) },
    );
  };
  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t('New monthly pledge')} description={t('A donor promises a fixed amount every month. You’ll see it in “Due this month” and can send reminders.')} size="lg"
      footer={<div className="flex justify-end gap-2"><Button variant="secondary" onClick={onClose}>{t('Cancel')}</Button><Button type="submit" form="pledge-form" isLoading={save.isPending}>{t('Save')}</Button></div>}>
      <form id="pledge-form" onSubmit={submit} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Select label={t('Donor')} value={donorId} onChange={(e) => set({ donorId: e.target.value })} options={(donors.data?.items ?? []).map((d) => ({ value: d.id, label: d.phone ? `${d.name} · ${d.phone}` : d.name }))} />
        <Select label={t('Fund')} value={fundId} onChange={(e) => set({ fundId: e.target.value })} options={activeFunds.map((x) => ({ value: x.id, label: bi(x.name, x.nameBn) }))} />
        <Input label={t('Amount (BDT)')} type="number" min="0.01" step="0.01" required value={f.amount} onChange={(e) => set({ amount: e.target.value })} />
        <Input label={t('Day of the month (1–28)')} type="number" min="1" max="28" required value={f.dayOfMonth} onChange={(e) => set({ dayOfMonth: e.target.value })} />
        <Input label={t('Starts')} type="date" value={f.startDate} onChange={(e) => set({ startDate: e.target.value })} />
        <Textarea label={t('Note (optional)')} rows={2} value={f.note} onChange={(e) => set({ note: e.target.value })} containerClassName="sm:col-span-2" />
        <Checkbox label={t('Email reminder')} checked={f.remindEmail} onChange={(e) => set({ remindEmail: e.target.checked })} />
        <Checkbox label={t('SMS reminder')} description={t('Counts towards your plan’s SMS limit.')} checked={f.remindSms} onChange={(e) => set({ remindSms: e.target.checked })} />
      </form>
    </Modal>
  );
};

export const PledgesTab: React.FC = () => {
  const t = useT();
  const bi = useBi();
  const [dueOnly, setDueOnly] = React.useState(true);
  const q = usePledges({ dueThisMonth: dueOnly || undefined, pageSize: 200 });
  const save = useSavePledge();
  const del = useDeletePledge();
  const remind = useSendReminders();
  const [adding, setAdding] = React.useState(false);
  const [paying, setPaying] = React.useState<Pledge | null>(null);

  const sendReminders = (ids?: string[]) =>
    remind.mutate(ids, {
      onSuccess: (r) => toast.success(t('{n} reminders sent, {m} skipped', { n: r?.reminded ?? 0, m: r?.skipped ?? 0 })),
      onError: (err) => toast.error(apiErrorMessage(err, t('Could not send reminders'))),
    });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-lg border border-slate-200 dark:border-white/10 p-0.5" role="group" aria-label={t('Show')}>
          <button type="button" aria-pressed={dueOnly} className={`px-3 py-1.5 text-sm rounded-md ${dueOnly ? 'bg-primary-50 text-primary-700 dark:bg-primary-500/15 dark:text-primary-300 font-semibold' : 'text-slate-600 dark:text-slate-300'}`} onClick={() => setDueOnly(true)}>{t('Due this month')}</button>
          <button type="button" aria-pressed={!dueOnly} className={`px-3 py-1.5 text-sm rounded-md ${!dueOnly ? 'bg-primary-50 text-primary-700 dark:bg-primary-500/15 dark:text-primary-300 font-semibold' : 'text-slate-600 dark:text-slate-300'}`} onClick={() => setDueOnly(false)}>{t('All pledges')}</button>
        </div>
        <div className="flex gap-2 sm:ml-auto">
          <Button variant="secondary" leftIcon={<BellRing className="w-4 h-4" />} isLoading={remind.isPending} onClick={() => sendReminders()}>{t('Remind all due')}</Button>
          <Button leftIcon={<Plus className="w-4 h-4" />} onClick={() => setAdding(true)}>{t('New pledge')}</Button>
        </div>
      </div>
      <p className="text-xs text-slate-500 dark:text-slate-400">{t('Reminders go by in-app notification (portal users), email and/or SMS — at most once per pledge per month.')}</p>

      {q.isLoading ? <SkeletonText lines={6} /> : q.isError ? <ErrorState title={t('Could not load pledges')} onRetry={() => q.refetch()} /> : (q.data?.items.length ?? 0) === 0 ? (
        <EmptyState title={dueOnly ? t('Nothing due this month') : t('No monthly pledges yet')} description={t('Add a pledge when a donor commits to give every month.')} />
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHead><tr>
              <TableHeaderCell>{t('Donor')}</TableHeaderCell><TableHeaderCell>{t('Fund')}</TableHeaderCell>
              <TableHeaderCell className="text-right">{t('Amount')}</TableHeaderCell><TableHeaderCell>{t('Next due')}</TableHeaderCell>
              <TableHeaderCell>{t('Status')}</TableHeaderCell><TableHeaderCell><span className="sr-only">{t('Actions')}</span></TableHeaderCell>
            </tr></TableHead>
            <tbody>
              {q.data!.items.map((p, i) => (
                <TableRow key={p.id} index={i}>
                  <TableCell><span className="font-medium">{p.donor.name}</span>{p.donor.phone && <span className="block text-xs text-slate-500">{p.donor.phone}</span>}</TableCell>
                  <TableCell>{bi(p.fund.name, p.fund.nameBn)}</TableCell>
                  <TableCell className="text-right font-semibold"><Money value={p.amount} /></TableCell>
                  <TableCell className="whitespace-nowrap">{formatDate(p.nextDueDate)}{p.remindedThisMonth && <span className="block text-xs text-slate-500">{t('Reminded this month')}</span>}</TableCell>
                  <TableCell><DueBadge state={p.dueState} /></TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      {p.status === 'ACTIVE' && (p.dueState === 'due' || p.dueState === 'overdue') && (
                        <>
                          <Button size="sm" variant="outline" leftIcon={<HandCoins className="w-4 h-4" />} onClick={() => setPaying(p)}>{t('Record payment')}</Button>
                          <Button size="icon-sm" variant="ghost" aria-label={t('Send reminder')} title={t('Send reminder')} disabled={p.remindedThisMonth} onClick={() => sendReminders([p.id])}><BellRing className="w-4 h-4" /></Button>
                        </>
                      )}
                      {p.status !== 'CANCELLED' && (
                        <Button size="icon-sm" variant="ghost" aria-label={p.status === 'ACTIVE' ? t('Pause') : t('Resume')} title={p.status === 'ACTIVE' ? t('Pause') : t('Resume')} onClick={() => save.mutate({ id: p.id, body: { status: p.status === 'ACTIVE' ? 'PAUSED' : 'ACTIVE' } })}>
                          {p.status === 'ACTIVE' ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                        </Button>
                      )}
                      <Button size="icon-sm" variant="ghost" aria-label={t('Delete')} onClick={() => window.confirm(t('Delete this monthly pledge? Recorded donations are kept.')) && del.mutate(p.id)}><Trash2 className="w-4 h-4" /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </tbody>
          </Table>
        </div>
      )}
      <PledgeModal isOpen={adding} onClose={() => setAdding(false)} />
      <RecordDonationModal isOpen={Boolean(paying)} pledgeId={paying?.id} onClose={() => setPaying(null)} />
    </div>
  );
};

/* ── Payouts (disbursements) ─────────────────────────────────────────────── */

const PayoutModal: React.FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => {
  const t = useT();
  const bi = useBi();
  const funds = useFunds();
  const save = useSaveDisbursement();
  const [f, setF] = React.useState({ fundId: '', amount: '', paidTo: '', purpose: '', date: toDateInput(new Date()), note: '' });
  const set = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }));
  const fundId = f.fundId || funds.data?.[0]?.id || '';
  const fund = funds.data?.find((x) => x.id === fundId);
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    save.mutate(
      { fundId, amount: Number(f.amount), paidTo: f.paidTo, purpose: f.purpose || null, date: f.date ? new Date(`${f.date}T12:00:00`).toISOString() : undefined, note: f.note || null },
      {
        onSuccess: () => { toast.success(t('Payout recorded')); setF((x) => ({ ...x, amount: '', paidTo: '', purpose: '', note: '' })); onClose(); },
        onError: (err) => toast.error(apiErrorMessage(err, t('Could not record the payout'))),
      },
    );
  };
  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t('Record a payout')} description={t('Money paid out of a fund — e.g. Zakat given to a needy family. It can’t exceed the fund’s balance.')} size="lg"
      footer={<div className="flex justify-end gap-2"><Button variant="secondary" onClick={onClose}>{t('Cancel')}</Button><Button type="submit" form="payout-form" isLoading={save.isPending}>{t('Save')}</Button></div>}>
      <form id="payout-form" onSubmit={submit} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Select label={t('Fund')} value={fundId} onChange={(e) => set({ fundId: e.target.value })} options={(funds.data ?? []).map((x) => ({ value: x.id, label: bi(x.name, x.nameBn) }))}
          helperText={fund ? <>{t('Balance')}: <Money value={fund.balance} /></> : undefined} />
        <Input label={t('Amount (BDT)')} type="number" min="0.01" step="0.01" required value={f.amount} onChange={(e) => set({ amount: e.target.value })} />
        <Input label={t('Paid to')} required value={f.paidTo} onChange={(e) => set({ paidTo: e.target.value })} />
        <Input label={t('Purpose')} value={f.purpose} onChange={(e) => set({ purpose: e.target.value })} />
        <Input label={t('Date')} type="date" value={f.date} onChange={(e) => set({ date: e.target.value })} />
        <Textarea label={t('Note (optional)')} rows={2} value={f.note} onChange={(e) => set({ note: e.target.value })} containerClassName="sm:col-span-2" />
      </form>
    </Modal>
  );
};

export const PayoutsTab: React.FC = () => {
  const t = useT();
  const bi = useBi();
  const funds = useFunds();
  const [fundId, setFundId] = React.useState('');
  const q = useDisbursements({ fundId: fundId || undefined, pageSize: 200 });
  const del = useDeleteDisbursement();
  const [adding, setAdding] = React.useState(false);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <Select aria-label={t('Fund')} value={fundId} onChange={(e) => setFundId(e.target.value)} options={[{ value: '', label: t('All funds') }, ...(funds.data ?? []).map((x) => ({ value: x.id, label: bi(x.name, x.nameBn) }))]} containerClassName="w-full sm:w-56" />
        <Button className="sm:ml-auto" leftIcon={<Plus className="w-4 h-4" />} onClick={() => setAdding(true)}>{t('Record payout')}</Button>
      </div>
      {q.isLoading ? <SkeletonText lines={6} /> : q.isError ? <ErrorState title={t('Could not load payouts')} onRetry={() => q.refetch()} /> : (q.data?.items.length ?? 0) === 0 ? (
        <EmptyState title={t('No payouts yet')} description={t('Record each Zakat distribution or spending from a fund so its balance stays accurate.')} />
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHead><tr>
              <TableHeaderCell>{t('Date')}</TableHeaderCell><TableHeaderCell>{t('Fund')}</TableHeaderCell><TableHeaderCell>{t('Paid to')}</TableHeaderCell>
              <TableHeaderCell>{t('Purpose')}</TableHeaderCell><TableHeaderCell className="text-right">{t('Amount')}</TableHeaderCell><TableHeaderCell><span className="sr-only">{t('Actions')}</span></TableHeaderCell>
            </tr></TableHead>
            <tbody>
              {q.data!.items.map((d, i) => (
                <TableRow key={d.id} index={i}>
                  <TableCell className="whitespace-nowrap">{formatDate(d.date)}</TableCell>
                  <TableCell>{bi(d.fund.name, d.fund.nameBn)}</TableCell>
                  <TableCell>{d.paidTo}</TableCell>
                  <TableCell className="text-sm">{d.purpose}</TableCell>
                  <TableCell className="text-right font-semibold"><Money value={d.amount} /></TableCell>
                  <TableCell><div className="flex justify-end"><Button size="icon-sm" variant="ghost" aria-label={t('Delete')} onClick={() => window.confirm(t('Delete this payout?')) && del.mutate(d.id)}><Trash2 className="w-4 h-4" /></Button></div></TableCell>
                </TableRow>
              ))}
            </tbody>
          </Table>
        </div>
      )}
      <PayoutModal isOpen={adding} onClose={() => setAdding(false)} />
    </div>
  );
};
