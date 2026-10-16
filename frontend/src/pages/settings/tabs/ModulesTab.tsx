import React from 'react';
import toast from 'react-hot-toast';
import { Lock, MoonStar, Puzzle } from 'lucide-react';
import { Alert, Badge, ErrorState, SkeletonText } from '@/components/ui';
import { useAuthStore } from '@/store/authStore';
import { useLocale, useT } from '@/i18n';
import { cn } from '@/lib/cn';
import { MODULE_GROUPS, type ResolvedModule } from '@/lib/modules';
import { useModules, useUpdateModules } from '@/hooks/useModules';

// =============================================================================
// Settings → Modules (T0). One switch per registry module, grouped into
// "Islamic / Madrasah" (off by default) and "Optional modules" (on by
// default). A module the plan doesn't include shows a lock and can't be
// switched on here — except by a super admin, which the server records as a
// per-school plan override.
// =============================================================================

const ModuleSwitch: React.FC<{
  module: ResolvedModule;
  busy: boolean;
  canOverridePlan: boolean;
  onToggle: (next: boolean) => void;
}> = ({ module: m, busy, canOverridePlan, onToggle }) => {
  const t = useT();
  const { lang } = useLocale();
  const locked = !m.entitled && !m.switchedOn && !canOverridePlan;
  const on = m.switchedOn;
  const id = `module-${m.key.replace(/\W/g, '-')}`;
  const [primaryLabel, secondaryLabel] = lang === 'bn' ? [m.labelBn, m.label] : [m.label, m.labelBn];
  const [primaryDesc, secondaryDesc] = lang === 'bn' ? [m.descriptionBn, m.description] : [m.description, m.descriptionBn];

  return (
    <li className="flex items-start gap-4 py-4 first:pt-0 last:pb-0">
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor={id} className="font-semibold text-slate-900 dark:text-white">
            {primaryLabel}
          </label>
          <span className="text-sm text-slate-500 dark:text-slate-400">{secondaryLabel}</span>
          {!m.entitled && (
            <Badge variant="warning">
              <Lock className="w-3 h-3" aria-hidden /> {t('Not in your plan')}
            </Badge>
          )}
          {on && m.entitled && <Badge variant="success">{t('On')}</Badge>}
        </div>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{primaryDesc}</p>
        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{secondaryDesc}</p>
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={`${primaryLabel}: ${on ? t('On') : t('Off')}`}
        disabled={busy || locked}
        title={locked ? t('Upgrade your plan to use this module') : undefined}
        onClick={() => onToggle(!on)}
        className={cn(
          'relative mt-1 inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 focus-visible:ring-offset-2',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          on ? 'bg-primary-600' : 'bg-slate-300 dark:bg-white/15',
        )}
      >
        <span className={cn('inline-block h-5 w-5 rounded-full bg-white shadow transition-transform', on ? 'translate-x-5' : 'translate-x-0.5')} />
      </button>
    </li>
  );
};

const ModulesTab: React.FC = () => {
  const t = useT();
  const { lang } = useLocale();
  const role = useAuthStore((s) => s.user?.role);
  const { data, isLoading, isError, refetch } = useModules();
  const update = useUpdateModules();
  const [pendingKey, setPendingKey] = React.useState<string | null>(null);

  const toggle = (key: string, next: boolean) => {
    setPendingKey(key);
    update.mutate(
      { [key]: next },
      {
        onSuccess: () => toast.success(next ? t('Module switched on') : t('Module switched off')),
        onError: (error: unknown) => {
          const msg = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
          toast.error(msg || t('Could not update modules'));
        },
        onSettled: () => setPendingKey(null),
      },
    );
  };

  if (isLoading) return <SkeletonText lines={8} />;
  if (isError || !data) return <ErrorState title={t('Could not load modules')} onRetry={() => refetch()} />;

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-lg font-bold text-slate-900 dark:text-white">{t('Modules')}</h2>
        <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">
          {t('Switch features on or off for your whole school. A switched-off module disappears from menus, dashboards, the guardian app and your website.')}
        </p>
      </div>

      {MODULE_GROUPS.map((group) => {
        const items = data.modules.filter((m) => m.group === group.key);
        if (items.length === 0) return null;
        return (
          <section key={group.key} aria-labelledby={`modules-${group.key}`}>
            <div className="flex items-center gap-2 mb-1">
              {group.key === 'islamic' ? (
                <MoonStar className="w-5 h-5 text-primary-700 dark:text-primary-400" aria-hidden />
              ) : (
                <Puzzle className="w-5 h-5 text-primary-700 dark:text-primary-400" aria-hidden />
              )}
              <h3 id={`modules-${group.key}`} className="font-bold text-slate-900 dark:text-white">
                {lang === 'bn' ? group.titleBn : group.title}
              </h3>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">{lang === 'bn' ? group.hintBn : group.hint}</p>
            <ul className="divide-y divide-slate-200 dark:divide-white/8 rounded-xl border border-slate-200 dark:border-white/8 p-4">
              {items.map((m) => (
                <ModuleSwitch
                  key={m.key}
                  module={m}
                  busy={update.isPending && pendingKey === m.key}
                  canOverridePlan={role === 'SUPER_ADMIN'}
                  onToggle={(next) => toggle(m.key, next)}
                />
              ))}
            </ul>
          </section>
        );
      })}

      {data.modules.some((m) => !m.entitled) && (
        <Alert tone="info" title={t('Some modules are not in your plan')}>
          {t('Upgrade your plan from Settings → Plan & usage to switch them on.')}
        </Alert>
      )}
    </div>
  );
};

export default ModulesTab;
