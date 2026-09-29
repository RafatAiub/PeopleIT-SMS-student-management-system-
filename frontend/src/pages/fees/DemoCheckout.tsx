import React from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { CheckCircle2, XCircle, CreditCard, ArrowLeft } from 'lucide-react';
import toast from 'react-hot-toast';
import { PageHeader, Card, Button, Alert, ErrorState, Skeleton, DescriptionList, Badge } from '../../components/ui';
import { EmptyState } from '../../components/common/EmptyState';
import { useT, formatCurrency, formatDate } from '../../i18n';
import { useOnlineTransaction, useConfirmDemoPayment } from './feeExtras.queries';
import type { OnlineGateway } from './types';

const GATEWAY_LABEL: Record<OnlineGateway, string> = { BKASH: 'bKash', NAGAD: 'Nagad', SSLCOMMERZ: 'SSLCommerz' };

// Demo checkout — reached from PayOnlineModal when the chosen gateway has no
// API keys configured (backend returns demo: true + checkoutPath). Pressing a
// button calls the demo-only confirm endpoint, which the backend rejects as
// soon as real gateway keys exist. Route: /fees/demo-checkout?txn=<id>.
const DemoCheckout: React.FC = () => {
  const t = useT();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const txnId = params.get('txn');

  const { data: txn, isLoading, isError, refetch } = useOnlineTransaction(txnId);
  const confirm = useConfirmDemoPayment();

  const handle = async (outcome: 'success' | 'failure') => {
    if (!txnId) return;
    try {
      const result = await confirm.mutateAsync({ txnId, outcome });
      if (result.status === 'SUCCESS') {
        toast.success(t('Demo payment recorded — no real money was charged.'));
      } else {
        toast.error(t('Demo payment marked as failed.'));
      }
    } catch (err: any) {
      toast.error(err.response?.data?.message || t('Could not complete the demo payment.'));
    }
  };

  const header = (
    <PageHeader
      title={t('Demo checkout')}
      description={t('Simulated online payment — for testing the fee payment flow.')}
      breadcrumbs={[{ label: t('Fees'), to: '/fees' }, { label: t('Demo checkout') }]}
    />
  );

  const demoAlert = (
    <Alert tone="warning" title={t('Demo mode')}>
      {t('The payment gateway API key is not configured, so this is a simulated checkout. Nothing is really charged and no money moves — the result only updates the invoice for testing.')}
    </Alert>
  );

  if (!txnId) {
    return (
      <div className="space-y-6">
        {header}
        <Card>
          <EmptyState
            title={t('No payment selected')}
            description={t('Start an online payment from your invoices to open the demo checkout.')}
            action={<Link to="/fees" className="text-primary-600 font-medium">{t('Back to fees')}</Link>}
          />
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl mx-auto w-full">
      {header}
      {demoAlert}

      {isLoading ? (
        <Card className="space-y-3">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-24" />
          <Skeleton className="h-10 w-full" />
        </Card>
      ) : isError || !txn ? (
        <ErrorState onRetry={() => refetch()} message={t('Failed to load this payment.')} />
      ) : !txn.isDemo ? (
        <Alert tone="danger" title={t('Not a demo payment')}>
          {t('This transaction was sent to a real payment gateway and cannot be simulated.')}
        </Alert>
      ) : (
        <Card className="space-y-5">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-lg bg-primary-50 dark:bg-primary-500/10 text-primary-600 flex items-center justify-center shrink-0">
                <CreditCard className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <p className="text-sm text-slate-500 dark:text-slate-400">{GATEWAY_LABEL[txn.gateway]} · {t('Demo')}</p>
                <p className="text-2xl font-bold text-slate-900 dark:text-white tabular-nums">{formatCurrency(txn.amount)}</p>
              </div>
            </div>
            <Badge variant={txn.status === 'SUCCESS' ? 'success' : txn.status === 'FAILED' || txn.status === 'CANCELLED' ? 'danger' : 'warning'}>
              {txn.status}
            </Badge>
          </div>

          <DescriptionList
            columns={2}
            items={[
              { label: t('Invoice'), value: txn.invoice.invoiceNo },
              {
                label: t('Student'),
                value: txn.invoice.student ? `${txn.invoice.student.firstName} ${txn.invoice.student.lastName}` : '—',
              },
              { label: t('Transaction ID'), value: <span className="font-mono text-xs break-all">{txn.transactionId}</span> },
              { label: t('Started'), value: formatDate(txn.createdAt) },
            ]}
          />

          {txn.status === 'SUCCESS' ? (
            <div className="rounded-lg border border-emerald-200 dark:border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/10 p-4 flex gap-3">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="font-semibold text-emerald-800 dark:text-emerald-300">{t('Demo payment successful')}</p>
                <p className="text-emerald-700 dark:text-emerald-400">
                  {txn.payment?.receiptNo ? t('Receipt {no} was issued.', { no: txn.payment.receiptNo }) : t('The invoice has been updated.')}{' '}
                  {t('No real money was charged.')}
                </p>
              </div>
            </div>
          ) : txn.status === 'FAILED' || txn.status === 'CANCELLED' ? (
            <div className="rounded-lg border border-red-200 dark:border-red-500/30 bg-red-50 dark:bg-red-500/10 p-4 flex gap-3">
              <XCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
              <p className="text-sm text-red-700 dark:text-red-300">{t('This demo payment did not go through. Start a new payment from your invoices to try again.')}</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <Button
                variant="primary"
                leftIcon={<CheckCircle2 className="w-4 h-4" />}
                isLoading={confirm.isPending && confirm.variables?.outcome === 'success'}
                disabled={confirm.isPending}
                onClick={() => handle('success')}
                fullWidth
              >
                {t('Simulate success')}
              </Button>
              <Button
                variant="danger-soft"
                leftIcon={<XCircle className="w-4 h-4" />}
                isLoading={confirm.isPending && confirm.variables?.outcome === 'failure'}
                disabled={confirm.isPending}
                onClick={() => handle('failure')}
                fullWidth
              >
                {t('Simulate failure')}
              </Button>
            </div>
          )}

          <div className="pt-2 border-t border-slate-100 dark:border-white/5">
            <Button variant="ghost" size="sm" leftIcon={<ArrowLeft className="w-4 h-4" />} onClick={() => navigate('/fees')}>
              {t('Back to fees')}
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
};

export default DemoCheckout;
