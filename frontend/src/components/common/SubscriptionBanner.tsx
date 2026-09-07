import React from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Clock } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { useMySubscription } from '@/hooks/useBilling';

export const SubscriptionBanner: React.FC = () => {
  const { user } = useAuthStore();
  const { data: subscription } = useMySubscription();

  if (user?.role !== 'ADMIN' || !subscription || subscription.bannerLevel === 'none') return null;

  const isGrace = subscription.bannerLevel === 'grace';
  const days = subscription.daysRemaining;

  const message = (() => {
    switch (subscription.bannerLevel) {
      case 'trial-ending':
        return `Your free trial ends in ${days} day${days === 1 ? '' : 's'}. Choose a plan to keep access.`;
      case 'renewal-due':
        return `Your subscription renews in ${days} day${days === 1 ? '' : 's'} — renew now to avoid interruption.`;
      case 'grace':
        return `Your subscription has expired. ${days} day${days === 1 ? '' : 's'} left before your account is suspended.`;
      default:
        return null;
    }
  })();

  if (!message) return null;

  return (
    <div
      role={isGrace ? 'alert' : 'status'}
      className={`px-4 py-2.5 flex items-center justify-between gap-3 z-40 text-xs sm:text-sm font-medium animate-fadeIn border-b ${
        isGrace
          ? 'bg-rose-600 text-white border-rose-700'
          : 'bg-amber-500 text-white border-amber-600'
      }`}
    >
      <div className="flex items-center gap-2 min-w-0">
        {isGrace ? (
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
        ) : (
          <Clock className="w-4 h-4 flex-shrink-0" />
        )}
        <span className="line-clamp-2 sm:line-clamp-none">{message}</span>
      </div>

      <Link
        to="/billing"
        className="flex-shrink-0 inline-flex items-center bg-white text-slate-900 hover:bg-slate-100 px-3 py-1.5 rounded-lg font-semibold transition-colors text-xs min-h-[36px]"
      >
        {isGrace ? 'Renew now' : 'View billing'}
      </Link>
    </div>
  );
};

export default SubscriptionBanner;
