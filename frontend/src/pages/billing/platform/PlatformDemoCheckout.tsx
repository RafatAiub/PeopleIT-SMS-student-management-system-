import React, { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { platformBillingApi } from '@/api/platformBilling.api';
import { PLATFORM_INVOICES_KEY, PLATFORM_PAYMENTS_KEY, PLATFORM_STATUS_KEY } from '@/hooks/usePlatformBilling';
import { Alert, Button, Card, PageHeader, Skeleton } from '@/components/ui';
import { formatCurrency, useT } from '@/i18n';
import { periodLabel } from './platformBilling.logic';
import { ResultIcon } from './PlatformBillingPage';

/**
 * P1: simulated checkout used when the gateway has no merchant keys (never in
 * production unless FEE_DEMO_PAYMENTS_ENABLED=true). The server refuses the
 * confirm call once a real gateway is configured.
 */
const PlatformDemoCheckout: React.FC = () => {
  const t = useT();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [params] = useSearchParams();
  const id = params.get('payment') ?? '';
  const { data: payment, isLoading, refetch } = useQuery({ queryKey: ['platform-payment', id], queryFn: () => platformBillingApi.myPayment(id), enabled: !!id });
  const [busy, setBusy] = useState<'success' | 'failure' | null>(null);

  const confirm = async (outcome: 'success' | 'failure') => {
    setBusy(outcome);
    try {
      const r = await platformBillingApi.demoConfirm(id, outcome);
      await Promise.all([PLATFORM_STATUS_KEY, PLATFORM_INVOICES_KEY, PLATFORM_PAYMENTS_KEY].map((k) => qc.invalidateQueries({ queryKey: [k] })));
      navigate(`/billing?payment=${r.status === 'SUCCESS' ? 'success' : 'failed'}&pid=${id}`, { replace: true });
    } catch (err: any) {
      toast.error(err?.response?.data?.message || t('Could not complete the demo payment'));
      refetch();
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="max-w-md mx-auto space-y-5 pb-12">
      <PageHeader title={t('Demo checkout')} description={t('No real money will be charged.')} />
      {isLoading ? (
        <Skeleton className="h-48 rounded-2xl" />
      ) : !payment ? (
        <Alert tone="danger" title={t('Payment not found')} />
      ) : (
        <Card className="p-6 space-y-4 text-center">
          <div className="flex justify-center">
            <ResultIcon status={payment.status} />
          </div>
          <p className="text-3xl font-extrabold text-slate-900 dark:text-white">{formatCurrency(payment.amount)}</p>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            {payment.method === 'BKASH' ? 'bKash' : 'SSLCommerz'} · {payment.invoices.map((i) => periodLabel(i.period)).join(', ')}
          </p>
          {payment.status === 'SUCCESS' ? (
            <Alert tone="success" title={t('Already paid')}>{payment.receiptNumber}</Alert>
          ) : !payment.demoAllowed || payment.status === 'FAILED' || payment.status === 'CANCELLED' ? (
            <Alert tone="warning" title={t('This demo payment can no longer be confirmed')} />
          ) : (
            <div className="grid gap-2">
              <Button size="lg" fullWidth isLoading={busy === 'success'} disabled={!!busy} onClick={() => confirm('success')}>
                {t('Simulate successful payment')}
              </Button>
              <Button size="lg" fullWidth variant="secondary" isLoading={busy === 'failure'} disabled={!!busy} onClick={() => confirm('failure')}>
                {t('Simulate failed payment')}
              </Button>
            </div>
          )}
          <Link to="/billing" className="text-sm font-semibold text-primary-700 dark:text-primary-300 hover:underline">
            {t('Back to Billing')}
          </Link>
        </Card>
      )}
    </div>
  );
};

export default PlatformDemoCheckout;
