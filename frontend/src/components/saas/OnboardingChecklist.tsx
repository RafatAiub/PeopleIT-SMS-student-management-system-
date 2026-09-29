import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CheckCircle2, Circle, ChevronRight, Rocket, SkipForward, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { Badge, Button, Card, CardHeader, ErrorState, SkeletonText } from '@/components/ui';
import { useAuthStore } from '@/store/authStore';
import { formatNumber, useT } from '@/i18n';
import { cn } from '@/lib/cn';
import { apiErrorMessage, useOnboarding, useUpdateOnboarding, type OnboardingItem } from './saas.api';

interface OnboardingChecklistProps {
  className?: string;
  /** Max incomplete steps listed before "Open setup wizard" (default 5). */
  maxItems?: number;
}

/**
 * Admin dashboard card: "Get your school ready" — computed from real data by
 * GET /saas/onboarding. Hidden for non-admins, once dismissed, and once every
 * step is done or skipped.
 */
export const OnboardingChecklist: React.FC<OnboardingChecklistProps> = ({ className, maxItems = 5 }) => {
  const t = useT();
  const navigate = useNavigate();
  const role = useAuthStore((s) => s.user?.role);
  const institutionId = useAuthStore((s) => s.user?.institutionId);
  const isAdmin = (role === 'ADMIN' || role === 'SUPER_ADMIN') && Boolean(institutionId);
  const { data, isLoading, isError, refetch } = useOnboarding(isAdmin);
  const update = useUpdateOnboarding();

  if (!isAdmin) return null;

  if (isLoading) {
    return (
      <Card className={className}>
        <SkeletonText lines={4} />
      </Card>
    );
  }

  if (isError || !data) {
    return (
      <Card className={className}>
        <ErrorState compact title={t('Could not load the setup checklist')} onRetry={() => refetch()} />
      </Card>
    );
  }

  if (data.dismissed || data.allDone) return null;

  const pending = data.items.filter((i) => !i.done && !i.skipped);
  const shown = pending.slice(0, maxItems);

  const run = (patch: { dismissed?: boolean; skip?: string }, success: string) =>
    update.mutate(patch, {
      onSuccess: () => toast.success(t(success)),
      onError: (err) => toast.error(apiErrorMessage(err, t('Could not save. Please try again.'))),
    });

  return (
    <Card className={cn('relative', className)} aria-labelledby="onboarding-checklist-title">
      <CardHeader
        icon={<Rocket className="w-5 h-5 text-primary-600 dark:text-primary-300" />}
        title={<span id="onboarding-checklist-title">{t('Get your institution ready')}</span>}
        description={t('{done} of {total} steps complete', {
          done: formatNumber(data.completed),
          total: formatNumber(data.total),
        })}
        actions={
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t('Hide setup checklist')}
            title={t('Hide setup checklist')}
            onClick={() => run({ dismissed: true }, 'Checklist hidden. Reopen it from Settings → Plan & usage.')}
            disabled={update.isPending}
          >
            <X className="w-4 h-4" />
          </Button>
        }
      />

      <div
        className="h-2 w-full rounded-full bg-slate-100 dark:bg-white/8 overflow-hidden mb-4"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={data.percent}
        aria-label={t('Setup progress')}
      >
        <div className="h-full rounded-full bg-primary-600 transition-all" style={{ width: `${data.percent}%` }} />
      </div>

      <ul className="divide-y divide-slate-100 dark:divide-white/6">
        {shown.map((item) => (
          <ChecklistRow
            key={item.key}
            item={item}
            onSkip={() => run({ skip: item.key }, 'Step skipped')}
            busy={update.isPending}
          />
        ))}
      </ul>

      <div className="flex flex-wrap items-center justify-between gap-2 mt-4">
        <p className="text-xs text-slate-500 dark:text-slate-400">
          {pending.length > shown.length
            ? t('{n} more steps in the setup wizard', { n: formatNumber(pending.length - shown.length) })
            : t('Steps tick off automatically as you add data.')}
        </p>
        <Button size="sm" variant="outline" rightIcon={<ChevronRight className="w-4 h-4" />} onClick={() => navigate('/onboarding/setup')}>
          {t('Open setup wizard')}
        </Button>
      </div>
      {!data.persisted && (
        <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-2">
          {t('Skipped and hidden steps are saved in this browser only until the latest database update is applied.')}
        </p>
      )}
    </Card>
  );
};

const ChecklistRow: React.FC<{ item: OnboardingItem; onSkip: () => void; busy: boolean }> = ({ item, onSkip, busy }) => {
  const t = useT();
  return (
    <li className="flex items-center gap-3 py-2.5">
      {item.done ? (
        <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-300 shrink-0" aria-hidden />
      ) : (
        <Circle className="w-5 h-5 text-slate-300 dark:text-slate-600 shrink-0" aria-hidden />
      )}
      <Link to={item.href} className="flex-1 min-w-0 group">
        <span className="flex items-center gap-2">
          <span className="text-sm font-medium text-slate-900 dark:text-white group-hover:text-primary-600 dark:group-hover:text-primary-300 truncate">
            {t(item.title)}
          </span>
          {item.optional && <Badge variant="neutral">{t('Optional')}</Badge>}
        </span>
        <span className="block text-xs text-slate-500 dark:text-slate-400 truncate">{t(item.description)}</span>
      </Link>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={t('Skip "{step}"', { step: t(item.title) })}
        title={t('Skip this step')}
        onClick={onSkip}
        disabled={busy}
      >
        <SkipForward className="w-4 h-4" />
      </Button>
    </li>
  );
};

export default OnboardingChecklist;
