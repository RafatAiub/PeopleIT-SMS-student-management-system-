import React from 'react';
import { Link } from 'react-router-dom';
import { HandHeart, Printer } from 'lucide-react';
import { Card, CardHeader, ErrorState, PageHeader, SkeletonText, StatCard, Table, TableCell, TableHead, TableHeaderCell, TableRow } from '@/components/ui';
import { EmptyState } from '@/components/common/EmptyState';
import { formatDate, useT } from '@/i18n';
import { METHOD_LABEL, useMyDonations } from './donations.api';
import { DonationStatusBadge, DueBadge, Money, useBi } from './shared';

/** Guardian portal: "My donations" — gifts recorded against the donor profile linked to this user. */
const MyDonations: React.FC = () => {
  const t = useT();
  const bi = useBi();
  const q = useMyDonations();

  return (
    <div className="space-y-6 max-w-4xl">
      <PageHeader title={t('My donations')} description={t('Your donations to the school, with printable receipts.')} />
      {q.isLoading ? <SkeletonText lines={6} /> : q.isError || !q.data ? <ErrorState title={t('Could not load your donations')} onRetry={() => q.refetch()} /> : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <StatCard label={t('Total given')} value={<Money value={q.data.total} />} icon={<HandHeart className="w-5 h-5" />} />
            <StatCard label={t('Monthly pledges')} value={q.data.pledges.filter((p) => p.status === 'ACTIVE').length} tone="info" />
          </div>

          {q.data.pledges.length > 0 && (
            <Card>
              <CardHeader title={t('Monthly pledges')} />
              <ul className="divide-y divide-slate-200 dark:divide-white/8 mt-2">
                {q.data.pledges.map((p) => (
                  <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
                    <span>{bi(p.fund.name, p.fund.nameBn)} · <Money value={p.amount} /> {t('on day {d}', { d: p.dayOfMonth })}</span>
                    <span className="flex items-center gap-2">{t('Next due')}: {formatDate(p.nextDueDate)} <DueBadge state={p.dueState} /></span>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {q.data.donations.length === 0 ? (
            <EmptyState icon={<HandHeart className="w-8 h-8" />} title={t('No donations yet')} description={t('Donations you make at the office or online will appear here once the school links them to your account.')} />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHead><tr>
                  <TableHeaderCell>{t('Date')}</TableHeaderCell><TableHeaderCell>{t('Fund')}</TableHeaderCell><TableHeaderCell>{t('Method')}</TableHeaderCell>
                  <TableHeaderCell className="text-right">{t('Amount')}</TableHeaderCell><TableHeaderCell>{t('Status')}</TableHeaderCell><TableHeaderCell><span className="sr-only">{t('Receipt')}</span></TableHeaderCell>
                </tr></TableHead>
                <tbody>
                  {q.data.donations.map((d, i) => (
                    <TableRow key={d.id} index={i}>
                      <TableCell className="whitespace-nowrap">{formatDate(d.paidAt)}</TableCell>
                      <TableCell>{bi(d.fund.name, d.fund.nameBn)}{d.campaign && <span className="block text-xs text-slate-500">{bi(d.campaign.title, d.campaign.titleBn)}</span>}</TableCell>
                      <TableCell>{t(METHOD_LABEL[d.method])}</TableCell>
                      <TableCell className="text-right font-semibold"><Money value={d.amount} /></TableCell>
                      <TableCell><DonationStatusBadge status={d.status} /></TableCell>
                      <TableCell>
                        {d.receiptNo && (
                          <Link to={`/donations/mine/${d.id}/receipt`} className="inline-flex items-center gap-1 text-sm font-semibold text-primary-700 dark:text-primary-400 hover:underline">
                            <Printer className="w-4 h-4" aria-hidden /> {d.receiptNo}
                          </Link>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </tbody>
              </Table>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default MyDonations;
