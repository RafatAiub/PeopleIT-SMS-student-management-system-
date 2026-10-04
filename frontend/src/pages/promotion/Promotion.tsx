import React, { useState } from 'react';
import { PageHeader, Tabs } from '../../components/ui';
import { useT } from '../../i18n';
import { PromotionRunTab } from './PromotionRunTab';
import { PromotionHistoryTab } from './PromotionHistoryTab';

/** Route: /promotion — SUPER_ADMIN, ADMIN (backend requireRole SA, A). */
const Promotion: React.FC = () => {
  const t = useT();
  const [tab, setTab] = useState<'run' | 'history'>('run');
  return (
    <div className="space-y-6">
      <PageHeader
        title={t('Promotion & year rollover')}
        description={t('Move a class into the next session: promote, retain, graduate or transfer students in one step.')}
      />
      <Tabs
        label={t('Promotion tabs')}
        variant="underline"
        value={tab}
        onChange={(id) => setTab(id as 'run' | 'history')}
        tabs={[
          { id: 'run', label: t('Run promotion') },
          { id: 'history', label: t('History') },
        ]}
      />
      {tab === 'run' ? <PromotionRunTab onDone={() => setTab('history')} /> : <PromotionHistoryTab />}
    </div>
  );
};

export default Promotion;
