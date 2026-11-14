import React from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { CreditCard, Download, MessageSquare, Send, ShieldCheck, Wallet } from 'lucide-react';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardHeader,
  ErrorState,
  Input,
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
import { formatCurrency, formatDate, formatNumber, useLocale } from '@/i18n';
import { useSmsT } from './sms.i18n';
import {
  downloadLogCsv,
  errorMessage,
  useCancelSender,
  useCheckout,
  useMyPurchases,
  useMySenderRequests,
  useRequestSender,
  useSaveSettings,
  useSmsLedger,
  useSmsOverview,
  type LogFilters,
  type Overview,
} from './sms.api';
import { balanceLevel, LEDGER_LABEL, messagesLeft, perSms, purchaseResult, senderIdError, SENDER_ID_MAX, signedUnits, smsUnits } from './sms.logic';
import { SmsLogTable } from './SmsLogTable';

// =============================================================================
// P5 — School ADMIN: SMS credits (/sms). Balance, buy packs (bKash /
// SSLCommerz, demo checkout without keys), SMS log + CSV, credit history,
// masked sender ID request, low-balance alert level.
// =============================================================================

const TAB_IDS = ['overview', 'log', 'history', 'settings'] as const;
type TabId = (typeof TAB_IDS)[number];

const SmsCreditsPage: React.FC = () => {
  const t = useSmsT();
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const requested = params.get('tab');
  const tab: TabId = (TAB_IDS as readonly string[]).includes(requested ?? '') ? (requested as TabId) : 'overview';
  const setTab = (id: string) => setParams((p) => { const n = new URLSearchParams(p); n.set('tab', id); return n; }, { replace: true });
  const overview = useSmsOverview();
  const result = purchaseResult(location.search);

  const tabs: TabItem[] = [
    { id: 'overview', label: t('Balance & buy') },
    { id: 'log', label: t('SMS log') },
    { id: 'history', label: t('Credit history') },
    { id: 'settings', label: t('Sender ID & alerts') },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title={t('SMS credits')} description={t('Prepaid SMS for guardian messages: 1 credit = 1 SMS part (160 English or 70 Bangla characters).')} />
      {result && (
        <Alert
          tone={result.status === 'success' ? 'success' : result.status === 'pending' ? 'info' : 'danger'}
          title={result.status === 'success' ? t('Payment received — credits added') : result.status === 'pending' ? t('Payment is being confirmed') : t('Payment was not completed')}
          action={result.purchaseId && result.status === 'success' ? <Link className="text-sm font-medium underline" to={`/sms/receipt/${result.purchaseId}`}>{t('View receipt')}</Link> : undefined}
        />
      )}
      <div className="overflow-x-auto scrollbar-none -mx-1 px-1">
        <Tabs tabs={tabs} value={tab} onChange={setTab} label={t('SMS sections')} idPrefix="sms" />
      </div>
      <TabPanel id={tab} value={tab} idPrefix="sms">
        {overview.isLoading ? (
          <div className="space-y-6"><SkeletonStatGrid count={4} /><SkeletonText lines={6} /></div>
        ) : overview.isError || !overview.data ? (
          <ErrorState title={t('Could not load SMS credits')} onRetry={() => void overview.refetch()} />
        ) : (
          <>
            {tab === 'overview' && <OverviewTab o={overview.data} />}
            {tab === 'log' && <LogTab />}
            {tab === 'history' && <HistoryTab />}
            {tab === 'settings' && <SettingsTab o={overview.data} />}
          </>
        )}
      </TabPanel>
    </div>
  );
};

const LEVEL_TONE = { ok: 'success', low: 'warning', empty: 'danger' } as const;

const OverviewTab: React.FC<{ o: Overview }> = ({ o }) => {
  const t = useSmsT();
  const { lang } = useLocale();
  const navigate = useNavigate();
  const checkout = useCheckout();
  const [gateway, setGateway] = React.useState<'BKASH' | 'SSLCOMMERZ'>(o.gateways.find((g) => g.available)?.gateway ?? 'BKASH');
  const [draft, setDraft] = React.useState('');
  const level = balanceLevel(o.balance, o.lowBalanceThreshold);
  const sent = (o.thisMonth.SENT?.segments ?? 0) + (o.thisMonth.DELIVERED?.segments ?? 0);
  const est = smsUnits(draft);

  const buy = (packId: string) => {
    checkout.mutate(
      { packId, gateway },
      {
        onSuccess: (r) => {
          if (r.demo && r.checkoutPath) navigate(r.checkoutPath);
          else window.location.assign(r.paymentUrl);
        },
        onError: (e) => toast.error(errorMessage(e, t('Could not start the payment'))),
      },
    );
  };

  return (
    <div className="space-y-6">
      {!o.smsLive && <Alert tone="warning" title={t('SMS sending is switched off on this server')}>{t('Messages are logged as Skipped and no credits are used until PeopleNIT turns SMS on.')}</Alert>}
      {level !== 'ok' && (
        <Alert tone={level === 'empty' ? 'danger' : 'warning'} title={level === 'empty' ? t('No SMS credits left') : t('SMS credits are running low')}>
          {level === 'empty' ? t('Guardian SMS (fee reminders, absence alerts, campaigns) are being skipped. Buy a pack below.') : t('Buy a pack soon so guardian messages keep going out.')}
        </Alert>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard label={t('Credits left')} value={<span className="tabular-nums">{formatNumber(o.balance)}</span>} hint={<Badge variant={LEVEL_TONE[level]}>{level === 'ok' ? t('Healthy') : level === 'low' ? t('Low') : t('Empty')}</Badge>} icon={<Wallet className="w-5 h-5" />} />
        <StatCard label={t('Free this month')} value={<span className="tabular-nums">{formatNumber(o.freeRemaining)} / {formatNumber(o.freeAllowance)}</span>} hint={t('From your plan, used first')} icon={<ShieldCheck className="w-5 h-5" />} tone="info" />
        <StatCard label={t('Used this month')} value={<span className="tabular-nums">{formatNumber(sent)}</span>} hint={t('{n} skipped', { n: formatNumber(o.thisMonth.SKIPPED?.count ?? 0) })} icon={<Send className="w-5 h-5" />} tone="accent" />
        <StatCard label={t('About this many SMS left')} value={<span className="tabular-nums">{formatNumber(messagesLeft(o.balance, o.freeRemaining))}</span>} hint={t('Single-part messages')} icon={<MessageSquare className="w-5 h-5" />} tone="warning" />
      </div>

      <Card>
        <CardHeader title={t('Buy SMS credits')} description={t('Credits never expire. Pay with bKash or card (SSLCommerz); credits are added as soon as the payment is confirmed.')} />
        {o.packs.length === 0 ? (
          <p className="mt-4 text-sm text-slate-600 dark:text-slate-300">{t('No packs are on sale yet — please contact PeopleNIT.')}</p>
        ) : (
          <>
            <div className="mt-4 max-w-xs">
              <Select
                label={t('Pay with')}
                value={gateway}
                onChange={(e) => setGateway(e.target.value as 'BKASH' | 'SSLCOMMERZ')}
                options={o.gateways.map((g) => ({ value: g.gateway, label: `${g.label}${g.demo ? ` (${t('demo')})` : ''}`, disabled: !g.available }))}
              />
            </div>
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {o.packs.map((p) => (
                <div key={p.id} className="rounded-xl border border-slate-200 dark:border-white/10 p-4 flex flex-col gap-2">
                  <div className="font-semibold text-slate-900 dark:text-white">{lang === 'bn' && p.nameBn ? p.nameBn : p.name}</div>
                  <div className="text-2xl font-bold tabular-nums text-slate-900 dark:text-white">{formatNumber(p.units)} <span className="text-sm font-medium text-slate-500 dark:text-slate-400">{t('SMS')}</span></div>
                  <div className="text-sm text-slate-600 dark:text-slate-300">{formatCurrency(p.priceBdt)} · {t('{p} per SMS', { p: formatCurrency(perSms(p.priceBdt, p.units), { decimals: 2 }) })}</div>
                  <Button className="mt-2" leftIcon={<CreditCard className="w-4 h-4" />} isLoading={checkout.isPending && checkout.variables?.packId === p.id} disabled={!o.gateways.some((g) => g.available)} onClick={() => buy(p.id)}>
                    {t('Buy')}
                  </Button>
                </div>
              ))}
            </div>
          </>
        )}
      </Card>

      <Card>
        <CardHeader title={t('How many credits will a message use?')} description={t('Bangla and emoji messages use more credits: 70 characters per part instead of 160.')} />
        <Textarea className="mt-3" rows={3} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={t('Type or paste a message…')} aria-label={t('Message to measure')} />
        <p className="mt-2 text-sm text-slate-700 dark:text-slate-300" aria-live="polite">
          {t('{len} characters · {enc} · {n} credit(s) per recipient', { len: formatNumber(est.length), enc: est.encoding === 'UNICODE' ? t('Bangla/Unicode') : t('English'), n: formatNumber(est.units) })}
        </p>
      </Card>
      <PurchasesCard />
    </div>
  );
};

const PurchasesCard: React.FC = () => {
  const t = useSmsT();
  const q = useMyPurchases();
  const rows = (q.data ?? []).filter((p) => p.status === 'SUCCESS' || p.status === 'PENDING');
  if (!rows.length) return null;
  return (
    <Card>
      <CardHeader title={t('Purchases')} />
      <div className="overflow-x-auto mt-3">
        <Table>
          <TableHead><tr><TableHeaderCell>{t('Date')}</TableHeaderCell><TableHeaderCell className="text-right">{t('Credits')}</TableHeaderCell><TableHeaderCell className="text-right">{t('Amount')}</TableHeaderCell><TableHeaderCell>{t('Method')}</TableHeaderCell><TableHeaderCell>{t('Receipt')}</TableHeaderCell></tr></TableHead>
          <tbody>
            {rows.map((p, i) => (
              <TableRow key={p.id} index={i}>
                <TableCell>{formatDate(p.paidAt ?? p.createdAt)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatNumber(p.units)}</TableCell>
                <TableCell className="text-right">{formatCurrency(p.amount)}</TableCell>
                <TableCell>{p.method === 'MANUAL' ? t('Paid offline') : p.method === 'BKASH' ? 'bKash' : 'SSLCommerz'}{p.isDemo ? ` (${t('demo')})` : ''}</TableCell>
                <TableCell>{p.receiptNumber ? <Link className="text-primary-700 dark:text-primary-400 underline" to={`/sms/receipt/${p.id}`}>{p.receiptNumber}</Link> : <Badge variant="warning">{t('Pending')}</Badge>}</TableCell>
              </TableRow>
            ))}
          </tbody>
        </Table>
      </div>
    </Card>
  );
};

const LogTab: React.FC = () => {
  const t = useSmsT();
  const [filters, setFilters] = React.useState<LogFilters>({ page: 1, pageSize: 50 });
  const [busy, setBusy] = React.useState(false);
  const exportCsv = async () => {
    setBusy(true);
    try {
      await downloadLogCsv(filters);
    } catch (e) {
      toast.error(errorMessage(e, t('Export failed')));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button variant="secondary" leftIcon={<Download className="w-4 h-4" />} isLoading={busy} onClick={() => void exportCsv()}>{t('Export CSV')}</Button>
      </div>
      <SmsLogTable filters={filters} onChange={setFilters} />
    </div>
  );
};

const HistoryTab: React.FC = () => {
  const t = useSmsT();
  const [page, setPage] = React.useState(1);
  const q = useSmsLedger(page);
  if (q.isLoading) return <SkeletonText lines={6} />;
  if (q.isError || !q.data) return <ErrorState title={t('Could not load credit history')} onRetry={() => void q.refetch()} />;
  const pages = Math.max(1, Math.ceil(q.data.meta.total / q.data.meta.pageSize));
  return (
    <Card>
      <div className="overflow-x-auto">
        <Table>
          <TableHead><tr><TableHeaderCell>{t('Date')}</TableHeaderCell><TableHeaderCell>{t('Type')}</TableHeaderCell><TableHeaderCell className="text-right">{t('Credits')}</TableHeaderCell><TableHeaderCell className="text-right">{t('Balance')}</TableHeaderCell><TableHeaderCell>{t('Details')}</TableHeaderCell></tr></TableHead>
          <tbody>
            {q.data.data.length === 0 ? (
              <tr><TableCell colSpan={5} className="text-center text-slate-500">{t('No credit activity yet')}</TableCell></tr>
            ) : q.data.data.map((r, i) => (
              <TableRow key={r.id} index={i}>
                <TableCell className="whitespace-nowrap">{formatDate(r.createdAt, true)}</TableCell>
                <TableCell><Badge variant={r.units > 0 ? 'success' : r.type === 'DEDUCT' ? 'neutral' : 'warning'}>{t(LEDGER_LABEL[r.type])}</Badge></TableCell>
                <TableCell className="text-right tabular-nums">{signedUnits(r.units)}{r.freeUnits ? <span className="block text-xs text-slate-500 dark:text-slate-400">{t('{n} free', { n: formatNumber(r.freeUnits) })}</span> : null}</TableCell>
                <TableCell className="text-right tabular-nums">{formatNumber(r.balanceAfter)}</TableCell>
                <TableCell className="text-sm text-slate-600 dark:text-slate-300 min-w-48">{r.reason}</TableCell>
              </TableRow>
            ))}
          </tbody>
        </Table>
      </div>
      {pages > 1 && (
        <div className="flex items-center justify-end gap-2 mt-3">
          <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>{t('Previous')}</Button>
          <span className="text-sm tabular-nums">{page} / {pages}</span>
          <Button size="sm" variant="secondary" disabled={page >= pages} onClick={() => setPage(page + 1)}>{t('Next')}</Button>
        </div>
      )}
    </Card>
  );
};

const SettingsTab: React.FC<{ o: Overview }> = ({ o }) => {
  const t = useSmsT();
  const save = useSaveSettings();
  const request = useRequestSender();
  const cancel = useCancelSender();
  const history = useMySenderRequests();
  const [threshold, setThreshold] = React.useState(String(o.lowBalanceThreshold));
  const [sender, setSender] = React.useState('');
  const [note, setNote] = React.useState('');
  const senderErr = sender ? senderIdError(sender) : null;
  const pending = (history.data ?? []).find((r) => r.status === 'REQUESTED');

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <Card>
        <CardHeader title={t('Sender ID (masking)')} description={t('Show your school name instead of a number on guardians’ phones. PeopleNIT registers it with the mobile operators; approval usually takes 3–7 working days.')} />
        <div className="mt-4 space-y-3">
          <p className="text-sm text-slate-700 dark:text-slate-300">
            {t('Current sender:')} <strong>{o.senderId ?? t('Default number (non-masking)')}</strong>
          </p>
          {pending ? (
            <Alert tone="info" title={t('Waiting for approval: {id}', { id: pending.requested })} action={<Button size="sm" variant="ghost" isLoading={cancel.isPending} onClick={() => cancel.mutate(pending.id, { onError: (e) => toast.error(errorMessage(e, t('Could not cancel'))) })}>{t('Cancel request')}</Button>}>
              {t('Requested on {d}', { d: formatDate(pending.createdAt) })}
            </Alert>
          ) : (
            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                if (senderIdError(sender)) return;
                request.mutate({ senderId: sender.trim(), note: note.trim() || undefined }, {
                  onSuccess: () => { toast.success(t('Sender ID requested')); setSender(''); setNote(''); },
                  onError: (er) => toast.error(errorMessage(er, t('Could not send the request'))),
                });
              }}
            >
              <Input label={t('Requested sender ID')} value={sender} maxLength={SENDER_ID_MAX} onChange={(e) => setSender(e.target.value)} error={senderErr ? t(senderErr) : undefined} helperText={t('Up to 11 English letters/digits, e.g. ALAMINSCH')} required />
              <Textarea label={t('Note for PeopleNIT (optional)')} rows={2} value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} />
              <Button type="submit" isLoading={request.isPending} disabled={!sender || !!senderErr}>{t('Request sender ID')}</Button>
            </form>
          )}
          {(history.data ?? []).filter((r) => r.status !== 'REQUESTED').slice(0, 5).map((r) => (
            <div key={r.id} className="text-sm flex flex-wrap items-center gap-2 text-slate-700 dark:text-slate-300">
              <Badge variant={r.status === 'APPROVED' ? 'success' : 'danger'}>{r.status === 'APPROVED' ? t('Approved') : t('Rejected')}</Badge>
              <span className="font-medium">{r.approvedValue ?? r.requested}</span>
              {r.reviewNote && <span className="text-slate-500 dark:text-slate-400">— {r.reviewNote}</span>}
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <CardHeader title={t('Low-balance alert')} description={t('Admins get an email and an in-app alert (at most once a day) when credits fall below this number. 0 turns it off.')} />
        <form
          className="mt-4 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            const n = Number(threshold);
            if (!Number.isInteger(n) || n < 0) return;
            save.mutate({ lowBalanceThreshold: n }, { onSuccess: () => toast.success(t('Saved')), onError: (er) => toast.error(errorMessage(er, t('Could not save'))) });
          }}
        >
          <Input type="number" min={0} step={1} inputMode="numeric" label={t('Alert when credits fall below')} value={threshold} onChange={(e) => setThreshold(e.target.value)} containerClassName="max-w-xs" />
          <Button type="submit" isLoading={save.isPending}>{t('Save')}</Button>
        </form>
      </Card>
    </div>
  );
};

export default SmsCreditsPage;
