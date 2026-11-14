import React from 'react';
import { usePlatformBillingStatus } from '@/hooks/usePlatformBilling';
import { Skeleton } from '@/components/ui';
import PlatformBillingPage from './platform/PlatformBillingPage';
import SubscriptionOverview from './SubscriptionOverview';

/**
 * /billing — P1: a school with a platform billing profile (monthly invoices
 * from PeopleNIT) sees its bills; a school without one keeps the legacy
 * plan/subscription page.
 */
const BillingHome: React.FC = () => {
  const { data: status, isLoading, isError } = usePlatformBillingStatus();
  if (isLoading) return <Skeleton className="h-64 max-w-5xl mx-auto rounded-2xl" />;
  if (!isError && status?.hasProfile) return <PlatformBillingPage />;
  return <SubscriptionOverview />;
};

export default BillingHome;
