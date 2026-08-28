import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  CreditCard,
  CalendarClock,
  CheckCircle2,
  Loader2,
  BadgeCheck,
  AlertTriangle,
  Wallet,
  Receipt,
} from 'lucide-react';
import toast from 'react-hot-toast';
import {
  billingApi,
  BILLING_CYCLE_LABELS,
  formatCurrency,
  type BillingCycle,
  type SubscriptionStatus,
  type SubscriptionPaymentStatus,
} from '@/api/billing.api';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { useMySubscription, useBillingPlans, useMyPayments } from '@/hooks/useBilling';

const STATUS_BADGE: Record<SubscriptionStatus, { label: string; variant: 'success' | 'warning' | 'danger' | 'info' | 'neutral' }> = {
  TRIALING: { label: 'Trialing', variant: 'info' },
  ACTIVE: { label: 'Active', variant: 'success' },
  GRACE: { label: 'Grace Period', variant: 'warning' },
  EXPIRED: { label: 'Expired', variant: 'danger' },
  CANCELLED: { label: 'Cancelled', variant: 'danger' },
};

const PAYMENT_STATUS_BADGE: Record<SubscriptionPaymentStatus, { label: string; variant: 'success' | 'warning' | 'danger' | 'info' | 'neutral' }> = {
  INITIATED: { label: 'Initiated', variant: 'info' },
  PENDING: { label: 'Pending', variant: 'warning' },
  SUCCESS: { label: 'Success', variant: 'success' },
  FAILED: { label: 'Failed', variant: 'danger' },
  CANCELLED: { label: 'Cancelled', variant: 'neutral' },
  REFUNDED: { label: 'Refunded', variant: 'info' },
};

const CYCLES: BillingCycle[] = ['MONTHLY', 'QUARTERLY', 'HALF_YEARLY', 'YEARLY'];

const SubscriptionOverview: React.FC = () => {
  const {
    data: subscription,
    isLoading: subLoading,
    isError: subIsError,
    refetch: refetchSubscription,
  } = useMySubscription();
  const {
    data: plansData,
    isLoading: plansLoading,
    isError: plansIsError,
    refetch: refetchPlans,
  } = useBillingPlans();
  const { data: paymentsData } = useMyPayments();

  const plans = plansData ?? [];
  const payments = paymentsData ?? [];
  const loading = subLoading || plansLoading;
  const error = subIsError || plansIsError;

  const [selectedCycle, setSelectedCycle] = useState<BillingCycle>('MONTHLY');
  const [checkoutPlanId, setCheckoutPlanId] = useState<string | null>(null);
  const [payingPending, setPayingPending] = useState(false);
  // Initialize the cycle toggle to the subscriber's current billing cycle
  // exactly once, on first load — not on every background refetch, or the
  // toggle would keep snapping back while the admin is browsing other cycles.
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

  const handleSubscribe = async (planId: string) => {
    setCheckoutPlanId(planId);
    try {
      const { paymentUrl } = await billingApi.initiateCheckout(planId, selectedCycle);
      // SSLCommerz requires a top-level navigation to its hosted checkout —
      // never open this in an iframe/new tab.
      window.location.href = paymentUrl;
    } catch (err: any) {
      console.error('Failed to initiate checkout', err);
      toast.error(err.response?.data?.message || 'Failed to start checkout. Please try again.');
      setCheckoutPlanId(null);
    }
  };

  const handlePayPending = async () => {
    const pending = subscription?.pendingPaymentRequest;
    if (!pending || !pending.planId) {
      toast.error('This payment request is missing its plan — please contact support.');
      return;
    }
    setPayingPending(true);
    try {
      // Always creates a fresh checkout session — deliberately not reusing
      // any stored gateway URL, same as the plan-picker's Subscribe button.
      const { paymentUrl } = await billingApi.initiateCheckout(pending.planId, pending.billingCycle);
      window.location.href = paymentUrl;
    } catch (err: any) {
      console.error('Failed to initiate checkout for pending payment request', err);
      toast.error(err.response?.data?.message || 'Failed to start checkout. Please try again.');
      setPayingPending(false);
    }
  };

  const dateLabel = (() => {
    if (!subscription) return null;
    if (subscription.status === 'TRIALING') {
      return subscription.trialEndsAt ? { label: 'Trial ends', value: subscription.trialEndsAt } : null;
    }
    if (subscription.status === 'GRACE') {
      return subscription.graceEndsAt ? { label: 'Grace period ends', value: subscription.graceEndsAt } : null;
    }
    return subscription.currentPeriodEnd ? { label: 'Current period ends', value: subscription.currentPeriodEnd } : null;
  })();

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="flex items-center gap-3 text-slate-500">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500" />
          <span className="font-bold text-sm">Loading subscription details...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-3xl mx-auto p-8 glass-card border border-red-200 dark:border-red-500/20 rounded-3xl text-center space-y-3">
        <AlertTriangle className="w-10 h-10 text-red-500 mx-auto" />
        <p className="text-sm font-bold text-red-600 dark:text-red-400">Failed to load subscription information</p>
        <Button variant="secondary" onClick={handleRetry}>Retry</Button>
      </div>
    );
  }

  const statusInfo = subscription ? STATUS_BADGE[subscription.status] : null;
  const pendingPayment = subscription?.pendingPaymentRequest ?? null;

  return (
    <div className="space-y-8 max-w-6xl mx-auto pb-12 animate-fadeIn">
      {/* Header */}
      <div className="glass-card p-6 bg-white/50 dark:bg-slate-900/50 border border-slate-200 dark:border-white/10 rounded-3xl relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-600 via-primary-500 to-accent-400" />
        <div className="flex items-center gap-4">
          <div className="p-3 bg-blue-500/10 text-blue-600 dark:text-blue-400 rounded-2xl">
            <CreditCard className="w-8 h-8" />
          </div>
          <div>
            <h2 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">Subscription &amp; Billing</h2>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
              Manage your institution's subscription plan and billing cycle.
            </p>
          </div>
        </div>
      </div>

      {/* Pending payment request — a super admin generated a payment link for this institution */}
      {pendingPayment && (
        <div className="glass-card p-6 bg-blue-50 dark:bg-blue-500/5 border border-blue-200 dark:border-blue-500/20 rounded-3xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="p-2.5 bg-blue-100 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 rounded-xl flex-shrink-0">
              <Wallet className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-slate-900 dark:text-white">Payment Requested</h4>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 leading-relaxed">
                A payment of <strong className="text-slate-900 dark:text-white">{formatCurrency(pendingPayment.amount, pendingPayment.currency)}</strong> for{' '}
                <strong className="text-slate-900 dark:text-white">{pendingPayment.planName || 'your subscription'}</strong> ({BILLING_CYCLE_LABELS[pendingPayment.billingCycle]}) was requested by
                the platform administrator on {new Date(pendingPayment.requestedAt).toLocaleDateString()}.
              </p>
            </div>
          </div>
          <Button variant="gradient" isLoading={payingPending} onClick={handlePayPending} className="flex-shrink-0">
            Pay Now
          </Button>
        </div>
      )}

      {/* Current subscription summary */}
      {subscription && (
        <div className="glass-card p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-3xl shadow-xl space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1">Current Plan</span>
              <h3 className="text-xl font-black text-slate-900 dark:text-white">{subscription.plan?.name || 'No plan'}</h3>
              <p className="text-xs text-slate-500 mt-0.5">{BILLING_CYCLE_LABELS[subscription.billingCycle]} billing</p>
            </div>
            <div className="flex items-center gap-3">
              {statusInfo && <Badge variant={statusInfo.variant} className="text-xs px-3 py-1.5">{statusInfo.label}</Badge>}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4 border-t border-slate-100 dark:border-white/5">
            <div className="p-4 bg-slate-50 dark:bg-slate-950 rounded-2xl border border-slate-200 dark:border-white/5 flex items-center gap-3">
              <CalendarClock className="w-5 h-5 text-blue-500 flex-shrink-0" />
              <div className="text-xs">
                <span className="font-bold text-slate-900 dark:text-white block">{subscription.daysRemaining} day(s) remaining</span>
                {dateLabel && (
                  <span className="text-slate-500">
                    {dateLabel.label}: {new Date(dateLabel.value).toLocaleDateString()}
                  </span>
                )}
              </div>
            </div>
            <div className="p-4 bg-slate-50 dark:bg-slate-950 rounded-2xl border border-slate-200 dark:border-white/5 flex items-center gap-3">
              <BadgeCheck className="w-5 h-5 text-emerald-500 flex-shrink-0" />
              <div className="text-xs">
                <span className="font-bold text-slate-900 dark:text-white block">
                  {subscription.plan?.studentCap ? `${subscription.plan.studentCap} student cap` : 'Unlimited students'}
                </span>
                <span className="text-slate-500">Included with your current plan</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Renew / Change Plan */}
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <h3 className="text-lg font-extrabold text-slate-900 dark:text-white">Renew / Change Plan</h3>

          {/* Billing cycle toggle — applies to all plan cards at once */}
          <div className="inline-flex items-center bg-slate-100 dark:bg-slate-800 rounded-2xl p-1 self-start">
            {CYCLES.map((cycle) => (
              <button
                key={cycle}
                type="button"
                onClick={() => setSelectedCycle(cycle)}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
                  selectedCycle === cycle
                    ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-sm'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                {BILLING_CYCLE_LABELS[cycle]}
              </button>
            ))}
          </div>
        </div>

        {plans.length === 0 ? (
          <div className="glass-card p-10 text-center text-sm text-slate-500 rounded-3xl border border-slate-200 dark:border-white/10">
            No subscription plans are currently available. Please contact support.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {plans.map((plan) => {
              const price = plan.prices.find((p) => p.billingCycle === selectedCycle);
              const isCurrentPlan = subscription?.planId === plan.id && subscription?.billingCycle === selectedCycle;
              return (
                <div
                  key={plan.id}
                  className={`glass-card p-6 rounded-3xl border shadow-xl flex flex-col gap-4 bg-white dark:bg-slate-900 ${
                    isCurrentPlan
                      ? 'border-blue-400 dark:border-blue-500/50 ring-2 ring-blue-400/30'
                      : 'border-slate-200 dark:border-white/10'
                  }`}
                >
                  <div>
                    <h4 className="text-lg font-black text-slate-900 dark:text-white">{plan.name}</h4>
                    {plan.description && <p className="text-xs text-slate-500 mt-1 leading-relaxed">{plan.description}</p>}
                  </div>

                  <div>
                    {price ? (
                      <div>
                        <span className="text-2xl font-black text-slate-900 dark:text-white">
                          {formatCurrency(price.amount, price.currency)}
                        </span>
                        <span className="text-xs text-slate-500"> / {BILLING_CYCLE_LABELS[selectedCycle].toLowerCase()}</span>
                      </div>
                    ) : (
                      <span className="text-xs italic text-slate-400">No price set for {BILLING_CYCLE_LABELS[selectedCycle]}</span>
                    )}
                  </div>

                  <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                    <span>{plan.studentCap ? `Up to ${plan.studentCap} students` : 'Unlimited students'}</span>
                  </div>

                  <div className="mt-auto pt-2">
                    <Button
                      variant={isCurrentPlan ? 'secondary' : 'gradient'}
                      className="w-full justify-center"
                      disabled={!price || checkoutPlanId === plan.id}
                      isLoading={checkoutPlanId === plan.id}
                      onClick={() => handleSubscribe(plan.id)}
                    >
                      {checkoutPlanId === plan.id ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" /> Redirecting...
                        </>
                      ) : isCurrentPlan ? (
                        'Renew Current Plan'
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
      <div className="space-y-4">
        <h3 className="text-lg font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
          <Receipt className="w-4 h-4 text-slate-400" /> Payment History
        </h3>
        <div className="glass-card overflow-hidden rounded-3xl border border-slate-200 dark:border-white/10">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-950 text-slate-500 dark:text-slate-400 text-[11px] font-bold uppercase tracking-wider border-b border-slate-200 dark:border-white/5">
                  <th className="p-4 pl-6">Transaction ID</th>
                  <th className="p-4">Amount</th>
                  <th className="p-4">Status</th>
                  <th className="p-4">Date</th>
                  <th className="p-4 pr-6 text-right">Receipt</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-white/5 text-xs text-slate-700 dark:text-slate-300">
                {payments.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-slate-400 italic">No payment records yet.</td>
                  </tr>
                ) : (
                  payments.map((payment) => {
                    const badge = PAYMENT_STATUS_BADGE[payment.status];
                    return (
                      <tr key={payment.id} className="hover:bg-slate-50/50 dark:hover:bg-white/5 transition-colors">
                        <td className="p-4 pl-6 font-mono text-slate-700 dark:text-slate-300">
                          {payment.gatewayTransactionId || payment.id.slice(0, 10)}
                        </td>
                        <td className="p-4 font-bold text-slate-900 dark:text-white">{formatCurrency(payment.amount, payment.currency)}</td>
                        <td className="p-4"><Badge variant={badge.variant}>{badge.label}</Badge></td>
                        <td className="p-4 text-slate-500">{new Date(payment.createdAt).toLocaleDateString()}</td>
                        <td className="p-4 pr-6 text-right">
                          <Link
                            to={`/billing/receipt/${payment.id}`}
                            className="px-2.5 py-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 dark:bg-blue-500/10 dark:hover:bg-blue-500/20 text-blue-600 dark:text-blue-400 font-bold transition-all text-[11px] inline-block"
                          >
                            View
                          </Link>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SubscriptionOverview;
