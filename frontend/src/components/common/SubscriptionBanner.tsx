import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Clock } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { billingApi, type MySubscription } from '@/api/billing.api';

export const SubscriptionBanner: React.FC = () => {
  const { user } = useAuthStore();
  const [subscription, setSubscription] = useState<MySubscription | null>(null);

  useEffect(() => {
    if (user?.role !== 'ADMIN') return;
    let cancelled = false;
    billingApi
      .getMySubscription()
      .then((sub) => {
        if (!cancelled) setSubscription(sub);
      })
      .catch(() => {
        // Silently ignore — a missing/failed subscription fetch should never
        // block the rest of the dashboard from rendering.
      });
    return () => {
      cancelled = true;
    };
  }, [user?.role]);

  if (user?.role !== 'ADMIN' || !subscription || subscription.bannerLevel === 'none') return null;

  const isGrace = subscription.bannerLevel === 'grace';

  const message = (() => {
    switch (subscription.bannerLevel) {
      case 'trial-ending':
        return `Your free trial ends in ${subscription.daysRemaining} day(s).`;
      case 'renewal-due':
        return `Your subscription renews in ${subscription.daysRemaining} day(s) — renew now to avoid interruption.`;
      case 'grace':
        return `Your subscription has expired. You have ${subscription.daysRemaining} day(s) left before your account is suspended.`;
      default:
        return null;
    }
  })();

  if (!message) return null;

  return (
    <div
      className={`px-4 py-2.5 shadow-md flex items-center justify-between z-40 text-xs sm:text-sm font-medium animate-fadeIn ${
        isGrace
          ? 'bg-gradient-to-r from-red-600 via-rose-600 to-red-700 text-white'
          : 'bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 text-white'
      }`}
    >
      <div className="flex items-center gap-2.5">
        {isGrace ? <AlertTriangle className="w-4 h-4 flex-shrink-0" /> : <Clock className="w-4 h-4 flex-shrink-0" />}
        <span>{message}</span>
      </div>

      <Link
        to="/billing"
        className="flex items-center gap-1.5 bg-white text-slate-900 hover:bg-slate-50 px-3 py-1.5 rounded-xl font-bold transition-all shadow-xs active:scale-95 text-xs min-h-[36px]"
      >
        {isGrace ? 'Renew Now' : 'View Billing'}
      </Link>
    </div>
  );
};

export default SubscriptionBanner;
