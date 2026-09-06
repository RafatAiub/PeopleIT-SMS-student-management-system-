import React, { useEffect, useRef, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, XCircle, Clock, ArrowLeft, Loader2 } from 'lucide-react';
import { billingApi, type MySubscription } from '@/api/billing.api';
import { BILLING_SUBSCRIPTION_KEY } from '@/hooks/useBilling';
import { Button } from '@/components/ui/Button';

type RedirectStatus = 'success' | 'fail' | 'cancel' | null;

const POLL_INTERVAL_MS = 3000;
const POLL_TIMEOUT_MS = 30000;

type Accent = 'success' | 'pending' | 'danger' | 'warning';

const ACCENT: Record<Accent, { ring: string; icon: string }> = {
  success: { ring: 'bg-emerald-100 dark:bg-emerald-500/15', icon: 'text-emerald-600 dark:text-emerald-400' },
  pending: { ring: 'bg-blue-100 dark:bg-blue-500/15', icon: 'text-blue-600 dark:text-blue-400' },
  danger: { ring: 'bg-rose-100 dark:bg-rose-500/15', icon: 'text-rose-600 dark:text-rose-400' },
  warning: { ring: 'bg-amber-100 dark:bg-amber-500/15', icon: 'text-amber-600 dark:text-amber-400' },
};

const CheckoutResult: React.FC = () => {
  const [searchParams] = useSearchParams();
  const redirectStatus = (searchParams.get('status') as RedirectStatus) || null;

  const [subscription, setSubscription] = useState<MySubscription | null>(null);
  const [polling, setPolling] = useState(redirectStatus === 'success');
  const [error, setError] = useState<string | null>(null);
  const startedAtRef = useRef<number>(Date.now());
  const queryClient = useQueryClient();

  useEffect(() => {
    let intervalId: ReturnType<typeof setInterval> | undefined;
    let cancelled = false;

    const fetchOnce = async (): Promise<MySubscription | null> => {
      try {
        const sub = await billingApi.getMySubscription();
        if (!cancelled) setSubscription(sub);
        return sub;
      } catch (err: any) {
        if (!cancelled) setError(err.response?.data?.message || 'Failed to check subscription status');
        return null;
      }
    };

    const invalidateSharedSubscriptionCache = () => {
      queryClient.invalidateQueries({ queryKey: [BILLING_SUBSCRIPTION_KEY] });
    };

    if (redirectStatus === 'success') {
      fetchOnce().then((sub) => {
        if (sub?.status === 'ACTIVE') {
          setPolling(false);
          invalidateSharedSubscriptionCache();
          return;
        }
        intervalId = setInterval(async () => {
          const latest = await fetchOnce();
          const timedOut = Date.now() - startedAtRef.current >= POLL_TIMEOUT_MS;
          if (latest?.status === 'ACTIVE' || timedOut) {
            setPolling(false);
            if (intervalId) clearInterval(intervalId);
            if (latest?.status === 'ACTIVE') invalidateSharedSubscriptionCache();
          }
        }, POLL_INTERVAL_MS);
      });
    } else {
      fetchOnce();
    }

    return () => {
      cancelled = true;
      if (intervalId) clearInterval(intervalId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [redirectStatus]);

  const isActive = subscription?.status === 'ACTIVE';

  const view: { accent: Accent; Icon: React.ComponentType<{ className?: string }>; title: string; message: string } = (() => {
    if (redirectStatus === 'fail')
      return {
        accent: 'danger',
        Icon: XCircle,
        title: 'Payment failed',
        message: 'The payment could not be completed. No charge was made — you can try again from the billing page.',
      };
    if (redirectStatus === 'cancel')
      return {
        accent: 'warning',
        Icon: XCircle,
        title: 'Payment cancelled',
        message: 'You left the checkout before it finished. No charge was made.',
      };
    if (polling)
      return {
        accent: 'pending',
        Icon: Loader2,
        title: 'Confirming your payment',
        message: 'This usually takes a few seconds. You can safely stay on this page.',
      };
    if (isActive)
      return {
        accent: 'success',
        Icon: CheckCircle2,
        title: 'You\'re all set',
        message: 'Your payment went through and your subscription is active.',
      };
    return {
      accent: 'warning',
      Icon: Clock,
      title: 'Still processing',
      message: 'Your payment is taking a little longer than usual. Check the billing page again shortly.',
    };
  })();

  const accent = ACCENT[view.accent];

  return (
    <div className="max-w-md mx-auto py-16 px-4 animate-fadeIn">
      <div className="glass-card border border-slate-200 dark:border-white/10 rounded-2xl p-8 text-center">
        <div className={`w-16 h-16 rounded-2xl mx-auto flex items-center justify-center ${accent.ring}`}>
          <view.Icon className={`w-8 h-8 ${accent.icon} ${polling ? 'animate-spin' : ''}`} />
        </div>

        <h1 className="text-xl font-bold text-slate-900 dark:text-white mt-5">{view.title}</h1>
        <p className="text-sm text-slate-600 dark:text-slate-400 mt-2 leading-relaxed">{view.message}</p>

        {error && <p className="text-xs text-rose-500 mt-3">{error}</p>}

        {subscription && (
          <div className="mt-6 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-slate-950/50 p-4 text-left text-xs space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-slate-500 dark:text-slate-400">Plan</span>
              <span className="font-semibold text-slate-900 dark:text-white">{subscription.plan?.name ?? '—'}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-500 dark:text-slate-400">Status</span>
              <span className="font-semibold text-slate-900 dark:text-white">{subscription.status}</span>
            </div>
            {subscription.currentPeriodEnd && (
              <div className="flex items-center justify-between">
                <span className="text-slate-500 dark:text-slate-400">Renews on</span>
                <span className="font-semibold text-slate-900 dark:text-white">
                  {new Date(subscription.currentPeriodEnd).toLocaleDateString()}
                </span>
              </div>
            )}
          </div>
        )}

        <Link to="/billing" className="block mt-6">
          <Button variant="gradient" className="w-full justify-center">
            <ArrowLeft className="w-4 h-4" /> Back to billing
          </Button>
        </Link>
      </div>
    </div>
  );
};

export default CheckoutResult;
