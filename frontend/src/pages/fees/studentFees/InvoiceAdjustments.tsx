import React, { useState } from 'react';
import toast from 'react-hot-toast';
import { Ban, RotateCcw, Undo2 } from 'lucide-react';
import { Alert, Button, Checkbox, Input, Modal, Select, Textarea } from '../../../components/ui';
import { formatCurrency, formatDate, useT } from '../../../i18n';
import { useAuthStore } from '../../../store/authStore';
import type { InvoiceDetail, Payment } from '../types';
import { useCancelInvoice, useInvoiceHistory, useRecordRefund, useRefundInfo, useReversePayment, useWaiveFine } from './studentFees.api';
import { invoiceActions, METHOD_LABELS, parseAmount } from './studentFees.logic';

const REFUND_METHODS = ['CASH', 'BANK', 'BKASH_PERSONAL', 'NAGAD_PERSONAL', 'CHEQUE', 'GATEWAY', 'OTHER'];

/**
 * Staff-only money actions inside the invoice drawer: cancel the invoice,
 * reverse / refund a payment, waive a late fine, and the adjustment history.
 */
export const InvoiceAdjustments: React.FC<{ invoice: InvoiceDetail; onCancelled?: () => void }> = ({ invoice, onCancelled }) => {
  const t = useT();
  const role = useAuthStore((s) => s.user?.role);
  const can = invoiceActions(role, invoice);
  const staff = can.refund;
  const { data: history } = useInvoiceHistory(invoice.id, staff);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reverseOf, setReverseOf] = useState<Payment | null>(null);
  const [refundOf, setRefundOf] = useState<Payment | null>(null);
  const [waiveId, setWaiveId] = useState<string | null>(null);
  if (!staff) return null;

  const fines = (invoice.fines ?? []).filter((f) => f.fineKey !== 'STOP');
  const stopped = (invoice.fines ?? []).some((f) => f.fineKey === 'STOP');
  const reasonLabel: Record<string, string> = {
    CANCEL: t('Cancelled'),
    COUNTER_DISCOUNT: t('Counter discount'),
    FINE_WAIVER: t('Fine waived'),
    CARRIED_FORWARD: t('Carried forward'),
  };

  return (
    <div className="space-y-4">
      {fines.length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-2">{t('Late fines')}</p>
          <ul className="rounded-lg border border-slate-200 dark:border-white/10 divide-y divide-slate-100 dark:divide-white/5">
            {fines.map((f) => {
              const open = Number(f.amount) - Number(f.waivedAmount);
              return (
                <li key={f.id} className="px-3 py-2 flex items-center justify-between gap-2 text-sm">
                  <span>
                    {formatCurrency(f.amount)}
                    {Number(f.waivedAmount) > 0 && <span className="text-xs text-emerald-700 dark:text-emerald-300"> · {t('waived')} {formatCurrency(f.waivedAmount)}{f.waiveReason ? ` (${f.waiveReason})` : ''}</span>}
                  </span>
                  {can.waive && open > 0 && Number(invoice.dueAmount) > 0 && (
                    <Button size="xs" variant="ghost" onClick={() => setWaiveId(f.id)}>{t('Waive')}</Button>
                  )}
                </li>
              );
            })}
          </ul>
          {stopped && <p className="text-xs text-slate-500 mt-1">{t('Future fines are switched off for this invoice.')}</p>}
        </div>
      )}

      {invoice.payments.length > 0 && (can.reverse || can.refund) && (
        <div className="flex flex-wrap gap-2">
          {invoice.payments.map((p) => (
            <div key={p.id} className="flex gap-1">
              {can.reverse && p.status === 'COMPLETED' && (
                <Button size="xs" variant="danger-soft" leftIcon={<RotateCcw className="w-3 h-3" />} onClick={() => setReverseOf(p)}>
                  {t('Reverse')} {formatCurrency(p.amount)}
                </Button>
              )}
              {(p.status === 'REVERSED' || /\[OVERPAYMENT /.test(p.notes ?? '')) && (
                <Button size="xs" variant="secondary" leftIcon={<Undo2 className="w-3 h-3" />} onClick={() => setRefundOf(p)}>
                  {t('Refund')} {p.receiptNo ?? ''}
                </Button>
              )}
            </div>
          ))}
        </div>
      )}

      {history && (history.adjustments.length > 0 || history.refunds.length > 0 || history.reversals.length > 0) && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-2">{t('Adjustments')}</p>
          <ul className="text-xs space-y-1 text-slate-600 dark:text-slate-300">
            {history.adjustments.map((a) => (
              <li key={a.id}>{formatDate(a.createdAt)} · {reasonLabel[a.kind] ?? a.kind} {Number(a.amount) > 0 ? formatCurrency(a.amount) : ''} · {a.reason}</li>
            ))}
            {history.reversals.map((r) => (
              <li key={r.id}>{formatDate(r.createdAt)} · {t('Payment reversed')} {formatCurrency(r.amount)} · {r.reason}</li>
            ))}
            {history.refunds.map((r) => (
              <li key={r.id}>{formatDate(r.createdAt)} · {t('Refunded')} {formatCurrency(r.amount)} ({t(METHOD_LABELS[r.method] ?? r.method)}{r.reference ? ` · ${r.reference}` : ''}) · {r.reason}</li>
            ))}
          </ul>
        </div>
      )}

      {can.cancel && (
        <Button variant="secondary" size="sm" leftIcon={<Ban className="w-3.5 h-3.5" />} onClick={() => setCancelOpen(true)}>{t('Cancel invoice')}</Button>
      )}

      {cancelOpen && <CancelModal invoice={invoice} onClose={() => setCancelOpen(false)} onDone={onCancelled} />}
      {reverseOf && <ReverseModal payment={reverseOf} onClose={() => setReverseOf(null)} />}
      {refundOf && <RefundModal payment={refundOf} onClose={() => setRefundOf(null)} />}
      {waiveId && <WaiveModal invoiceId={invoice.id} fineId={waiveId} onClose={() => setWaiveId(null)} />}
    </div>
  );
};

function ReasonModal(props: {
  title: string;
  body?: React.ReactNode;
  confirm: string;
  danger?: boolean;
  pending: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void;
  extra?: React.ReactNode;
}) {
  const t = useT();
  const [reason, setReason] = useState('');
  const [err, setErr] = useState<string | undefined>();
  return (
    <Modal
      isOpen
      onClose={props.onClose}
      title={props.title}
      size="sm"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={props.onClose}>{t('Back')}</Button>
          <Button
            variant={props.danger ? 'danger' : 'primary'}
            isLoading={props.pending}
            onClick={() => (reason.trim().length < 3 ? setErr(t('Please give a reason')) : props.onConfirm(reason.trim()))}
          >
            {props.confirm}
          </Button>
        </div>
      }
    >
      <div className="space-y-3">
        {props.body}
        {props.extra}
        <Textarea label={t('Reason')} rows={2} value={reason} onChange={(e) => setReason(e.target.value)} error={err} required />
      </div>
    </Modal>
  );
}

const CancelModal: React.FC<{ invoice: InvoiceDetail; onClose: () => void; onDone?: () => void }> = ({ invoice, onClose, onDone }) => {
  const t = useT();
  const m = useCancelInvoice();
  return (
    <ReasonModal
      title={t('Cancel invoice {no}?', { no: invoice.invoiceNo })}
      body={<p className="text-sm text-slate-600 dark:text-slate-300">{t('The invoice is kept with status Cancelled and nothing is due on it. A cancelled monthly invoice can be generated again.')}</p>}
      confirm={t('Cancel invoice')}
      danger
      pending={m.isPending}
      onClose={onClose}
      onConfirm={(reason) =>
        m.mutate({ invoiceId: invoice.id, reason }, {
          onSuccess: () => { toast.success(t('Invoice cancelled')); onClose(); onDone?.(); },
          onError: (e: any) => toast.error(e?.response?.data?.message || t('Could not cancel')),
        })
      }
    />
  );
};

const ReverseModal: React.FC<{ payment: Payment; onClose: () => void }> = ({ payment, onClose }) => {
  const t = useT();
  const m = useReversePayment();
  const online = ['BKASH', 'NAGAD', 'SSLCOMMERZ'].includes(payment.method);
  return (
    <ReasonModal
      title={t('Reverse payment {no}?', { no: payment.receiptNo ?? '' })}
      body={
        <>
          <p className="text-sm text-slate-600 dark:text-slate-300">{t('{amount} comes off the invoice and the receipt is marked REVERSED. Record the refund separately if money is handed back.', { amount: formatCurrency(payment.amount) })}</p>
          {online && <Alert tone="warning">{t('This was an online payment. Refund it in the gateway merchant panel; here it is only recorded.')}</Alert>}
        </>
      }
      confirm={t('Reverse')}
      danger
      pending={m.isPending}
      onClose={onClose}
      onConfirm={(reason) =>
        m.mutate({ paymentId: payment.id, reason }, {
          onSuccess: () => { toast.success(t('Payment reversed')); onClose(); },
          onError: (e: any) => toast.error(e?.response?.data?.message || t('Could not reverse')),
        })
      }
    />
  );
};

const RefundModal: React.FC<{ payment: Payment; onClose: () => void }> = ({ payment, onClose }) => {
  const t = useT();
  const { data: info } = useRefundInfo(payment.id);
  const m = useRecordRefund();
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('CASH');
  const [reference, setReference] = useState('');
  return (
    <ReasonModal
      title={t('Record refund')}
      body={
        <p className="text-sm text-slate-600 dark:text-slate-300">
          {t('Can still be refunded')}: <strong className="tabular-nums">{info ? formatCurrency(info.refundable) : '…'}</strong>
          {info?.gateway ? ` · ${t('online payment — refund in the gateway panel, then record it here')}` : ''}
        </p>
      }
      extra={
        <>
          <Input label={t('Amount (৳)')} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={info ? String(info.refundable) : ''} required />
          <Select label={t('Method')} value={method} onChange={(e) => setMethod(e.target.value)} options={REFUND_METHODS.map((x) => ({ value: x, label: t(METHOD_LABELS[x]) }))} />
          <Input label={t('Reference (optional)')} value={reference} onChange={(e) => setReference(e.target.value)} />
        </>
      }
      confirm={t('Record refund')}
      pending={m.isPending}
      onClose={onClose}
      onConfirm={(reason) => {
        const n = parseAmount(amount || String(info?.refundable ?? ''));
        if (!Number.isFinite(n) || n <= 0) return toast.error(t('Enter a valid amount'));
        m.mutate({ paymentId: payment.id, amount: n, method, reference: reference.trim() || undefined, reason }, {
          onSuccess: () => { toast.success(t('Refund recorded')); onClose(); },
          onError: (e: any) => toast.error(e?.response?.data?.message || t('Could not record the refund')),
        });
      }}
    />
  );
};

const WaiveModal: React.FC<{ invoiceId: string; fineId: string; onClose: () => void }> = ({ invoiceId, fineId, onClose }) => {
  const t = useT();
  const m = useWaiveFine();
  const [stopFuture, setStopFuture] = useState(true);
  return (
    <ReasonModal
      title={t('Waive late fine')}
      extra={<Checkbox checked={stopFuture} onChange={(e) => setStopFuture(e.target.checked)} label={t('Also stop future fines on this invoice')} />}
      confirm={t('Waive')}
      pending={m.isPending}
      onClose={onClose}
      onConfirm={(reason) =>
        m.mutate({ invoiceId, fineId, reason, stopFuture }, {
          onSuccess: () => { toast.success(t('Fine waived')); onClose(); },
          onError: (e: any) => toast.error(e?.response?.data?.message || t('Could not waive')),
        })
      }
    />
  );
};
