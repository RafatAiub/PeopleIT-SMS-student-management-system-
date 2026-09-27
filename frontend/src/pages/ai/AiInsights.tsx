import { Link } from 'react-router-dom';
import { Brain, ShieldAlert, ArrowRight } from 'lucide-react';
import { Button, PageHeader } from '../../components/ui';
import { useT } from '../../i18n';
import { AiStatusBanner } from './aiShared';
import { useAiStatus } from './aiUtils';
import OverviewTab from './tabs/OverviewTab';
import RiskTab from './tabs/RiskTab';

/**
 * /ai-insights — kept for existing links and the sidebar entry. Shows the
 * executive summary and the academic-risk board; every other AI feature
 * lives in the AI Assistant hub (/ai).
 */
export default function AiInsights() {
  const t = useT();
  const status = useAiStatus();

  return (
    <div className="space-y-6">
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            <Brain className="w-7 h-7 text-primary-600 dark:text-primary-400" />
            {t('AI-Driven Insights')}
          </span>
        }
        description={t('Statistics and student risk indicators computed from your institution’s own data, with an AI-written summary.')}
        actions={
          <Link to="/ai">
            <Button variant="secondary" rightIcon={<ArrowRight className="w-4 h-4" />}>{t('Open AI Assistant')}</Button>
          </Link>
        }
      />
      <AiStatusBanner status={status.data} />
      <OverviewTab />
      <section className="space-y-3">
        <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <ShieldAlert className="w-5 h-5 text-red-500 dark:text-red-400" />
          {t('Risk Assessment Board')}
        </h2>
        <RiskTab />
      </section>
    </div>
  );
}
