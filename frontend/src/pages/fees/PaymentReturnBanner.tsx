import React, { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Alert, Button } from '../../components/ui';
import { useT, formatCurrency } from '../../i18n';
import { FEES_INVOICES_KEY } from './hooks';
import { useOnlineTransaction } from './feeExtras.queries';

interface PaymentReturnBannerProps {
  status: string;
  txnId: string | null;
  onDismiss: () => void;
}

/**
 * Shown after the payment gateway redirects the browser back to /fees
 * (?payment=success|failed|cancelled|pending&txn=<id>). The status in the URL
 * is only a hint — the transaction itself is re-read from the API so a
 * hand-edited URL can't display a fake success.
 */
export const PaymentReturnBanner: React.FC<PaymentReturnBannerProps> = ({ status, txnId, onDismiss }) => {
  const t = useT();
  const qc = useQueryClient();
  const { data: txn, isLoading } = useOnlineTransaction(txnId);

  useEffect(() => {
    qc.invalidateQueries({ queryKey: [FEES_INVOICES_KEY] });
  }, [qc, txn?.status]);

  const dismiss = (
    <Button variant="ghost" size="xs" onClick={onDismiss}>
      {t('Dismiss')}
    </Button>
  );

  if (txnId && isLoading) return null;

  const effective = txn?.status ?? (status === 'success' ? 'PENDING' : status.toUpperCase());

  if (effective === 'SUCCESS') {
    return (
      <div className="space-y-2">
        {txn?.isDemo && (
          <Alert tone="warning" title={t('Demo mode')}>
            {t('This was a simulated payment — the gateway API key is not configured and no money was charged.')}
          </Alert>
        )}
        <Alert tone="success" title={t('Payment received')} action={dismiss}>
          {txn
            ? t('{amount} was paid against invoice {invoice}.', { amount: formatCurrency(txn.amount), invoice: txn.invoice.invoiceNo })
            : t('Your payment was received.')}
          {txn?.payment?.receiptNo ? ` ${t('Receipt no.')} ${txn.payment.receiptNo}` : ''}
        </Alert>
      </div>
    );
  }
  if (effective === 'FAILED') {
    return (
      <Alert tone="danger" title={t('Payment failed')} action={dismiss}>
        {t('The payment did not go through and nothing was charged to this invoice. You can try again.')}
      </Alert>
    );
  }
  if (effective === 'CANCELLED') {
    return (
      <Alert tone="warning" title={t('Payment cancelled')} action={dismiss}>
        {t('You cancelled the payment. The invoice is unchanged.')}
      </Alert>
    );
  }
  return (
    <Alert tone="info" title={t('Payment processing')} action={dismiss}>
      {t('We are waiting for the payment gateway to confirm this payment. Refresh in a minute to see the updated invoice.')}
    </Alert>
  );
};
