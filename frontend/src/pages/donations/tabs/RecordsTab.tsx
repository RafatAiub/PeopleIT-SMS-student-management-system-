import React from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Download, Mail, Plus, Printer, RotateCcw, Search } from 'lucide-react';
import { Button, Checkbox, ErrorState, Input, Modal, Select, SkeletonText, Table, TableCell, TableHead, TableHeaderCell, TableRow, Textarea } from '@/components/ui';
import { EmptyState } from '@/components/common/EmptyState';
import { formatDate, formatNumber, useT } from '@/i18n';
import {
  apiErrorMessage, downloadDonationsCsv, METHOD_LABEL, OFFLINE_METHODS, useCampaigns, useDonations, useDonors, useEmailReceipt, useFunds,
  usePledges, useRecordDonation, useRefundDonation, type Donation, type DonationFilters, type DonationMethod, type DonationStatus,
} from '../donations.api';
import { DonationStatusBadge, Money, toDateInput, useBi } from '../shared';

const PAGE_SIZE = 25;

export const RecordDonationModal: React.FC<{ isOpen: boolean; onClose: () => void; pledgeId?: string }> = ({ isOpen, onClose, pledgeId }) => {
  const t = useT();
  const bi = useBi();
  const funds = useFunds();
  const campaigns = useCampaigns();
  const donors = useDonors({ pageSize: 200 });
  const pledges = usePledges({ status: 'ACTIVE', pageSize: 200 });
  const record = useRecordDonation();
  const [form, setForm] = React.useState({
    fundId: '', campaignId: '', donorId: '', donorName: '', recurringId: pledgeId ?? '', amount: '', method: 'CASH' as DonationMethod,
    paidAt: toDateInput(new Date()), note: '', anonymous: false, sendReceipt: true,
  });
  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));

  React.useEffect(() => {
    if (!isOpen) return;
    const p = pledgeId ? pledges.data?.items.find((x) => x.id === pledgeId) : undefined;
    setForm((f) => ({
      ...f,
      recurringId: pledgeId ?? '',
      ...(p ? { donorId: p.donorId, fundId: p.fundId, amount: String(p.amount) } : {}),
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, pledgeId, pledges.data]);

  const activeFunds = (funds.data ?? []).filter((f) => f.active);
  const fundOptions = activeFunds.map((f) => ({ value: f.id, label: bi(f.name, f.nameBn) }));
  const campaignOptions = (campaigns.data ?? []).filter((c) => !form.fundId || c.fundId === form.fundId).map((c) => ({ value: c.id, label: bi(c.title, c.titleBn) }));
  const donorOptions = (donors.data?.items ?? []).map((d) => ({ value: d.id, label: d.phone ? `${d.name} · ${d.phone}` : d.name }));
  const pledgeOptions = (pledges.data?.items ?? []).map((p) => ({ value: p.id, label: `${p.donor.name} · ${bi(p.fund.name, p.fund.nameBn)} · ${p.amount}` }));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const fundId = form.fundId || activeFunds[0]?.id;
    if (!fundId) return toast.error(t('Create a fund first'));
    record.mutate(
      {
        fundId,
        campaignId: form.campaignId || null,
        donorId: form.donorId || null,
        donorName: form.donorId ? null : form.donorName || null,
        recurringId: form.recurringId || null,
        amount: Number(form.amount),
        method: form.method,
        paidAt: form.paidAt ? new Date(`${form.paidAt}T12:00:00`).toISOString() : undefined,
        note: form.note || null,
        anonymous: form.anonymous,
        sendReceipt: form.sendReceipt,
      },
      {
        onSuccess: (d) => {
          toast.success(t('Donation recorded — receipt {no}', { no: d?.receiptNo ?? '' }));
          setForm((f) => ({ ...f, amount: '', donorName: '', note: '', recurringId: '', campaignId: '' }));
          onClose();
        },
        onError: (err) => toast.error(apiErrorMessage(err, t('Could not record the donation'))),
      },
    );
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="lg"
      title={t('Record a donation')}
      description={t('For cash, bank or mobile-banking gifts received at the office. A receipt number is issued straight away.')}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>{t('Cancel')}</Button>
          <Button type="submit" form="record-donation-form" isLoading={record.isPending}>{t('Save and issue receipt')}</Button>
        </div>
      }
    >
      <form id="record-donation-form" onSubmit={submit} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Select label={t('Monthly pledge (optional)')} value={form.recurringId} onChange={(e) => {
          const p = pledges.data?.items.find((x) => x.id === e.target.value);
          set({ recurringId: e.target.value, ...(p ? { donorId: p.donorId, fundId: p.fundId, amount: String(p.amount) } : {}) });
        }} options={[{ value: '', label: t('— None —') }, ...pledgeOptions]} containerClassName="sm:col-span-2" />
        <Select label={t('Fund')} required value={form.fundId || activeFunds[0]?.id || ''} onChange={(e) => set({ fundId: e.target.value, campaignId: '' })} options={fundOptions} />
        <Select label={t('Campaign (optional)')} value={form.campaignId} onChange={(e) => set({ campaignId: e.target.value })} options={[{ value: '', label: t('— None —') }, ...campaignOptions]} />
        <Select label={t('Donor')} value={form.donorId} onChange={(e) => set({ donorId: e.target.value })} options={[{ value: '', label: t('Walk-in / not saved') }, ...donorOptions]} />
        {!form.donorId && <Input label={t('Donor name')} value={form.donorName} onChange={(e) => set({ donorName: e.target.value })} required />}
        <Input label={t('Amount (BDT)')} type="number" min="0.01" step="0.01" inputMode="decimal" required value={form.amount} onChange={(e) => set({ amount: e.target.value })} />
        <Select label={t('Method')} value={form.method} onChange={(e) => set({ method: e.target.value as DonationMethod })} options={OFFLINE_METHODS.map((m) => ({ value: m, label: t(METHOD_LABEL[m]) }))} />
        <Input label={t('Date received')} type="date" value={form.paidAt} onChange={(e) => set({ paidAt: e.target.value })} />
        <Textarea label={t('Note (optional)')} value={form.note} onChange={(e) => set({ note: e.target.value })} rows={2} containerClassName="sm:col-span-2" />
        <Checkbox label={t('Anonymous')} description={t('Hide the donor’s name on public lists and printed receipts.')} checked={form.anonymous} onChange={(e) => set({ anonymous: e.target.checked })} />
        <Checkbox label={t('Email the receipt')} description={t('Only when the donor has an email address.')} checked={form.sendReceipt} onChange={(e) => set({ sendReceipt: e.target.checked })} />
      </form>
    </Modal>
  );
};

const RefundModal: React.FC<{ donation: Donation | null; onClose: () => void }> = ({ donation, onClose }) => {
  const t = useT();
  const refund = useRefundDonation();
  const [reason, setReason] = React.useState('');
  return (
    <Modal
      isOpen={Boolean(donation)}
      onClose={onClose}
      title={t('Refund donation')}
      description={donation?.source === 'ONLINE' ? t('This records the refund here. Also refund it in the payment gateway’s merchant panel.') : t('Record that the money was handed back to the donor.')}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>{t('Cancel')}</Button>
          <Button
            variant="danger"
            isLoading={refund.isPending}
            disabled={reason.trim().length < 3}
            onClick={() => donation && refund.mutate({ id: donation.id, reason: reason.trim() }, {
              onSuccess: () => { toast.success(t('Donation refunded')); setReason(''); onClose(); },
              onError: (err) => toast.error(apiErrorMessage(err, t('Could not refund'))),
            })}
          >
            {t('Refund')}
          </Button>
        </div>
      }
    >
      <Textarea label={t('Reason')} value={reason} onChange={(e) => setReason(e.target.value)} rows={3} required />
    </Modal>
  );
};

const RecordsTab: React.FC = () => {
  const t = useT();
  const bi = useBi();
  const funds = useFunds();
  const [filters, setFilters] = React.useState<DonationFilters>({ page: 1, pageSize: PAGE_SIZE });
  const [search, setSearch] = React.useState('');
  const [recordOpen, setRecordOpen] = React.useState(false);
  const [refunding, setRefunding] = React.useState<Donation | null>(null);
  const [exporting, setExporting] = React.useState(false);
  const q = useDonations(filters);
  const emailReceipt = useEmailReceipt();
  const setF = (patch: Partial<DonationFilters>) => setFilters((f) => ({ ...f, ...patch, page: patch.page ?? 1 }));

  React.useEffect(() => {
    const h = setTimeout(() => setF({ q: search.trim() || undefined }), 300);
    return () => clearTimeout(h);
  }, [search]);

  const page = filters.page ?? 1;
  const totalPages = Math.max(1, Math.ceil((q.data?.total ?? 0) / PAGE_SIZE));
  const paidTotal = Number((q.data?.extra?.summary as { paidTotal?: number } | undefined)?.paidTotal ?? 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <Input
          aria-label={t('Search donations')}
          placeholder={t('Donor, phone or receipt no.')}
          leftIcon={<Search className="w-4 h-4" />}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          containerClassName="w-full sm:w-64"
        />
        <Select aria-label={t('Fund')} value={filters.fundId ?? ''} onChange={(e) => setF({ fundId: e.target.value || undefined })} options={[{ value: '', label: t('All funds') }, ...(funds.data ?? []).map((f) => ({ value: f.id, label: bi(f.name, f.nameBn) }))]} containerClassName="w-full sm:w-44" />
        <Select aria-label={t('Status')} value={filters.status ?? ''} onChange={(e) => setF({ status: e.target.value as DonationStatus | '' })} options={[{ value: '', label: t('All statuses') }, ...(['PAID', 'PENDING', 'FAILED', 'REFUNDED'] as DonationStatus[]).map((s) => ({ value: s, label: t(s.charAt(0) + s.slice(1).toLowerCase()) }))]} containerClassName="w-full sm:w-40" />
        <Select aria-label={t('Source')} value={filters.source ?? ''} onChange={(e) => setF({ source: e.target.value as DonationFilters['source'] })} options={[{ value: '', label: t('Office and online') }, { value: 'ADMIN', label: t('Recorded at office') }, { value: 'ONLINE', label: t('Online (website)') }]} containerClassName="w-full sm:w-44" />
        <div className="flex gap-2 sm:ml-auto">
          <Button variant="secondary" leftIcon={<Download className="w-4 h-4" />} isLoading={exporting} onClick={async () => {
            setExporting(true);
            try { await downloadDonationsCsv(filters); } catch (err) { toast.error(apiErrorMessage(err, t('Export failed'))); } finally { setExporting(false); }
          }}>CSV</Button>
          <Button leftIcon={<Plus className="w-4 h-4" />} onClick={() => setRecordOpen(true)}>{t('Record donation')}</Button>
        </div>
      </div>

      {q.isLoading ? <SkeletonText lines={8} /> : q.isError ? <ErrorState title={t('Could not load donations')} onRetry={() => q.refetch()} /> : (q.data?.items.length ?? 0) === 0 ? (
        <EmptyState title={t('No donations yet')} description={t('Record an office donation, or switch on online giving with the Donate block on your website.')} action={<Button onClick={() => setRecordOpen(true)}>{t('Record donation')}</Button>} />
      ) : (
        <>
          <p className="text-sm text-slate-600 dark:text-slate-300">{t('{n} donations · paid total', { n: formatNumber(q.data!.total) })}: <strong><Money value={paidTotal} /></strong></p>
          <div className="overflow-x-auto">
            <Table>
              <TableHead>
                <tr>
                  <TableHeaderCell>{t('Date')}</TableHeaderCell>
                  <TableHeaderCell>{t('Receipt no.')}</TableHeaderCell>
                  <TableHeaderCell>{t('Donor')}</TableHeaderCell>
                  <TableHeaderCell>{t('Fund')}</TableHeaderCell>
                  <TableHeaderCell>{t('Method')}</TableHeaderCell>
                  <TableHeaderCell className="text-right">{t('Amount')}</TableHeaderCell>
                  <TableHeaderCell>{t('Status')}</TableHeaderCell>
                  <TableHeaderCell><span className="sr-only">{t('Actions')}</span></TableHeaderCell>
                </tr>
              </TableHead>
              <tbody>
                {q.data!.items.map((d, i) => (
                  <TableRow key={d.id} index={i}>
                    <TableCell className="whitespace-nowrap">{formatDate(d.paidAt ?? d.createdAt)}</TableCell>
                    <TableCell className="whitespace-nowrap font-mono text-xs">{d.receiptNo ?? <span className="text-slate-400">{d.reference}</span>}</TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span>{d.donorName || t('Anonymous')}{d.anonymous && <span className="text-xs text-slate-500"> · {t('anonymous')}</span>}</span>
                        {d.donorPhone && <span className="text-xs text-slate-500">{d.donorPhone}</span>}
                      </div>
                    </TableCell>
                    <TableCell>{bi(d.fund.name, d.fund.nameBn)}{d.campaign && <span className="block text-xs text-slate-500">{d.campaign.title}</span>}</TableCell>
                    <TableCell className="whitespace-nowrap">{t(METHOD_LABEL[d.method])}{d.source === 'ONLINE' && <span className="block text-xs text-slate-500">{d.isDemo ? t('Online (demo)') : t('Online')}</span>}</TableCell>
                    <TableCell className="text-right font-semibold"><Money value={d.amount} /></TableCell>
                    <TableCell><DonationStatusBadge status={d.status} /></TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        {d.receiptNo && (
                          <Link to={`/donations/receipt/${d.id}`} className="inline-flex h-8 w-8 items-center justify-center rounded-lg hover:bg-slate-100 dark:hover:bg-white/6" aria-label={t('Print receipt')} title={t('Print receipt')}>
                            <Printer className="w-4 h-4" />
                          </Link>
                        )}
                        {d.status === 'PAID' && d.donorEmail && (
                          <Button size="icon-sm" variant="ghost" aria-label={t('Email receipt')} title={t('Email receipt')} onClick={() => emailReceipt.mutate(d.id, {
                            onSuccess: (r) => (r?.sent ? toast.success(t('Receipt emailed')) : toast.error(t('Receipt not sent ({reason})', { reason: r?.reason ?? '' }))),
                            onError: (err) => toast.error(apiErrorMessage(err, t('Could not email the receipt'))),
                          })}>
                            <Mail className="w-4 h-4" />
                          </Button>
                        )}
                        {d.status === 'PAID' && (
                          <Button size="icon-sm" variant="ghost" aria-label={t('Refund')} title={t('Refund')} onClick={() => setRefunding(d)}>
                            <RotateCcw className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </tbody>
            </Table>
          </div>
          {totalPages > 1 && (
            <div className="flex items-center justify-end gap-2">
              <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => setF({ page: page - 1 })}>{t('Previous')}</Button>
              <span className="text-sm text-slate-600 dark:text-slate-300">{t('Page {p} of {n}', { p: page, n: totalPages })}</span>
              <Button size="sm" variant="secondary" disabled={page >= totalPages} onClick={() => setF({ page: page + 1 })}>{t('Next')}</Button>
            </div>
          )}
        </>
      )}

      <RecordDonationModal isOpen={recordOpen} onClose={() => setRecordOpen(false)} />
      <RefundModal donation={refunding} onClose={() => setRefunding(null)} />
    </div>
  );
};

export default RecordsTab;
