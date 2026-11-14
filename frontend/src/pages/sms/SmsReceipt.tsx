import React from 'react';
import { useParams } from 'react-router-dom';
import { Printer } from 'lucide-react';
import { Button, Card, DescriptionList, ErrorState, PageHeader, SkeletonText } from '@/components/ui';
import { formatCurrency, formatDate, formatNumber, useLocale } from '@/i18n';
import { useSmsT } from './sms.i18n';
import { usePurchase } from './sms.api';

// P5 SMS credit purchase receipt (printable). `admin` = super-admin view.

const METHOD: Record<string, string> = { BKASH: 'bKash', SSLCOMMERZ: 'SSLCommerz', MANUAL: 'Paid offline' };

const SmsReceipt: React.FC<{ admin?: boolean }> = ({ admin = false }) => {
  const t = useSmsT();
  const { lang } = useLocale();
  const { id } = useParams();
  const q = usePurchase(id, admin);
  const back = admin ? '/super-admin/sms' : '/sms';

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="print:hidden">
        <PageHeader
          title={t('SMS credit receipt')}
          breadcrumbs={[{ label: t('SMS credits'), to: back }, { label: t('Receipt') }]}
          actions={<Button variant="secondary" leftIcon={<Printer className="w-4 h-4" />} onClick={() => window.print()}>{t('Print')}</Button>}
        />
      </div>
      {q.isLoading ? (
        <SkeletonText lines={6} />
      ) : q.isError || !q.data ? (
        <ErrorState title={t('Receipt not found')} />
      ) : q.data.status !== 'SUCCESS' ? (
        <ErrorState title={t('This payment is not complete')} />
      ) : (
        <Card>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="text-lg font-bold text-slate-900 dark:text-white">PeopleNIT</div>
              <div className="text-sm text-slate-600 dark:text-slate-300">{t('SMS credit receipt')}</div>
            </div>
            <div className="text-right">
              <div className="font-mono font-semibold">{q.data.receiptNumber}</div>
              <div className="text-sm text-slate-600 dark:text-slate-300">{formatDate(q.data.paidAt, true)}</div>
            </div>
          </div>
          <DescriptionList
            className="mt-6"
            columns={2}
            items={[
              { label: t('School'), value: q.data.institutionName },
              { label: t('Pack'), value: (lang === 'bn' && q.data.packNameBn ? q.data.packNameBn : q.data.packName) ?? '—' },
              { label: t('SMS credits'), value: formatNumber(q.data.units) },
              { label: t('Amount paid'), value: formatCurrency(q.data.amount, { decimals: 2 }) },
              { label: t('Method'), value: `${t(METHOD[q.data.method] ?? q.data.method)}${q.data.isDemo ? ` (${t('demo')})` : ''}` },
              { label: t('Reference'), value: q.data.reference ?? '—' },
            ]}
          />
          {q.data.isDemo && <p className="mt-4 text-sm font-medium text-red-700 dark:text-red-300">{t('Demo payment — no real money was received.')}</p>}
        </Card>
      )}
    </div>
  );
};

export default SmsReceipt;
