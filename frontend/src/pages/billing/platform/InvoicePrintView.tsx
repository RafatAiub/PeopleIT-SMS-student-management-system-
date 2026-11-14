import React from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Printer } from 'lucide-react';
import { platformBillingApi } from '@/api/platformBilling.api';
import { Alert, Button, Skeleton } from '@/components/ui';
import { formatCurrency, formatDate, useT } from '@/i18n';
import { periodLabel } from './platformBilling.logic';

/**
 * P1: HTML print view of one platform invoice (Bangla-capable, unlike the
 * Helvetica PDF). `admin` = the super-admin variant (any school's invoice).
 */
const InvoicePrintView: React.FC<{ admin?: boolean }> = ({ admin = false }) => {
  const t = useT();
  const { id = '' } = useParams();
  const { data: inv, isLoading, isError } = useQuery({
    queryKey: ['platform-invoice-print', admin, id],
    queryFn: () => (admin ? platformBillingApi.invoice(id) : platformBillingApi.myInvoice(id)),
  });

  if (isLoading) return <Skeleton className="h-96 max-w-3xl mx-auto rounded-2xl" />;
  if (isError || !inv) return <Alert tone="danger" title={t('Invoice not found')} />;
  const school = inv.institution;

  return (
    <div className="max-w-3xl mx-auto pb-12">
      <div className="flex items-center justify-between gap-2 mb-4 print:hidden">
        <Link to={admin ? '/super-admin/billing' : `/billing?invoice=${inv.id}`} className="text-sm font-semibold text-primary-700 dark:text-primary-300 hover:underline">
          ← {t('Back')}
        </Link>
        <Button leftIcon={<Printer className="w-4 h-4" />} onClick={() => window.print()}>
          {t('Print')}
        </Button>
      </div>
      <article className="bg-white text-slate-900 rounded-2xl border border-slate-200 p-6 sm:p-10 print:border-0 print:p-0 print:rounded-none">
        <header className="flex flex-col sm:flex-row sm:justify-between gap-4 border-b-2 border-slate-900 pb-4">
          <div>
            <p className="text-2xl font-extrabold">PeopleNIT</p>
            <p className="text-xs text-slate-600">{t('School management software')}</p>
          </div>
          <div className="sm:text-right">
            <p className="text-lg font-bold">{t('INVOICE')} / চালান</p>
            <p className="font-mono text-sm">{inv.invoiceNumber}</p>
          </div>
        </header>

        <section className="grid sm:grid-cols-2 gap-6 py-5 text-sm">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500">{t('Bill to')}</p>
            <p className="font-bold">{school?.name}</p>
            {school?.slug && <p>{t('School code')}: {school.slug}</p>}
            {school?.address && <p>{school.address}</p>}
            {(school?.contactPhone || school?.phone) && <p>{school?.contactPhone || school?.phone}</p>}
          </div>
          <dl className="grid grid-cols-2 gap-x-3 gap-y-1 sm:justify-self-end">
            <dt className="text-slate-500">{t('Billing month')}</dt>
            <dd className="font-semibold">{periodLabel(inv.period)}</dd>
            <dt className="text-slate-500">{t('Issue date')}</dt>
            <dd>{formatDate(inv.issueDate)}</dd>
            <dt className="text-slate-500">{t('Due date')}</dt>
            <dd className="font-semibold">{formatDate(inv.dueDate)}</dd>
            <dt className="text-slate-500">{t('Status')}</dt>
            <dd>{t(inv.status)}</dd>
          </dl>
        </section>

        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-100 text-left">
              <th scope="col" className="p-2">{t('Description')}</th>
              <th scope="col" className="p-2 text-right">{t('Qty')}</th>
              <th scope="col" className="p-2 text-right">{t('Unit price')}</th>
              <th scope="col" className="p-2 text-right">{t('Amount')}</th>
            </tr>
          </thead>
          <tbody>
            {inv.lines.map((l, i) => (
              <tr key={i} className="border-b border-slate-200">
                <td className="p-2">{l.description}</td>
                <td className="p-2 text-right tabular-nums">{l.quantity}</td>
                <td className="p-2 text-right tabular-nums">{formatCurrency(l.unitPrice)}</td>
                <td className="p-2 text-right tabular-nums">{formatCurrency(l.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <dl className="ml-auto mt-4 w-full sm:w-72 grid grid-cols-2 gap-y-1 text-sm">
          <dt>{t('Subtotal')}</dt>
          <dd className="text-right tabular-nums">{formatCurrency(inv.subtotal)}</dd>
          <dt>{t('Discounts')}</dt>
          <dd className="text-right tabular-nums">−{formatCurrency(inv.discount)}</dd>
          <dt className="font-bold">{t('Total')}</dt>
          <dd className="text-right tabular-nums font-bold">{formatCurrency(inv.total)}</dd>
          <dt>{t('Paid')}</dt>
          <dd className="text-right tabular-nums">{formatCurrency(inv.paidAmount)}</dd>
          {inv.waivedAmount > 0 && (
            <>
              <dt>{t('Waived')}</dt>
              <dd className="text-right tabular-nums">{formatCurrency(inv.waivedAmount)}</dd>
            </>
          )}
          <dt className="font-bold border-t border-slate-900 pt-1">{t('Amount due')}</dt>
          <dd className="text-right tabular-nums font-bold border-t border-slate-900 pt-1">{formatCurrency(inv.amountDue)}</dd>
        </dl>

        {inv.pricingModel === 'PER_STUDENT' && inv.studentCount !== null && (
          <p className="mt-6 text-xs text-slate-600">
            {t('{count} active students on the 1st × {rate} per student', { count: inv.studentCount, rate: formatCurrency(inv.rate ?? 0) })}
          </p>
        )}
        {inv.payments.length > 0 && (
          <section className="mt-6 text-xs text-slate-600">
            <p className="font-semibold text-slate-800">{t('Payments')}</p>
            <ul>
              {inv.payments.map((p) => (
                <li key={p.id}>
                  {p.receiptNumber} · {p.paidAt ? formatDate(p.paidAt) : ''} · {p.method.replace(/_/g, ' ')} · {formatCurrency(p.amount)}
                </li>
              ))}
            </ul>
          </section>
        )}
        <p className="mt-8 text-xs text-slate-500">{t('Pay online from the Billing page of your PeopleNIT account (bKash or SSLCommerz).')}</p>
      </article>
    </div>
  );
};

export default InvoicePrintView;
