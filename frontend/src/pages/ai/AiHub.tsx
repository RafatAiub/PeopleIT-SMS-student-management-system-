import { lazy, Suspense, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Brain, ShieldAlert, CalendarX, Wallet, MessageSquareText, Clock, TrendingUp, BookOpen, Eraser, Inbox } from 'lucide-react';
import { Button, PageHeader, Tabs, TabPanel, SkeletonText, Card } from '../../components/ui';
import { useT, formatNumber } from '../../i18n';
import { useAuthStore } from '../../store/authStore';
import { AiStatusBanner } from './aiShared';
import { useAiStatus, ROLES, type Role } from './aiUtils';

const OverviewTab = lazy(() => import('./tabs/OverviewTab'));
const RiskTab = lazy(() => import('./tabs/RiskTab'));
const AttendanceTab = lazy(() => import('./tabs/AttendanceTab'));
const FeeRiskTab = lazy(() => import('./tabs/FeeRiskTab'));
const ComposeTab = lazy(() => import('./tabs/ComposeTab'));
const WorkloadTab = lazy(() => import('./tabs/WorkloadTab'));
const ForecastTab = lazy(() => import('./tabs/ForecastTab'));
const AskTab = lazy(() => import('./tabs/AskTab'));
const CleanupTab = lazy(() => import('./tabs/CleanupTab'));

// Each tab's roles mirror the backend requireRole list for its endpoint(s).
const TABS = [
  { id: 'overview', label: 'Overview', icon: <Brain className="w-4 h-4" />, roles: ROLES.STAFF_AI, Component: OverviewTab },
  { id: 'risk', label: 'Academic risk', icon: <ShieldAlert className="w-4 h-4" />, roles: ROLES.STAFF_AI, Component: RiskTab },
  { id: 'attendance', label: 'Attendance patterns', icon: <CalendarX className="w-4 h-4" />, roles: ROLES.STAFF_AI, Component: AttendanceTab },
  { id: 'fees', label: 'Fee risk', icon: <Wallet className="w-4 h-4" />, roles: ROLES.FEE, Component: FeeRiskTab },
  { id: 'compose', label: 'Message drafts', icon: <MessageSquareText className="w-4 h-4" />, roles: ROLES.STAFF_AI, Component: ComposeTab },
  { id: 'workload', label: 'Teacher workload', icon: <Clock className="w-4 h-4" />, roles: ROLES.ADMIN_ONLY, Component: WorkloadTab },
  { id: 'forecast', label: 'Enrolment forecast', icon: <TrendingUp className="w-4 h-4" />, roles: ROLES.ADMIN_ONLY, Component: ForecastTab },
  { id: 'ask', label: 'Knowledge assistant', icon: <BookOpen className="w-4 h-4" />, roles: ROLES.ALL_STAFF, Component: AskTab },
  { id: 'cleanup', label: 'Data clean-up', icon: <Eraser className="w-4 h-4" />, roles: ROLES.ADMIN_ONLY, Component: CleanupTab },
];

export default function AiHub() {
  const t = useT();
  const role = useAuthStore((s) => s.user?.role) as Role | undefined;
  const [params, setParams] = useSearchParams();
  const status = useAiStatus();

  const visible = useMemo(() => TABS.filter((tab) => role && tab.roles.includes(role)), [role]);
  const requested = params.get('tab');
  const active = visible.find((tab) => tab.id === requested)?.id ?? visible[0]?.id ?? 'ask';
  const canReview = role ? ROLES.STAFF_AI.includes(role) : false;

  return (
    <div className="space-y-5">
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            <Brain className="w-7 h-7 text-primary-600 dark:text-primary-400" />
            {t('AI Assistant')}
          </span>
        }
        description={t('Insights computed from your school’s own records, with optional AI-written summaries and drafts. Anything for guardians or students is reviewed by staff first.')}
        actions={
          canReview ? (
            <Link to="/ai/review">
              <Button variant="secondary" leftIcon={<Inbox className="w-4 h-4" />}>
                {t('Review queue')}
                {status.data?.pendingDrafts ? ` (${formatNumber(status.data.pendingDrafts)})` : ''}
              </Button>
            </Link>
          ) : undefined
        }
      />

      <AiStatusBanner status={status.data} />

      <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
        <Tabs
          label={t('AI features')}
          idPrefix="ai-hub"
          value={active}
          onChange={(id) => setParams({ tab: id }, { replace: true })}
          tabs={visible.map((tab) => ({ id: tab.id, label: t(tab.label), icon: tab.icon }))}
        />
      </div>

      {visible.map((tab) => (
        <TabPanel key={tab.id} id={tab.id} value={active} idPrefix="ai-hub">
          {tab.id === active && (
            <Suspense fallback={<Card><SkeletonText lines={4} /></Card>}>
              <tab.Component />
            </Suspense>
          )}
        </TabPanel>
      ))}
    </div>
  );
}
