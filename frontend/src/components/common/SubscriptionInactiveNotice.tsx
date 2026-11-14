import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Lock, X } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { useMySubscription } from '@/hooks/useBilling';
import { usePlatformBillingStatus } from '@/hooks/usePlatformBilling';
import { useT } from '@/i18n';
import { SUBSCRIPTION_INACTIVE_EVENT } from '@/api/client';

/**
 * P0: persistent notice for a read-only (expired) school account. Appears as
 * soon as the server answers any request with 402 SUBSCRIPTION_INACTIVE, and
 * — for admins, whose subscription is fetched anyway — straight away when the
 * subscription is RESTRICTED. Every role sees it; the wording differs:
 *   - ADMIN: "Subscription expired — pay to continue" + a link to billing
 *   - other staff: the same headline, asked to contact the school admin
 *   - STUDENT / GUARDIAN: a softer "School account inactive, contact the school"
 */
export const SubscriptionInactiveNotice: React.FC = () => {
  const t = useT();
  const { user, supportSession } = useAuthStore();
  const { data: subscription } = useMySubscription();
  // P1: platform-billed schools are covered by PlatformBillingBanner / the disabled screen.
  const { data: platform } = usePlatformBillingStatus();
  const [flagged, setFlagged] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const onInactive = () => {
      setFlagged(true);
      setDismissed(false);
    };
    window.addEventListener(SUBSCRIPTION_INACTIVE_EVENT, onInactive);
    return () => window.removeEventListener(SUBSCRIPTION_INACTIVE_EVENT, onInactive);
  }, []);

  const restricted = flagged || subscription?.accessLevel === 'RESTRICTED';
  if (!user || user.role === 'SUPER_ADMIN' || supportSession || !restricted || dismissed || platform?.hasProfile || platform?.accessLevel === 'DISABLED') return null;

  const isAdmin = user.role === 'ADMIN';
  const isFamily = user.role === 'STUDENT' || user.role === 'GUARDIAN';

  const message = isFamily
    ? t('School account inactive — please contact the school.')
    : isAdmin
      ? t('Subscription expired — pay to continue. You can still view data, but changes are blocked until you renew.')
      : t('Subscription expired — the school account is read-only. Please ask your school admin to renew.');

  return (
    <div
      role="alert"
      className="px-4 py-2.5 flex items-center justify-between gap-3 z-40 text-xs sm:text-sm font-medium border-b bg-rose-700 text-white border-rose-800"
    >
      <div className="flex items-center gap-2 min-w-0">
        <Lock className="w-4 h-4 flex-shrink-0" aria-hidden="true" />
        <span className="line-clamp-3 sm:line-clamp-none">{message}</span>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        {isAdmin && (
          <Link
            to="/billing"
            className="inline-flex items-center bg-white text-slate-900 hover:bg-slate-100 px-3 py-1.5 rounded-lg font-semibold transition-colors text-xs min-h-[36px]"
          >
            {t('Pay now')}
          </Link>
        )}
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="inline-flex items-center justify-center min-h-[36px] min-w-[36px] rounded-lg hover:bg-rose-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
          aria-label={t('Dismiss')}
        >
          <X className="w-4 h-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
};

export default SubscriptionInactiveNotice;
