import React, { useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { Printer, Search, Users, Wallet, X } from 'lucide-react';
import { Badge, Button, Card, Input, Kbd, PageHeader, Select, Skeleton, Textarea } from '../../../components/ui';
import { StatusBadge } from '../../../components/common/StatusBadge';
import { formatCurrency, formatDate, useLocale, useT } from '../../../i18n';
import { useAuthStore } from '../../../store/authStore';
import { useInvoiceDetail } from '../hooks';
import { PrintReceiptModal } from '../PrintDocuments';
import { useCollect, useCounterDues, useCounterSearch, useTodayCollections, type CollectResult, type CounterStudent } from '../studentFees/studentFees.api';
import {
  COUNTER_METHODS,
  METHOD_LABELS,
  monthLabel,
  parseAmount,
  previewAllocation,
  referenceRequired,
  selectedDue,
  sortOldestFirst,
  toPaisa,
  fromPaisa,
} from '../studentFees/studentFees.logic';

// Fees → Collect: the cashier's counter. Keyboard: "/" search, ↑/↓ + Enter
// to pick, Ctrl+Enter to take the payment, Esc for the next student.

function useDebounced<T>(value: T, ms: number) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return v;
}

const CollectFeePage: React.FC = () => {
  const t = useT();
  const { lang } = useLocale();
  const role = useAuthStore((s) => s.user?.role);
  const canDiscount = role === 'ADMIN' || role === 'ACCOUNTANT' || role === 'SUPER_ADMIN';
  const searchRef = useRef<HTMLInputElement>(null);

  const [query, setQuery] = useState('');
  const q = useDebounced(query, 250);
  const [cursor, setCursor] = useState(0);
  const [studentId, setStudentId] = useState<string | null>(null);
  const { data: hits, isFetching: searching } = useCounterSearch(studentId ? '' : q);
  const { data: dues, isLoading: loadingDues } = useCounterDues(studentId);
  const { data: today } = useTodayCollections();
  const collect = useCollect();

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<string>('CASH');
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [discountOpen, setDiscountOpen] = useState(false);
  const [discounts, setDiscounts] = useState<Record<string, string>>({});
  const [discountReason, setDiscountReason] = useState('');
  const [result, setResult] = useState<CollectResult | null>(null);
  const [printing, setPrinting] = useState<{ invoiceId: string; paymentId: string } | null>(null);
  const { data: printInvoice } = useInvoiceDetail(printing?.invoiceId ?? null);
  const printPayment = printInvoice?.payments.find((p) => p.id === printing?.paymentId) ?? null;

  const invoices = useMemo(() => sortOldestFirst(dues?.invoices ?? []), [dues]);
  useEffect(() => {
    // Default: every unpaid month selected.
    setSelected(new Set((dues?.invoices ?? []).map((i) => i.id)));
    setDiscounts({});
  }, [dues]);

  const discountNums = useMemo(() => {
    const out: Record<string, number> = {};
    for (const [id, v] of Object.entries(discounts)) {
      const n = parseAmount(v);
      if (Number.isFinite(n) && n > 0) out[id] = n;
    }
    return out;
  }, [discounts]);
  const discountTotal = fromPaisa(Object.values(discountNums).reduce((s, n) => s + toPaisa(n), 0));
  const selectedRows = invoices.filter((i) => selected.has(i.id));
  const fullDue = selectedDue(invoices, selected, discountNums);
  const typed = amount.trim() ? parseAmount(amount) : null;
  const payAmount = typed ?? fullDue;
  const allocation = payAmount > 0 ? previewAllocation(payAmount, selectedRows, discountNums) : [];
  const allocById = new Map((allocation ?? []).map((a) => [a.invoiceId, a.amount]));

  const reset = () => {
    setStudentId(null);
    setQuery('');
    setAmount('');
    setReference('');
    setNotes('');
    setDiscountOpen(false);
    setDiscountReason('');
    setResult(null);
    setCursor(0);
    setTimeout(() => searchRef.current?.focus(), 0);
  };

  const pick = (s: CounterStudent) => {
    setStudentId(s.id);
    setResult(null);
    setAmount('');
  };

  // Keyboard shortcuts.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (e.key === '/' && tag !== 'INPUT' && tag !== 'TEXTAREA' && tag !== 'SELECT') {
        e.preventDefault();
        if (studentId) reset();
        searchRef.current?.focus();
      } else if (e.key === 'Escape' && studentId && !printing) {
        reset();
      } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && studentId && !result) {
        e.preventDefault();
        void submit();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const problem = (() => {
    if (!dues) return null;
    if (typed !== null && !Number.isFinite(typed)) return t('Enter a valid amount');
    if (selectedRows.length === 0) return t('Choose at least one month');
    if (payAmount <= 0 && discountTotal <= 0) return t('Nothing to collect');
    if (payAmount > 0 && !allocation) return t('The amount is more than the selected dues ({due})', { due: formatCurrency(fullDue) });
    if (referenceRequired(method) && !reference.trim()) return t('Enter the cheque / bank reference');
    if (discountTotal > 0 && discountReason.trim().length < 3) return t('A discount needs a reason');
    return null;
  })();

  const submit = async () => {
    if (!dues || problem || collect.isPending) {
      if (problem) toast.error(problem);
      return;
    }
    const discountList = Object.entries(discountNums).filter(([id]) => selected.has(id)).map(([invoiceId, a]) => ({ invoiceId, amount: a }));
    try {
      const res = await collect.mutateAsync({
        studentId: dues.student.id,
        ...(typed !== null
          ? { amount: typed, invoiceIds: selectedRows.map((r) => r.id) }
          : { allocations: (allocation ?? []).filter((a) => a.amount > 0) }),
        method,
        reference: reference.trim() || undefined,
        notes: notes.trim() || undefined,
        ...(discountList.length ? { discounts: discountList, discountReason: discountReason.trim() } : {}),
      });
      setResult(res);
      toast.success(t('{amount} received', { amount: formatCurrency(res.total) }));
      if (res.payments[0]) setPrinting({ invoiceId: res.payments[0].invoiceId, paymentId: res.payments[0].paymentId });
    } catch (err: any) {
      toast.error(err?.response?.data?.message || t('Could not record the payment'));
    }
  };

  const list = hits ?? [];

  return (
    <div className="space-y-5">
      <PageHeader
        title={t('Collect fee')}
        description={t('Search a student, pick the months, take the payment and print the receipt.')}
        actions={
          <div className="rounded-xl border border-slate-200 dark:border-white/10 px-3 py-2 text-right" aria-live="polite">
            <p className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">{t('My collections today')}</p>
            <p className="text-lg font-bold tabular-nums text-slate-900 dark:text-white">{formatCurrency(today?.total ?? 0)}</p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">{t('{n} receipt(s)', { n: today?.count ?? 0 })}</p>
          </div>
        }
      />

      {!studentId && (
        <Card className="p-4 space-y-3">
          <Input
            ref={searchRef}
            autoFocus
            label={t('Find student')}
            placeholder={t('Name, student ID, roll, or guardian phone')}
            leftIcon={<Search className="w-4 h-4" />}
            value={query}
            onChange={(e) => { setQuery(e.target.value); setCursor(0); }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') { e.preventDefault(); setCursor((c) => Math.min(c + 1, list.length - 1)); }
              else if (e.key === 'ArrowUp') { e.preventDefault(); setCursor((c) => Math.max(c - 1, 0)); }
              else if (e.key === 'Enter' && list[cursor]) { e.preventDefault(); pick(list[cursor]); }
            }}
            aria-controls="counter-results"
            helperText={<span>{t('Tip')}: <Kbd>/</Kbd> {t('search')} · <Kbd>↑</Kbd><Kbd>↓</Kbd> <Kbd>Enter</Kbd> {t('pick')} · <Kbd>Ctrl</Kbd>+<Kbd>Enter</Kbd> {t('take payment')} · <Kbd>Esc</Kbd> {t('next student')}</span>}
          />
          {q.trim().length >= 2 && (
            <ul id="counter-results" role="listbox" aria-label={t('Students')} className="rounded-lg border border-slate-200 dark:border-white/10 divide-y divide-slate-100 dark:divide-white/5">
              {searching && list.length === 0 && <li className="p-3"><Skeleton className="h-8" /></li>}
              {!searching && list.length === 0 && <li className="p-3 text-sm text-slate-500">{t('No student found')}</li>}
              {list.map((s, i) => (
                <li key={s.id} role="option" aria-selected={i === cursor}>
                  <button
                    type="button"
                    onClick={() => pick(s)}
                    onMouseEnter={() => setCursor(i)}
                    className={`w-full text-left px-3 py-2.5 flex items-center justify-between gap-2 ${i === cursor ? 'bg-primary-50 dark:bg-primary-500/10' : ''}`}
                  >
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-slate-900 dark:text-white truncate">{s.name}</span>
                      <span className="block text-xs text-slate-500 dark:text-slate-400 truncate">
                        {s.studentId}{s.rollNumber ? ` · ${t('Roll')} ${s.rollNumber}` : ''} · {s.className ?? '—'}{s.sectionName ? ` (${s.sectionName})` : ''}
                        {s.matchedBy === 'GUARDIAN_PHONE' && s.guardianName ? ` · ${t('Guardian')}: ${s.guardianName}` : ''}
                        {s.status !== 'ACTIVE' ? ` · ${s.status}` : ''}
                      </span>
                    </span>
                    <span className={`text-sm font-semibold tabular-nums shrink-0 ${s.totalDue > 0 ? 'text-rose-700 dark:text-rose-300' : 'text-emerald-700 dark:text-emerald-300'}`}>
                      {formatCurrency(s.totalDue)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {studentId && (loadingDues || !dues) && <Skeleton className="h-64" />}

      {studentId && dues && (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
          <div className="lg:col-span-3 space-y-4">
            <Card className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-base font-semibold text-slate-900 dark:text-white">{dues.student.name}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {dues.student.studentId}{dues.student.rollNumber ? ` · ${t('Roll')} ${dues.student.rollNumber}` : ''} · {dues.student.className ?? '—'}{dues.student.sectionName ? ` (${dues.student.sectionName})` : ''}
                  </p>
                  {dues.student.guardianName && (
                    <p className="text-xs text-slate-500 dark:text-slate-400">{t('Guardian')}: {dues.student.guardianName}{dues.student.guardianPhone ? ` · ${dues.student.guardianPhone}` : ''}</p>
                  )}
                </div>
                <Button variant="ghost" size="sm" leftIcon={<X className="w-4 h-4" />} onClick={reset}>{t('Change')}</Button>
              </div>
              {dues.siblings.length > 0 && (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Users className="w-4 h-4 text-slate-500" aria-hidden />
                  <span className="text-xs text-slate-500">{t('Siblings')}:</span>
                  {dues.siblings.map((s) => (
                    <button key={s.id} type="button" onClick={() => pick(s)} className="rounded-full border border-slate-300 dark:border-white/15 px-2.5 py-1 text-xs text-slate-700 dark:text-slate-200 hover:border-primary-600">
                      {s.name} · <span className="tabular-nums">{formatCurrency(s.totalDue)}</span>
                    </button>
                  ))}
                </div>
              )}
            </Card>

            <Card className="p-0 overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-200 dark:border-white/8 flex items-center justify-between gap-2">
                <h2 className="text-sm font-semibold text-slate-900 dark:text-white">{t('Unpaid months')}</h2>
                <span className="text-sm font-semibold tabular-nums text-rose-700 dark:text-rose-300">{formatCurrency(dues.totalDue)}</span>
              </div>
              {invoices.length === 0 ? (
                <p className="p-4 text-sm text-emerald-700 dark:text-emerald-300">{t('All paid — nothing due.')}</p>
              ) : (
                <ul className="divide-y divide-slate-100 dark:divide-white/5">
                  {invoices.map((inv) => {
                    const alloc = allocById.get(inv.id);
                    return (
                      <li key={inv.id} className="px-4 py-3">
                        <label className="flex items-start gap-3 cursor-pointer">
                          <input
                            type="checkbox"
                            className="mt-1 w-4 h-4 accent-primary-600"
                            checked={selected.has(inv.id)}
                            onChange={(e) => setSelected((s) => { const n = new Set(s); if (e.target.checked) n.add(inv.id); else n.delete(inv.id); return n; })}
                          />
                          <span className="flex-1 min-w-0">
                            <span className="flex items-center justify-between gap-2">
                              <span className="text-sm font-medium text-slate-900 dark:text-white">{inv.period ? monthLabel(inv.period, lang) : inv.invoiceNo}</span>
                              <span className="text-sm font-semibold tabular-nums">{formatCurrency(inv.dueAmount)}</span>
                            </span>
                            <span className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
                              <span>
                                {inv.invoiceNo} · {t('Due')} {formatDate(inv.dueDate)}
                                {inv.fineTotal > 0 ? ` · ${t('incl. late fine')} ${formatCurrency(inv.fineTotal)}` : ''}
                              </span>
                              <span className="flex items-center gap-2">
                                {alloc !== undefined && selected.has(inv.id) && <Badge variant="primary">{t('Pay')} {formatCurrency(alloc)}</Badge>}
                                <StatusBadge status={inv.status} />
                              </span>
                            </span>
                          </span>
                        </label>
                        {discountOpen && selected.has(inv.id) && (
                          <div className="mt-2 pl-7">
                            <Input
                              aria-label={t('Discount for {month}', { month: inv.period ? monthLabel(inv.period, lang) : inv.invoiceNo })}
                              placeholder={t('Discount (৳)')}
                              inputMode="decimal"
                              value={discounts[inv.id] ?? ''}
                              onChange={(e) => setDiscounts({ ...discounts, [inv.id]: e.target.value })}
                              className="max-w-[10rem]"
                            />
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>
          </div>

          <div className="lg:col-span-2 space-y-4">
            {result ? (
              <Card className="p-4 space-y-3">
                <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">{t('Payment recorded')}: {formatCurrency(result.total)}</p>
                {result.discountTotal > 0 && <p className="text-xs text-slate-500">{t('Discount given')}: {formatCurrency(result.discountTotal)}</p>}
                <ul className="divide-y divide-slate-100 dark:divide-white/5">
                  {result.payments.map((p) => (
                    <li key={p.paymentId} className="py-2 flex items-center justify-between gap-2 text-sm">
                      <span className="min-w-0">
                        <span className="block font-medium tabular-nums">{formatCurrency(p.amount)}</span>
                        <span className="block text-xs text-slate-500">{p.receiptNo} · {p.invoiceNo}</span>
                      </span>
                      <Button size="sm" variant="secondary" leftIcon={<Printer className="w-3.5 h-3.5" />} onClick={() => setPrinting({ invoiceId: p.invoiceId, paymentId: p.paymentId })}>
                        {t('Print')}
                      </Button>
                    </li>
                  ))}
                </ul>
                <Button fullWidth onClick={reset}>{t('Next student')} <Kbd>Esc</Kbd></Button>
              </Card>
            ) : (
              <Card className="p-4 space-y-3">
                <div className="rounded-lg bg-slate-50 dark:bg-white/5 p-3 text-sm space-y-1">
                  <div className="flex justify-between"><span>{t('Selected dues')}</span><span className="tabular-nums">{formatCurrency(fullDue + discountTotal)}</span></div>
                  {discountTotal > 0 && <div className="flex justify-between"><span>{t('Discount')}</span><span className="tabular-nums">− {formatCurrency(discountTotal)}</span></div>}
                  <div className="flex justify-between font-semibold"><span>{t('To pay')}</span><span className="tabular-nums">{formatCurrency(fullDue)}</span></div>
                </div>
                <Input
                  label={t('Amount received (৳)')}
                  inputMode="decimal"
                  placeholder={formatCurrency(fullDue)}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  helperText={t('Leave empty to take the full selected amount. A smaller amount pays the oldest month first.')}
                />
                <Select label={t('Method')} value={method} onChange={(e) => setMethod(e.target.value)} options={COUNTER_METHODS.map((m) => ({ value: m, label: t(METHOD_LABELS[m]) }))} />
                {method !== 'CASH' && (
                  <Input label={referenceRequired(method) ? t('Reference (required)') : t('Reference / transaction ID')} value={reference} onChange={(e) => setReference(e.target.value)} />
                )}
                <Input label={t('Note (optional)')} value={notes} onChange={(e) => setNotes(e.target.value)} />
                {canDiscount && (
                  <div>
                    <button type="button" className="text-sm text-primary-700 dark:text-primary-300 hover:underline" onClick={() => setDiscountOpen((v) => !v)}>
                      {discountOpen ? t('Remove discount') : t('Give a discount')}
                    </button>
                    {discountOpen && (
                      <Textarea className="mt-2" rows={2} label={t('Discount reason')} value={discountReason} onChange={(e) => setDiscountReason(e.target.value)} required />
                    )}
                  </div>
                )}
                {problem && invoices.length > 0 && <p className="text-xs text-rose-700 dark:text-rose-300" role="status">{problem}</p>}
                <Button
                  fullWidth
                  size="lg"
                  leftIcon={<Wallet className="w-4 h-4" />}
                  disabled={!!problem || invoices.length === 0}
                  isLoading={collect.isPending}
                  onClick={submit}
                >
                  {t('Take {amount}', { amount: formatCurrency(payAmount > 0 ? payAmount : 0) })}
                </Button>
                <p className="text-[11px] text-center text-slate-500"><Kbd>Ctrl</Kbd>+<Kbd>Enter</Kbd></p>
              </Card>
            )}
            {dues.recentPayments.length > 0 && (
              <Card className="p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">{t('Recent receipts')}</p>
                <ul className="space-y-1.5 text-xs">
                  {dues.recentPayments.slice(0, 5).map((p) => (
                    <li key={p.id} className="flex justify-between gap-2">
                      <span className="truncate">{formatDate(p.paidAt)} · {p.receiptNo ?? p.invoiceNo} · {t(METHOD_LABELS[p.method] ?? p.method)}</span>
                      <span className={`tabular-nums ${p.status === 'REVERSED' ? 'line-through text-slate-400' : ''}`}>{formatCurrency(p.amount)}</span>
                    </li>
                  ))}
                </ul>
              </Card>
            )}
          </div>
        </div>
      )}

      <PrintReceiptModal invoice={printPayment ? printInvoice ?? null : null} payment={printPayment} onClose={() => setPrinting(null)} />
    </div>
  );
};

export default CollectFeePage;
