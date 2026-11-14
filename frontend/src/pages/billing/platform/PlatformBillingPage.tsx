import React, { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { CheckCircle2, Download, FileText, Printer, Receipt, XCircle, Clock } from 'lucide-react';
import { platformBillingApi, type OnlineGateway, type PlatformInvoice } from '@/api/platformBilling.api';
import { PLATFORM_INVOICES_KEY, PLATFORM_PAYMENTS_KEY, PLATFORM_STATUS_KEY, useMyPlatformInvoices, useMyPlatformPayments, usePlatformBillingStatus } from '@/hooks/usePlatformBilling';
import { Alert, Badge, Button, Card, PageHeader, Skeleton } from '@/components/ui';
import { formatCurrency, formatDate, useT } from '@/i18n';
import { computationText, invoiceStatusVariant, periodLabel, sumTaka } from './platformBilling.logic';

const UNPAID = ['DUE', 'PARTIAL', 'OVERDUE'];

/**
 * P1: the school ADMIN's Billing page for PeopleNIT's monthly bill.
 * Current bill (big amount + due date + pay buttons), how it was computed,
 * history with PDFs and print view, and receipts.
 */
const PlatformBillingPage: React.FC = () => {
  const t = useT();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const { data: status } = usePlatformBillingStatus();
  const { data: invoices, isLoading } = useMyPlatformInvoices();
  const { data: payments } = useMyPlatformPayments();
  const { data: gateways } = useQuery({ queryKey: ['platform-billing-gateways'], queryFn: platformBillingApi.gateways });
  const [busy, setBusy] = useState<string | null>(null);

  const unpaid = useMemo(() => (invoices ?? []).filter((i) => UNPAID.includes(i.status) && i.amountDue > 0), [invoices]);
  const selectedId = params.get('invoice');
  const selected: PlatformInvoice | undefined =
    (invoices ?? []).find((i) => i.id === selectedId) ?? unpaid[unpaid.length - 1] ?? (invoices ?? [])[0];
  const totalDue = sumTaka(unpaid.map((i) => i.amountDue));
  const paymentResult = params.get('payment');

  const pay = async (gateway: OnlineGateway, payAll: boolean) => {
    if (!selected && !payAll) return;
    setBusy(`${gateway}:${payAll ? 'all' : 'one'}`);
    try {
      const r = await platformBillingApi.checkout(payAll ? { gateway, payAll: true } : { gateway, invoiceId: selected!.id });
      if (r.demo && r.checkoutPath) {
        toast(r.message, { icon: 'ℹ️' });
        navigate(r.checkoutPath);
      } else {
        window.location.href = r.paymentUrl;
      }
    } catch (err: any) {
      toast.error(err?.response?.data?.message || t('Could not start the payment. Please try again.'));
    } finally {
      setBusy(null);
    }
  };

  const clearResult = () => {
    params.delete('payment');
    params.delete('pid');
    setParams(params, { replace: true });
    qc.invalidateQueries({ queryKey: [PLATFORM_STATUS_KEY] });
    qc.invalidateQueries({ queryKey: [PLATFORM_INVOICES_KEY] });
    qc.invalidateQueries({ queryKey: [PLATFORM_PAYMENTS_KEY] });
  };

  const available = (gateways ?? []).filter((g) => g.available);
  const canPaySelected = !!selected && UNPAID.includes(selected.status) && selected.amountDue > 0;

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-12">
      <PageHeader title={t('Billing')} description={t('Your monthly PeopleNIT bill, payments and receipts.')} />

      {paymentResult && (
        <Alert
          tone={paymentResult === 'success' ? 'success' : paymentResult === 'pending' ? 'info' : 'danger'}
          title={
            paymentResult === 'success'
              ? t('Payment received — thank you!')
              : paymentResult === 'pending'
                ? t('Payment is being confirmed')
                : paymentResult === 'cancelled'
                  ? t('Payment cancelled')
                  : t('Payment failed')
          }
          action={
            <Button variant="ghost" size="sm" onClick={clearResult}>
              {t('Dismiss')}
            </Button>
          }
        >
          {paymentResult === 'success'
            ? t('Your receipt is below. A confirmation was sent by SMS and email.')
            : paymentResult === 'pending'
              ? t('We are waiting for the payment gateway. Refresh in a minute.')
              : t('No money was taken. You can try again.')}
        </Alert>
      )}

      {status?.accessLevel === 'RESTRICTED' && status.reason === 'PLATFORM_BILLING' && (
        <Alert tone="danger" title={t('Payment overdue — pay now')}>
          {t('Your school account is read-only until the bill is paid. Paying unlocks it automatically.')}
        </Alert>
      )}
      {status?.accessLevel === 'DISABLED' && (
        <Alert tone="danger" title={t('Account disabled — pay to reactivate')}>
          {t('Pay the bill below and the account is switched back on automatically.')}
        </Alert>
      )}

      {isLoading ? (
        <Skeleton className="h-48 rounded-2xl" />
      ) : !selected ? (
        <Card className="p-6 text-center text-slate-600 dark:text-slate-300">{t('No bills yet. Your first monthly bill will appear here.')}</Card>
      ) : (
        <Card className="p-5 sm:p-6">
          <div className="flex flex-col lg:flex-row lg:items-start gap-6">
            <div className="flex-1 min-w-0 space-y-2">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base font-bold text-slate-900 dark:text-white">{t('Bill for {month}', { month: periodLabel(selected.period) })}</h2>
                <Badge variant={invoiceStatusVariant(selected.status)}>{t(selected.status)}</Badge>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-mono">{selected.invoiceNumber}</p>
              <p className="text-4xl font-extrabold tracking-tight text-slate-900 dark:text-white" aria-label={t('Amount due')}>
                {formatCurrency(canPaySelected ? selected.amountDue : selected.total)}
              </p>
              <p className="text-sm text-slate-600 dark:text-slate-300">
                {canPaySelected ? (
                  selected.daysOverdue > 0 ? (
                    <span className="text-rose-700 dark:text-rose-300 font-semibold">
                      {t('Overdue by {n} days (was due {date})', { n: selected.daysOverdue, date: formatDate(selected.dueDate) })}
                    </span>
                  ) : (
                    t('Due by {date}', { date: formatDate(selected.dueDate) })
                  )
                ) : selected.status === 'PAID' ? (
                  t('Paid — thank you')
                ) : (
                  selected.statusReason ?? t(selected.status)
                )}
              </p>
            </div>

            {canPaySelected && (
              <div className="w-full lg:w-72 space-y-2">
                {available.length === 0 && <p className="text-sm text-slate-600 dark:text-slate-300">{t('Online payment is not available yet — please contact PeopleNIT.')}</p>}
                {available.map((g) => (
                  <Button key={g.gateway} fullWidth size="lg" isLoading={busy === `${g.gateway}:one`} disabled={!!busy} onClick={() => pay(g.gateway, false)}>
                    {g.gateway === 'BKASH' ? t('Pay with bKash') : t('Pay with card / mobile banking (SSLCommerz)')}
                  </Button>
                ))}
                {available.some((g) => g.demo) && <p className="text-xs text-amber-700 dark:text-amber-300">{t('Demo mode — no real money will be charged.')}</p>}
                {unpaid.length > 1 && available.length > 0 && (
                  <div className="pt-2 border-t border-slate-200 dark:border-slate-800 space-y-2">
                    <p className="text-xs text-slate-600 dark:text-slate-300">{t('{n} unpaid bills, {amount} in total', { n: unpaid.length, amount: formatCurrency(totalDue) })}</p>
                    {available.map((g) => (
                      <Button key={g.gateway} fullWidth variant="secondary" isLoading={busy === `${g.gateway}:all`} disabled={!!busy} onClick={() => pay(g.gateway, true)}>
                        {t('Pay all with {gateway}', { gateway: g.label })}
                      </Button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="mt-6">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-2">{t('How this amount was calculated')}</h3>
            {computationText(selected, (n) => formatCurrency(n)) && (
              <p className="text-sm text-slate-600 dark:text-slate-300 mb-3">
                {selected.pricingModel === 'PER_STUDENT'
                  ? t('{count} active students on the 1st × {rate} per student', { count: selected.studentCount ?? 0, rate: formatCurrency(selected.rate ?? 0) })
                  : t('Fixed monthly fee of {amount}', { amount: formatCurrency(selected.rate ?? 0) })}
              </p>
            )}
            <div className="overflow-x-auto -mx-1">
              <table className="w-full text-sm">
                <caption className="sr-only">{t('Bill lines')}</caption>
                <thead>
                  <tr className="text-left text-xs text-slate-500 dark:text-slate-400">
                    <th scope="col" className="py-2 px-1 font-semibold">{t('Description')}</th>
                    <th scope="col" className="py-2 px-1 font-semibold text-right">{t('Qty')}</th>
                    <th scope="col" className="py-2 px-1 font-semibold text-right">{t('Amount')}</th>
                  </tr>
                </thead>
                <tbody>
                  {selected.lines.map((l, i) => (
                    <tr key={i} className="border-t border-slate-100 dark:border-slate-800">
                      <td className="py-2 px-1 text-slate-800 dark:text-slate-200">{l.description}</td>
                      <td className="py-2 px-1 text-right tabular-nums">{l.quantity}</td>
                      <td className={`py-2 px-1 text-right tabular-nums ${l.amount < 0 ? 'text-emerald-700 dark:text-emerald-400' : ''}`}>{formatCurrency(l.amount)}</td>
                    </tr>
                  ))}
                  <tr className="border-t-2 border-slate-200 dark:border-slate-700 font-bold">
                    <td className="py-2 px-1" colSpan={2}>{t('Total')}</td>
                    <td className="py-2 px-1 text-right tabular-nums">{formatCurrency(selected.total)}</td>
                  </tr>
                  {selected.paidAmount > 0 && (
                    <tr>
                      <td className="py-1 px-1 text-slate-600 dark:text-slate-300" colSpan={2}>{t('Paid')}</td>
                      <td className="py-1 px-1 text-right tabular-nums">{formatCurrency(selected.paidAmount)}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="flex flex-wrap gap-2 mt-4">
              <Button variant="secondary" size="sm" leftIcon={<Download className="w-4 h-4" />} onClick={() => platformBillingApi.downloadMyInvoicePdf(selected.id, selected.invoiceNumber).catch(() => toast.error(t('Download failed')))}>
                {t('Download PDF')}
              </Button>
              <Link to={`/billing/invoices/${selected.id}/print`} className="inline-flex items-center gap-1.5 min-h-8 px-3 text-xs rounded-lg border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 font-semibold">
                <Printer className="w-4 h-4" aria-hidden="true" />
                {t('Print')}
              </Link>
            </div>
          </div>
        </Card>
      )}

      <Card className="p-5 sm:p-6">
        <h2 className="text-base font-bold text-slate-900 dark:text-white mb-3 flex items-center gap-2">
          <FileText className="w-4 h-4" aria-hidden="true" /> {t('Bill history')}
        </h2>
        {(invoices ?? []).length === 0 ? (
          <p className="text-sm text-slate-500">{t('No bills yet.')}</p>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {(invoices ?? []).map((inv) => (
              <li key={inv.id} className="py-3 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
                <button
                  type="button"
                  className="flex-1 min-w-0 text-left rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-600"
                  onClick={() => {
                    params.set('invoice', inv.id);
                    setParams(params, { replace: true });
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                >
                  <span className="font-semibold text-slate-900 dark:text-white">{periodLabel(inv.period)}</span>
                  <span className="block text-xs text-slate-500 font-mono">{inv.invoiceNumber}</span>
                </button>
                <span className="tabular-nums text-sm">{formatCurrency(inv.total)}</span>
                <Badge variant={invoiceStatusVariant(inv.status)}>{t(inv.status)}</Badge>
                <Button variant="ghost" size="sm" aria-label={t('Download PDF for {n}', { n: inv.invoiceNumber })} onClick={() => platformBillingApi.downloadMyInvoicePdf(inv.id, inv.invoiceNumber).catch(() => toast.error(t('Download failed')))}>
                  <Download className="w-4 h-4" aria-hidden="true" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="p-5 sm:p-6">
        <h2 className="text-base font-bold text-slate-900 dark:text-white mb-3 flex items-center gap-2">
          <Receipt className="w-4 h-4" aria-hidden="true" /> {t('Receipts')}
        </h2>
        {(payments ?? []).length === 0 ? (
          <p className="text-sm text-slate-500">{t('No payments yet.')}</p>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {(payments ?? []).map((p) => (
              <li key={p.id} className="py-3 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
                <div className="flex-1 min-w-0">
                  <span className="font-semibold text-slate-900 dark:text-white font-mono">{p.receiptNumber}</span>
                  <span className="block text-xs text-slate-500">
                    {p.paidAt ? formatDate(p.paidAt) : ''} · {p.method.replace(/_/g, ' ')}
                    {p.isDemo ? ` · ${t('demo')}` : ''} · {p.invoices.map((i) => periodLabel(i.period)).join(', ')}
                  </span>
                </div>
                <span className="tabular-nums text-sm font-semibold">{formatCurrency(p.amount)}</span>
                <Button variant="secondary" size="sm" leftIcon={<Download className="w-4 h-4" />} onClick={() => platformBillingApi.downloadMyReceiptPdf(p.id, p.receiptNumber).catch(() => toast.error(t('Download failed')))}>
                  {t('Receipt')}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
};

/** Small status icon used by the demo checkout result. */
export const ResultIcon: React.FC<{ status: string }> = ({ status }) =>
  status === 'SUCCESS' ? (
    <CheckCircle2 className="w-10 h-10 text-emerald-600" aria-hidden="true" />
  ) : status === 'FAILED' || status === 'CANCELLED' ? (
    <XCircle className="w-10 h-10 text-rose-600" aria-hidden="true" />
  ) : (
    <Clock className="w-10 h-10 text-slate-500" aria-hidden="true" />
  );

export default PlatformBillingPage;
