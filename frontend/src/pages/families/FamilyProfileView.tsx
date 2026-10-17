import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  BadgePercent, CreditCard, Edit3, FileText, GitMerge, HandHeart, Phone, Plus, Receipt, Star, Trash2, UserMinus, UserPlus, Users, Wallet,
} from 'lucide-react';
import { Avatar, Badge, Button, Card, CardHeader, Input, Modal, Select, Textarea } from '@/components/ui';
import { formatCurrency, formatDate, formatNumber, useLocale, useT } from '@/i18n';
import {
  apiErrorMessage, useAddMembers, useAddNote, useDeleteNote, useFamilySearch, useMergeFamily, useOfflinePayment, usePayOnline, useRemoveGuardian,
  useDeleteFamily, useRemoveStudent, useSiblingConcession, useUpdateFamily, type FamilyChild, type FamilyProfile,
} from './families.api';
import { familyHeadline, previewOldestFirst, sumAmounts } from './family.logic';
import { ConfirmModal } from '@/components/common/ConfirmModal';
import { showUndoToast } from '@/components/common/undoToast';
import { useAuthStore } from '@/store/authStore';
import { BadgeIconTile } from '../character/shared';

// =============================================================================
// T3 family profile — one view for staff (everything), teachers (read-only:
// contacts, children, attendance, character) and guardians (own family, no
// staff notes, "Pay all"). The server decides what each view receives.
// =============================================================================

const Money: React.FC<{ v: number | null | undefined; className?: string }> = ({ v, className }) => <span className={className ?? 'tabular-nums'}>{formatCurrency(v ?? 0)}</span>;

/* ── Pay all (guardian) ──────────────────────────────────────────────────── */

const PayAllModal: React.FC<{ open: boolean; onClose: () => void; profile: FamilyProfile }> = ({ open, onClose, profile }) => {
  const t = useT();
  const navigate = useNavigate();
  const pay = usePayOnline();
  const [method, setMethod] = React.useState<'BKASH' | 'NAGAD' | 'SSLCOMMERZ'>('BKASH');
  const lines = profile.children.flatMap((c) => (c.fees?.unpaid ?? []).map((i) => ({ ...i, child: `${c.firstName} ${c.lastName}` })));
  const start = () =>
    pay.mutate({ id: profile.family.id, method }, {
      onSuccess: (r) => {
        if (r.demo && r.checkoutPath) navigate(r.checkoutPath);
        else window.location.assign(r.paymentUrl);
      },
      onError: (err) => toast.error(apiErrorMessage(err, t('Could not start the payment'))),
    });
  return (
    <Modal isOpen={open} onClose={onClose} title={t('Pay all children’s fees')} size="md"
      footer={<div className="flex justify-end gap-2"><Button variant="secondary" onClick={onClose}>{t('Cancel')}</Button><Button leftIcon={<CreditCard className="w-4 h-4" />} onClick={start} isLoading={pay.isPending} disabled={lines.length === 0}>{t('Pay {amount}', { amount: formatCurrency(profile.fees?.due ?? 0) })}</Button></div>}>
      <div className="space-y-4">
        <ul className="divide-y divide-slate-100 dark:divide-white/6 text-sm">
          {lines.map((l) => (
            <li key={l.id} className="flex justify-between gap-2 py-2">
              <span className="min-w-0"><span className="font-medium">{l.child}</span> <span className="text-xs text-slate-500">{l.invoiceNo} · {formatDate(l.dueDate)}</span></span>
              <Money v={l.dueAmount} />
            </li>
          ))}
        </ul>
        <Select label={t('Pay with')} value={method} onChange={(e) => setMethod(e.target.value as typeof method)}
          options={[{ value: 'BKASH', label: 'bKash' }, { value: 'NAGAD', label: 'Nagad' }, { value: 'SSLCOMMERZ', label: t('Card / SSLCommerz') }]} />
        <p className="text-xs text-slate-500 dark:text-slate-400">{t('One payment covers every invoice above. Each child gets their own receipt.')}</p>
      </div>
    </Modal>
  );
};

/* ── Offline split (staff) ───────────────────────────────────────────────── */

const OfflineModal: React.FC<{ open: boolean; onClose: () => void; profile: FamilyProfile }> = ({ open, onClose, profile }) => {
  const t = useT();
  const save = useOfflinePayment();
  const lines = profile.children.flatMap((c) => (c.fees?.unpaid ?? []).map((i) => ({ ...i, child: `${c.firstName} ${c.lastName}` })));
  const [amount, setAmount] = React.useState('');
  const [method, setMethod] = React.useState<'CASH' | 'BANK_TRANSFER'>('CASH');
  const [ref, setRef] = React.useState('');
  const [notes, setNotes] = React.useState('');
  const [manual, setManual] = React.useState(false);
  const [split, setSplit] = React.useState<Record<string, string>>({});
  React.useEffect(() => {
    if (open) { setAmount(String(profile.fees?.due ?? '')); setManual(false); setSplit({}); setRef(''); setNotes(''); }
  }, [open, profile.fees?.due]);
  const amt = Number(amount) || 0;
  const preview = previewOldestFirst(amt, lines);
  const manualAllocs = lines.map((l) => ({ invoiceId: l.id, amount: Number(split[l.id] || 0) })).filter((a) => a.amount > 0);
  const manualSum = sumAmounts(manualAllocs.map((a) => a.amount));
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    save.mutate(
      { id: profile.family.id, amount: amt, method, transactionRef: ref || undefined, notes: notes || undefined, allocations: manual ? manualAllocs : undefined },
      {
        onSuccess: (r) => { toast.success(t('Payment recorded: {n} receipts', { n: formatNumber(r.payments.length) })); onClose(); },
        onError: (err) => toast.error(apiErrorMessage(err, t('Could not record the payment'))),
      },
    );
  };
  const amountFor = (id: string) => preview.allocations.find((a) => a.invoiceId === id)?.amount ?? 0;
  return (
    <Modal isOpen={open} onClose={onClose} title={t('Record a family payment')} size="lg"
      footer={<div className="flex justify-end gap-2"><Button variant="secondary" onClick={onClose}>{t('Cancel')}</Button><Button type="submit" form="family-offline" isLoading={save.isPending} disabled={amt <= 0 || (manual && manualSum !== amt) || (!manual && preview.leftover > 0)}>{t('Record payment')}</Button></div>}>
      <form id="family-offline" onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Input label={t('Amount (BDT)')} type="number" min="0.01" step="0.01" required value={amount} onChange={(e) => setAmount(e.target.value)} />
          <Select label={t('Method')} value={method} onChange={(e) => setMethod(e.target.value as typeof method)} options={[{ value: 'CASH', label: t('Cash') }, { value: 'BANK_TRANSFER', label: t('Bank transfer') }]} />
          <Input label={t('Reference (optional)')} maxLength={120} value={ref} onChange={(e) => setRef(e.target.value)} />
        </div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={manual} onChange={(e) => setManual(e.target.checked)} /> {t('Choose the split myself')}</label>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead><tr className="text-left text-xs text-slate-500"><th className="py-1 pr-2">{t('Child')}</th><th className="py-1 pr-2">{t('Invoice')}</th><th className="py-1 pr-2 text-right">{t('Due')}</th><th className="py-1 text-right">{t('Pays')}</th></tr></thead>
            <tbody className="divide-y divide-slate-100 dark:divide-white/6">
              {lines.map((l) => (
                <tr key={l.id}>
                  <td className="py-1.5 pr-2">{l.child}</td>
                  <td className="py-1.5 pr-2 text-xs">{l.invoiceNo}<span className="block text-slate-500">{formatDate(l.dueDate)}</span></td>
                  <td className="py-1.5 pr-2 text-right"><Money v={l.dueAmount} /></td>
                  <td className="py-1.5 text-right">
                    {manual
                      ? <input className="input-field h-8 w-24 text-right" type="number" min="0" max={l.dueAmount} step="0.01" value={split[l.id] ?? ''} onChange={(e) => setSplit((s) => ({ ...s, [l.id]: e.target.value }))} aria-label={t('Amount for {invoice}', { invoice: l.invoiceNo })} />
                      : <Money v={amountFor(l.id)} />}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!manual && preview.leftover > 0 && <p className="text-sm text-red-600">{t('The amount is more than the family owes.')}</p>}
        {manual && manualSum !== amt && <p className="text-sm text-amber-700">{t('The split adds up to {sum}.', { sum: formatCurrency(manualSum) })}</p>}
        <Textarea label={t('Note (optional)')} rows={2} maxLength={500} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </form>
    </Modal>
  );
};

/* ── Merge (staff) ───────────────────────────────────────────────────────── */

const MergeModal: React.FC<{ open: boolean; onClose: () => void; familyId: string }> = ({ open, onClose, familyId }) => {
  const t = useT();
  const [q, setQ] = React.useState('');
  const search = useFamilySearch(q, open);
  const merge = useMergeFamily();
  const doMerge = (otherId: string, name: string) => {
    if (!window.confirm(t('Move everyone from “{name}” into this family?', { name }))) return;
    merge.mutate({ id: familyId, otherFamilyId: otherId }, {
      onSuccess: () => { toast.success(t('Families merged')); onClose(); },
      onError: (err) => toast.error(apiErrorMessage(err, t('Could not merge'))),
    });
  };
  return (
    <Modal isOpen={open} onClose={onClose} title={t('Merge another family into this one')} size="md">
      <div className="space-y-3">
        <Input label={t('Search by guardian, child or family name')} value={q} onChange={(e) => setQ(e.target.value)} />
        <ul className="divide-y divide-slate-100 dark:divide-white/6">
          {(search.data ?? []).filter((f) => f.id !== familyId).map((f) => (
            <li key={f.id} className="flex items-center justify-between gap-2 py-2 text-sm">
              <span className="min-w-0"><span className="font-semibold">{f.name}</span><span className="block text-xs text-slate-500 truncate">{[...f.guardians, ...f.children].join(', ')}</span></span>
              <Button size="sm" variant="secondary" onClick={() => doMerge(f.id, f.name)} isLoading={merge.isPending}>{t('Merge')}</Button>
            </li>
          ))}
        </ul>
      </div>
    </Modal>
  );
};

/* ── Child card ──────────────────────────────────────────────────────────── */

const ChildCard: React.FC<{ c: FamilyChild; profile: FamilyProfile }> = ({ c, profile }) => {
  const t = useT();
  const { lang } = useLocale();
  const remove = useRemoveStudent();
  const staffish = profile.view !== 'guardian';
  const ungroup = () => {
    if (!window.confirm(t('Take {name} out of this family?', { name: c.firstName }))) return;
    remove.mutate({ id: profile.family.id, studentId: c.id }, { onSuccess: () => toast.success(t('Student ungrouped')), onError: (err) => toast.error(apiErrorMessage(err, t('Could not ungroup'))) });
  };
  return (
    <Card className="space-y-3">
      <div className="flex items-start gap-3">
        <Avatar name={`${c.firstName} ${c.lastName}`} src={c.avatarUrl} size="lg" />
        <div className="min-w-0 flex-1">
          <h3 className="font-bold text-slate-900 dark:text-white truncate">
            {staffish ? <Link to={`/students/${c.id}`} className="hover:underline">{c.firstName} {c.lastName}</Link> : `${c.firstName} ${c.lastName}`}
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {[c.class?.name, c.section?.name].filter(Boolean).join(' · ') || t('No class')}{c.rollNumber ? ` · ${t('Roll')} ${c.rollNumber}` : ''} · {c.studentId}
          </p>
          {c.status !== 'ACTIVE' && <Badge variant="neutral" className="mt-1">{c.status}</Badge>}
        </div>
        {profile.permissions.canEdit && profile.children.length > 1 && (
          <Button size="icon-sm" variant="ghost" aria-label={t('Take out of family')} onClick={ungroup}><UserMinus className="w-4 h-4" /></Button>
        )}
      </div>
      <dl className="grid grid-cols-2 gap-2 text-sm">
        <div>
          <dt className="text-xs text-slate-500">{t('Attendance')}</dt>
          <dd className="font-semibold tabular-nums">{c.attendance.rate == null ? '—' : `${formatNumber(c.attendance.rate)}%`}<span className="block text-xs font-normal text-slate-500">{t('{p} present · {a} absent · {l} late', { p: formatNumber(c.attendance.present), a: formatNumber(c.attendance.absent), l: formatNumber(c.attendance.late) })}</span></dd>
        </div>
        {c.fees && (
          <div>
            <dt className="text-xs text-slate-500">{t('Fees due')}</dt>
            <dd className={`font-semibold ${c.fees.due > 0 ? 'text-red-700 dark:text-red-400' : 'text-emerald-700 dark:text-emerald-400'}`}><Money v={c.fees.due} />{c.fees.overdue > 0 && <span className="block text-xs font-normal">{t('Overdue')}: <Money v={c.fees.overdue} /></span>}</dd>
          </div>
        )}
      </dl>
      {c.fees && c.fees.unpaid.length > 0 && (
        <ul className="text-xs text-slate-600 dark:text-slate-300 space-y-0.5">
          {c.fees.unpaid.slice(0, 4).map((i) => <li key={i.id} className="flex justify-between gap-2"><span>{i.invoiceNo} · {formatDate(i.dueDate)}</span><Money v={i.dueAmount} /></li>)}
        </ul>
      )}
      {c.character && (
        <div className="rounded-lg bg-slate-50 dark:bg-white/4 p-2.5 text-sm">
          <div className="flex justify-between gap-2">
            <span className="flex items-center gap-1.5 font-medium"><Star className="w-4 h-4 text-primary-700" aria-hidden /> {t('Character')}</span>
            <span className="tabular-nums">{formatNumber(c.character.points)} {t('points')}</span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            {c.character.overall == null ? t('Not assessed yet') : `${c.character.periodName}: ${formatNumber(c.character.overall)}%${c.character.band ? ` · ${lang === 'bn' ? c.character.band.bn : c.character.band.en}` : ''}`}
          </p>
          {c.character.badges.length > 0 && (
            <div className="flex gap-1 mt-1.5" aria-label={t('Badges')}>
              {c.character.badges.map((b) => <span key={b.id} title={b.badge.name}><BadgeIconTile icon={b.badge.icon} color={b.badge.color} size="sm" /></span>)}
              {c.character.badgeCount > 3 && <span className="text-xs text-slate-500 self-center">+{formatNumber(c.character.badgeCount - 3)}</span>}
            </div>
          )}
        </div>
      )}
    </Card>
  );
};

/* ── Main view ───────────────────────────────────────────────────────────── */

export const FamilyProfileView: React.FC<{ profile: FamilyProfile }> = ({ profile }) => {
  const t = useT();
  const { lang } = useLocale();
  const p = profile;
  const update = useUpdateFamily();
  const removeGuardian = useRemoveGuardian();
  const addMembers = useAddMembers();
  const addNote = useAddNote();
  const delNote = useDeleteNote();
  const concession = useSiblingConcession();
  const [payOpen, setPayOpen] = React.useState(false);
  const [offlineOpen, setOfflineOpen] = React.useState(false);
  const [mergeOpen, setMergeOpen] = React.useState(false);
  const [note, setNote] = React.useState('');
  const [conc, setConc] = React.useState('');
  const [concKids, setConcKids] = React.useState<Set<string>>(new Set());
  const nameOf = (studentId: string) => { const c = p.children.find((x) => x.id === studentId); return c ? c.firstName : ''; };
  const err = (fallback: string) => (e: unknown) => toast.error(apiErrorMessage(e, t(fallback)));

  const deleteFamily = useDeleteFamily();
  const role = useAuthStore((s) => s.user?.role);
  const canDelete = role === 'ADMIN' || role === 'SUPER_ADMIN';
  const navigate = useNavigate();
  const [confirmDelete, setConfirmDelete] = React.useState(false);

  const rename = () => {
    const name = window.prompt(t('Family name'), p.family.name)?.trim();
    if (name && name !== p.family.name) update.mutate({ id: p.family.id, body: { name } }, { onSuccess: () => toast.success(t('Family saved')), onError: err('Could not save') });
  };

  return (
    <div className="space-y-6">
      <ConfirmModal
        isOpen={confirmDelete}
        title={t('Delete family')}
        message={t('Move "{name}" to the trash? Its children and guardians are not deleted, and you can restore it for 30 days.', { name: p.family.name })}
        confirmLabel={t('Delete')}
        variant="danger"
        isLoading={deleteFamily.isPending}
        onConfirm={() =>
          deleteFamily.mutate(p.family.id, {
            onSuccess: (res) => {
              setConfirmDelete(false);
              showUndoToast(t('Family moved to trash'), res, () => navigate(`/families/${p.family.id}`));
              navigate('/families');
            },
            onError: err('Could not delete'),
          })
        }
        onCancel={() => setConfirmDelete(false)}
      />
      <Card className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <span className="w-12 h-12 rounded-full bg-primary-50 dark:bg-primary-500/10 text-primary-700 dark:text-primary-300 inline-flex items-center justify-center shrink-0" aria-hidden><Users className="w-6 h-6" /></span>
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white truncate flex items-center gap-2">
              {p.family.name}
              {p.permissions.canEdit && <Button size="icon-sm" variant="ghost" aria-label={t('Rename family')} onClick={rename}><Edit3 className="w-4 h-4" /></Button>}
              {canDelete && <Button size="icon-sm" variant="ghost" aria-label={t('Delete family')} onClick={() => setConfirmDelete(true)}><Trash2 className="w-4 h-4" /></Button>}
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">{lang === 'bn' ? `${formatNumber(p.children.length)} সন্তান · ${formatNumber(p.guardians.length)} অভিভাবক` : familyHeadline(p.children.length, p.guardians.length)}</p>
          </div>
        </div>
        {p.fees && (
          <div className="flex flex-wrap items-center gap-3">
            <div className="text-right">
              <p className="text-xs text-slate-500">{t('Family total due')}</p>
              <p className={`text-2xl font-bold ${p.fees.due > 0 ? 'text-red-700 dark:text-red-400' : 'text-emerald-700 dark:text-emerald-400'}`}><Money v={p.fees.due} /></p>
              {p.fees.overdue > 0 && <p className="text-xs text-red-600">{t('Overdue')}: <Money v={p.fees.overdue} /></p>}
            </div>
            {p.permissions.canPayOnline && p.fees.due > 0 && <Button leftIcon={<CreditCard className="w-4 h-4" />} onClick={() => setPayOpen(true)}>{t('Pay all')}</Button>}
            {p.permissions.canPayOffline && p.fees.due > 0 && <Button variant="secondary" leftIcon={<Wallet className="w-4 h-4" />} onClick={() => setOfflineOpen(true)}>{t('Record payment')}</Button>}
          </div>
        )}
      </Card>

      <section aria-labelledby="family-children">
        <h2 id="family-children" className="text-sm font-semibold uppercase tracking-wide text-slate-500 mb-3">{t('Children')} {p.children.length > 1 && <span className="normal-case font-normal">· {t('siblings')}</span>}</h2>
        {p.children.length === 0 ? <p className="text-sm text-slate-500">{t('No children in this family.')}</p> : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">{p.children.map((c) => <ChildCard key={c.id} c={c} profile={p} />)}</div>
        )}
        <p className="text-xs text-slate-500 mt-2">{t('Attendance since {date}', { date: formatDate(p.attendanceWindow.from) })}{p.attendanceWindow.label ? ` (${p.attendanceWindow.label})` : ''}</p>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader icon={<Phone className="w-5 h-5" />} title={t('Guardians')} actions={p.permissions.canEdit ? <Button size="sm" variant="ghost" leftIcon={<GitMerge className="w-4 h-4" />} onClick={() => setMergeOpen(true)}>{t('Merge')}</Button> : undefined} />
          <ul className="mt-3 divide-y divide-slate-100 dark:divide-white/6">
            {p.guardians.map((g) => (
              <li key={g.id} className="flex items-center gap-3 py-2">
                <Avatar size="sm" name={`${g.firstName} ${g.lastName}`} src={g.avatarUrl} />
                <div className="min-w-0 flex-1 text-sm">
                  <p className="font-semibold truncate">{g.firstName} {g.lastName} <span className="text-xs font-normal text-slate-500">· {g.relationship}</span> {g.isPrimary && <Badge variant="primary">{t('Primary')}</Badge>}</p>
                  <p className="text-xs text-slate-500 truncate"><a href={`tel:${g.phone}`} className="hover:underline">{g.phone}</a>{g.email ? ` · ${g.email}` : ''}{g.occupation ? ` · ${g.occupation}` : ''}</p>
                </div>
                {p.permissions.canEdit && !g.isPrimary && (
                  <Button size="sm" variant="ghost" onClick={() => update.mutate({ id: p.family.id, body: { primaryGuardianId: g.id } }, { onError: err('Could not save') })}>{t('Make primary')}</Button>
                )}
                {p.permissions.canEdit && (
                  <Button size="icon-sm" variant="ghost" aria-label={t('Remove from family')} onClick={() => window.confirm(t('Remove this guardian from the family?')) && removeGuardian.mutate({ id: p.family.id, guardianId: g.id }, { onError: err('Could not remove') })}><Trash2 className="w-4 h-4" /></Button>
                )}
              </li>
            ))}
          </ul>
          {p.otherGuardians.length > 0 && (
            <div className="mt-3 rounded-lg border border-dashed border-slate-200 dark:border-white/10 p-3">
              <p className="text-xs font-semibold text-slate-500 mb-2">{t('Also linked to these children')}</p>
              <ul className="space-y-1">
                {p.otherGuardians.map((g) => (
                  <li key={g.id} className="flex items-center justify-between gap-2 text-sm">
                    <span className="truncate">{g.firstName} {g.lastName} · {g.phone}{g.inOtherFamily ? ` · ${t('in another family')}` : ''}</span>
                    {p.permissions.canEdit && <Button size="sm" variant="secondary" leftIcon={<UserPlus className="w-4 h-4" />} onClick={() => addMembers.mutate({ id: p.family.id, guardianIds: [g.id] }, { onSuccess: () => toast.success(t('Guardian added')), onError: err('Could not add') })}>{t('Add')}</Button>}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>

        {p.fees && (
          <Card>
            <CardHeader icon={<Receipt className="w-5 h-5" />} title={t('Recent payments')} />
            {p.recentPayments.length === 0 ? <p className="text-sm text-slate-500 mt-3">{t('No payments yet.')}</p> : (
              <ul className="mt-3 divide-y divide-slate-100 dark:divide-white/6 text-sm">
                {p.recentPayments.map((r) => (
                  <li key={r.id} className="flex justify-between gap-2 py-2">
                    <span className="min-w-0">
                      <span className="font-medium">{nameOf(r.studentId)}</span> <span className="text-xs text-slate-500">{r.invoiceNo} · {r.method} · {formatDate(r.paidAt)}</span>
                      <span className="block text-xs text-slate-500">{r.receiptNo}{r.familyPaymentId ? ` · ${t('family payment')}` : ''}</span>
                    </span>
                    <Money v={r.amount} />
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}

        {p.permissions.canNotes && (
          <Card>
            <CardHeader icon={<FileText className="w-5 h-5" />} title={t('Staff notes')} description={t('Never shown to guardians.')} />
            <form className="mt-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); if (note.trim()) addNote.mutate({ id: p.family.id, body: note.trim() }, { onSuccess: () => setNote(''), onError: err('Could not add the note') }); }}>
              <Input aria-label={t('New note')} placeholder={t('Add a note…')} value={note} maxLength={4000} onChange={(e) => setNote(e.target.value)} containerClassName="flex-1" />
              <Button type="submit" leftIcon={<Plus className="w-4 h-4" />} isLoading={addNote.isPending} disabled={!note.trim()}>{t('Add')}</Button>
            </form>
            <ul className="mt-3 space-y-3">
              {p.notes.map((n) => (
                <li key={n.id} className="text-sm">
                  <p className="whitespace-pre-wrap">{n.body}</p>
                  <p className="text-xs text-slate-500 flex items-center gap-2">{n.authorName} · {formatDate(n.createdAt)}
                    <button type="button" className="text-red-600 hover:underline" onClick={() => window.confirm(t('Delete this note?')) && delNote.mutate({ id: p.family.id, noteId: n.id }, { onError: err('Could not delete') })}>{t('Delete')}</button>
                  </p>
                </li>
              ))}
            </ul>
          </Card>
        )}

        {p.view !== 'teacher' && (
          <Card>
            <CardHeader icon={<FileText className="w-5 h-5" />} title={t('Documents')} />
            {p.documents.length === 0 ? <p className="text-sm text-slate-500 mt-3">{t('No documents uploaded.')}</p> : (
              <ul className="mt-3 divide-y divide-slate-100 dark:divide-white/6 text-sm">
                {p.documents.map((d) => (
                  <li key={d.id} className="flex justify-between gap-2 py-2">
                    <a href={d.fileUrl} target="_blank" rel="noopener noreferrer" className="truncate text-primary-700 dark:text-primary-400 hover:underline">{d.name}</a>
                    <span className="text-xs text-slate-500 shrink-0">{nameOf(d.studentId)} · {formatDate(d.uploadedAt)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}

        {p.donations && (
          <Card>
            <CardHeader icon={<HandHeart className="w-5 h-5" />} title={t('Donations')} description={t('{n} gifts · {total}', { n: formatNumber(p.donations.count), total: formatCurrency(p.donations.total) })} />
            <ul className="mt-3 divide-y divide-slate-100 dark:divide-white/6 text-sm">
              {p.donations.recent.map((d) => (
                <li key={d.id} className="flex justify-between gap-2 py-2"><span>{lang === 'bn' && d.fund.nameBn ? d.fund.nameBn : d.fund.name} <span className="text-xs text-slate-500">{d.receiptNo} · {formatDate(d.paidAt)}</span></span><Money v={d.amount} /></li>
              ))}
            </ul>
          </Card>
        )}

        {p.concessions && (
          <Card>
            <CardHeader icon={<BadgePercent className="w-5 h-5" />} title={t('Sibling concession')} description={t('Applies an existing fee concession to several siblings at once. Future invoices use it.')} />
            {p.concessions.active.length > 0 && (
              <ul className="mt-3 text-sm space-y-1">
                {p.concessions.active.map((a) => <li key={a.id}>{nameOf(a.studentId)}: <span className="font-medium">{a.concession.name}</span> ({a.concession.type === 'PERCENT' ? `${formatNumber(a.concession.value)}%` : formatCurrency(a.concession.value)})</li>)}
              </ul>
            )}
            {p.permissions.canConcession && (p.concessions.available.length === 0 ? (
              <p className="text-sm text-slate-500 mt-3">{t('Create a concession (e.g. “Sibling 10%”) in Fees → Concessions first.')}</p>
            ) : (
              <div className="mt-3 space-y-2">
                <Select aria-label={t('Concession')} value={conc} onChange={(e) => setConc(e.target.value)} placeholder={t('Choose a concession')}
                  options={p.concessions.available.map((c) => ({ value: c.id, label: `${c.name} (${c.type === 'PERCENT' ? `${c.value}%` : formatCurrency(c.value)})` }))} />
                <div className="flex flex-wrap gap-3">
                  {p.children.map((c) => (
                    <label key={c.id} className="flex items-center gap-1.5 text-sm"><input type="checkbox" checked={concKids.has(c.id)} onChange={() => setConcKids((s) => { const n = new Set(s); if (n.has(c.id)) n.delete(c.id); else n.add(c.id); return n; })} />{c.firstName}</label>
                  ))}
                </div>
                <Button size="sm" disabled={!conc || concKids.size === 0} isLoading={concession.isPending}
                  onClick={() => concession.mutate({ id: p.family.id, concessionId: conc, studentIds: [...concKids] }, { onSuccess: (r) => { toast.success(t('Applied to {n} children', { n: formatNumber(r.applied) })); setConcKids(new Set()); }, onError: err('Could not apply the concession') })}>
                  {t('Apply')}
                </Button>
              </div>
            ))}
          </Card>
        )}
      </div>

      {p.permissions.canPayOnline && <PayAllModal open={payOpen} onClose={() => setPayOpen(false)} profile={p} />}
      {p.permissions.canPayOffline && <OfflineModal open={offlineOpen} onClose={() => setOfflineOpen(false)} profile={p} />}
      {p.permissions.canEdit && <MergeModal open={mergeOpen} onClose={() => setMergeOpen(false)} familyId={p.family.id} />}
    </div>
  );
};

export default FamilyProfileView;
