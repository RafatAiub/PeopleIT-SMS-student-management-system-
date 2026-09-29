import React, { useState } from 'react';
import { Megaphone, Users } from 'lucide-react';
import { Alert, PageHeader, Tabs, TabPanel } from '@/components/ui';
import { useT } from '@/i18n';
import { useAuthStore } from '@/store/authStore';
import { useCampaignConfig } from './campaigns.queries';
import CampaignsTab from './CampaignsTab';
import GroupsTab from './GroupsTab';

type TabId = 'campaigns' | 'groups';

/**
 * Bulk messaging — campaigns (SMS / email / in-app) and reusable message
 * groups. Roles: SUPER_ADMIN, ADMIN, TEACHER (teachers see only their own
 * campaigns/groups and may only reach their class-teacher sections).
 */
export default function CampaignsPage() {
  const t = useT();
  const { user } = useAuthStore();
  const [tab, setTab] = useState<TabId>('campaigns');
  const config = useCampaignConfig();
  const demoChannels = config.data
    ? (['SMS', 'EMAIL'] as const).filter((c) => config.data!.demo[c])
    : [];

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <PageHeader
        title={t('Messaging campaigns')}
        description={t('Send SMS, email or in-app messages to students, guardians and staff — now or on a schedule.')}
        breadcrumbs={[{ label: t('Communication') }, { label: t('Campaigns') }]}
      />

      {demoChannels.length > 0 && (
        <Alert tone="warning" title={t('Demo mode')}>
          {t('{channels} provider not configured — campaigns on that channel count recipients but nothing is really sent.', {
            channels: demoChannels.map((c) => (c === 'SMS' ? 'SMS' : t('Email'))).join(' & '),
          })}
        </Alert>
      )}

      {user?.role === 'TEACHER' && (
        <Alert tone="info">
          {t('As a teacher you can message students and guardians of sections you are class teacher of.')}
        </Alert>
      )}

      <Tabs
        tabs={[
          { id: 'campaigns', label: t('Campaigns'), icon: <Megaphone className="w-4 h-4" /> },
          { id: 'groups', label: t('Groups'), icon: <Users className="w-4 h-4" /> },
        ]}
        value={tab}
        onChange={(v) => setTab(v as TabId)}
        label={t('Messaging sections')}
        idPrefix="campaigns"
      />
      <TabPanel id="campaigns" value={tab} idPrefix="campaigns">
        <CampaignsTab />
      </TabPanel>
      <TabPanel id="groups" value={tab} idPrefix="campaigns">
        <GroupsTab />
      </TabPanel>
    </div>
  );
}
