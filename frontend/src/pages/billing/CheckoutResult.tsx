import React, { useEffect, useRef, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { CheckCircle2, XCircle, Clock, ArrowLeft } from 'lucide-react';
import { billingApi, type MySubscription } from '@/api/billing.api';

type RedirectStatus = 'success' | 'fail' | 'cancel' | null;

const POLL_INTERVAL_MS = 3000;
const POLL_TIMEOUT_MS = 30000;

const CheckoutResult: React.FC = () => {
  const [searchParams] = useSearchParams();
  const redirectStatus = (searchParams.get('status') as RedirectStatus) || null;

  const [subscription, setSubscription] = useState<MySubscription | null>(null);
  const [polling, setPolling] = useState(redirectStatus === 'success');
  const [error, setError] = useState<string | null>(null);
  const startedAtRef = useRef<number>(Date.now());

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

    if (redirectStatus === 'success') {
      // The redirect might arrive before the IPN has credited the payment —
      // poll briefly for the authoritative status rather than trusting the URL.
      fetchOnce().then((sub) => {
        if (sub?.status === 'ACTIVE') {
          setPolling(false);
          return;
        }
        intervalId = setInterval(async () => {
          const latest = await fetchOnce();
          const timedOut = Date.now() - startedAtRef.current >= POLL_TIMEOUT_MS;
          if (latest?.status === 'ACTIVE' || timedOut) {
            setPolling(false);
            if (intervalId) clearInterval(intervalId);
          }
        }, POLL_INTERVAL_MS);
      });
    } else {
      // fail/cancel — no polling needed, just fetch current status for reference.
      fetchOnce();
    }

    return () => {
      cancelled = true;
      if (intervalId) clearInterval(intervalId);
    };
  }, [redirectStatus]);

  const isActive = subscription?.status === 'ACTIVE';

  const renderContent = () => {
    if (redirectStatus === 'fail') {
      return {
        icon: <XCircle className="w-14 h-14 text-red-500" />,
        title: 'Payment Failed',
        message: 'Your payment could not be completed. Please try again or use a different payment method.',
      };
    }
    if (redirectStatus === 'cancel') {
      return {
        icon: <XCircle className="w-14 h-14 text-amber-500" />,
        title: 'Payment Cancelled',
        message: 'You cancelled the payment before it was completed. No charges were made.',
      };
    }
    if (polling) {
      return {
        icon: <Clock className="w-14 h-14 text-blue-500 animate-pulse" />,
        title: 'Processing Payment',
        message: 'Payment is being processed, please check back shortly.',
      };
    }
    if (isActive) {
      return {
        icon: <CheckCircle2 className="w-14 h-14 text-emerald-500" />,
        title: 'Payment Successful',
        message: "Payment successful — your subscription is now active.",
      };
    }
    return {
      icon: <Clock className="w-14 h-14 text-amber-500" />,
      title: 'Still Processing',
      message: 'Payment is being processed, please check back shortly.',
    };
  };

  const content = renderContent();

  return (
    <div className="max-w-xl mx-auto py-16 animate-fadeIn">
      <div className="glass-card p-10 bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-3xl shadow-xl text-center space-y-5">
        <div className="flex justify-center">{content.icon}</div>
        <h2 className="text-xl font-black text-slate-900 dark:text-white">{content.title}</h2>
        <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">{content.message}</p>

        {error && <p className="text-xs text-red-500">{error}</p>}

        {subscription && (
          <div className="p-4 bg-slate-50 dark:bg-slate-950 rounded-2xl border border-slate-200 dark:border-white/5 text-xs text-left space-y-1">
            <div className="flex justify-between">
              <span className="text-slate-500">Plan:</span>
              <span className="font-bold text-slate-900 dark:text-white">{subscription.plan?.name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Status:</span>
              <span className="font-bold text-slate-900 dark:text-white">{subscription.status}</span>
            </div>
          </div>
        )}

        <Link
          to="/billing"
          className="inline-flex items-center gap-2 bg-gradient-to-r from-blue-600 to-primary-600 hover:from-blue-500 hover:to-primary-500 text-white px-5 py-2.5 rounded-2xl transition-all shadow-lg shadow-blue-500/20 text-xs font-bold"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Billing
        </Link>
      </div>
    </div>
  );
};

export default CheckoutResult;
