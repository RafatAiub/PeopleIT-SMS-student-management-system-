import React from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Badge, ErrorState, SkeletonText } from '@/components/ui';
import { PrintLayout, SignatureLines } from '@/components/print/PrintLayout';
import { formatCurrency, formatDate, useT } from '@/i18n';
import { FUND_TYPE_LABEL, useReceipt } from './donations.api';

/**
 * Printable donation receipt (browser print), English + Bangla on one page:
 * institution letterhead, receipt number, fund, amount in figures and in
 * words (EN + BN). `mine` = the guardian portal's own-receipt endpoint.
 */
const Row: React.FC<{ en: string; bn: string; children: React.ReactNode }> = ({ en, bn, children }) => (
  <div className="flex items-start justify-between gap-4 py-2 border-b border-slate-200 last:border-0 text-sm">
    <span className="text-slate-500 shrink-0">{en} <span lang="bn" className="text-xs">/ {bn}</span></span>
    <span className="text-right font-medium text-slate-900">{children}</span>
  </div>
);

const DonationReceipt: React.FC<{ mine?: boolean }> = ({ mine = false }) => {
  const t = useT();
  const { id } = useParams<{ id: string }>();
  const q = useReceipt(id, mine);

  if (q.isLoading) return <div className="max-w-lg mx-auto"><SkeletonText lines={10} /></div>;
  if (q.isError || !q.data) return <ErrorState title={t('Receipt not available')} message={t('Only paid donations have a receipt.')} onRetry={() => q.refetch()} />;
  const r = q.data;

  return (
    <div className="max-w-2xl mx-auto space-y-4 pb-12">
      <div className="no-print">
        <Link to={mine ? '/donations/mine' : '/donations?tab=records'} className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800 dark:hover:text-slate-200">
          <ArrowLeft className="w-4 h-4" /> {t('Back')}
        </Link>
      </div>
      <PrintLayout
        title="Donation Receipt · দানের রসিদ"
        reference={`Receipt No. ${r.receiptNo}`}
        date={r.paidAt ?? undefined}
        size="a5"
        institution={{ name: r.institution.name, logoUrl: r.institution.logoUrl, address: r.institution.address ?? undefined, phone: r.institution.phone ?? undefined, email: r.institution.email ?? undefined }}
        footer={<SignatureLines labels={['Received by / গ্রহণকারী', 'Authorised signature / অনুমোদিত স্বাক্ষর']} />}
      >
        {r.status === 'REFUNDED' && (
          <div className="mb-3"><Badge variant="danger">REFUNDED / ফেরত দেওয়া হয়েছে{r.refundedAt ? ` · ${formatDate(r.refundedAt)}` : ''}</Badge></div>
        )}
        <div className="text-center bg-slate-50 rounded-lg py-5 mb-3">
          <p className="text-xs text-slate-500">Amount / পরিমাণ</p>
          <p className="text-3xl font-bold text-slate-900 mt-1">{formatCurrency(r.amount)}</p>
          <p className="text-sm text-slate-700 mt-2">{r.amountInWords.en}</p>
          <p className="text-sm text-slate-700 mt-0.5" lang="bn">{r.amountInWords.bn}</p>
        </div>
        <Row en="Received from" bn="দাতা">{r.anonymous || !r.donorName ? 'Anonymous / বেনামী' : r.donorName}</Row>
        <Row en="Fund" bn="ফান্ড">{r.fund.name}{r.fund.nameBn ? ` (${r.fund.nameBn})` : ''} · {FUND_TYPE_LABEL[r.fund.type].en} / <span lang="bn">{FUND_TYPE_LABEL[r.fund.type].bn}</span></Row>
        {r.campaign && <Row en="Campaign" bn="ক্যাম্পেইন">{r.campaign.title}{r.campaign.titleBn ? ` (${r.campaign.titleBn})` : ''}</Row>}
        <Row en="Payment method" bn="পরিশোধের মাধ্যম">{r.methodLabel}</Row>
        <Row en="Date" bn="তারিখ">{r.paidAt ? formatDate(r.paidAt) : '—'}</Row>
        <Row en="Reference" bn="রেফারেন্স"><span className="font-mono text-xs">{r.reference}</span></Row>
        {r.note && <Row en="Note" bn="মন্তব্য">{r.note}</Row>}
        <p className="mt-4 text-center text-sm text-slate-700">JazakAllahu khairan for your generosity. <span lang="bn">আপনার দানের জন্য জাযাকাল্লাহু খাইরান।</span></p>
      </PrintLayout>
    </div>
  );
};

export default DonationReceipt;
