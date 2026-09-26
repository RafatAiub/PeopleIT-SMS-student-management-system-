import React, { useState } from 'react';
import { ChevronDown, ChevronUp, CreditCard, Receipt } from 'lucide-react';
import { Card, Button, SkeletonText } from '../../components/ui';
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

interface InvoiceCardProps {
  invoice: InvoiceListItem;
  onPayOnline: (invoice: InvoiceListItem) => void;
  onPrintReceipt: (payment: Payment) => void;
}

export const InvoiceCard: React.FC<InvoiceCardProps> = ({ invoice, onPayOnline, onPrintReceipt }) => {
  const [expanded, setExpanded] = useState(false);
  const { data: detail, isLoading } = useInvoiceDetail(expanded ? invoice.id : null);
  const dueAmount = Number(invoice.dueAmount);

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold text-slate-900 dark:text-white truncate">{invoice.invoiceNo}</p>
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
        {invoice.status !== 'PAID' && (
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
          ) : !detail || detail.payments.length === 0 ? (
            <p className="text-xs text-slate-500 dark:text-slate-400">No payments recorded yet.</p>
          ) : (
            <div className="space-y-2">
              {detail.payments.map((p) => (
                <div key={p.id} className="flex items-center justify-between gap-2 text-sm">
                  <div className="min-w-0">
                    <p className="font-medium text-slate-900 dark:text-white tabular-nums">{formatCurrency(p.amount)}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {METHOD_LABEL[p.method] || p.method} &middot; {formatDate(p.createdAt)}
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
