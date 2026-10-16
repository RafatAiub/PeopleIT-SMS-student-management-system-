/** `/donation/:reference` — where the gateway (or the demo checkout) returns the donor. */
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, Clock, Printer, XCircle } from 'lucide-react';
import { SiteApiError } from '../api';
import { SkeletonRows } from '../blocks/shared';
import { useSiteRuntime, useSiteText } from '../runtime';
import { formatSiteDate, formatSiteMoney } from '../strings';
import type { PublicDonationStatus } from '../donations';
import { useSiteSeo } from './seo';

const STATUS_LABEL: Record<PublicDonationStatus, string> = { PENDING: 'Pending', PAID: 'Received', FAILED: 'Not completed', REFUNDED: 'Refunded' };

export function DonationStatusView({ reference }: { reference: string }) {
  const { siteId, api, lang, settings } = useSiteRuntime();
  const { s, tx } = useSiteText();
  const [params] = useSearchParams();
  const isDemoHint = params.get('demo') === '1';
  const [pendingOutcome, setPendingOutcome] = useState<'success' | 'fail' | null>(null);

  const q = useQuery({
    queryKey: ['site-donation', siteId, reference],
    queryFn: () => api.getDonation(siteId!, reference),
    enabled: Boolean(siteId),
    retry: (n, e) => n < 1 && !(e instanceof SiteApiError && e.status === 404),
  });

  useSiteSeo({ title: `${s('Donation')} | ${settings.siteName}`, lang, siteName: settings.siteName, noindex: true });

  const demoPay = async (outcome: 'success' | 'fail') => {
    if (!siteId) return;
    setPendingOutcome(outcome);
    try { await api.demoPayDonation(siteId, reference, outcome); } finally { setPendingOutcome(null); void q.refetch(); }
  };

  if (q.isLoading) return <div className="site-container site-pad-md"><SkeletonRows rows={1} className="h-64" /></div>;
  if (q.isError || !q.data) {
    return (
      <section className="site-pad-lg">
        <div className="site-container site-w-narrow flex flex-col items-center gap-3 text-center">
          <h1 className="site-h2">{s('Donation not found')}</h1>
          <p className="site-muted">{s('Check the link, or contact the school office.')}</p>
        </div>
      </section>
    );
  }

  const d = q.data;
  const paid = d.status === 'PAID';
  const Icon = paid ? CheckCircle2 : d.status === 'PENDING' ? Clock : XCircle;

  return (
    <section className="site-pad-md">
      <div className="site-container site-w-narrow flex flex-col gap-6">
        <div className="flex flex-col items-center gap-2 text-center">
          <Icon size={44} style={paid ? { color: 'var(--site-primary-text)' } : undefined} className={paid ? '' : 'opacity-70'} aria-hidden />
          <h1 className="site-h2">{paid ? s('JazakAllahu khairan — thank you!') : d.status === 'PENDING' ? s('Waiting for payment') : s('Payment not completed')}</h1>
          <span className="site-badge site-badge-accent">{s(STATUS_LABEL[d.status])}</span>
        </div>

        {(isDemoHint || d.isDemo) && (
          <div className="site-alert site-alert-warning text-center">
            <strong>{s('Demo payment — no money moves')}.</strong> {s('This is a simulated checkout for testing.')}
          </div>
        )}
        {d.isDemo && d.status === 'PENDING' && (
          <div className="flex flex-wrap justify-center gap-3">
            <button type="button" className="site-btn site-btn-primary" disabled={Boolean(pendingOutcome)} onClick={() => demoPay('success')}>
              {pendingOutcome === 'success' ? s('Processing…') : s('Simulate a successful payment')}
            </button>
            <button type="button" className="site-btn site-btn-outline" disabled={Boolean(pendingOutcome)} onClick={() => demoPay('fail')}>
              {pendingOutcome === 'fail' ? s('Processing…') : s('Simulate a failed payment')}
            </button>
          </div>
        )}

        <dl className="site-card site-card-pad grid grid-cols-[auto,1fr] gap-x-6 gap-y-2 text-sm">
          <dt className="site-muted">{s('Amount')}</dt><dd className="text-right text-lg font-bold">{formatSiteMoney(d.amount, d.currency, lang)}</dd>
          <dt className="site-muted">{s('Fund')}</dt><dd className="text-right">{tx(d.fund.name, d.fund.nameBn)}</dd>
          {d.campaign && <><dt className="site-muted">{s('Campaign')}</dt><dd className="text-right">{tx(d.campaign.title, d.campaign.titleBn)}</dd></>}
          {d.receiptNo && <><dt className="site-muted">{s('Receipt no.')}</dt><dd className="text-right font-semibold">{d.receiptNo}</dd></>}
          <dt className="site-muted">{s('Reference')}</dt><dd className="text-right">{d.reference}</dd>
          {d.paidAt && <><dt className="site-muted">{s('Date')}</dt><dd className="text-right">{formatSiteDate(d.paidAt, lang, { day: 'numeric', month: 'long', year: 'numeric' })}</dd></>}
        </dl>
        {paid && (
          <button type="button" className="site-btn site-btn-outline self-center" onClick={() => window.print()}>
            <Printer size={16} className="mr-1 inline" aria-hidden />{s('Print this page')}
          </button>
        )}
      </div>
    </section>
  );
}
