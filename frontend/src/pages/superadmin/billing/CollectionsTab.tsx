import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Mail, MessageSquare, Phone, Settings2, ShieldAlert, StickyNote, Handshake, Banknote } from 'lucide-react';
import { platformBillingApi, type AccessLevel, type BoardRow, type CallOutcome, type TimelineEntry } from '@/api/platformBilling.api';
import { Badge, Button, Drawer, Input, Select, Skeleton, Textarea } from '@/components/ui';
import { DataTable, type Column } from '@/components/DataTable/DataTable';
import { formatCurrency, formatDate, useT } from '@/i18n';
import { accessVariant, invoiceStatusVariant, periodLabel } from '@/pages/billing/platform/platformBilling.logic';
import { BillingProfileModal, invalidatePlatformAdmin, OverrideModal } from './PlatformBillingModals';
import { InvoiceDrawer } from './PlatformInvoicesTab';

const OUTCOMES: CallOutcome[] = ['REACHED', 'NO_ANSWER', 'PROMISED', 'REFUSED', 'WRONG_NUMBER'];
const OUTCOME_LABEL: Record<CallOutcome, string> = {
  REACHED: 'Reached',
  NO_ANSWER: 'No answer',
  PROMISED: 'Promised to pay',
  REFUSED: 'Refused',
  WRONG_NUMBER: 'Wrong number',
};

const TimelineItem: React.FC<{ e: TimelineEntry }> = ({ e }) => {
  const t = useT();
  const icon =
    e.kind === 'REMINDER' ? (
      e.channel === 'SMS' ? <MessageSquare className="w-4 h-4" /> : <Mail className="w-4 h-4" />
    ) : e.type === 'CALL' ? (
      <Phone className="w-4 h-4" />
    ) : e.type === 'PROMISE_TO_PAY' ? (
      <Handshake className="w-4 h-4" />
    ) : e.type === 'PAYMENT' ? (
      <Banknote className="w-4 h-4" />
    ) : e.type === 'ACCESS_CHANGE' ? (
      <ShieldAlert className="w-4 h-4" />
    ) : (
      <StickyNote className="w-4 h-4" />
    );
  return (
    <li className="flex gap-3 py-3">
      <span className="mt-0.5 w-7 h-7 rounded-full bg-slate-100 dark:bg-white/10 flex items-center justify-center text-slate-600 dark:text-slate-300 flex-shrink-0" aria-hidden="true">
        {icon}
      </span>
      <div className="min-w-0 flex-1 text-sm">
        <p className="font-semibold text-slate-900 dark:text-white">
          {e.kind === 'REMINDER'
            ? t('{kind} reminder by {channel}', { kind: t(e.type), channel: e.channel ?? '' })
            : e.type === 'CALL'
              ? `${t('Call')} · ${t(OUTCOME_LABEL[(e.callOutcome ?? 'REACHED') as CallOutcome])}`
              : t(e.type.replace(/_/g, ' '))}
          {e.result && (
            <Badge className="ml-2" variant={e.result === 'SENT' ? 'success' : e.result === 'FAILED' ? 'danger' : 'neutral'}>
              {t(e.result)}
            </Badge>
          )}
        </p>
        {e.body && <p className="text-slate-700 dark:text-slate-300 whitespace-pre-wrap break-words">{e.body}</p>}
        {e.kind === 'REMINDER' && (
          <p className="text-xs text-slate-500 break-words">
            {e.recipient} {e.providerResponse ? `· ${e.providerResponse}` : ''}
          </p>
        )}
        <p className="text-xs text-slate-500">
          {formatDate(e.at, true)}
          {e.actorName ? ` · ${e.actorName}` : ''}
          {e.invoiceNumber ? ` · ${e.invoiceNumber}` : ''}
          {e.promiseDate ? ` · ${t('promised for {d}', { d: formatDate(e.promiseDate) })}` : ''}
          {e.nextFollowUpAt ? ` · ${t('follow up {d}', { d: formatDate(e.nextFollowUpAt) })}` : ''}
        </p>
      </div>
    </li>
  );
};

/** One school's collection file: invoices, access, log a call/note/promise, timeline. */
export const SchoolCollectionsDrawer: React.FC<{ institutionId: string | null; onClose: () => void }> = ({ institutionId, onClose }) => {
  const t = useT();
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['platform-school', institutionId],
    queryFn: () => platformBillingApi.schoolCollections(institutionId!),
    enabled: !!institutionId,
  });
  const { data: staff } = useQuery({ queryKey: ['platform-staff'], queryFn: platformBillingApi.staff, enabled: !!institutionId });
  const [type, setType] = useState<'CALL' | 'NOTE' | 'PROMISE_TO_PAY'>('CALL');
  const [outcome, setOutcome] = useState<CallOutcome>('REACHED');
  const [body, setBody] = useState('');
  const [promiseDate, setPromiseDate] = useState('');
  const [followUp, setFollowUp] = useState('');
  const [assignee, setAssignee] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [invoiceId, setInvoiceId] = useState<string | null>(null);
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

  const save = async () => {
    if (!institutionId) return;
    setSaving(true);
    try {
      await platformBillingApi.addActivity(institutionId, {
        type,
        callOutcome: type === 'CALL' ? outcome : undefined,
        body: body || undefined,
        promiseDate: type === 'PROMISE_TO_PAY' ? promiseDate || undefined : undefined,
        nextFollowUpAt: followUp || undefined,
        assigneeUserId: assignee === '' ? undefined : assignee === 'none' ? null : assignee,
      });
      toast.success(t('Saved'));
      setBody('');
      setPromiseDate('');
      setFollowUp('');
      invalidatePlatformAdmin(qc);
    } catch (err: any) {
      const errors = err?.response?.data?.errors;
      toast.error((Array.isArray(errors) && errors[0]?.message) || err?.response?.data?.message || t('Could not save'));
    } finally {
      setSaving(false);
    }
  };

  const profile = data?.profile;
  return (
    <>
      <Drawer isOpen={!!institutionId} onClose={onClose} width="lg" title={data?.institution.name ?? t('School')} description={data?.institution.phone ?? undefined}>
        {isLoading || !data ? (
          <Skeleton className="h-96" />
        ) : (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center gap-2">
              {profile?.accessOverride ? (
                <Badge variant={accessVariant(profile.accessOverride)}>
                  {t(profile.accessOverride)} · {t('manual')}
                  {profile.overrideKeep ? ` · ${t('kept')}` : ''}
                </Badge>
              ) : (
                <Badge variant="success">{t('Automatic access')}</Badge>
              )}
              {data.assigneeName && <Badge variant="info">{t('Owner: {n}', { n: data.assigneeName })}</Badge>}
              <Button size="sm" variant="secondary" leftIcon={<ShieldAlert className="w-4 h-4" />} onClick={() => setOverrideOpen(true)}>
                {t('Restrict / disable')}
              </Button>
              <Button size="sm" variant="ghost" leftIcon={<Settings2 className="w-4 h-4" />} onClick={() => setProfileOpen(true)}>
                {t('Billing profile')}
              </Button>
            </div>

            <section>
              <h3 className="text-sm font-bold mb-2">{t('Invoices')}</h3>
              <ul className="divide-y divide-slate-100 dark:divide-slate-800 text-sm">
                {data.invoices.slice(0, 12).map((inv) => (
                  <li key={inv.id}>
                    <button type="button" onClick={() => setInvoiceId(inv.id)} className="w-full py-2 flex items-center gap-2 text-left hover:bg-slate-50 dark:hover:bg-white/5 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-600">
                      <span className="flex-1">{periodLabel(inv.period)}</span>
                      <span className="tabular-nums">{formatCurrency(inv.amountDue > 0 ? inv.amountDue : inv.total)}</span>
                      <Badge variant={invoiceStatusVariant(inv.status)}>{t(inv.status)}</Badge>
                    </button>
                  </li>
                ))}
              </ul>
            </section>

            <section className="space-y-3 rounded-xl border border-slate-200 dark:border-slate-800 p-3">
              <h3 className="text-sm font-bold">{t('Log contact')}</h3>
              <div className="grid sm:grid-cols-2 gap-3">
                <Select
                  label={t('Type')}
                  value={type}
                  onChange={(e) => setType(e.target.value as typeof type)}
                  options={[
                    { value: 'CALL', label: t('Call') },
                    { value: 'PROMISE_TO_PAY', label: t('Promise to pay') },
                    { value: 'NOTE', label: t('Note') },
                  ]}
                />
                {type === 'CALL' && (
                  <Select label={t('Outcome')} value={outcome} onChange={(e) => setOutcome(e.target.value as CallOutcome)} options={OUTCOMES.map((o) => ({ value: o, label: t(OUTCOME_LABEL[o]) }))} />
                )}
                {type === 'PROMISE_TO_PAY' && <Input label={t('Promised payment date')} type="date" value={promiseDate} onChange={(e) => setPromiseDate(e.target.value)} />}
                <Input label={t('Next follow-up')} type="date" value={followUp} onChange={(e) => setFollowUp(e.target.value)} />
                <Select
                  label={t('Assign to')}
                  value={assignee}
                  onChange={(e) => setAssignee(e.target.value)}
                  options={[
                    { value: '', label: t('Keep current') },
                    { value: 'none', label: t('Nobody') },
                    ...(staff ?? []).map((s) => ({ value: s.id, label: `${s.firstName} ${s.lastName}`.trim() })),
                  ]}
                />
              </div>
              <Textarea label={t('What was said')} rows={2} value={body} onChange={(e) => setBody(e.target.value)} />
              <Button size="sm" isLoading={saving} onClick={save}>{t('Save')}</Button>
            </section>

            <section>
              <h3 className="text-sm font-bold">{t('Timeline')}</h3>
              {data.timeline.length === 0 ? (
                <p className="text-sm text-slate-500 py-2">{t('Nothing yet.')}</p>
              ) : (
                <ol className="divide-y divide-slate-100 dark:divide-slate-800">
                  {data.timeline.map((e) => (
                    <TimelineItem key={`${e.kind}-${e.id}`} e={e} />
                  ))}
                </ol>
              )}
            </section>
          </div>
        )}
      </Drawer>
      <InvoiceDrawer invoiceId={invoiceId} onClose={() => setInvoiceId(null)} />
      <OverrideModal
        institutionId={overrideOpen ? institutionId : null}
        current={profile ? { level: profile.accessOverride, keep: profile.overrideKeep, reason: profile.overrideReason } : null}
        onClose={() => setOverrideOpen(false)}
      />
      {institutionId && <BillingProfileModal isOpen={profileOpen} institutionId={institutionId} institutionName={data?.institution.name} onClose={() => setProfileOpen(false)} />}
    </>
  );
};

const CollectionsTab: React.FC<{ openSchoolId?: string | null; onOpenSchool?: (id: string | null) => void }> = ({ openSchoolId, onOpenSchool }) => {
  const t = useT();
  const [q, setQ] = useState('');
  const [assignee, setAssignee] = useState('');
  const [accessLevel, setAccessLevel] = useState<AccessLevel | ''>('');
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [sort, setSort] = useState('daysOverdue');
  const [localOpen, setLocalOpen] = useState<string | null>(null);
  const openId = openSchoolId !== undefined ? openSchoolId : localOpen;
  const setOpen = (id: string | null) => (onOpenSchool ? onOpenSchool(id) : setLocalOpen(id));

  const { data, isLoading } = useQuery({
    queryKey: ['platform-collections', q, assignee, accessLevel, overdueOnly, sort],
    queryFn: () =>
      platformBillingApi.collections({
        q: q || undefined,
        assignee: assignee || undefined,
        accessLevel: accessLevel || undefined,
        overdueOnly: overdueOnly ? 'true' : undefined,
        sort,
      }),
  });

  const columns: Column<BoardRow>[] = [
    { key: 'name', header: t('School'), accessor: 'name', primary: true, render: (r) => <span className="font-semibold text-slate-900 dark:text-white">{r.name}</span> },
    { key: 'amountDue', header: t('Due'), accessor: 'amountDue', align: 'right', render: (r) => <span className="tabular-nums font-semibold">{formatCurrency(r.amountDue)}</span> },
    {
      key: 'daysOverdue',
      header: t('Days overdue'),
      accessor: 'daysOverdue',
      align: 'right',
      render: (r) => (r.daysOverdue > 0 ? <span className="text-rose-700 dark:text-rose-300 font-semibold tabular-nums">{r.daysOverdue}</span> : <span className="text-slate-500">—</span>),
    },
    { key: 'lastContactAt', header: t('Last contact'), hideOnMobile: true, exportValue: (r) => r.lastContactAt ?? '', render: (r) => (r.lastContactAt ? formatDate(r.lastContactAt) : '—') },
    {
      key: 'nextFollowUpAt',
      header: t('Next follow-up'),
      exportValue: (r) => r.nextFollowUpAt ?? '',
      render: (r) => (r.nextFollowUpAt ? formatDate(r.nextFollowUpAt) : '—'),
    },
    { key: 'promiseDate', header: t('Promised'), hideOnMobile: true, exportValue: (r) => r.promiseDate ?? '', render: (r) => (r.promiseDate ? formatDate(r.promiseDate) : '—') },
    { key: 'assigneeName', header: t('Owner'), accessor: 'assigneeName', hideOnMobile: true, render: (r) => r.assigneeName ?? '—' },
    {
      key: 'accessLevel',
      header: t('Access'),
      accessor: 'accessLevel',
      render: (r) => <Badge variant={accessVariant(r.accessLevel)}>{t(r.accessLevel)}</Badge>,
    },
  ];

  return (
    <div className="space-y-4">
      {data && (
        <p className="text-sm text-slate-600 dark:text-slate-300">
          {t('{n} schools owe {amount} · {o} overdue', { n: data.totals.schools, amount: formatCurrency(data.totals.amountDue), o: data.totals.overdueSchools })}
        </p>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 items-end">
        <Input label={t('Search')} placeholder={t('School name or code')} value={q} onChange={(e) => setQ(e.target.value)} />
        <Select
          label={t('Owner')}
          value={assignee}
          onChange={(e) => setAssignee(e.target.value)}
          options={[
            { value: '', label: t('Everyone') },
            { value: 'me', label: t('Assigned to me') },
            { value: 'none', label: t('Unassigned') },
          ]}
        />
        <Select
          label={t('Access')}
          value={accessLevel}
          onChange={(e) => setAccessLevel(e.target.value as AccessLevel | '')}
          options={[
            { value: '', label: t('Any') },
            { value: 'ACTIVE', label: t('ACTIVE') },
            { value: 'RESTRICTED', label: t('RESTRICTED') },
            { value: 'DISABLED', label: t('DISABLED') },
          ]}
        />
        <Select
          label={t('Sort by')}
          value={sort}
          onChange={(e) => setSort(e.target.value)}
          options={[
            { value: 'daysOverdue', label: t('Most overdue') },
            { value: 'amount', label: t('Largest amount') },
            { value: 'nextFollowUp', label: t('Next follow-up') },
            { value: 'lastContact', label: t('Longest without contact') },
            { value: 'name', label: t('Name') },
          ]}
        />
        <label className="flex items-center gap-2 text-sm font-medium min-h-10 cursor-pointer">
          <input type="checkbox" className="w-4 h-4" checked={overdueOnly} onChange={(e) => setOverdueOnly(e.target.checked)} />
          {t('Overdue only')}
        </label>
      </div>

      <DataTable
        data={data?.rows ?? []}
        columns={columns}
        isLoading={isLoading}
        onRowClick={(r) => setOpen(r.institutionId)}
        actions={[{ label: t('Open'), icon: 'view', onClick: (r) => setOpen(r.institutionId) }]}
        exportFileName="collections"
        emptyTitle={t('Nothing to collect')}
        emptyDescription={t('No school has an unpaid PeopleNIT bill right now.')}
        caption={t('Collections board')}
      />

      <SchoolCollectionsDrawer institutionId={openId} onClose={() => setOpen(null)} />
    </div>
  );
};

export default CollectionsTab;
