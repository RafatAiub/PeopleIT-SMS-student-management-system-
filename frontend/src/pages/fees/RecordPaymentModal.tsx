import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Modal, Button, Input, Select } from '../../components/ui';
import { formatCurrency } from '../../i18n';
import { useRecordOfflinePayment } from './hooks';
import type { InvoiceDetail, InvoiceListItem, PaymentMethod } from './types';

// Offline recording only — CASH / BANK_TRANSFER — matches
// RecordPaymentSchema.method used by POST /fees/invoices/:id/payments/offline.
// BKASH/NAGAD/SSLCOMMERZ go through the online (gateway) flow instead, which
// staff cannot trigger on a family's behalf.
const OFFLINE_METHODS: { value: PaymentMethod; label: string }[] = [
  { value: 'CASH', label: 'Cash' },
  { value: 'BANK_TRANSFER', label: 'Bank transfer' },
];

interface RecordPaymentModalProps {
  invoice: InvoiceListItem | InvoiceDetail | null;
  onClose: () => void;
}

export const RecordPaymentModal: React.FC<RecordPaymentModalProps> = ({ invoice, onClose }) => {
  const recordPayment = useRecordOfflinePayment();
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('CASH');
  const [transactionRef, setTransactionRef] = useState('');
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (invoice) {
      setAmount(String(Number(invoice.dueAmount)));
      setMethod('CASH');
      setTransactionRef('');
      setNotes('');
      setErrors({});
    }
  }, [invoice]);

  if (!invoice) return null;

  const dueAmount = Number(invoice.dueAmount);
  const alreadyPaid = dueAmount <= 0 || invoice.status === 'PAID';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const next: Record<string, string> = {};
    const numeric = Number(amount);
    if (!amount || Number.isNaN(numeric) || numeric <= 0) next.amount = 'Amount must be greater than ৳ 0';
    else if (numeric > dueAmount) next.amount = `Amount cannot exceed the due amount of ${formatCurrency(dueAmount)}`;
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    try {
      await recordPayment.mutateAsync({
        invoiceId: invoice.id,
        amount: numeric,
        method,
        transactionRef: transactionRef || undefined,
        notes: notes || undefined,
      });
      toast.success('Payment recorded successfully');
      onClose();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to record payment');
    }
  };

  return (
    <Modal isOpen onClose={onClose} title="Record offline payment" size="sm">
      <div className="mb-4">
        <p className="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wider font-semibold">Invoice</p>
        <p className="text-sm font-medium text-slate-900 dark:text-white mt-1">
          {invoice.invoiceNo} {invoice.student && <>&middot; {invoice.student.firstName} {invoice.student.lastName}</>}
        </p>
      </div>

      {alreadyPaid ? (
        <div className="space-y-4">
          <div className="rounded-xl border border-emerald-200 dark:border-emerald-500/20 bg-emerald-50 dark:bg-emerald-500/10 px-4 py-3 text-sm font-medium text-emerald-700 dark:text-emerald-400">
            This invoice is already fully paid. There is no due amount left to collect.
          </div>
          <div className="flex justify-end">
            <Button type="button" variant="secondary" onClick={onClose}>Close</Button>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          <Input
            label="Payment amount (৳)"
            type="number"
            required
            min={0.01}
            max={dueAmount}
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            error={errors.amount}
            helperText={`Must be greater than ৳ 0 and no more than the due amount of ${formatCurrency(dueAmount)}.`}
          />
          <Select
            label="Method"
            value={method}
            onChange={(e) => setMethod(e.target.value as PaymentMethod)}
            options={OFFLINE_METHODS}
          />
          <Input
            label="Reference / transaction no. (optional)"
            value={transactionRef}
            onChange={(e) => setTransactionRef(e.target.value)}
          />
          <Input
            label="Notes (optional)"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-white/5">
            <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
            <Button type="submit" isLoading={recordPayment.isPending}>Record payment</Button>
          </div>
        </form>
      )}
    </Modal>
  );
};
