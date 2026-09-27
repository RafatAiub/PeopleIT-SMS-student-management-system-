import React from 'react';
import { DollarSign, Printer, Receipt } from 'lucide-react';
import { Drawer, Button, Skeleton, SkeletonText, ErrorState, DescriptionList } from '../../components/ui';
import { StatusBadge } from '../../components/common/StatusBadge';
import { formatCurrency, formatDate } from '../../i18n';
import { useInvoiceDetail } from './hooks';
import type { InvoiceListItem, Payment } from './types';

const METHOD_LABEL: Record<string, string> = {
  CASH: 'Cash',
  BANK_TRANSFER: 'Bank transfer',
  BKASH: 'bKash',
  NAGAD: 'Nagad',
  SSLCOMMERZ: 'SSLCommerz',
};

interface InvoiceDetailDrawerProps {
  invoiceId: string | null;
  onClose: () => void;
  canRecordPayment: boolean;
  onRecordPayment: (invoice: InvoiceListItem) => void;
  onPrintInvoice: () => void;
  onPrintReceipt: (payment: Payment) => void;
}

export const InvoiceDetailDrawer: React.FC<InvoiceDetailDrawerProps> = ({
  invoiceId,
  onClose,
  canRecordPayment,
  onRecordPayment,
  onPrintInvoice,
  onPrintReceipt,
}) => {
  const { data: invoice, isLoading, isError, refetch } = useInvoiceDetail(invoiceId);

  return (
    <Drawer isOpen={!!invoiceId} onClose={onClose} title={invoice ? `Invoice ${invoice.invoiceNo}` : 'Invoice'} width="lg">
      {isLoading ? (
        <div className="space-y-4">
          <SkeletonText lines={3} />
          <Skeleton className="h-32" />
        </div>
      ) : isError ? (
        <ErrorState onRetry={() => refetch()} message="Failed to load invoice details." />
      ) : invoice ? (
        <div className="space-y-6">
          <div className="flex items-start justify-between gap-3">
            <DescriptionList
              columns={2}
              items={[
                { label: 'Student', value: invoice.student ? `${invoice.student.firstName} ${invoice.student.lastName}` : '—' },
                { label: 'Student ID', value: invoice.student?.studentId ?? '—' },
                { label: 'Issue date', value: formatDate(invoice.createdAt) },
                { label: 'Due date', value: formatDate(invoice.dueDate) },
              ]}
            />
            <StatusBadge status={invoice.status} />
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-2">Line items</p>
            <div className="rounded-lg border border-slate-200 dark:border-white/10 divide-y divide-slate-100 dark:divide-white/5">
              {invoice.items.map((item) => (
                <div key={item.id} className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm">
                  <div className="min-w-0">
                    <span className="text-slate-700 dark:text-slate-300 break-words">{item.description}</span>
                    {Number(item.discount) > 0 && (
                      <p className="text-xs text-emerald-600 dark:text-emerald-400">
                        {formatCurrency(item.amount)} − {formatCurrency(item.discount)} discount
                      </p>
                    )}
                  </div>
                  <span className="tabular-nums font-medium text-slate-900 dark:text-white shrink-0">{formatCurrency(item.netAmount)}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-lg bg-slate-50 dark:bg-white/5 p-4 space-y-1.5 text-sm">
            <div className="flex justify-between"><span className="text-slate-500 dark:text-slate-400">Total</span><span className="font-semibold tabular-nums">{formatCurrency(invoice.totalAmount)}</span></div>
            <div className="flex justify-between"><span className="text-slate-500 dark:text-slate-400">Paid</span><span className="tabular-nums">{formatCurrency(invoice.paidAmount)}</span></div>
            <div className="flex justify-between border-t border-slate-200 dark:border-white/10 pt-1.5"><span className="font-semibold text-slate-700 dark:text-slate-200">Due</span><span className="font-bold tabular-nums">{formatCurrency(invoice.dueAmount)}</span></div>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-2">Payment history</p>
            {invoice.payments.length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">No payments recorded yet.</p>
            ) : (
              <div className="rounded-lg border border-slate-200 dark:border-white/10 divide-y divide-slate-100 dark:divide-white/5">
                {invoice.payments.map((p) => (
                  <div key={p.id} className="flex items-center justify-between gap-2 px-3 py-2.5 text-sm">
                    <div className="min-w-0">
                      <p className="font-medium text-slate-900 dark:text-white tabular-nums">{formatCurrency(p.amount)}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {METHOD_LABEL[p.method] || p.method} &middot; {formatDate(p.paidAt ?? p.createdAt ?? '')}
                        {p.receiptNo ? ` · ${p.receiptNo}` : ''}
                        {p.transactionRef ? ` · Ref: ${p.transactionRef}` : ''}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      leftIcon={<Receipt className="w-3.5 h-3.5" />}
                      onClick={() => onPrintReceipt(p)}
                    >
                      Receipt
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {invoice.notes && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-1">Notes</p>
              <p className="text-sm text-slate-700 dark:text-slate-300">{invoice.notes}</p>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100 dark:border-white/5">
            <Button variant="secondary" size="sm" leftIcon={<Printer className="w-3.5 h-3.5" />} onClick={onPrintInvoice}>
              Print invoice
            </Button>
            {canRecordPayment && invoice.status !== 'PAID' && Number(invoice.dueAmount) > 0 && (
              <Button size="sm" leftIcon={<DollarSign className="w-3.5 h-3.5" />} onClick={() => onRecordPayment(invoice)}>
                Record payment
              </Button>
            )}
          </div>
        </div>
      ) : null}
    </Drawer>
  );
};
