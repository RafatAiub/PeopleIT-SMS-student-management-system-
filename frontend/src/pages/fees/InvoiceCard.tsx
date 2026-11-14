import React, { useState } from 'react';
import { ChevronDown, ChevronUp, CreditCard, Receipt } from 'lucide-react';
import { Card, Button, SkeletonText } from '../../components/ui';
import { StatusBadge } from '../../components/common/StatusBadge';
import { formatCurrency, formatDate, useLocale, useT } from '../../i18n';
import { monthLabel } from './studentFees/studentFees.logic';
import { useInvoiceDetail } from './hooks';
import type { InvoiceListItem, Payment } from './types';

const METHOD_LABEL: Record<string, string> = {
  CASH: 'Cash',
  BANK_TRANSFER: 'Bank transfer',
  BKASH: 'bKash',
  NAGAD: 'Nagad',
  SSLCOMMERZ: 'SSLCommerz',
};

interface InvoiceCardProps {
  invoice: InvoiceListItem;
  onPayOnline: (invoice: InvoiceListItem) => void;
  onPrintReceipt: (payment: Payment) => void;
}

export const InvoiceCard: React.FC<InvoiceCardProps> = ({ invoice, onPayOnline, onPrintReceipt }) => {
  const [expanded, setExpanded] = useState(false);
  const { data: detail, isLoading } = useInvoiceDetail(expanded ? invoice.id : null);
  const dueAmount = Number(invoice.dueAmount);
  const t = useT();
  const { lang } = useLocale();
  const month = invoice.feePeriod?.period ? monthLabel(invoice.feePeriod.period, lang) : null;

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold text-slate-900 dark:text-white truncate">{month ?? invoice.invoiceNo}</p>
          {month && <p className="text-xs text-slate-500 dark:text-slate-400">{invoice.invoiceNo}</p>}
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Due {formatDate(invoice.dueDate)}</p>
        </div>
        <StatusBadge status={invoice.status} />
      </div>

      <div className="flex items-end justify-between">
        <div>
          <p className="text-xs text-slate-500 dark:text-slate-400">Total</p>
          <p className="text-base font-semibold text-slate-900 dark:text-white tabular-nums">{formatCurrency(invoice.totalAmount)}</p>
        </div>
        {dueAmount > 0 && (
          <div className="text-right">
            <p className="text-xs text-rose-500 dark:text-rose-400">Due</p>
            <p className="text-base font-semibold text-rose-600 dark:text-rose-400 tabular-nums">{formatCurrency(dueAmount)}</p>
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 pt-1">
        {invoice.status !== 'PAID' && invoice.status !== 'CANCELLED' && (
          <Button size="sm" leftIcon={<CreditCard className="w-3.5 h-3.5" />} onClick={() => onPayOnline(invoice)}>
            Pay online
          </Button>
        )}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          rightIcon={expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          onClick={() => setExpanded((v) => !v)}
        >
          Payment history
        </Button>
      </div>

      {expanded && (
        <div className="pt-2 border-t border-slate-100 dark:border-white/5">
          {isLoading ? (
            <SkeletonText lines={2} />
          ) : !detail ? null : (
            <div className="space-y-2">
              <ul className="space-y-1 pb-2 border-b border-slate-100 dark:border-white/5">
                {detail.items.map((it) => (
                  <li key={it.id} className="flex justify-between gap-2 text-xs text-slate-600 dark:text-slate-300">
                    <span className="min-w-0 break-words">{it.description}</span>
                    <span className="tabular-nums shrink-0">{formatCurrency(it.netAmount)}</span>
                  </li>
                ))}
              </ul>
              {detail.payments.length === 0 && <p className="text-xs text-slate-500 dark:text-slate-400">No payments recorded yet.</p>}
              {detail.payments.map((p) => (
                <div key={p.id} className="flex items-center justify-between gap-2 text-sm">
                  <div className="min-w-0">
                    <p className={`font-medium tabular-nums ${p.status === 'REVERSED' ? 'line-through text-slate-400' : 'text-slate-900 dark:text-white'}`}>{formatCurrency(p.amount)}</p>
                    {p.status === 'REVERSED' && <p className="text-xs font-semibold text-rose-700 dark:text-rose-300">{t('Reversed')}</p>}
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {METHOD_LABEL[p.method] || p.method} &middot; {formatDate(p.paidAt ?? p.createdAt ?? "")}{p.receiptNo ? ` · ${p.receiptNo}` : ""}
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
      )}
    </Card>
  );
};
