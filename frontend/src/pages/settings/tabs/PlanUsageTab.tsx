import React from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle2, CreditCard, Gauge, Lock, Rocket } from 'lucide-react';
import toast from 'react-hot-toast';
import { Alert, Badge, Button, Card, CardHeader, ErrorState, SkeletonStatGrid, SkeletonText } from '@/components/ui';
import { EmptyState } from '@/components/common/EmptyState';
import { useAuthStore } from '@/store/authStore';
import { formatDate, formatNumber, useT } from '@/i18n';
import { cn } from '@/lib/cn';
import {
  apiErrorMessage,
  useEntitlements,
  useOnboarding,
  useUpdateOnboarding,
  type LimitWithUsage,
} from '@/components/saas/saas.api';

const STATUS_VARIANT: Record<string, 'success' | 'warning' | 'danger' | 'info' | 'neutral'> = {
  ACTIVE: 'success',
  TRIALING: 'info',
  GRACE: 'warning',
  EXPIRED: 'danger',
  CANCELLED: 'neutral',
};

const UsageBar: React.FC<{ limit: LimitWithUsage }> = ({ limit }) => {
  const t = useT();
  const pct = limit.percent ?? 0;
  const tone = pct >= 100 ? 'bg-red-600' : pct >= 80 ? 'bg-amber-500' : 'bg-primary-600';
  const usedText = limit.used === null ? t('Not tracked yet') : formatNumber(limit.used);
  const limitText = limit.limit === null ? t('Unlimited') : formatNumber(limit.limit);
  return (
    <div className="rounded-xl border border-slate-200 dark:border-white/8 p-4">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-medium text-slate-700 dark:text-slate-200">{t(limit.label)}</span>
        <span className="text-sm tabular-nums text-slate-900 dark:text-white">
          <strong>{usedText}</strong>
          <span className="text-slate-500 dark:text-slate-400"> / {limitText}</span>
        </span>
      </div>
      {limit.limit !== null && limit.used !== null ? (
        <div
          className="h-2 mt-2 rounded-full bg-slate-100 dark:bg-white/8 overflow-hidden"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct}
          aria-label={t(limit.label)}
        >
          <div className={cn('h-full rounded-full', tone)} style={{ width: `${pct}%` }} />
        </div>
      ) : (
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5">
          {limit.limit === null ? t('No limit on your plan') : t('Usage for this metric is not recorded yet')}
        </p>
      )}
      {limit.period === 'month' && <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1.5">{t('Resets on the 1st of each month (UTC)')}</p>}
    </div>
  );
};

const PlanUsageTab: React.FC = () => {
  const t = useT();
  const navigate = useNavigate();
  const role = useAuthStore((s) => s.user?.role);
  const { data, isLoading, isError, refetch } = useEntitlements();
  const onboarding = useOnboarding();
  const updateOnboarding = useUpdateOnboarding();

  if (isLoading) {
    return (
      <div className="space-y-6">
        <SkeletonText lines={2} />
        <SkeletonStatGrid count={4} />
      </div>
    );
  }
  if (isError || !data) {
    return <ErrorState title={t('Could not load your plan')} onRetry={() => refetch()} />;
  }

  const limits = Object.values(data.limits);
  const features = Object.values(data.features).sort((a, b) => Number(b.enabled) - Number(a.enabled) || a.label.localeCompare(b.label));
  const sub = data.subscription;

  const restoreChecklist = () =>
    updateOnboarding.mutate(
      { dismissed: false },
      {
        onSuccess: () => toast.success(t('Setup checklist is back on your dashboard.')),
        onError: (err) => toast.error(apiErrorMessage(err, t('Could not save. Please try again.'))),
      }
    );

  return (
    <div className="space-y-6">
      <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
        <Gauge className="w-5 h-5 text-blue-500 dark:text-blue-400" />
        {t('Plan & usage')}
      </h3>

      <Card>
        <CardHeader
          icon={<CreditCard className="w-5 h-5" />}
          title={data.plan ? data.plan.name : t('No subscription plan')}
          description={
            sub
              ? sub.status === 'TRIALING' && sub.trialEndsAt
                ? t('Trial ends {date}', { date: formatDate(sub.trialEndsAt) })
                : sub.currentPeriodEnd
                  ? t('Current period ends {date}', { date: formatDate(sub.currentPeriodEnd) })
                  : undefined
              : t('Your institution is not on a plan, so no limits apply.')
          }
          actions={
            <div className="flex items-center gap-2">
              {sub && <Badge variant={STATUS_VARIANT[sub.status] ?? 'neutral'}>{t(sub.status.charAt(0) + sub.status.slice(1).toLowerCase())}</Badge>}
              {role === 'ADMIN' && (
                <Button size="sm" variant="outline" onClick={() => navigate('/billing')}>
                  {t('Manage subscription')}
                </Button>
              )}
            </div>
          }
        />
        {!data.configured && (
          <Alert tone="info">
            {t('Per-feature plan limits become available after the latest database update. Until then only the plan’s student cap applies.')}
          </Alert>
        )}
      </Card>

      <section aria-labelledby="usage-heading" className="space-y-3">
        <h4 id="usage-heading" className="text-sm font-semibold text-slate-900 dark:text-white">{t('Usage')}</h4>
        {limits.length === 0 ? (
          <EmptyState compact title={t('No limits')} description={t('Your plan has no usage limits.')} />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {limits.map((l) => (
              <UsageBar key={l.resource} limit={l} />
            ))}
          </div>
        )}
      </section>

      <section aria-labelledby="features-heading" className="space-y-3">
        <h4 id="features-heading" className="text-sm font-semibold text-slate-900 dark:text-white">{t('Modules')}</h4>
        {features.length === 0 ? (
          <EmptyState compact title={t('No modules configured')} />
        ) : (
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {features.map((f) => (
              <li
                key={f.key}
                className="flex items-center gap-2.5 rounded-lg border border-slate-200 dark:border-white/8 px-3 py-2.5 text-sm"
              >
                {f.enabled ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-300 shrink-0" aria-hidden />
                ) : (
                  <Lock className="w-4 h-4 text-slate-400 shrink-0" aria-hidden />
                )}
                <span className={cn('flex-1 min-w-0 truncate', f.enabled ? 'text-slate-800 dark:text-slate-100' : 'text-slate-500 dark:text-slate-400')}>
                  {t(f.label)}
                </span>
                <Badge variant={f.enabled ? 'success' : 'neutral'}>{f.enabled ? t('Included') : t('Not included')}</Badge>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Card>
        <CardHeader
          icon={<Rocket className="w-5 h-5" />}
          title={t('Setup checklist')}
          description={
            onboarding.data
              ? t('{done} of {total} steps complete', {
                  done: formatNumber(onboarding.data.completed),
                  total: formatNumber(onboarding.data.total),
                })
              : t('Track the steps to get your institution running.')
          }
          actions={
            <div className="flex flex-wrap gap-2">
              {onboarding.data?.dismissed && (
                <Button size="sm" variant="outline" onClick={restoreChecklist} isLoading={updateOnboarding.isPending}>
                  {t('Show on dashboard')}
                </Button>
              )}
              <Button size="sm" onClick={() => navigate('/onboarding/setup')}>
                {t('Open setup wizard')}
              </Button>
            </div>
          }
        />
        {onboarding.isError && <ErrorState compact onRetry={() => onboarding.refetch()} />}
      </Card>
    </div>
  );
};

export default PlanUsageTab;
