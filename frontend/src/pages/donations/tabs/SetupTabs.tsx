import React from 'react';
import toast from 'react-hot-toast';
import { Edit3, Globe, Plus, Search, Trash2 } from 'lucide-react';
import { Badge, Button, Card, Checkbox, ErrorState, Input, Modal, Select, SkeletonText, Table, TableCell, TableHead, TableHeaderCell, TableRow, Textarea } from '@/components/ui';
import { EmptyState } from '@/components/common/EmptyState';
import { formatDate, formatNumber, useLocale, useT } from '@/i18n';
import {
  apiErrorMessage, FUND_TYPE_LABEL, FUND_TYPES, useCampaigns, useDeleteCampaign, useDeleteDonor, useDeleteFund, useDonors, useFunds,
  useSaveCampaign, useSaveDonor, useSaveFund, type Campaign, type Donor, type Fund, type FundType,
} from '../donations.api';
import { FundTypeBadge, GoalBar, Money, toDateInput, useBi } from '../shared';
import { showUndoToast } from '@/components/common/undoToast';

function confirmDelete(message: string): boolean {
  return window.confirm(message);
}

/* ── Funds ──────────────────────────────────────────────────────────────── */

const FundModal: React.FC<{ fund: Fund | null | 'new'; onClose: () => void }> = ({ fund, onClose }) => {
  const t = useT();
  const { lang } = useLocale();
  const save = useSaveFund();
  const editing = fund && fund !== 'new' ? fund : null;
  const [f, setF] = React.useState({ name: '', nameBn: '', type: 'GENERAL' as FundType, description: '', goalAmount: '', active: true, showOnWebsite: false });
  React.useEffect(() => {
    if (!fund) return;
    setF(editing
      ? { name: editing.name, nameBn: editing.nameBn ?? '', type: editing.type, description: editing.description ?? '', goalAmount: editing.goalAmount ? String(editing.goalAmount) : '', active: editing.active, showOnWebsite: editing.showOnWebsite }
      : { name: '', nameBn: '', type: 'GENERAL', description: '', goalAmount: '', active: true, showOnWebsite: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fund]);
  const set = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }));
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    save.mutate(
      { id: editing?.id, body: { ...f, nameBn: f.nameBn || null, description: f.description || null, goalAmount: f.goalAmount ? Number(f.goalAmount) : null } },
      { onSuccess: () => { toast.success(t('Fund saved')); onClose(); }, onError: (err) => toast.error(apiErrorMessage(err, t('Could not save the fund'))) },
    );
  };
  return (
    <Modal isOpen={Boolean(fund)} onClose={onClose} title={editing ? t('Edit fund') : t('New fund')} size="lg"
      footer={<div className="flex justify-end gap-2"><Button variant="secondary" onClick={onClose}>{t('Cancel')}</Button><Button type="submit" form="fund-form" isLoading={save.isPending}>{t('Save')}</Button></div>}>
      <form id="fund-form" onSubmit={submit} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Input label={t('Name')} required value={f.name} onChange={(e) => set({ name: e.target.value })} />
        <Input label={t('Name (Bangla)')} lang="bn" value={f.nameBn} onChange={(e) => set({ nameBn: e.target.value })} />
        <Select label={t('Type')} value={f.type} onChange={(e) => set({ type: e.target.value as FundType })} options={FUND_TYPES.map((x) => ({ value: x, label: `${FUND_TYPE_LABEL[x].en} / ${FUND_TYPE_LABEL[x].bn}` }))} />
        <Input label={t('Goal (BDT, optional)')} type="number" min="0" step="0.01" value={f.goalAmount} onChange={(e) => set({ goalAmount: e.target.value })} />
        <Textarea label={t('Description')} rows={3} value={f.description} onChange={(e) => set({ description: e.target.value })} containerClassName="sm:col-span-2" />
        <Checkbox label={t('Active')} description={t('Inactive funds stop accepting new donations.')} checked={f.active} onChange={(e) => set({ active: e.target.checked })} />
        <Checkbox label={t('Show on website')} description={t('Donors can choose this fund on your website’s Donate block.')} checked={f.showOnWebsite} onChange={(e) => set({ showOnWebsite: e.target.checked })} />
        {f.type === 'ZAKAT' && <p className="sm:col-span-2 text-xs text-slate-500 dark:text-slate-400">{lang === 'bn' ? 'যাকাত শুধুমাত্র শরিয়তসম্মত খাতে ব্যয় করুন; বিতরণ "পেমেন্ট" ট্যাবে লিখে রাখুন।' : 'Spend Zakat only on eligible recipients, and record each distribution in the Payouts tab.'}</p>}
      </form>
    </Modal>
  );
};

export const FundsTab: React.FC = () => {
  const t = useT();
  const bi = useBi();
  const q = useFunds();
  const del = useDeleteFund();
  const [editing, setEditing] = React.useState<Fund | null | 'new'>(null);
  if (q.isLoading) return <SkeletonText lines={6} />;
  if (q.isError) return <ErrorState title={t('Could not load funds')} onRetry={() => q.refetch()} />;
  const funds = q.data ?? [];
  return (
    <div className="space-y-4">
      <div className="flex justify-end"><Button leftIcon={<Plus className="w-4 h-4" />} onClick={() => setEditing('new')}>{t('New fund')}</Button></div>
      {funds.length === 0 ? (
        <EmptyState title={t('No funds yet')} description={t('Start with the funds your institution collects, e.g. Zakat, Sadaqah, Lillah, Building.')} action={<Button onClick={() => setEditing('new')}>{t('New fund')}</Button>} />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {funds.map((f) => (
            <Card key={f.id} className="flex flex-col gap-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="font-bold text-slate-900 dark:text-white truncate">{bi(f.name, f.nameBn)}</h3>
                  <div className="flex flex-wrap items-center gap-1.5 mt-1">
                    <FundTypeBadge type={f.type} />
                    {!f.active && <Badge variant="neutral">{t('Inactive')}</Badge>}
                    {f.showOnWebsite && <Badge variant="info"><Globe className="w-3 h-3" aria-hidden /> {t('On website')}</Badge>}
                  </div>
                </div>
                <div className="flex gap-1">
                  <Button size="icon-sm" variant="ghost" aria-label={t('Edit')} onClick={() => setEditing(f)}><Edit3 className="w-4 h-4" /></Button>
                  <Button size="icon-sm" variant="ghost" aria-label={t('Delete')} onClick={() => confirmDelete(t('Delete this fund?')) && del.mutate(f.id, {
                    onSuccess: (res) => showUndoToast(t('Fund moved to trash'), res, () => q.refetch()),
                    onError: (err) => toast.error(apiErrorMessage(err, t('Could not delete'))),
                  })}><Trash2 className="w-4 h-4" /></Button>
                </div>
              </div>
              <dl className="grid grid-cols-3 gap-2 text-sm">
                <div><dt className="text-xs text-slate-500 dark:text-slate-400">{t('Collected')}</dt><dd className="font-semibold"><Money value={f.collected} /></dd></div>
                <div><dt className="text-xs text-slate-500 dark:text-slate-400">{t('Paid out')}</dt><dd className="font-semibold"><Money value={f.disbursed} /></dd></div>
                <div><dt className="text-xs text-slate-500 dark:text-slate-400">{t('Balance')}</dt><dd className="font-bold text-primary-700 dark:text-primary-400"><Money value={f.balance} /></dd></div>
              </dl>
              {f.goalAmount != null && (
                <div className="space-y-1">
                  <GoalBar progress={f.progress} label={t('Goal progress')} />
                  <p className="text-xs text-slate-500 dark:text-slate-400">{t('Goal')}: <Money value={f.goalAmount} /> · {f.progress ?? 0}%</p>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
      <FundModal fund={editing} onClose={() => setEditing(null)} />
    </div>
  );
};

/* ── Donors ─────────────────────────────────────────────────────────────── */

const DonorModal: React.FC<{ donor: Donor | null | 'new'; onClose: () => void }> = ({ donor, onClose }) => {
  const t = useT();
  const save = useSaveDonor();
  const editing = donor && donor !== 'new' ? donor : null;
  const [f, setF] = React.useState({ name: '', phone: '', email: '', address: '', anonymous: false, notes: '' });
  React.useEffect(() => {
    if (!donor) return;
    setF(editing
      ? { name: editing.name, phone: editing.phone ?? '', email: editing.email ?? '', address: editing.address ?? '', anonymous: editing.anonymous, notes: editing.notes ?? '' }
      : { name: '', phone: '', email: '', address: '', anonymous: false, notes: '' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [donor]);
  const set = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }));
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    save.mutate(
      { id: editing?.id, body: { name: f.name, phone: f.phone || null, email: f.email || null, address: f.address || null, anonymous: f.anonymous, notes: f.notes || null } },
      { onSuccess: () => { toast.success(t('Donor saved')); onClose(); }, onError: (err) => toast.error(apiErrorMessage(err, t('Could not save the donor'))) },
    );
  };
  return (
    <Modal isOpen={Boolean(donor)} onClose={onClose} title={editing ? t('Edit donor') : t('New donor')} size="lg"
      footer={<div className="flex justify-end gap-2"><Button variant="secondary" onClick={onClose}>{t('Cancel')}</Button><Button type="submit" form="donor-form" isLoading={save.isPending}>{t('Save')}</Button></div>}>
      <form id="donor-form" onSubmit={submit} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Input label={t('Name')} required value={f.name} onChange={(e) => set({ name: e.target.value })} containerClassName="sm:col-span-2" />
        <Input label={t('Mobile number')} inputMode="tel" value={f.phone} onChange={(e) => set({ phone: e.target.value })} />
        <Input label={t('Email')} type="email" value={f.email} onChange={(e) => set({ email: e.target.value })} helperText={t('Receipts are emailed here.')} />
        <Input label={t('Address')} value={f.address} onChange={(e) => set({ address: e.target.value })} containerClassName="sm:col-span-2" />
        <Textarea label={t('Notes')} rows={2} value={f.notes} onChange={(e) => set({ notes: e.target.value })} containerClassName="sm:col-span-2" />
        <Checkbox label={t('Anonymous donor')} description={t('Never show this donor’s name publicly.')} checked={f.anonymous} onChange={(e) => set({ anonymous: e.target.checked })} />
      </form>
      {editing?.user && <p className="mt-3 text-xs text-slate-500">{t('Linked portal account')}: {editing.user.firstName} {editing.user.lastName} ({t(editing.user.role)})</p>}
    </Modal>
  );
};

export const DonorsTab: React.FC = () => {
  const t = useT();
  const [search, setSearch] = React.useState('');
  const [query, setQuery] = React.useState('');
  const [page, setPage] = React.useState(1);
  const q = useDonors({ q: query || undefined, page, pageSize: 25 });
  const del = useDeleteDonor();
  const [editing, setEditing] = React.useState<Donor | null | 'new'>(null);
  React.useEffect(() => {
    const h = setTimeout(() => { setQuery(search.trim()); setPage(1); }, 300);
    return () => clearTimeout(h);
  }, [search]);
  const totalPages = Math.max(1, Math.ceil((q.data?.total ?? 0) / 25));
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <Input aria-label={t('Search donors')} placeholder={t('Name, phone or email')} leftIcon={<Search className="w-4 h-4" />} value={search} onChange={(e) => setSearch(e.target.value)} containerClassName="w-full sm:w-72" />
        <Button className="sm:ml-auto" leftIcon={<Plus className="w-4 h-4" />} onClick={() => setEditing('new')}>{t('New donor')}</Button>
      </div>
      {q.isLoading ? <SkeletonText lines={6} /> : q.isError ? <ErrorState title={t('Could not load donors')} onRetry={() => q.refetch()} /> : (q.data?.items.length ?? 0) === 0 ? (
        <EmptyState title={t('No donors yet')} description={t('Donors are added here, or automatically when someone gives online with their phone or email.')} />
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHead><tr>
              <TableHeaderCell>{t('Name')}</TableHeaderCell><TableHeaderCell>{t('Contact')}</TableHeaderCell>
              <TableHeaderCell className="text-right">{t('Donations')}</TableHeaderCell><TableHeaderCell className="text-right">{t('Total given')}</TableHeaderCell>
              <TableHeaderCell><span className="sr-only">{t('Actions')}</span></TableHeaderCell>
            </tr></TableHead>
            <tbody>
              {q.data!.items.map((d, i) => (
                <TableRow key={d.id} index={i}>
                  <TableCell><span className="font-medium">{d.name}</span>{d.anonymous && <Badge variant="neutral" className="ml-2">{t('Anonymous')}</Badge>}{d.userId && <Badge variant="info" className="ml-2">{t('Portal user')}</Badge>}</TableCell>
                  <TableCell className="text-sm">{d.phone}{d.phone && d.email ? ' · ' : ''}{d.email}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatNumber(d.donationCount ?? 0)}</TableCell>
                  <TableCell className="text-right font-semibold"><Money value={d.totalGiven ?? 0} /></TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      <Button size="icon-sm" variant="ghost" aria-label={t('Edit')} onClick={() => setEditing(d)}><Edit3 className="w-4 h-4" /></Button>
                      <Button size="icon-sm" variant="ghost" aria-label={t('Delete')} onClick={() => confirmDelete(t('Delete this donor? Their past donations are kept; their monthly pledges are removed.')) && del.mutate(d.id, {
                        onSuccess: () => toast.success(t('Donor deleted')),
                        onError: (err) => toast.error(apiErrorMessage(err, t('Could not delete'))),
                      })}><Trash2 className="w-4 h-4" /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </tbody>
          </Table>
        </div>
      )}
      {totalPages > 1 && (
        <div className="flex items-center justify-end gap-2">
          <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>{t('Previous')}</Button>
          <span className="text-sm">{t('Page {p} of {n}', { p: page, n: totalPages })}</span>
          <Button size="sm" variant="secondary" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>{t('Next')}</Button>
        </div>
      )}
      <DonorModal donor={editing} onClose={() => setEditing(null)} />
    </div>
  );
};

/* ── Campaigns ──────────────────────────────────────────────────────────── */

const CampaignModal: React.FC<{ campaign: Campaign | null | 'new'; onClose: () => void }> = ({ campaign, onClose }) => {
  const t = useT();
  const bi = useBi();
  const funds = useFunds();
  const save = useSaveCampaign();
  const editing = campaign && campaign !== 'new' ? campaign : null;
  const empty = { fundId: '', title: '', titleBn: '', description: '', goalAmount: '', startDate: '', endDate: '', coverImageUrl: '', isPublic: false };
  const [f, setF] = React.useState(empty);
  React.useEffect(() => {
    if (!campaign) return;
    setF(editing ? {
      fundId: editing.fundId, title: editing.title, titleBn: editing.titleBn ?? '', description: editing.description ?? '',
      goalAmount: editing.goalAmount ? String(editing.goalAmount) : '', startDate: toDateInput(editing.startDate), endDate: toDateInput(editing.endDate),
      coverImageUrl: editing.coverImageUrl ?? '', isPublic: editing.isPublic,
    } : empty);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaign]);
  const set = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }));
  const fundId = f.fundId || funds.data?.[0]?.id || '';
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    save.mutate(
      {
        id: editing?.id,
        body: {
          fundId, title: f.title, titleBn: f.titleBn || null, description: f.description || null,
          goalAmount: f.goalAmount ? Number(f.goalAmount) : null,
          startDate: f.startDate ? new Date(`${f.startDate}T00:00:00`).toISOString() : null,
          endDate: f.endDate ? new Date(`${f.endDate}T23:59:59`).toISOString() : null,
          coverImageUrl: f.coverImageUrl || null, isPublic: f.isPublic,
        },
      },
      { onSuccess: () => { toast.success(t('Campaign saved')); onClose(); }, onError: (err) => toast.error(apiErrorMessage(err, t('Could not save the campaign'))) },
    );
  };
  return (
    <Modal isOpen={Boolean(campaign)} onClose={onClose} title={editing ? t('Edit campaign') : t('New campaign')} size="lg"
      footer={<div className="flex justify-end gap-2"><Button variant="secondary" onClick={onClose}>{t('Cancel')}</Button><Button type="submit" form="campaign-form" isLoading={save.isPending}>{t('Save')}</Button></div>}>
      <form id="campaign-form" onSubmit={submit} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Input label={t('Title')} required value={f.title} onChange={(e) => set({ title: e.target.value })} />
        <Input label={t('Title (Bangla)')} lang="bn" value={f.titleBn} onChange={(e) => set({ titleBn: e.target.value })} />
        <Select label={t('Fund')} value={fundId} onChange={(e) => set({ fundId: e.target.value })} options={(funds.data ?? []).map((x) => ({ value: x.id, label: bi(x.name, x.nameBn) }))} />
        <Input label={t('Goal (BDT, optional)')} type="number" min="0" step="0.01" value={f.goalAmount} onChange={(e) => set({ goalAmount: e.target.value })} />
        <Input label={t('Starts')} type="date" value={f.startDate} onChange={(e) => set({ startDate: e.target.value })} />
        <Input label={t('Ends')} type="date" value={f.endDate} onChange={(e) => set({ endDate: e.target.value })} />
        <Input label={t('Cover image URL')} type="url" value={f.coverImageUrl} onChange={(e) => set({ coverImageUrl: e.target.value })} containerClassName="sm:col-span-2" helperText={t('Upload in Website builder → Media, then paste the link.')} />
        <Textarea label={t('Description')} rows={3} value={f.description} onChange={(e) => set({ description: e.target.value })} containerClassName="sm:col-span-2" />
        <Checkbox label={t('Show on website')} description={t('Appears in the Donate and Campaign progress blocks.')} checked={f.isPublic} onChange={(e) => set({ isPublic: e.target.checked })} />
      </form>
    </Modal>
  );
};

export const CampaignsTab: React.FC = () => {
  const t = useT();
  const bi = useBi();
  const q = useCampaigns();
  const del = useDeleteCampaign();
  const [editing, setEditing] = React.useState<Campaign | null | 'new'>(null);
  if (q.isLoading) return <SkeletonText lines={6} />;
  if (q.isError) return <ErrorState title={t('Could not load campaigns')} onRetry={() => q.refetch()} />;
  const list = q.data ?? [];
  return (
    <div className="space-y-4">
      <div className="flex justify-end"><Button leftIcon={<Plus className="w-4 h-4" />} onClick={() => setEditing('new')}>{t('New campaign')}</Button></div>
      {list.length === 0 ? (
        <EmptyState title={t('No campaigns yet')} description={t('Run a time-bound appeal (e.g. a new hifz hall) with a goal and a progress bar on your website.')} />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {list.map((c) => (
            <Card key={c.id} className="flex flex-col gap-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="font-bold text-slate-900 dark:text-white">{bi(c.title, c.titleBn)}</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    {c.fund ? bi(c.fund.name, c.fund.nameBn) : ''}
                    {c.endDate && ` · ${t('Ends')} ${formatDate(c.endDate)}`}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  {c.isPublic && <Badge variant="info"><Globe className="w-3 h-3" aria-hidden /> {t('On website')}</Badge>}
                  <Button size="icon-sm" variant="ghost" aria-label={t('Edit')} onClick={() => setEditing(c)}><Edit3 className="w-4 h-4" /></Button>
                  <Button size="icon-sm" variant="ghost" aria-label={t('Delete')} onClick={() => confirmDelete(t('Delete this campaign? Its donations are kept.')) && del.mutate(c.id, {
                    onSuccess: (res) => showUndoToast(t('Campaign moved to trash'), res, () => q.refetch()),
                    onError: (err) => toast.error(apiErrorMessage(err, t('Could not delete'))),
                  })}><Trash2 className="w-4 h-4" /></Button>
                </div>
              </div>
              <GoalBar progress={c.progress} label={t('Goal progress')} />
              <p className="text-sm"><strong><Money value={c.raised} /></strong> {t('raised')}{c.goalAmount != null && <> {t('of')} <Money value={c.goalAmount} /></>} · {t('{n} donations', { n: formatNumber(c.donationCount) })}</p>
            </Card>
          ))}
        </div>
      )}
      <CampaignModal campaign={editing} onClose={() => setEditing(null)} />
    </div>
  );
};
