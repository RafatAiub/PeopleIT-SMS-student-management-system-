import React from 'react';
import { AlertTriangle, Info, CheckCircle2, XCircle, RotateCw, Lock, Sparkles, Construction } from 'lucide-react';
import { cn } from '../../lib/cn';
import { useT } from '../../i18n';
import { Button } from './Button';

/* ─────────────────────────────────────────────────────────────────────────
 * Alert — inline status message.
 * ───────────────────────────────────────────────────────────────────────── */
type AlertTone = 'info' | 'success' | 'warning' | 'danger';
const ALERT_STYLE: Record<AlertTone, { box: string; icon: React.ReactNode }> = {
  info: { box: 'bg-blue-50 border-blue-200 text-blue-900 dark:bg-blue-500/10 dark:border-blue-400/20 dark:text-blue-100', icon: <Info className="w-4 h-4 text-blue-600 dark:text-blue-300" /> },
  success: { box: 'bg-emerald-50 border-emerald-200 text-emerald-900 dark:bg-emerald-500/10 dark:border-emerald-400/20 dark:text-emerald-100', icon: <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-300" /> },
  warning: { box: 'bg-amber-50 border-amber-200 text-amber-900 dark:bg-amber-500/10 dark:border-amber-400/20 dark:text-amber-100', icon: <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-300" /> },
  danger: { box: 'bg-red-50 border-red-200 text-red-900 dark:bg-red-500/10 dark:border-red-400/20 dark:text-red-100', icon: <XCircle className="w-4 h-4 text-red-600 dark:text-red-300" /> },
};

export const Alert: React.FC<{ tone?: AlertTone; title?: React.ReactNode; children?: React.ReactNode; action?: React.ReactNode; className?: string }> = ({
  tone = 'info',
  title,
  children,
  action,
  className,
}) => (
  <div role={tone === 'danger' ? 'alert' : 'status'} className={cn('flex gap-3 rounded-lg border px-4 py-3 text-sm', ALERT_STYLE[tone].box, className)}>
    <span className="mt-0.5 shrink-0">{ALERT_STYLE[tone].icon}</span>
    <div className="flex-1 min-w-0">
      {title && <p className="font-semibold">{title}</p>}
      {children && <div className={cn(title && 'mt-0.5', 'opacity-90')}>{children}</div>}
    </div>
    {action && <div className="shrink-0 self-center">{action}</div>}
  </div>
);

/* ─────────────────────────────────────────────────────────────────────────
 * ErrorState — failed load with retry. Use instead of silently rendering
 * "no data" when a request fails.
 * ───────────────────────────────────────────────────────────────────────── */
export const ErrorState: React.FC<{ title?: string; message?: string; onRetry?: () => void; className?: string; compact?: boolean }> = ({
  title,
  message,
  onRetry,
  className,
  compact,
}) => {
  const t = useT();
  return (
    <div role="alert" className={cn('flex flex-col items-center justify-center text-center', compact ? 'py-8' : 'py-14', 'px-4', className)}>
      <div className="w-11 h-11 rounded-xl bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-400/20 flex items-center justify-center mb-3">
        <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-300" />
      </div>
      <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-50">{title ?? t('Something went wrong')}</h3>
      {message && <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-sm">{message}</p>}
      {onRetry && (
        <Button variant="secondary" size="sm" className="mt-4" leftIcon={<RotateCw className="w-3.5 h-3.5" />} onClick={onRetry}>
          {t('Retry')}
        </Button>
      )}
    </div>
  );
};

/* ─────────────────────────────────────────────────────────────────────────
 * IncompleteNotice — required by the redesign rules: any screen or widget
 * that can't be wired to real data yet is labelled, never faked.
 * ───────────────────────────────────────────────────────────────────────── */
export const IncompleteNotice: React.FC<{ title?: string; reason: React.ReactNode; className?: string }> = ({ title = 'Not available yet', reason, className }) => (
  <div className={cn('flex items-start gap-3 rounded-lg border border-dashed border-slate-300 dark:border-white/15 bg-slate-50 dark:bg-white/3 px-4 py-3', className)}>
    <Construction className="w-4 h-4 mt-0.5 text-slate-500 dark:text-slate-400 shrink-0" />
    <div className="text-sm">
      <p className="font-semibold text-slate-800 dark:text-slate-200">{title}</p>
      <p className="text-slate-600 dark:text-slate-400 mt-0.5">{reason}</p>
    </div>
  </div>
);

/* ─────────────────────────────────────────────────────────────────────────
 * UpgradePrompt — for features locked by plan. NOTE: the backend has no
 * feature-flag / plan-module data yet, so nothing is locked today; this is
 * the component the plan-gating work will use once approved.
 * ───────────────────────────────────────────────────────────────────────── */
export const UpgradePrompt: React.FC<{ feature: string; description?: string; onUpgrade?: () => void; className?: string }> = ({
  feature,
  description,
  onUpgrade,
  className,
}) => {
  const t = useT();
  return (
    <div className={cn('rounded-xl border border-primary-200 dark:border-primary-400/20 bg-gradient-to-br from-primary-50 to-accent-50 dark:from-primary-500/10 dark:to-accent-500/5 p-5 sm:p-6', className)}>
      <div className="flex items-start gap-4">
        <div className="w-10 h-10 rounded-lg bg-white dark:bg-white/10 border border-primary-200 dark:border-primary-400/20 flex items-center justify-center shrink-0">
          <Lock className="w-5 h-5 text-primary-600 dark:text-primary-300" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-50">{feature} is not included in your plan</h3>
          <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">{description ?? 'Upgrade to unlock this module for your institution.'}</p>
          {onUpgrade && (
            <Button size="sm" className="mt-3" onClick={onUpgrade}>
              {t('Upgrade plan')}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};

/* ─────────────────────────────────────────────────────────────────────────
 * AiGeneratedNotice — every AI output shown to guardians/students must be
 * reviewed by staff first. Wrap AI text with this label + edit control.
 * ───────────────────────────────────────────────────────────────────────── */
export const AiGeneratedNotice: React.FC<{ className?: string; children?: React.ReactNode }> = ({ className, children }) => {
  const t = useT();
  return (
    <div className={cn('rounded-lg border border-blue-200 dark:border-blue-400/25 bg-blue-50/60 dark:bg-blue-500/7', className)}>
      <div className="flex items-center gap-2 px-3 py-2 border-b border-blue-200/70 dark:border-blue-400/15 text-xs font-semibold text-blue-800 dark:text-blue-200">
        <Sparkles className="w-3.5 h-3.5" />
        {t('AI generated — review before sending')}
      </div>
      {children && <div className="p-3">{children}</div>}
    </div>
  );
};
