import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, RefreshCw } from 'lucide-react';
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
import { PrintLayout, SignatureLines } from '@/components/print/PrintLayout';

// Two routes (App.tsx): /billing/receipt/:paymentId (ADMIN) and
// /super-admin/billing/receipt/:paymentId (SUPER_ADMIN). Branches on role.
const PAYMENT_STATUS_BADGE: Record<
  SubscriptionPaymentStatus,
  { label: string; variant: 'success' | 'warning' | 'danger' | 'info' | 'neutral' }
> = {
  INITIATED: { label: 'Initiated', variant: 'info' },
  PENDING: { label: 'Pending', variant: 'warning' },
  SUCCESS: { label: 'Paid', variant: 'success' },
  FAILED: { label: 'Failed', variant: 'danger' },
  CANCELLED: { label: 'Cancelled', variant: 'neutral' },
  REFUNDED: { label: 'Refunded', variant: 'info' },
};

const Row: React.FC<{ label: string; children: React.ReactNode; mono?: boolean }> = ({ label, children, mono }) => (
  <div className="flex items-start justify-between gap-4 py-3 border-b border-slate-100 last:border-0">
    <span className="text-xs text-slate-500">{label}</span>
    <span className={`text-sm text-slate-900 text-right ${mono ? 'font-mono text-xs break-all' : 'font-medium'}`}>
      {children}
    </span>
  </div>
);

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

  const backTo = user?.role === 'SUPER_ADMIN' ? '/super-admin/billing' : '/billing';

  if (loading) {
    return (
      <div className="max-w-lg mx-auto py-12 animate-pulse">
        <div className="h-4 w-40 bg-slate-200 dark:bg-slate-800 rounded mb-6" />
        <div className="h-96 bg-slate-200 dark:bg-slate-800 rounded-2xl" />
      </div>
    );
  }

  if (error || !payment) {
    return (
      <div className="max-w-md mx-auto mt-16 glass-card border border-rose-300/40 dark:border-rose-500/20 rounded-2xl p-8 text-center space-y-3">
        <AlertTriangle className="w-10 h-10 text-rose-500 mx-auto" />
        <p className="text-sm font-semibold text-rose-600 dark:text-rose-400">{error || 'Payment not found'}</p>
        <Button variant="secondary" onClick={fetchReceipt} className="mx-auto">
          <RefreshCw className="w-4 h-4" /> Retry
        </Button>
      </div>
    );
  }

  const status = PAYMENT_STATUS_BADGE[payment.status];

  return (
    <div className="max-w-lg mx-auto space-y-4 pb-12 animate-fadeIn">
      <div className="no-print">
        <Link
          to={backTo}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> Back to billing
        </Link>
      </div>

      <PrintLayout
        title="Payment Receipt"
        reference={payment.gatewayTransactionId ? `Txn ${payment.gatewayTransactionId}` : undefined}
        date={payment.createdAt}
        institution={{ name: payment.institution.name }}
        size="a5"
        footer={<SignatureLines labels={['Received by', "Payer's signature"]} />}
      >
        <div className="flex items-start justify-between gap-4 mb-4">
          <Badge variant={status.variant}>{status.label}</Badge>
        </div>

        <div className="text-center bg-slate-50 rounded-lg py-6 mb-2">
          <p className="text-xs text-slate-500">Amount</p>
          <p className="text-3xl font-bold text-slate-900 mt-1">{formatCurrency(payment.amount, payment.currency)}</p>
        </div>

        <div>
          <Row label="Plan">{payment.planPrice?.plan.name ?? '—'}</Row>
          <Row label="Billing cycle">{BILLING_CYCLE_LABELS[payment.billingCycle]}</Row>
          <Row label="Method">
            {payment.isManualOverride
              ? 'Recorded by PeopleIT'
              : payment.generatedBySuperAdmin
                ? 'Payment link'
                : 'Online (SSLCommerz)'}
          </Row>
          <Row label="Transaction ID" mono>
            {payment.gatewayTransactionId || '—'}
          </Row>
          <Row label="Gateway validation ID" mono>
            {payment.gatewayValId || '—'}
          </Row>
          {payment.isManualOverride && payment.overrideReason && <Row label="Note">{payment.overrideReason}</Row>}
        </div>

        {payment.refundedAt && (
          <div className="mt-4 rounded-lg bg-amber-50 border border-amber-200 px-4 py-3">
            <p className="text-xs font-semibold text-amber-700">
              Refunded on {new Date(payment.refundedAt).toLocaleDateString()}
            </p>
          </div>
        )}
      </PrintLayout>
    </div>
  );
};

export default PaymentReceipt;
