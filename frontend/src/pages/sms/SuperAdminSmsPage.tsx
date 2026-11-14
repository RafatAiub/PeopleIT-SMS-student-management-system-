import React from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { AlertTriangle, Banknote, Download, Plus, Radio, Send, Wallet } from 'lucide-react';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardHeader,
  Checkbox,
  ErrorState,
  Input,
  Modal,
  PageHeader,
  Select,
  SkeletonStatGrid,
  SkeletonText,
  StatCard,
  Table,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
  TabPanel,
  Tabs,
  Textarea,
  type TabItem,
} from '@/components/ui';
import { formatCurrency, formatDate, formatNumber } from '@/i18n';
import { useSmsT } from './sms.i18n';
import {
  downloadLogCsv,
  errorMessage,
  useAdjustCredits,
  useAdminOverview,
  useAdminPacks,
  useAdminPurchases,
  useClearSender,
  useManualCredit,
  useProviderBalances,
  useReviewSender,
  useSavePack,
  useSenderQueue,
  type AdminOverview,
  type LogFilters,
  type Pack,
  type SenderRequest,
} from './sms.api';
import { perSms, PROVIDER_LABEL, senderIdError, SENDER_ID_MAX, type ProviderName } from './sms.logic';
import { SmsLogTable } from './SmsLogTable';

// =============================================================================
// P5 — SUPER_ADMIN: SMS overview (/super-admin/sms). Credits sold/used,
// per-school balances (manual credit, adjust, bonus), sender ID approval
// queue, credit packs, provider status + live balances, all-school SMS log.
// =============================================================================

const TAB_IDS = ['overview', 'schools', 'sender', 'packs', 'purchases', 'log'] as const;
type TabId = (typeof TAB_IDS)[number];

const SuperAdminSmsPage: React.FC = () => {
  const t = useSmsT();
  const [params, setParams] = useSearchParams();
  const requested = params.get('tab');
  const tab: TabId = (TAB_IDS as readonly string[]).includes(requested ?? '') ? (requested as TabId) : 'overview';
  const setTab = (id: string) => setParams((p) => { const n = new URLSearchParams(p); n.set('tab', id); return n; }, { replace: true });
  const q = useAdminOverview();

  const tabs: TabItem[] = [
    { id: 'overview', label: t('Overview') },
    { id: 'schools', label: t('School balances') },
    { id: 'sender', label: q.data?.pendingSenderRequests ? `${t('Sender IDs')} (${q.data.pendingSenderRequests})` : t('Sender IDs') },
    { id: 'packs', label: t('Packs') },
    { id: 'purchases', label: t('Purchases') },
    { id: 'log', label: t('SMS log') },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title={t('SMS & credits')} description={t('Providers, school SMS wallets, credit packs and sender ID approvals.')} />
      <div className="overflow-x-auto scrollbar-none -mx-1 px-1">
        <Tabs tabs={tabs} value={tab} onChange={setTab} label={t('SMS sections')} idPrefix="sa-sms" />
      </div>
      <TabPanel id={tab} value={tab} idPrefix="sa-sms">
        {q.isLoading ? (
          <div className="space-y-6"><SkeletonStatGrid count={4} /><SkeletonText lines={6} /></div>
        ) : q.isError || !q.data ? (
          <ErrorState title={t('Could not load SMS overview')} onRetry={() => void q.refetch()} />
        ) : (
          <>
            {tab === 'overview' && <OverviewTab o={q.data} />}
            {tab === 'schools' && <SchoolsTab o={q.data} />}
            {tab === 'sender' && <SenderTab />}
            {tab === 'packs' && <PacksTab />}
            {tab === 'purchases' && <PurchasesTab />}
            {tab === 'log' && <AdminLogTab />}
          </>
        )}
      </TabPanel>
    </div>
  );
};

const OverviewTab: React.FC<{ o: AdminOverview }> = ({ o }) => {
  const t = useSmsT();
  const [checkBalances, setCheckBalances] = React.useState(false);
  const balances = useProviderBalances(checkBalances);
  return (
    <div className="space-y-6">
      {!o.smsEnabled && <Alert tone="warning" title={t('SMS_ENABLED is off — every SMS is logged as Skipped')} />}
      {!o.enforced && <Alert tone="warning" title={t('Credit deduction is OFF (SMS_CREDITS_ENFORCED=false) — schools are not charged')} />}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard label={t('Sold this month')} value={formatCurrency(o.sold.thisMonth.amount)} hint={t('{n} credits', { n: formatNumber(o.sold.thisMonth.units) })} icon={<Banknote className="w-5 h-5" />} />
        <StatCard label={t('Used this month')} value={<span className="tabular-nums">{formatNumber(o.usedThisMonth.segments)}</span>} hint={t('{p} paid · {f} free', { p: formatNumber(o.usedThisMonth.paidUnits), f: formatNumber(o.usedThisMonth.freeUnits) })} icon={<Send className="w-5 h-5" />} tone="info" />
        <StatCard label={t('Credits held by schools')} value={<span className="tabular-nums">{formatNumber(o.outstandingBalance)}</span>} hint={t('Sold all time: {a}', { a: formatCurrency(o.sold.allTime.amount) })} icon={<Wallet className="w-5 h-5" />} tone="accent" />
        <StatCard label={t('Failed this month')} value={<span className="tabular-nums">{formatNumber(o.failedThisMonth)}</span>} hint={t('PeopleNIT messages: {n}', { n: formatNumber(o.platformThisMonth.segments) })} icon={<AlertTriangle className="w-5 h-5" />} tone="warning" />
      </div>
      <Card>
        <CardHeader title={t('Providers')} description={`${t('Mode')}: ${o.mode}`} actions={<Button size="sm" variant="secondary" leftIcon={<Radio className="w-4 h-4" />} isLoading={balances.isFetching} onClick={() => (checkBalances ? void balances.refetch() : setCheckBalances(true))}>{t('Check balances')}</Button>} />
        <div className="overflow-x-auto mt-3">
          <Table>
            <TableHead><tr><TableHeaderCell>{t('Provider')}</TableHeaderCell><TableHeaderCell>{t('Role')}</TableHeaderCell><TableHeaderCell>{t('Keys')}</TableHeaderCell><TableHeaderCell>{t('Balance')}</TableHeaderCell><TableHeaderCell>{t('Notes')}</TableHeaderCell></tr></TableHead>
            <tbody>
              {o.providers.map((p, i) => {
                const b = balances.data?.find((x) => x.name === p.name);
                return (
                  <TableRow key={p.name} index={i}>
                    <TableCell className="font-medium">{p.label}</TableCell>
                    <TableCell><Badge variant={p.role === 'PRIMARY' ? 'primary' : p.role === 'FALLBACK' ? 'info' : 'neutral'}>{t(p.role === 'PRIMARY' ? 'Primary' : p.role === 'FALLBACK' ? 'Fallback' : 'Not used')}</Badge></TableCell>
                    <TableCell><Badge variant={p.configured ? 'success' : 'neutral'}>{p.configured ? t('Configured') : t('Not set')}</Badge></TableCell>
                    <TableCell className="tabular-nums">{b ? (b.ok ? formatNumber(b.balance ?? 0) : <span className="text-xs text-red-700 dark:text-red-300">{t('Unavailable')}</span>) : '—'}</TableCell>
                    <TableCell className="text-xs text-slate-600 dark:text-slate-300">{p.verified ? t('Verified') : t('Built from public docs — verify with a live account')}{p.supportsStatus ? ` · ${t('status polling')}` : ''}</TableCell>
                  </TableRow>
                );
              })}
            </tbody>
          </Table>
        </div>
      </Card>
    </div>
  );
};

type CreditAction = { kind: 'manual' | 'adjust'; institutionId: string; name: string; balance: number } | null;

const SchoolsTab: React.FC<{ o: AdminOverview }> = ({ o }) => {
  const t = useSmsT();
  const [search, setSearch] = React.useState('');
  const [onlyLow, setOnlyLow] = React.useState(false);
  const [action, setAction] = React.useState<CreditAction>(null);
  const clear = useClearSender();
  const rows = o.schools.filter((s) => (!onlyLow || s.isLow) && s.name.toLowerCase().includes(search.trim().toLowerCase()));
  return (
    <Card>
      <div className="flex flex-wrap items-end gap-3">
        <Input label={t('Search school')} value={search} onChange={(e) => setSearch(e.target.value)} containerClassName="w-64 max-w-full" />
        <Checkbox label={t('Low balance only')} checked={onlyLow} onChange={(e) => setOnlyLow(e.target.checked)} />
      </div>
      <div className="overflow-x-auto mt-4">
        <Table>
          <TableHead><tr><TableHeaderCell>{t('School')}</TableHeaderCell><TableHeaderCell className="text-right">{t('Balance')}</TableHeaderCell><TableHeaderCell className="text-right">{t('Bought')}</TableHeaderCell><TableHeaderCell className="text-right">{t('Used')}</TableHeaderCell><TableHeaderCell>{t('Sender ID')}</TableHeaderCell><TableHeaderCell>{t('Actions')}</TableHeaderCell></tr></TableHead>
          <tbody>
            {rows.length === 0 ? (
              <tr><TableCell colSpan={6} className="text-center text-slate-500">{t('No schools match')}</TableCell></tr>
            ) : rows.map((s, i) => (
              <TableRow key={s.institutionId} index={i}>
                <TableCell className="font-medium min-w-40">{s.name}</TableCell>
                <TableCell className="text-right tabular-nums">{formatNumber(s.balance)} {s.isLow && <Badge variant={s.balance <= 0 ? 'danger' : 'warning'}>{s.balance <= 0 ? t('Empty') : t('Low')}</Badge>}</TableCell>
                <TableCell className="text-right tabular-nums">{formatNumber(s.totalPurchased)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatNumber(s.totalUsed)}</TableCell>
                <TableCell>
                  {s.senderId ? (
                    <span className="flex items-center gap-2">{s.senderId}<Button size="xs" variant="ghost" onClick={() => { if (window.confirm(t('Switch {s} back to the default number?', { s: s.name }))) clear.mutate(s.institutionId, { onError: (e) => toast.error(errorMessage(e, t('Could not save'))) }); }}>{t('Clear')}</Button></span>
                  ) : '—'}
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-2">
                    <Button size="xs" onClick={() => setAction({ kind: 'manual', institutionId: s.institutionId, name: s.name, balance: s.balance })}>{t('Add paid credits')}</Button>
                    <Button size="xs" variant="secondary" onClick={() => setAction({ kind: 'adjust', institutionId: s.institutionId, name: s.name, balance: s.balance })}>{t('Adjust / bonus')}</Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </tbody>
        </Table>
      </div>
      {action && <CreditModal action={action} onClose={() => setAction(null)} />}
    </Card>
  );
};

const CreditModal: React.FC<{ action: NonNullable<CreditAction>; onClose: () => void }> = ({ action, onClose }) => {
  const t = useSmsT();
  const manual = useManualCredit();
  const adjust = useAdjustCredits();
  const [units, setUnits] = React.useState('');
  const [amount, setAmount] = React.useState('');
  const [reference, setReference] = React.useState('');
  const [reason, setReason] = React.useState('');
  const [type, setType] = React.useState<'ADJUST' | 'BONUS'>('BONUS');
  const n = Number(units);
  const valid = Number.isInteger(n) && n !== 0 && (action.kind === 'adjust' ? (type === 'BONUS' ? n > 0 : action.balance + n >= 0) : n > 0) && reason.trim().length >= 3;
  const busy = manual.isPending || adjust.isPending;

  const submit = () => {
    const done = { onSuccess: () => { toast.success(t('Saved')); onClose(); }, onError: (e: unknown) => toast.error(errorMessage(e, t('Could not save'))) };
    if (action.kind === 'manual') manual.mutate({ institutionId: action.institutionId, units: n, amount: Number(amount) || 0, reference: reference.trim() || undefined, reason: reason.trim() }, done);
    else adjust.mutate({ institutionId: action.institutionId, type, units: n, reason: reason.trim() }, done);
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={action.kind === 'manual' ? t('Add paid credits') : t('Adjust / bonus')}
      description={`${action.name} · ${t('Balance')}: ${formatNumber(action.balance)}`}
      footer={<div className="flex justify-end gap-2"><Button variant="secondary" onClick={onClose}>{t('Cancel')}</Button><Button isLoading={busy} disabled={!valid} onClick={submit}>{t('Save')}</Button></div>}
    >
      <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); if (valid) submit(); }}>
        {action.kind === 'adjust' && (
          <Select label={t('Type')} value={type} onChange={(e) => setType(e.target.value as 'ADJUST' | 'BONUS')} options={[{ value: 'BONUS', label: t('Bonus (free credits)') }, { value: 'ADJUST', label: t('Adjustment (+ or −)') }]} />
        )}
        <Input type="number" step={1} inputMode="numeric" label={t('Credits')} value={units} onChange={(e) => setUnits(e.target.value)} helperText={action.kind === 'adjust' && type === 'ADJUST' ? t('Use a negative number to remove credits') : undefined} required />
        {action.kind === 'manual' && (
          <>
            <Input type="number" min={0} step="0.01" label={t('Amount received (BDT)')} value={amount} onChange={(e) => setAmount(e.target.value)} />
            <Input label={t('Reference (bank slip, bKash trx…)')} value={reference} onChange={(e) => setReference(e.target.value)} maxLength={120} />
          </>
        )}
        <Textarea label={t('Reason')} rows={2} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} required />
      </form>
    </Modal>
  );
};

const SenderTab: React.FC = () => {
  const t = useSmsT();
  const [status, setStatus] = React.useState('REQUESTED');
  const q = useSenderQueue(status || undefined);
  const [review, setReview] = React.useState<SenderRequest | null>(null);
  return (
    <Card>
      <CardHeader title={t('Sender ID requests')} description={t('Submit the school’s documents to the provider/operators; enter the sender ID here only after they approve it.')} />
      <div className="mt-3 max-w-xs">
        <Select label={t('Status')} value={status} onChange={(e) => setStatus(e.target.value)} options={[{ value: 'REQUESTED', label: t('Waiting') }, { value: 'APPROVED', label: t('Approved') }, { value: 'REJECTED', label: t('Rejected') }, { value: '', label: t('All') }]} />
      </div>
      {q.isLoading ? <SkeletonText lines={4} className="mt-4" /> : q.isError ? <ErrorState className="mt-4" title={t('Could not load requests')} onRetry={() => void q.refetch()} /> : (
        <div className="overflow-x-auto mt-4">
          <Table>
            <TableHead><tr><TableHeaderCell>{t('School')}</TableHeaderCell><TableHeaderCell>{t('Requested')}</TableHeaderCell><TableHeaderCell>{t('Date')}</TableHeaderCell><TableHeaderCell>{t('Note')}</TableHeaderCell><TableHeaderCell>{t('Status')}</TableHeaderCell><TableHeaderCell /></tr></TableHead>
            <tbody>
              {(q.data ?? []).length === 0 ? (
                <tr><TableCell colSpan={6} className="text-center text-slate-500">{t('Nothing here')}</TableCell></tr>
              ) : (q.data ?? []).map((r, i) => (
                <TableRow key={r.id} index={i}>
                  <TableCell className="font-medium">{r.institution?.name}</TableCell>
                  <TableCell className="font-mono">{r.requested}{r.approvedValue && r.approvedValue !== r.requested ? ` → ${r.approvedValue}` : ''}</TableCell>
                  <TableCell className="whitespace-nowrap">{formatDate(r.createdAt)}</TableCell>
                  <TableCell className="text-sm text-slate-600 dark:text-slate-300 max-w-xs">{r.note ?? '—'}{r.reviewNote && <span className="block text-xs">{r.reviewNote}</span>}</TableCell>
                  <TableCell><Badge variant={r.status === 'APPROVED' ? 'success' : r.status === 'REJECTED' ? 'danger' : 'warning'}>{t(r.status === 'APPROVED' ? 'Approved' : r.status === 'REJECTED' ? 'Rejected' : 'Waiting')}</Badge></TableCell>
                  <TableCell>{r.status === 'REQUESTED' && <Button size="xs" onClick={() => setReview(r)}>{t('Review')}</Button>}</TableCell>
                </TableRow>
              ))}
            </tbody>
          </Table>
        </div>
      )}
      {review && <ReviewModal req={review} onClose={() => setReview(null)} />}
    </Card>
  );
};

const ReviewModal: React.FC<{ req: SenderRequest; onClose: () => void }> = ({ req, onClose }) => {
  const t = useSmsT();
  const m = useReviewSender();
  const [value, setValue] = React.useState(req.requested);
  const [provider, setProvider] = React.useState<'' | ProviderName>('');
  const [note, setNote] = React.useState('');
  const err = senderIdError(value);
  const send = (decision: 'APPROVE' | 'REJECT') =>
    m.mutate(
      decision === 'APPROVE'
        ? { id: req.id, decision, approvedValue: value.trim(), provider: provider || null, reviewNote: note.trim() || undefined }
        : { id: req.id, decision, reviewNote: note.trim() },
      { onSuccess: () => { toast.success(t('Saved')); onClose(); }, onError: (e) => toast.error(errorMessage(e, t('Could not save'))) },
    );
  return (
    <Modal
      isOpen
      onClose={onClose}
      title={t('Review sender ID')}
      description={req.institution?.name}
      footer={
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="danger-soft" isLoading={m.isPending && m.variables?.decision === 'REJECT'} disabled={note.trim().length < 3} onClick={() => send('REJECT')}>{t('Reject')}</Button>
          <Button isLoading={m.isPending && m.variables?.decision === 'APPROVE'} disabled={!!err} onClick={() => send('APPROVE')}>{t('Approve')}</Button>
        </div>
      }
    >
      <div className="space-y-3">
        <Input label={t('Approved sender ID (as the operator registered it)')} value={value} maxLength={SENDER_ID_MAX} onChange={(e) => setValue(e.target.value)} error={err ? t(err) : undefined} />
        <Select
          label={t('Registered with provider')}
          value={provider}
          onChange={(e) => setProvider(e.target.value as '' | ProviderName)}
          options={[{ value: '', label: t('Any provider') }, ...(Object.keys(PROVIDER_LABEL) as ProviderName[]).map((p) => ({ value: p, label: PROVIDER_LABEL[p] }))]}
          helperText={t('Other providers send from the default number.')}
        />
        <Textarea label={t('Note (required to reject)')} rows={2} value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} />
      </div>
    </Modal>
  );
};

const EMPTY_PACK = { name: '', nameBn: '', units: '', priceBdt: '', isActive: true, sortOrder: '0' };

const PacksTab: React.FC = () => {
  const t = useSmsT();
  const q = useAdminPacks();
  const save = useSavePack();
  const [edit, setEdit] = React.useState<(typeof EMPTY_PACK & { id?: string }) | null>(null);
  const open = (p?: Pack) => setEdit(p ? { id: p.id, name: p.name, nameBn: p.nameBn ?? '', units: String(p.units), priceBdt: String(p.priceBdt), isActive: p.isActive, sortOrder: String(p.sortOrder) } : { ...EMPTY_PACK });
  const valid = edit && edit.name.trim() && Number(edit.units) > 0 && Number.isInteger(Number(edit.units)) && Number(edit.priceBdt) > 0;
  const submit = () => {
    if (!edit || !valid) return;
    save.mutate(
      { id: edit.id, name: edit.name.trim(), nameBn: edit.nameBn.trim() || null, units: Number(edit.units), priceBdt: Number(edit.priceBdt), isActive: edit.isActive, sortOrder: Number(edit.sortOrder) || 0 },
      { onSuccess: () => { toast.success(t('Saved')); setEdit(null); }, onError: (e) => toast.error(errorMessage(e, t('Could not save'))) },
    );
  };
  return (
    <Card>
      <CardHeader title={t('Credit packs')} description={t('What schools can buy. Deactivate a pack instead of deleting it — old receipts keep its name.')} actions={<Button size="sm" leftIcon={<Plus className="w-4 h-4" />} onClick={() => open()}>{t('New pack')}</Button>} />
      {q.isLoading ? <SkeletonText lines={4} className="mt-4" /> : q.isError ? <ErrorState className="mt-4" title={t('Could not load packs')} onRetry={() => void q.refetch()} /> : (
        <div className="overflow-x-auto mt-4">
          <Table>
            <TableHead><tr><TableHeaderCell>{t('Name')}</TableHeaderCell><TableHeaderCell className="text-right">{t('Credits')}</TableHeaderCell><TableHeaderCell className="text-right">{t('Price')}</TableHeaderCell><TableHeaderCell className="text-right">{t('Per SMS')}</TableHeaderCell><TableHeaderCell>{t('Status')}</TableHeaderCell><TableHeaderCell /></tr></TableHead>
            <tbody>
              {(q.data ?? []).length === 0 ? (
                <tr><TableCell colSpan={6} className="text-center text-slate-500">{t('No packs yet')}</TableCell></tr>
              ) : (q.data ?? []).map((p, i) => (
                <TableRow key={p.id} index={i}>
                  <TableCell className="font-medium">{p.name}{p.nameBn && <span className="block text-xs text-slate-500 dark:text-slate-400">{p.nameBn}</span>}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatNumber(p.units)}</TableCell>
                  <TableCell className="text-right">{formatCurrency(p.priceBdt)}</TableCell>
                  <TableCell className="text-right">{formatCurrency(perSms(p.priceBdt, p.units), { decimals: 2 })}</TableCell>
                  <TableCell><Badge variant={p.isActive ? 'success' : 'neutral'}>{p.isActive ? t('On sale') : t('Hidden')}</Badge></TableCell>
                  <TableCell><Button size="xs" variant="secondary" onClick={() => open(p)}>{t('Edit')}</Button></TableCell>
                </TableRow>
              ))}
            </tbody>
          </Table>
        </div>
      )}
      {edit && (
        <Modal isOpen onClose={() => setEdit(null)} title={edit.id ? t('Edit pack') : t('New pack')} footer={<div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setEdit(null)}>{t('Cancel')}</Button><Button isLoading={save.isPending} disabled={!valid} onClick={submit}>{t('Save')}</Button></div>}>
          <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); submit(); }}>
            <Input label={t('Name (English)')} value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} maxLength={80} required />
            <Input label={t('Name (Bangla)')} value={edit.nameBn} onChange={(e) => setEdit({ ...edit, nameBn: e.target.value })} maxLength={80} />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Input type="number" min={1} step={1} label={t('Credits')} value={edit.units} onChange={(e) => setEdit({ ...edit, units: e.target.value })} required />
              <Input type="number" min={0} step="0.01" label={t('Price (BDT)')} value={edit.priceBdt} onChange={(e) => setEdit({ ...edit, priceBdt: e.target.value })} required />
            </div>
            <Input type="number" min={0} step={1} label={t('Sort order')} value={edit.sortOrder} onChange={(e) => setEdit({ ...edit, sortOrder: e.target.value })} containerClassName="max-w-40" />
            <Checkbox label={t('On sale')} checked={edit.isActive} onChange={(e) => setEdit({ ...edit, isActive: e.target.checked })} />
          </form>
        </Modal>
      )}
    </Card>
  );
};

const PurchasesTab: React.FC = () => {
  const t = useSmsT();
  const q = useAdminPurchases();
  if (q.isLoading) return <SkeletonText lines={6} />;
  if (q.isError || !q.data) return <ErrorState title={t('Could not load purchases')} onRetry={() => void q.refetch()} />;
  return (
    <Card>
      <div className="overflow-x-auto">
        <Table>
          <TableHead><tr><TableHeaderCell>{t('Date')}</TableHeaderCell><TableHeaderCell>{t('School')}</TableHeaderCell><TableHeaderCell className="text-right">{t('Credits')}</TableHeaderCell><TableHeaderCell className="text-right">{t('Amount')}</TableHeaderCell><TableHeaderCell>{t('Method')}</TableHeaderCell><TableHeaderCell>{t('Status')}</TableHeaderCell><TableHeaderCell>{t('Receipt')}</TableHeaderCell></tr></TableHead>
          <tbody>
            {q.data.length === 0 ? (
              <tr><TableCell colSpan={7} className="text-center text-slate-500">{t('No purchases yet')}</TableCell></tr>
            ) : q.data.map((p, i) => (
              <TableRow key={p.id} index={i}>
                <TableCell className="whitespace-nowrap">{formatDate(p.paidAt ?? p.createdAt, true)}</TableCell>
                <TableCell>{p.institutionName}</TableCell>
                <TableCell className="text-right tabular-nums">{formatNumber(p.units)}</TableCell>
                <TableCell className="text-right">{formatCurrency(p.amount)}</TableCell>
                <TableCell>{p.method === 'MANUAL' ? t('Paid offline') : p.method === 'BKASH' ? 'bKash' : 'SSLCommerz'}{p.isDemo ? ` (${t('demo')})` : ''}</TableCell>
                <TableCell><Badge variant={p.status === 'SUCCESS' ? 'success' : p.status === 'PENDING' ? 'warning' : 'danger'}>{p.status === 'SUCCESS' ? t('Paid') : p.status === 'PENDING' ? t('Pending') : t('Failed')}</Badge></TableCell>
                <TableCell>{p.receiptNumber ? <Link className="text-primary-700 dark:text-primary-400 underline" to={`/super-admin/sms/receipt/${p.id}`}>{p.receiptNumber}</Link> : '—'}</TableCell>
              </TableRow>
            ))}
          </tbody>
        </Table>
      </div>
    </Card>
  );
};

const AdminLogTab: React.FC = () => {
  const t = useSmsT();
  const [filters, setFilters] = React.useState<LogFilters>({ page: 1, pageSize: 50 });
  const [busy, setBusy] = React.useState(false);
  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button variant="secondary" leftIcon={<Download className="w-4 h-4" />} isLoading={busy} onClick={() => { setBusy(true); downloadLogCsv(filters, true).catch((e) => toast.error(errorMessage(e, t('Export failed')))).finally(() => setBusy(false)); }}>{t('Export CSV')}</Button>
      </div>
      <SmsLogTable filters={filters} onChange={setFilters} admin />
    </div>
  );
};

export default SuperAdminSmsPage;
