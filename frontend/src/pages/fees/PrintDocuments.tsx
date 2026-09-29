import React from 'react';
import { Modal } from '../../components/ui';
import { PrintLayout, SignatureLines } from '../../components/print/PrintLayout';
import { formatCurrency, formatDate } from '../../i18n';
import type { InvoiceDetail, Payment } from './types';

const METHOD_LABEL: Record<string, string> = {
  CASH: 'Cash',
  BANK_TRANSFER: 'Bank transfer',
  BKASH: 'bKash',
  NAGAD: 'Nagad',
  SSLCOMMERZ: 'SSLCommerz',
};

/** Print-only view of a full invoice (line items + totals + payment history). */
export const PrintInvoiceModal: React.FC<{ invoice: InvoiceDetail | null; onClose: () => void }> = ({ invoice, onClose }) => {
  if (!invoice) return null;
  const student = invoice.student;
  return (
    <Modal isOpen onClose={onClose} size="2xl">
      <PrintLayout
        title="Invoice"
        reference={`Invoice No. ${invoice.invoiceNo}`}
        date={invoice.createdAt}
        footer={<SignatureLines labels={['Prepared by', 'Authorized signature']} />}
      >
        <div className="grid grid-cols-2 gap-4 mb-6">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500">Billed to</p>
            <p className="font-semibold">{student ? `${student.firstName} ${student.lastName}` : '—'}</p>
            {student?.studentId && <p className="text-xs text-slate-600">Student ID: {student.studentId}</p>}
          </div>
          <div className="text-right">
            <p className="text-xs uppercase tracking-wide text-slate-500">Due date</p>
            <p className="font-semibold">{formatDate(invoice.dueDate)}</p>
          </div>
        </div>

        <table className="w-full text-sm border-collapse mb-4">
          <thead>
            <tr className="border-b-2 border-slate-900">
              <th className="text-left py-2">Description</th>
              <th className="text-right py-2">Amount</th>
              <th className="text-right py-2">Discount</th>
              <th className="text-right py-2">Net</th>
            </tr>
          </thead>
          <tbody>
            {invoice.items.map((item) => (
              <tr key={item.id} className="border-b border-slate-200">
                <td className="py-2">{item.description}</td>
                <td className="py-2 text-right">{formatCurrency(item.amount)}</td>
                <td className="py-2 text-right">{formatCurrency(item.discount)}</td>
                <td className="py-2 text-right font-medium">{formatCurrency(item.netAmount)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="flex justify-end mb-6">
          <div className="w-full sm:w-64 space-y-1.5 text-sm">
            <div className="flex justify-between"><span>Total</span><span className="font-semibold">{formatCurrency(invoice.totalAmount)}</span></div>
            <div className="flex justify-between"><span>Paid</span><span>{formatCurrency(invoice.paidAmount)}</span></div>
            <div className="flex justify-between border-t border-slate-300 pt-1.5"><span className="font-semibold">Due</span><span className="font-bold">{formatCurrency(invoice.dueAmount)}</span></div>
          </div>
        </div>

        {invoice.payments.length > 0 && (
          <div className="mb-2">
            <p className="text-xs uppercase tracking-wide text-slate-500 mb-2">Payment history</p>
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-slate-300">
                  <th className="text-left py-1.5">Date</th>
                  <th className="text-left py-1.5">Method</th>
                  <th className="text-right py-1.5">Amount</th>
                </tr>
              </thead>
              <tbody>
                {invoice.payments.map((p) => (
                  <tr key={p.id} className="border-b border-slate-100">
                    <td className="py-1.5">{formatDate(p.paidAt ?? p.createdAt ?? '')}</td>
                    <td className="py-1.5">{METHOD_LABEL[p.method] || p.method}{p.receiptNo ? ` · ${p.receiptNo}` : ''}</td>
                    <td className="py-1.5 text-right">{formatCurrency(p.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {invoice.notes && (
          <p className="mt-4 text-xs text-slate-600"><span className="font-semibold">Notes:</span> {invoice.notes}</p>
        )}
      </PrintLayout>
    </Modal>
  );
};

// Demo payments are created by the backend with a "DEMO MODE" note.
const isDemoPayment = (payment: Payment) => (payment.notes ?? '').startsWith('DEMO MODE');

/** Print-only receipt for a single payment against an invoice. */
export const PrintReceiptModal: React.FC<{ invoice: InvoiceDetail | null; payment: Payment | null; onClose: () => void }> = ({
  invoice,
  payment,
  onClose,
}) => {
  if (!invoice || !payment) return null;
  const student = invoice.student;
  return (
    <Modal isOpen onClose={onClose} size="lg">
      <PrintLayout
        title="Money Receipt"
        reference={payment.receiptNo ? `Receipt No. ${payment.receiptNo}` : `Invoice No. ${invoice.invoiceNo}`}
        date={payment.paidAt ?? payment.createdAt}
        size="a5"
      >
        <div className="space-y-3">
          {isDemoPayment(payment) && (
            <p className="rounded border border-amber-300 bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-800">
              DEMO MODE — simulated online payment, no money was charged.
            </p>
          )}
          {payment.receiptNo && (
            <div className="flex justify-between">
              <span className="text-slate-500">Invoice No.</span>
              <span>{invoice.invoiceNo}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-slate-500">Received from</span>
            <span className="font-semibold">{student ? `${student.firstName} ${student.lastName}` : '—'}</span>
          </div>
          {student?.studentId && (
            <div className="flex justify-between">
              <span className="text-slate-500">Student ID</span>
              <span>{student.studentId}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-slate-500">Method</span>
            <span>{METHOD_LABEL[payment.method] || payment.method}</span>
          </div>
          {payment.transactionRef && (
            <div className="flex justify-between">
              <span className="text-slate-500">Reference</span>
              <span>{payment.transactionRef}</span>
            </div>
          )}
          <div className="flex justify-between border-t border-slate-300 pt-2 mt-2">
            <span className="font-semibold">Amount received</span>
            <span className="font-bold text-base">{formatCurrency(payment.amount)}</span>
          </div>
          <div className="flex justify-between text-xs text-slate-500">
            <span>Remaining due on invoice</span>
            <span>{formatCurrency(invoice.dueAmount)}</span>
          </div>
          {payment.notes && <p className="text-xs text-slate-600 pt-2"><span className="font-semibold">Notes:</span> {payment.notes}</p>}
        </div>
        <div className="mt-8">
          <SignatureLines labels={['Received by', "Payer's signature"]} />
        </div>
      </PrintLayout>
    </Modal>
  );
};
