import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, CheckCircle2, Circle, ExternalLink, Globe2, PartyPopper, RotateCcw, SkipForward } from 'lucide-react';
import toast from 'react-hot-toast';
import { Badge, Button, Card, ErrorState, PageHeader, Skeleton, SkeletonText } from '@/components/ui';
import { formatNumber, useT } from '@/i18n';
import { cn } from '@/lib/cn';
import { apiErrorMessage, useOnboarding, useUpdateOnboarding, type OnboardingItem } from '@/components/saas/saas.api';
import { InstitutionDefaultsCard } from '../settings/tabs/InstitutionDefaultsCard';

// =============================================================================
// Setup wizard (SUPER_ADMIN, ADMIN) — /onboarding/setup
// A stepper over the computed onboarding checklist (GET /saas/onboarding),
// with regional settings first. Steps complete themselves as real data is
// added on the linked pages; optional steps can be skipped.
// =============================================================================

type WizardStep =
  | { kind: 'regional'; key: 'regional'; title: string }
  | { kind: 'item'; key: string; title: string; item: OnboardingItem }
  | { kind: 'finish'; key: 'finish'; title: string };

const StepIcon: React.FC<{ state: 'done' | 'skipped' | 'todo'; active: boolean }> = ({ state, active }) => {
  if (state === 'done') return <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-300 shrink-0" aria-hidden />;
  if (state === 'skipped') return <SkipForward className="w-5 h-5 text-slate-400 shrink-0" aria-hidden />;
  return <Circle className={cn('w-5 h-5 shrink-0', active ? 'text-primary-600' : 'text-slate-300 dark:text-slate-600')} aria-hidden />;
};

const SetupWizard: React.FC = () => {
  const t = useT();
  const navigate = useNavigate();
  const { data, isLoading, isError, refetch } = useOnboarding();
  const update = useUpdateOnboarding();
  const [index, setIndex] = useState(0);
  const [regionalSaved, setRegionalSaved] = useState(false);

  const steps: WizardStep[] = useMemo(
    () => [
      { kind: 'regional', key: 'regional', title: 'Regional settings' },
      ...(data?.items ?? []).map((item) => ({ kind: 'item' as const, key: item.key, title: item.title, item })),
      { kind: 'finish', key: 'finish', title: 'All set' },
    ],
    [data]
  );

  // First visit: jump to the first incomplete checklist step.
  const [positioned, setPositioned] = useState(false);
  useEffect(() => {
    if (!data || positioned) return;
    const firstOpen = steps.findIndex((s) => s.kind === 'item' && !s.item.done && !s.item.skipped);
    setIndex(firstOpen > 0 ? firstOpen : 0);
    setPositioned(true);
  }, [data, positioned, steps]);

  if (isLoading) {
    return (
      <div className="space-y-6 max-w-5xl">
        <PageHeader title={t('Setup wizard')} />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Skeleton className="h-80 rounded-2xl" />
          <Card className="md:col-span-2">
            <SkeletonText lines={6} />
          </Card>
        </div>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="space-y-6 max-w-5xl">
        <PageHeader title={t('Setup wizard')} />
        <ErrorState title={t('Could not load your setup progress')} onRetry={() => refetch()} />
      </div>
    );
  }

  const current = steps[Math.min(index, steps.length - 1)];
  const stateOf = (s: WizardStep): 'done' | 'skipped' | 'todo' =>
    s.kind === 'item' ? (s.item.done ? 'done' : s.item.skipped ? 'skipped' : 'todo') : s.kind === 'regional' && regionalSaved ? 'done' : s.kind === 'finish' && data.allDone ? 'done' : 'todo';

  const mutate = (patch: { skip?: string; unskip?: string; dismissed?: boolean }, message: string, after?: () => void) =>
    update.mutate(patch, {
      onSuccess: () => {
        toast.success(t(message));
        after?.();
      },
      onError: (err) => toast.error(apiErrorMessage(err, t('Could not save. Please try again.'))),
    });

  const go = (delta: number) => setIndex((i) => Math.max(0, Math.min(steps.length - 1, i + delta)));

  return (
    <div className="space-y-6 max-w-5xl">
      <PageHeader
        title={t('Setup wizard')}
        description={t('Get your institution ready — {done} of {total} steps complete.', {
          done: formatNumber(data.completed),
          total: formatNumber(data.total),
        })}
        breadcrumbs={[{ label: t('Dashboard'), to: '/' }, { label: t('Setup wizard') }]}
        actions={
          <Button variant="outline" size="sm" leftIcon={<RotateCcw className="w-4 h-4" />} onClick={() => refetch()}>
            {t('Refresh progress')}
          </Button>
        }
      />

      <div
        className="h-2 w-full rounded-full bg-slate-100 dark:bg-white/8 overflow-hidden"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={data.percent}
        aria-label={t('Setup progress')}
      >
        <div className="h-full rounded-full bg-primary-600 transition-all" style={{ width: `${data.percent}%` }} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Stepper: horizontal scroll on phones, vertical list from md up */}
        <nav aria-label={t('Setup steps')} className="md:col-span-1">
          <ol className="flex md:flex-col gap-2 overflow-x-auto md:overflow-visible pb-1 -mx-1 px-1 scrollbar-none">
            {steps.map((s, i) => (
              <li key={s.key} className="shrink-0 md:shrink">
                <button
                  type="button"
                  onClick={() => setIndex(i)}
                  aria-current={i === index ? 'step' : undefined}
                  className={cn(
                    'flex items-center gap-2.5 w-full text-left rounded-xl border px-3 py-2.5 text-sm transition-colors',
                    i === index
                      ? 'bg-primary-50 dark:bg-primary-500/10 border-primary-200 dark:border-primary-500/20 text-primary-700 dark:text-primary-300 font-semibold'
                      : 'border-transparent text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5'
                  )}
                >
                  <StepIcon state={stateOf(s)} active={i === index} />
                  <span className="whitespace-nowrap md:whitespace-normal">{t(s.title)}</span>
                </button>
              </li>
            ))}
          </ol>
        </nav>

        <div className="md:col-span-2 space-y-4">
          {current.kind === 'regional' && (
            <>
              <div className="flex items-center gap-2 text-slate-900 dark:text-white">
                <Globe2 className="w-5 h-5 text-blue-500" />
                <h2 className="text-lg font-bold">{t('Regional settings')}</h2>
              </div>
              <p className="text-sm text-slate-600 dark:text-slate-300">
                {t('Choose the language, numerals, date format, time zone and currency your institution uses by default.')}
              </p>
              <InstitutionDefaultsCard onSaved={() => setRegionalSaved(true)} />
            </>
          )}

          {current.kind === 'item' && (
            <Card>
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <h2 className="text-lg font-bold text-slate-900 dark:text-white">{t(current.item.title)}</h2>
                {current.item.optional && <Badge variant="neutral">{t('Optional')}</Badge>}
                {current.item.done && <Badge variant="success" dot>{t('Done')}</Badge>}
                {current.item.skipped && <Badge variant="neutral">{t('Skipped')}</Badge>}
              </div>
              <p className="text-sm text-slate-600 dark:text-slate-300">{t(current.item.description)}</p>
              {current.item.count !== null && (
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-3">
                  {t('Currently: {n}', { n: formatNumber(current.item.count) })}
                </p>
              )}
              <div className="flex flex-wrap gap-2 mt-5">
                <Button rightIcon={<ExternalLink className="w-4 h-4" />} onClick={() => navigate(current.item.href)}>
                  {current.item.done ? t('Review') : t('Go to page')}
                </Button>
                {!current.item.done && !current.item.skipped && (
                  <Button
                    variant="ghost"
                    leftIcon={<SkipForward className="w-4 h-4" />}
                    isLoading={update.isPending}
                    onClick={() => mutate({ skip: current.item.key }, 'Step skipped', () => go(1))}
                  >
                    {t('Skip for now')}
                  </Button>
                )}
                {current.item.skipped && (
                  <Button variant="ghost" isLoading={update.isPending} onClick={() => mutate({ unskip: current.item.key }, 'Step restored')}>
                    {t('Undo skip')}
                  </Button>
                )}
              </div>
              {!current.item.done && (
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-4">
                  {t('This step ticks off automatically once the data exists — come back and press “Refresh progress”.')}
                </p>
              )}
            </Card>
          )}

          {current.kind === 'finish' && (
            <Card className="text-center py-10">
              <PartyPopper className="w-10 h-10 mx-auto text-primary-600" aria-hidden />
              <h2 className="text-lg font-bold text-slate-900 dark:text-white mt-3">
                {data.allDone ? t('Your institution is ready') : t('Almost there')}
              </h2>
              <p className="text-sm text-slate-600 dark:text-slate-300 mt-1 max-w-md mx-auto">
                {data.allDone
                  ? t('Every step is complete or skipped. You can reopen this wizard any time from Settings → Plan & usage.')
                  : t('{n} step(s) still open. You can finish them later — the checklist stays on your dashboard.', {
                      n: formatNumber(data.total - data.completed),
                    })}
              </p>
              <div className="flex flex-wrap justify-center gap-2 mt-5">
                <Button onClick={() => navigate('/')}>{t('Go to dashboard')}</Button>
                {data.allDone && !data.dismissed && (
                  <Button variant="outline" isLoading={update.isPending} onClick={() => mutate({ dismissed: true }, 'Checklist hidden', () => navigate('/'))}>
                    {t('Hide checklist from dashboard')}
                  </Button>
                )}
              </div>
            </Card>
          )}

          {!data.persisted && (
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {t('Skipped steps are saved in this browser only until the latest database update is applied.')}
            </p>
          )}

          <div className="flex justify-between gap-2">
            <Button variant="ghost" leftIcon={<ArrowLeft className="w-4 h-4" />} onClick={() => go(-1)} disabled={index === 0}>
              {t('Back')}
            </Button>
            <Button variant="secondary" rightIcon={<ArrowRight className="w-4 h-4" />} onClick={() => go(1)} disabled={index >= steps.length - 1}>
              {t('Next')}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SetupWizard;
