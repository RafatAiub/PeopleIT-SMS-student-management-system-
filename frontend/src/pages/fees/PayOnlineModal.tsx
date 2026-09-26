import React, { useState } from 'react';
import toast from 'react-hot-toast';
import { Modal, Button, Alert, Select } from '../../components/ui';
import { formatCurrency } from '../../i18n';
import { useInitiateOnlinePayment } from './hooks';
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

// Demo-mode online payment — the gateways are stubs until a real merchant
// account is configured, so this is labelled clearly instead of pretending
// money changes hands. Preserves the honesty banner from the previous
// MyInvoices implementation.
export const PayOnlineModal: React.FC<PayOnlineModalProps> = ({ invoice, onClose }) => {
  const [method, setMethod] = useState<OnlineMethod>('BKASH');
  const initiate = useInitiateOnlinePayment();

  if (!invoice) return null;

  const handlePay = async () => {
    try {
      const result = await initiate.mutateAsync({
        invoiceId: invoice.id,
        method,
        callbackUrl: window.location.href,
      });
      const paymentUrl = result?.paymentUrl;
      if (paymentUrl) {
        window.open(paymentUrl, '_blank', 'noopener,noreferrer');
        toast.success('Redirected to the sandbox payment page — this is a demo, no real money is charged.');
      } else {
        toast.error(result?.message || 'This payment gateway is not enabled for your institution yet.');
      }
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Online payment is not available yet. Please pay at the school office.');
    } finally {
      onClose();
    }
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      title="Pay online"
      description={`Invoice ${invoice.invoiceNo} — Due ${formatCurrency(invoice.dueAmount)}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={handlePay} isLoading={initiate.isPending}>Continue to payment</Button>
        </>
      }
    >
      <div className="space-y-4">
        <Alert tone="warning" title="Demo mode">
          The online payment gateway is not configured yet — this will open a sandbox test page and no real money is charged. Please pay at the school office to settle this invoice for now.
        </Alert>
        <Select
          label="Payment method"
          value={method}
          onChange={(e) => setMethod(e.target.value as OnlineMethod)}
          options={ONLINE_METHODS}
        />
      </div>
    </Modal>
  );
};
