import React from 'react';
import { useSearchParams } from 'react-router-dom';
import { PageHeader, Tabs, TabPanel, type TabItem } from '@/components/ui';
import { useT } from '@/i18n';
import { useAuthStore } from '@/store/authStore';
import ScoresTab from './tabs/ScoresTab';
import AwardsTab from './tabs/AwardsTab';
import SetupTab from './tabs/SetupTab';

// =============================================================================
// T2 Character (আখলাক) workspace — teachers score and award; admins and
// management also set up traits, periods, badges and settings. The route is
// gated by <ProtectedRoute module="islamic.character"> in App.tsx.
// =============================================================================

const CharacterPage: React.FC = () => {
  const t = useT();
  const role = useAuthStore((s) => s.user?.role);
  const canSetup = role === 'ADMIN' || role === 'MANAGEMENT' || role === 'SUPER_ADMIN';
  const ids = canSetup ? ['scores', 'awards', 'setup'] : ['scores', 'awards'];
  const [params, setParams] = useSearchParams();
  const requested = params.get('tab') ?? '';
  const tab = ids.includes(requested) ? requested : 'scores';
  const setTab = (id: string) => setParams((p) => { const n = new URLSearchParams(p); n.set('tab', id); return n; }, { replace: true });
  const tabs: TabItem[] = [
    { id: 'scores', label: t('Scores') },
    { id: 'awards', label: t('Badges & points') },
    ...(canSetup ? [{ id: 'setup', label: t('Setup') }] : []),
  ];
  return (
    <div className="space-y-6">
      <PageHeader title={t('Character (Akhlaq)')} description={t('Score traits each period, award badges and track points.')} />
      <div className="overflow-x-auto scrollbar-none -mx-1 px-1">
        <Tabs tabs={tabs} value={tab} onChange={setTab} label={t('Character sections')} idPrefix="character" />
      </div>
      <TabPanel id={tab} value={tab} idPrefix="character">
        {tab === 'scores' && <ScoresTab />}
        {tab === 'awards' && <AwardsTab />}
        {tab === 'setup' && <SetupTab />}
      </TabPanel>
    </div>
  );
};

export default CharacterPage;
