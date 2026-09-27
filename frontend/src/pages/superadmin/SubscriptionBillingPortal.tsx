import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { billingApi, type Plan } from '@/api/billing.api';
import { PageHeader } from '@/components/ui/Display';
import { Tabs, TabPanel } from '@/components/ui/Tabs';
import PlansTab from './billing/PlansTab';
import SubscriptionsTab from './billing/SubscriptionsTab';

// Analytics is the only tab that pulls in `recharts` (~heavy). Lazy-load it so
// that dependency lands in its own async chunk, fetched only when the tab opens.
const AnalyticsTab = React.lazy(() => import('./billing/AnalyticsTab'));

// Matches AnalyticsTab's own loading skeleton — shown while its async chunk loads.
const AnalyticsTabFallback: React.FC = () => (
  <div className="space-y-5 animate-pulse">
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="h-24 bg-slate-200 dark:bg-slate-800 rounded-2xl" />
      ))}
    </div>
    <div className="h-80 bg-slate-200 dark:bg-slate-800 rounded-2xl" />
  </div>
);

// =============================================================================
// SubscriptionBillingPortal — super-admin platform billing control center.
// Three tabs: Plans (catalogue + pricing), Subscriptions (per-institution
// status, overrides, payment history and refunds), Analytics (MRR / revenue /
// churn). See ./billing/* for each tab's implementation.
//
// Note: the backend has no endpoint to list payments across every
// institution, only per-institution (`/billing/super-admin/subscriptions/:id`)
// and by id (`/billing/super-admin/payments/:id`). Payment history and the
// refund flow therefore live inside the Subscriptions tab's detail drawer,
// not as a separate top-level "Payments" tab — see the final report.
// =============================================================================

const TABS = [
  { id: 'plans', label: 'Plans' },
  { id: 'subscriptions', label: 'Subscriptions' },
  { id: 'analytics', label: 'Analytics' },
];

const SubscriptionBillingPortal: React.FC = () => {
  const [tab, setTab] = useState<string>('subscriptions');
  const [plans, setPlans] = useState<Plan[]>([]);
  const [plansLoading, setPlansLoading] = useState(true);

  const fetchPlans = async () => {
    try {
      setPlansLoading(true);
      setPlans(await billingApi.listAllPlans());
    } catch (err) {
      console.error('Failed to fetch plans', err);
      toast.error('Failed to load plans');
    } finally {
      setPlansLoading(false);
    }
  };

  useEffect(() => {
    fetchPlans();
  }, []);

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      <PageHeader
        title="Subscription billing"
        description="Plans, pricing, and every institution's billing status across the platform."
      />

      <Tabs tabs={TABS} value={tab} onChange={setTab} variant="pills" label="Billing sections" idPrefix="billing" />

      <TabPanel id="plans" value={tab} idPrefix="billing">
        <PlansTab plans={plans} loading={plansLoading} onRefresh={fetchPlans} />
      </TabPanel>
      <TabPanel id="subscriptions" value={tab} idPrefix="billing">
        <SubscriptionsTab plans={plans} />
      </TabPanel>
      <TabPanel id="analytics" value={tab} idPrefix="billing">
        <React.Suspense fallback={<AnalyticsTabFallback />}>
          <AnalyticsTab />
        </React.Suspense>
      </TabPanel>
    </div>
  );
};

export default SubscriptionBillingPortal;
