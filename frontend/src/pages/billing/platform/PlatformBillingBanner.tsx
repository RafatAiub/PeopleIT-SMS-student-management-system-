import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Lock, Receipt, X } from 'lucide-react';
import { usePlatformBillingStatus } from '@/hooks/usePlatformBilling';
import { formatCurrency, formatDate, useT } from '@/i18n';
import { bannerKind, dayKey, isDismissedToday, isDismissible } from './platformBilling.logic';

const STORAGE_KEY = 'p1-bill-banner-dismissed';

function readDismissed(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

/**
 * P1: app-wide notice about the school's PeopleNIT bill.
 *   - ADMIN, unpaid bill (from the 1st): soft amber banner, dismissible for the day
 *   - ADMIN, overdue: red banner with Pay now (not dismissible)
 *   - every role, school RESTRICTED for non-payment: red read-only banner
 * DISABLED schools get the full "account disabled" screen instead.
 */
export const PlatformBillingBanner: React.FC = () => {
  const t = useT();
  const { data: status } = usePlatformBillingStatus();
  const [dismissed, setDismissed] = useState<boolean>(() => isDismissedToday(readDismissed()));
  const kind = bannerKind(status);
  if (kind === 'none' || (isDismissible(kind) && dismissed)) return null;

  const current = status?.summary?.current;
  const isAdmin = !!status?.isAdmin;
  const dismiss = () => {
    try {
      localStorage.setItem(STORAGE_KEY, dayKey());
    } catch {
      /* private mode — dismiss for this view only */
    }
    setDismissed(true);
  };

  let message: string;
  if (kind === 'restricted') {
    message = isAdmin
      ? t('Payment overdue — pay now. The school account is read-only until the bill is paid.')
      : t('Payment overdue — the school account is read-only. Please ask your school admin to pay the PeopleNIT bill.');
  } else if (kind === 'overdue') {
    message = t('Your PeopleNIT bill of {amount} is overdue. Please pay now to avoid restrictions.', {
      amount: formatCurrency(status?.summary?.totalDue ?? 0),
    });
  } else {
    message = t('Your PeopleNIT bill of {amount} is due by {date}.', {
      amount: formatCurrency(current?.amountDue ?? status?.summary?.totalDue ?? 0),
      date: current ? formatDate(current.dueDate) : '—',
    });
  }

  const tone =
    kind === 'due'
      ? 'bg-amber-50 text-amber-900 border-amber-200 dark:bg-amber-500/10 dark:text-amber-100 dark:border-amber-500/30'
      : 'bg-rose-700 text-white border-rose-800';
  const Icon = kind === 'restricted' ? Lock : kind === 'overdue' ? AlertTriangle : Receipt;

  return (
    <div role={kind === 'due' ? 'status' : 'alert'} className={`px-4 py-2.5 flex items-center justify-between gap-3 z-40 text-xs sm:text-sm font-medium border-b ${tone}`}>
      <div className="flex items-center gap-2 min-w-0">
        <Icon className="w-4 h-4 flex-shrink-0" aria-hidden="true" />
        <span className="line-clamp-3 sm:line-clamp-none">{message}</span>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        {isAdmin && (
          <Link
            to={current ? `/billing?invoice=${current.id}` : '/billing'}
            className={`inline-flex items-center px-3 py-1.5 rounded-lg font-semibold transition-colors text-xs min-h-[36px] ${
              kind === 'due' ? 'bg-primary-600 text-white hover:bg-primary-700' : 'bg-white text-slate-900 hover:bg-slate-100'
            }`}
          >
            {t('Pay now')}
          </Link>
        )}
        {isDismissible(kind) && (
          <button
            type="button"
            onClick={dismiss}
            className="inline-flex items-center justify-center min-h-[36px] min-w-[36px] rounded-lg hover:bg-amber-100 dark:hover:bg-amber-500/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-600"
            aria-label={t('Hide for today')}
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        )}
      </div>
    </div>
  );
};

export default PlatformBillingBanner;
