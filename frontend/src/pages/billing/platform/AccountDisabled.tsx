import React from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { LogOut, ShieldOff } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { useAuth } from '@/hooks/useAuth';
import { usePlatformBillingStatus } from '@/hooks/usePlatformBilling';
import { formatCurrency, useT } from '@/i18n';
import { LogoMark } from '@/components/common/LogoMark';

/**
 * P1: full-screen notice for a DISABLED school. Every role lands here; the
 * ADMIN gets the Pay button (the billing APIs stay open), everyone else is
 * asked to contact the school admin.
 */
const AccountDisabled: React.FC = () => {
  const t = useT();
  const { user } = useAuthStore();
  const { logout } = useAuth();
  const navigate = useNavigate();
  const { data: status, isLoading } = usePlatformBillingStatus();

  if (!isLoading && status && status.accessLevel !== 'DISABLED') return <Navigate to="/" replace />;

  const isAdmin = user?.role === 'ADMIN';
  const isFamily = user?.role === 'STUDENT' || user?.role === 'GUARDIAN';
  const due = status?.summary?.totalDue ?? 0;

  return (
    <main className="min-h-screen bg-slate-50 dark:bg-surface-900 flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm p-6 sm:p-8 text-center space-y-5">
        <div className="flex justify-center">
          <LogoMark />
        </div>
        <div className="mx-auto w-14 h-14 rounded-full bg-rose-100 dark:bg-rose-500/15 flex items-center justify-center">
          <ShieldOff className="w-7 h-7 text-rose-700 dark:text-rose-300" aria-hidden="true" />
        </div>
        <div className="space-y-2">
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">{t('Account disabled — pay to reactivate')}</h1>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            {isAdmin
              ? t('Your school account is switched off because the PeopleNIT bill is unpaid. Pay the bill and the account is switched back on automatically.')
              : isFamily
                ? t('School account inactive — please contact the school.')
                : t('Your school account is switched off. Please contact your school admin.')}
          </p>
          {isAdmin && due > 0 && (
            <p className="text-2xl font-extrabold text-slate-900 dark:text-white" aria-label={t('Amount due')}>
              {formatCurrency(due)}
            </p>
          )}
        </div>
        <div className="flex flex-col gap-2">
          {isAdmin && (
            <Link to="/billing" className="w-full justify-center min-h-11 inline-flex items-center rounded-xl bg-primary-600 hover:bg-primary-700 text-white font-semibold">
              {t('Pay now')}
            </Link>
          )}
          <button
            type="button"
            onClick={() => logout.mutate(undefined, { onSettled: () => navigate('/login') })}
            className="w-full min-h-11 inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 font-semibold"
          >
            <LogOut className="w-4 h-4" aria-hidden="true" />
            {t('Sign out')}
          </button>
        </div>
      </div>
    </main>
  );
};

export default AccountDisabled;
