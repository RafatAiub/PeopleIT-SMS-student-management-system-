import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { AlertTriangle, Receipt as ReceiptIcon, Printer, ArrowLeft } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import {
  billingApi,
  BILLING_CYCLE_LABELS,
  formatCurrency,
  type PaymentReceipt as PaymentReceiptType,
  type SubscriptionPaymentStatus,
} from '@/api/billing.api';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';

// Registered at two routes (App.tsx): /billing/receipt/:paymentId (ADMIN)
// and /super-admin/billing/receipt/:paymentId (SUPER_ADMIN) — this single
// component branches on role to call the matching backend endpoint.
const PAYMENT_STATUS_BADGE: Record<SubscriptionPaymentStatus, { label: string; variant: 'success' | 'warning' | 'danger' | 'info' | 'neutral' }> = {
  INITIATED: { label: 'Initiated', variant: 'info' },
  PENDING: { label: 'Pending', variant: 'warning' },
  SUCCESS: { label: 'Success', variant: 'success' },
  FAILED: { label: 'Failed', variant: 'danger' },
  CANCELLED: { label: 'Cancelled', variant: 'neutral' },
  REFUNDED: { label: 'Refunded', variant: 'info' },
};

const PaymentReceipt: React.FC = () => {
  const { paymentId } = useParams<{ paymentId: string }>();
  const { user } = useAuthStore();
  const [payment, setPayment] = useState<PaymentReceiptType | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchReceipt = async () => {
    if (!paymentId) return;
    try {
      setLoading(true);
      setError(null);
      const data =
        user?.role === 'SUPER_ADMIN'
          ? await billingApi.getPaymentReceiptAdmin(paymentId)
          : await billingApi.getPaymentReceipt(paymentId);
      setPayment(data);
    } catch (err: any) {
      console.error('Failed to load payment receipt', err);
      setError(err.response?.data?.message || 'Failed to load payment receipt');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReceipt();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paymentId, user?.role]);

  const handlePrint = () => window.print();

  const backTo = user?.role === 'SUPER_ADMIN' ? '/super-admin/billing' : '/billing';

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="flex items-center gap-3 text-slate-500">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500" />
          <span className="font-bold text-sm">Loading receipt...</span>
        </div>
      </div>
    );
  }

  if (error || !payment) {
    return (
      <div className="max-w-3xl mx-auto p-8 glass-card border border-red-200 dark:border-red-500/20 rounded-3xl text-center space-y-3">
        <AlertTriangle className="w-10 h-10 text-red-500 mx-auto" />
        <p className="text-sm font-bold text-red-600 dark:text-red-400">{error || 'Payment not found'}</p>
        <Button variant="secondary" onClick={fetchReceipt}>Retry</Button>
      </div>
    );
  }

  const statusInfo = PAYMENT_STATUS_BADGE[payment.status];

  return (
    <div className="max-w-2xl mx-auto space-y-6 pb-12 animate-fadeIn">
      <div className="flex items-center justify-between no-print">
        <Link
          to={backTo}
          className="inline-flex items-center gap-2 text-xs font-bold text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Billing
        </Link>
        <Button variant="secondary" size="sm" onClick={handlePrint}>
          <Printer className="w-3.5 h-3.5" /> Print / Save as PDF
        </Button>
      </div>

      <div className="glass-card p-8 bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-3xl shadow-xl space-y-6">
        <div className="flex items-center gap-4 pb-4 border-b border-slate-100 dark:border-white/5">
          <div className="p-3 bg-blue-500/10 text-blue-600 dark:text-blue-400 rounded-2xl">
            <ReceiptIcon className="w-7 h-7" />
          </div>
          <div>
            <h2 className="text-xl font-black text-slate-900 dark:text-white">Payment Receipt</h2>
            <p className="text-xs text-slate-500 mt-0.5">{payment.institution.name}</p>
          </div>
        </div>

        <table className="w-full text-left text-xs">
          <tbody className="divide-y divide-slate-100 dark:divide-white/5">
            <tr>
              <td className="py-2.5 pr-4 text-slate-500 font-bold w-1/3">Plan</td>
              <td className="py-2.5 font-bold text-slate-900 dark:text-white">{payment.planPrice?.plan.name ?? '—'}</td>
            </tr>
            <tr>
              <td className="py-2.5 pr-4 text-slate-500 font-bold">Billing Cycle</td>
              <td className="py-2.5 font-bold text-slate-900 dark:text-white">{BILLING_CYCLE_LABELS[payment.billingCycle]}</td>
            </tr>
            <tr>
              <td className="py-2.5 pr-4 text-slate-500 font-bold">Amount</td>
              <td className="py-2.5 font-bold text-slate-900 dark:text-white">{formatCurrency(payment.amount, payment.currency)}</td>
            </tr>
            <tr>
              <td className="py-2.5 pr-4 text-slate-500 font-bold">Currency</td>
              <td className="py-2.5 font-bold text-slate-900 dark:text-white">{payment.currency}</td>
            </tr>
            <tr>
              <td className="py-2.5 pr-4 text-slate-500 font-bold">Transaction ID</td>
              <td className="py-2.5 font-mono text-slate-700 dark:text-slate-300">{payment.gatewayTransactionId || '—'}</td>
            </tr>
            <tr>
              <td className="py-2.5 pr-4 text-slate-500 font-bold">Gateway Validation ID</td>
              <td className="py-2.5 font-mono text-slate-700 dark:text-slate-300">{payment.gatewayValId || '—'}</td>
            </tr>
            <tr>
              <td className="py-2.5 pr-4 text-slate-500 font-bold">Date</td>
              <td className="py-2.5 font-bold text-slate-900 dark:text-white">{new Date(payment.createdAt).toLocaleString()}</td>
            </tr>
            <tr>
              <td className="py-2.5 pr-4 text-slate-500 font-bold">Status</td>
              <td className="py-2.5"><Badge variant={statusInfo.variant}>{statusInfo.label}</Badge></td>
            </tr>
          </tbody>
        </table>

        {payment.refundedAt && (
          <p className="text-xs font-bold text-amber-600 dark:text-amber-400 pt-4 border-t border-slate-100 dark:border-white/5">
            Refunded on {new Date(payment.refundedAt).toLocaleDateString()}
          </p>
        )}
      </div>
    </div>
  );
};

export default PaymentReceipt;
