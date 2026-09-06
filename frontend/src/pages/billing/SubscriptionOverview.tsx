import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  CreditCard,
  CalendarClock,
  CheckCircle2,
  Loader2,
  Users,
  AlertTriangle,
  Wallet,
  Receipt,
  ArrowUpRight,
  ShieldCheck,
  Sparkles,
  RefreshCw,
} from 'lucide-react';
import toast from 'react-hot-toast';
import {
  billingApi,
  BILLING_CYCLE_LABELS,
  formatCurrency,
  type BillingCycle,
  type SubscriptionStatus,
  type SubscriptionPaymentStatus,
  type SubscriptionPayment,
} from '@/api/billing.api';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { DataTable, type Column } from '@/components/DataTable/DataTable';
import { useMySubscription, useBillingPlans, useMyPayments } from '@/hooks/useBilling';

const PAYMENT_STATUS_BADGE: Record<
  SubscriptionPaymentStatus,
  { label: string; variant: 'success' | 'warning' | 'danger' | 'info' | 'neutral' }
> = {
  INITIATED: { label: 'Initiated', variant: 'info' },
  PENDING: { label: 'Pending', variant: 'warning' },
  SUCCESS: { label: 'Paid', variant: 'success' },
  FAILED: { label: 'Failed', variant: 'danger' },
  CANCELLED: { label: 'Cancelled', variant: 'neutral' },
  REFUNDED: { label: 'Refunded', variant: 'info' },
};

const CYCLES: BillingCycle[] = ['MONTHLY', 'QUARTERLY', 'HALF_YEARLY', 'YEARLY'];

const MONTHS_PER_CYCLE: Record<BillingCycle, number> = {
  MONTHLY: 1,
  QUARTERLY: 3,
  HALF_YEARLY: 6,
  YEARLY: 12,
};

// ── Status hero: tone + copy per subscription state ───────────────────────

type HeroTone = 'active' | 'trial' | 'urgent' | 'inactive';

interface HeroConfig {
  tone: HeroTone;
  eyebrow: string;
  headline: (days: number) => string;
  sub: string;
  Icon: React.ComponentType<{ className?: string }>;
}

const HERO: Record<SubscriptionStatus, HeroConfig> = {
  ACTIVE: {
    tone: 'active',
    eyebrow: 'Subscription',
    headline: (d) => `Active — ${d} day${d === 1 ? '' : 's'} left in this period`,
    sub: 'Everything is running normally. Renew any time before the period ends.',
    Icon: ShieldCheck,
  },
  TRIALING: {
    tone: 'trial',
    eyebrow: 'Free trial',
    headline: (d) => `${d} day${d === 1 ? '' : 's'} left in your free trial`,
    sub: 'Choose a plan below to keep access when the trial ends.',
    Icon: Sparkles,
  },
  GRACE: {
    tone: 'urgent',
    eyebrow: 'Action needed',
    headline: (d) => `Expired — ${d} day${d === 1 ? '' : 's'} before your account is suspended`,
    sub: 'Renew now to avoid interruption for your staff and students.',
    Icon: AlertTriangle,
  },
  EXPIRED: {
    tone: 'urgent',
    eyebrow: 'Account suspended',
    headline: () => 'Your subscription has ended',
    sub: 'Renew a plan below to restore access for everyone at your institution.',
    Icon: AlertTriangle,
  },
  CANCELLED: {
    tone: 'inactive',
    eyebrow: 'Subscription',
    headline: () => 'Your subscription is cancelled',
    sub: 'Pick a plan below whenever you are ready to start again.',
    Icon: CreditCard,
  },
};

const TONE_STYLES: Record<HeroTone, { wrap: string; icon: string; eyebrow: string; cta: 'gradient' | 'danger' }> = {
  active: {
    wrap: 'border-emerald-200 dark:border-emerald-500/25 bg-emerald-50/60 dark:bg-emerald-500/5',
    icon: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400',
    eyebrow: 'text-emerald-700 dark:text-emerald-400',
    cta: 'gradient',
  },
  trial: {
    wrap: 'border-blue-200 dark:border-blue-500/25 bg-blue-50/60 dark:bg-blue-500/5',
    icon: 'bg-blue-100 text-blue-600 dark:bg-blue-500/15 dark:text-blue-400',
    eyebrow: 'text-blue-700 dark:text-blue-400',
    cta: 'gradient',
  },
  urgent: {
    wrap: 'border-rose-300 dark:border-rose-500/30 bg-rose-50/70 dark:bg-rose-500/5',
    icon: 'bg-rose-100 text-rose-600 dark:bg-rose-500/15 dark:text-rose-400',
    eyebrow: 'text-rose-700 dark:text-rose-400',
    cta: 'danger',
  },
  inactive: {
    wrap: 'border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-slate-900/40',
    icon: 'bg-slate-100 text-slate-500 dark:bg-white/5 dark:text-slate-400',
    eyebrow: 'text-slate-500 dark:text-slate-400',
    cta: 'gradient',
  },
};

const OverviewSkeleton: React.FC = () => (
  <div className="space-y-6 max-w-5xl mx-auto animate-pulse">
    <div className="space-y-2">
      <div className="h-7 w-56 bg-slate-200 dark:bg-slate-800 rounded-lg" />
      <div className="h-4 w-80 bg-slate-200 dark:bg-slate-800 rounded-lg" />
    </div>
    <div className="h-40 bg-slate-200 dark:bg-slate-800 rounded-2xl" />
    <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-64 bg-slate-200 dark:bg-slate-800 rounded-2xl" />
      ))}
    </div>
  </div>
);

const SubscriptionOverview: React.FC = () => {
  const {
    data: subscription,
    isLoading: subLoading,
    isError: subIsError,
    refetch: refetchSubscription,
  } = useMySubscription();
  const { data: plansData, isLoading: plansLoading, isError: plansIsError, refetch: refetchPlans } = useBillingPlans();
  const { data: paymentsData } = useMyPayments();

  const plans = plansData ?? [];
  const payments = paymentsData ?? [];
  const loading = subLoading || plansLoading;
  const error = subIsError || plansIsError;

  const [selectedCycle, setSelectedCycle] = useState<BillingCycle>('MONTHLY');
  const [checkoutPlanId, setCheckoutPlanId] = useState<string | null>(null);
  const [payingPending, setPayingPending] = useState(false);
  const cycleInitializedRef = useRef(false);

  useEffect(() => {
    if (subscription && !cycleInitializedRef.current) {
      setSelectedCycle(subscription.billingCycle);
      cycleInitializedRef.current = true;
    }
  }, [subscription]);

  const handleRetry = () => {
    refetchSubscription();
    refetchPlans();
  };

  const startCheckout = async (planId: string, cycle: BillingCycle, setBusy: (v: boolean) => void) => {
    setBusy(true);
    try {
      const { paymentUrl } = await billingApi.initiateCheckout(planId, cycle);
      // SSLCommerz requires a top-level navigation to its hosted checkout.
      window.location.href = paymentUrl;
    } catch (err: any) {
      console.error('Failed to initiate checkout', err);
      toast.error(err.response?.data?.message || 'Failed to start checkout. Please try again.');
      setBusy(false);
    }
  };

  const handleSubscribe = (planId: string) => {
    setCheckoutPlanId(planId);
    startCheckout(planId, selectedCycle, (busy) => setCheckoutPlanId(busy ? planId : null));
  };

  const handlePayPending = () => {
    const pending = subscription?.pendingPaymentRequest;
    if (!pending?.planId) {
      toast.error('This payment request is missing its plan — please contact support.');
      return;
    }
    startCheckout(pending.planId, pending.billingCycle, setPayingPending);
  };

  // Cheapest monthly-equivalent price across plans, used to show cycle savings.
  const monthlyBaseline = useMemo(() => {
    let min = Infinity;
    for (const p of plans) {
      const monthly = p.prices.find((pr) => pr.billingCycle === 'MONTHLY');
      if (monthly) min = Math.min(min, Number(monthly.amount));
    }
    return Number.isFinite(min) ? min : null;
  }, [plans]);

  const dateFact = (() => {
    if (!subscription) return null;
    if (subscription.status === 'TRIALING') return subscription.trialEndsAt && { label: 'Trial ends', value: subscription.trialEndsAt };
    if (subscription.status === 'GRACE') return subscription.graceEndsAt && { label: 'Suspends on', value: subscription.graceEndsAt };
    return subscription.currentPeriodEnd && { label: 'Renews on', value: subscription.currentPeriodEnd };
  })();

  const paymentColumns: Column<SubscriptionPayment>[] = [
    {
      key: 'date',
      header: 'Date',
      render: (p) => <span className="text-slate-600 dark:text-slate-300">{new Date(p.createdAt).toLocaleDateString()}</span>,
    },
    {
      key: 'amount',
      header: 'Amount',
      render: (p) => <span className="font-semibold text-slate-900 dark:text-white">{formatCurrency(p.amount, p.currency)}</span>,
    },
    {
      key: 'method',
      header: 'Method',
      render: (p) => (
        <span className="text-slate-500 dark:text-slate-400 text-xs">
          {p.isManualOverride ? 'Recorded by PeopleIT' : p.generatedBySuperAdmin ? 'Payment link' : 'Online (SSLCommerz)'}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (p) => {
        const b = PAYMENT_STATUS_BADGE[p.status];
        return <Badge variant={b.variant}>{b.label}</Badge>;
      },
    },
    {
      key: 'receipt',
      header: '',
      render: (p) => (
        <Link
          to={`/billing/receipt/${p.id}`}
          className="inline-flex items-center gap-1 text-xs font-semibold text-primary-600 dark:text-primary-400 hover:underline"
        >
          Receipt <ArrowUpRight className="w-3.5 h-3.5" />
        </Link>
      ),
    },
  ];

  if (loading) return <OverviewSkeleton />;

  if (error) {
    return (
      <div className="max-w-md mx-auto mt-16 glass-card border border-rose-300/40 dark:border-rose-500/20 rounded-2xl p-8 text-center space-y-3">
        <AlertTriangle className="w-10 h-10 text-rose-500 mx-auto" />
        <p className="text-sm font-semibold text-rose-600 dark:text-rose-400">Couldn't load your subscription</p>
        <p className="text-xs text-slate-500 dark:text-slate-400">Please check your connection and try again.</p>
        <Button variant="secondary" onClick={handleRetry} className="mx-auto">
          <RefreshCw className="w-4 h-4" /> Retry
        </Button>
      </div>
    );
  }

  const hero = subscription ? HERO[subscription.status] : null;
  const toneStyle = hero ? TONE_STYLES[hero.tone] : null;
  const pending = subscription?.pendingPaymentRequest ?? null;

  return (
    <div className="space-y-8 max-w-5xl mx-auto pb-12">
      {/* Page header */}
      <div className="animate-fadeIn" style={{ animationDelay: '0ms' }}>
        <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white">Subscription &amp; Billing</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Your institution's plan, renewals, and payment history.
        </p>
      </div>

      {/* Status hero */}
      {subscription && hero && toneStyle && (
        <div
          className={`glass-card rounded-2xl border p-6 animate-fadeIn ${toneStyle.wrap}`}
          style={{ animationDelay: '60ms' }}
          role={hero.tone === 'urgent' ? 'alert' : undefined}
        >
          <div className="flex flex-col lg:flex-row lg:items-center gap-5">
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${toneStyle.icon}`}>
              <hero.Icon className="w-6 h-6" />
            </div>
            <div className="flex-1 min-w-0">
              <p className={`text-xs font-bold uppercase tracking-wider ${toneStyle.eyebrow}`}>{hero.eyebrow}</p>
              <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white mt-0.5">
                {hero.headline(subscription.daysRemaining)}
              </h2>
              <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">{hero.sub}</p>

              <div className="flex flex-wrap gap-x-6 gap-y-2 mt-4 text-xs">
                <span className="inline-flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
                  <CreditCard className="w-3.5 h-3.5 text-slate-400" />
                  {subscription.plan?.name || 'No plan'} · {BILLING_CYCLE_LABELS[subscription.billingCycle]}
                </span>
                {dateFact && (
                  <span className="inline-flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
                    <CalendarClock className="w-3.5 h-3.5 text-slate-400" />
                    {dateFact.label}: {new Date(dateFact.value).toLocaleDateString()}
                  </span>
                )}
                <span className="inline-flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
                  <Users className="w-3.5 h-3.5 text-slate-400" />
                  {subscription.plan?.studentCap ? `Up to ${subscription.plan.studentCap} students` : 'Unlimited students'}
                </span>
              </div>
            </div>

            <div className="flex-shrink-0">
              <a href="#choose-plan">
                <Button variant={toneStyle.cta === 'danger' ? 'danger' : 'gradient'} className="w-full lg:w-auto justify-center">
                  {hero.tone === 'urgent' ? 'Renew now' : hero.tone === 'trial' ? 'Choose a plan' : 'Renew early'}
                </Button>
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Payment requested by the platform team */}
      {pending && (
        <div className="glass-card rounded-2xl border border-amber-300/50 dark:border-amber-500/20 bg-amber-50/70 dark:bg-amber-500/5 p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 animate-fadeIn">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400 flex items-center justify-center flex-shrink-0">
              <Wallet className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">Payment requested by PeopleIT</h3>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 leading-relaxed">
                <strong className="text-slate-900 dark:text-white">{formatCurrency(pending.amount, pending.currency)}</strong> for{' '}
                <strong className="text-slate-900 dark:text-white">{pending.planName || 'your subscription'}</strong> ({BILLING_CYCLE_LABELS[pending.billingCycle]}),
                requested on {new Date(pending.requestedAt).toLocaleDateString()}.
              </p>
            </div>
          </div>
          <Button variant="gradient" isLoading={payingPending} onClick={handlePayPending} className="flex-shrink-0 justify-center">
            Pay now
          </Button>
        </div>
      )}

      {/* Choose / change plan */}
      <div id="choose-plan" className="space-y-5 animate-fadeIn" style={{ animationDelay: '120ms' }}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Choose a plan</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Longer cycles bill less per month.</p>
          </div>
          <div className="inline-flex items-center bg-slate-100 dark:bg-slate-800 rounded-xl p-1 self-start">
            {CYCLES.map((cycle) => (
              <button
                key={cycle}
                type="button"
                onClick={() => setSelectedCycle(cycle)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all min-h-[36px] ${
                  selectedCycle === cycle
                    ? 'bg-white dark:bg-slate-900 text-primary-600 dark:text-primary-400 shadow-sm'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                {BILLING_CYCLE_LABELS[cycle]}
              </button>
            ))}
          </div>
        </div>

        {plans.length === 0 ? (
          <div className="glass-card rounded-2xl border border-slate-200 dark:border-white/10 p-10 text-center text-sm text-slate-500 dark:text-slate-400">
            No plans are available right now. Please contact PeopleIT support.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {plans.map((plan) => {
              const price = plan.prices.find((p) => p.billingCycle === selectedCycle);
              const isCurrent = subscription?.planId === plan.id && subscription?.billingCycle === selectedCycle;
              const months = MONTHS_PER_CYCLE[selectedCycle];
              const perMonth = price ? Number(price.amount) / months : null;
              const savingPct =
                monthlyBaseline && perMonth && selectedCycle !== 'MONTHLY'
                  ? Math.round((1 - perMonth / monthlyBaseline) * 100)
                  : 0;

              return (
                <div
                  key={plan.id}
                  className={`glass-card rounded-2xl border p-6 flex flex-col gap-4 transition-shadow ${
                    isCurrent
                      ? 'border-primary-400 dark:border-primary-500/50 ring-1 ring-primary-400/30'
                      : 'border-slate-200 dark:border-white/10 hover:shadow-lg'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="text-base font-bold text-slate-900 dark:text-white">{plan.name}</h3>
                      {plan.description && (
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">{plan.description}</p>
                      )}
                    </div>
                    {isCurrent && <Badge variant="info">Current</Badge>}
                  </div>

                  <div>
                    {price ? (
                      <>
                        <div className="flex items-baseline gap-1">
                          <span className="text-2xl font-bold text-slate-900 dark:text-white">
                            {formatCurrency(price.amount, price.currency)}
                          </span>
                          <span className="text-xs text-slate-500">/ {BILLING_CYCLE_LABELS[selectedCycle].toLowerCase()}</span>
                        </div>
                        {selectedCycle !== 'MONTHLY' && perMonth != null && (
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                            ≈ {formatCurrency(perMonth.toFixed(0), price.currency)} / month
                            {savingPct > 0 && (
                              <span className="ml-1.5 text-emerald-600 dark:text-emerald-400 font-semibold">save {savingPct}%</span>
                            )}
                          </p>
                        )}
                      </>
                    ) : (
                      <span className="text-xs italic text-slate-400">Not available for {BILLING_CYCLE_LABELS[selectedCycle]}</span>
                    )}
                  </div>

                  <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                    {plan.studentCap ? `Up to ${plan.studentCap} students` : 'Unlimited students'}
                  </div>

                  <div className="mt-auto pt-2">
                    <Button
                      variant={isCurrent ? 'secondary' : 'gradient'}
                      className="w-full justify-center"
                      disabled={!price || checkoutPlanId === plan.id}
                      isLoading={checkoutPlanId === plan.id}
                      onClick={() => handleSubscribe(plan.id)}
                    >
                      {checkoutPlanId === plan.id ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" /> Redirecting…
                        </>
                      ) : isCurrent ? (
                        'Renew this plan'
                      ) : (
                        'Subscribe'
                      )}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Payment history */}
      <div className="space-y-4 animate-fadeIn" style={{ animationDelay: '180ms' }}>
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white flex items-center gap-2">
          <Receipt className="w-4 h-4 text-slate-400" /> Payment history
        </h2>
        <div className="glass-card rounded-2xl border border-slate-200 dark:border-white/10 overflow-hidden">
          <DataTable
            data={payments}
            columns={paymentColumns}
            pageSize={8}
            emptyTitle="No payments yet"
            emptyDescription="Your subscription payments will appear here once you complete a checkout."
          />
        </div>
      </div>
    </div>
  );
};

export default SubscriptionOverview;
