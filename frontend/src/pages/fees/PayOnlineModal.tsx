import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Modal, Button, Alert, Select, Skeleton } from '../../components/ui';
import { formatCurrency, useT } from '../../i18n';
import { useInitiateOnlinePayment } from './hooks';
import { useGatewayModes } from './feeExtras.queries';
import type { InvoiceListItem, PaymentMethod } from './types';

type OnlineMethod = Extract<PaymentMethod, 'BKASH' | 'NAGAD' | 'SSLCOMMERZ'>;
const ONLINE_METHODS: { value: OnlineMethod; label: string }[] = [
  { value: 'BKASH', label: 'bKash' },
  { value: 'NAGAD', label: 'Nagad' },
  { value: 'SSLCOMMERZ', label: 'SSLCommerz' },
];

interface PayOnlineModalProps {
  invoice: InvoiceListItem | null;
  onClose: () => void;
}

// Online payment. Each gateway is either LIVE (real merchant keys configured
// on the server → the user is sent to the real gateway page) or in DEMO MODE
// (no keys → the backend returns demo: true and a local demo-checkout route
// where the result is simulated). Demo is always labelled as such.
export const PayOnlineModal: React.FC<PayOnlineModalProps> = ({ invoice, onClose }) => {
  const t = useT();
  const navigate = useNavigate();
  const [method, setMethod] = useState<OnlineMethod>('BKASH');
  const initiate = useInitiateOnlinePayment();
  const modes = useGatewayModes(!!invoice);

  if (!invoice) return null;

  const selectedMode = modes.data?.gateways.find((g) => g.gateway === method);
  // Unknown (lookup failed) is treated as demo so we never imply a real charge.
  const isDemo = selectedMode ? selectedMode.demo : !modes.isLoading;
  const unavailable = selectedMode?.available === false;

  const handlePay = async () => {
    try {
      const result = await initiate.mutateAsync({
        invoiceId: invoice.id,
        method,
        callbackUrl: window.location.href,
      });
      if (result?.demo && result.checkoutPath) {
        onClose();
        navigate(result.checkoutPath);
        return;
      }
      if (result?.paymentUrl) {
        toast.success(t('Redirecting to the payment gateway…'));
        window.location.assign(result.paymentUrl);
        return;
      }
      toast.error(result?.message || t('This payment gateway is not available right now.'));
      onClose();
    } catch (err: any) {
      toast.error(err.response?.data?.message || t('Online payment is not available yet. Please pay at the school office.'));
      onClose();
    }
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={t('Pay online')}
      description={`${t('Invoice')} ${invoice.invoiceNo} — ${t('Due')} ${formatCurrency(invoice.dueAmount)}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>{t('Cancel')}</Button>
          <Button onClick={handlePay} isLoading={initiate.isPending} disabled={modes.isLoading || unavailable}>
            {isDemo ? t('Continue to demo checkout') : t('Continue to payment')}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {modes.isLoading ? (
          <Skeleton className="h-16" />
        ) : unavailable ? (
          <Alert tone="danger" title={t('Not available')}>
            {t('This payment method is not set up for your school yet. Please pay at the school office.')}
          </Alert>
        ) : isDemo ? (
          <Alert tone="warning" title={t('Demo mode')}>
            {t('This payment gateway\'s API key is not configured, so you will see a simulated checkout. Nothing is really charged. Please pay at the school office to settle this invoice for real.')}
          </Alert>
        ) : (
          <Alert tone="info">
            {t('You will be redirected to the secure payment page. The invoice updates automatically once the gateway confirms your payment.')}
          </Alert>
        )}
        <Select
          label={t('Payment method')}
          value={method}
          onChange={(e) => setMethod(e.target.value as OnlineMethod)}
          options={ONLINE_METHODS.map((m) => {
            const mode = modes.data?.gateways.find((g) => g.gateway === m.value);
            return { value: m.value, label: mode?.demo ? `${m.label} (${t('demo')})` : m.label };
          })}
        />
      </div>
    </Modal>
  );
};
