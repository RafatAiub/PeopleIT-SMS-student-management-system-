import React from 'react';
import { PageHeader } from '../../components/ui';
import { useT } from '../../i18n';
import { GradingScalesPanel } from './GradingScalesPanel';

/** Route: /grading — SUPER_ADMIN, ADMIN. */
const GradingScales: React.FC = () => {
  const t = useT();
  return (
    <div className="space-y-6">
      <PageHeader
        title={t('Grading scales')}
        description={t('Define grade bands and grade points used across results.')}
        breadcrumbs={[{ label: t('Results'), to: '/results' }, { label: t('Grading scales') }]}
      />
      <div className="glass-card p-4 sm:p-6">
        <GradingScalesPanel />
      </div>
    </div>
  );
};

export default GradingScales;
