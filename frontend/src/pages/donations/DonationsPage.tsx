import React from 'react';
import { useSearchParams } from 'react-router-dom';
import { PageHeader, Tabs, TabPanel, type TabItem } from '@/components/ui';
import { useT } from '@/i18n';
import OverviewTab from './tabs/OverviewTab';
import RecordsTab from './tabs/RecordsTab';
import { CampaignsTab, DonorsTab, FundsTab } from './tabs/SetupTabs';
import { PayoutsTab, PledgesTab } from './tabs/PledgesPayoutsTabs';

// =============================================================================
// Donations, Zakat & Sadaqah (T1) — admin/accountant workspace. The route is
// gated by <ProtectedRoute module="islamic.donations"> in App.tsx.
// =============================================================================

const TAB_IDS = ['overview', 'records', 'funds', 'donors', 'campaigns', 'pledges', 'payouts'] as const;
type TabId = (typeof TAB_IDS)[number];

const DonationsPage: React.FC = () => {
  const t = useT();
  const [params, setParams] = useSearchParams();
  const requested = params.get('tab');
  const tab: TabId = (TAB_IDS as readonly string[]).includes(requested ?? '') ? (requested as TabId) : 'overview';
  const setTab = (id: string) => setParams((p) => { const n = new URLSearchParams(p); n.set('tab', id); return n; }, { replace: true });

  const tabs: TabItem[] = [
    { id: 'overview', label: t('Overview') },
    { id: 'records', label: t('Donations') },
    { id: 'funds', label: t('Funds') },
    { id: 'donors', label: t('Donors') },
    { id: 'campaigns', label: t('Campaigns') },
    { id: 'pledges', label: t('Monthly pledges') },
    { id: 'payouts', label: t('Payouts') },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('Donations, Zakat & Sadaqah')}
        description={t('Funds, donors, receipts, monthly pledges, campaigns and Zakat distribution.')}
      />
      <div className="overflow-x-auto scrollbar-none -mx-1 px-1">
        <Tabs tabs={tabs} value={tab} onChange={setTab} label={t('Donations sections')} idPrefix="donations" />
      </div>
      <TabPanel id={tab} value={tab} idPrefix="donations">
        {tab === 'overview' && <OverviewTab />}
        {tab === 'records' && <RecordsTab />}
        {tab === 'funds' && <FundsTab />}
        {tab === 'donors' && <DonorsTab />}
        {tab === 'campaigns' && <CampaignsTab />}
        {tab === 'pledges' && <PledgesTab />}
        {tab === 'payouts' && <PayoutsTab />}
      </TabPanel>
    </div>
  );
};

export default DonationsPage;
