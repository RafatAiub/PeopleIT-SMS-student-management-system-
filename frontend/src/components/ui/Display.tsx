import React from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { cn } from '../../lib/cn';

/* ─────────────────────────────────────────────────────────────────────────
 * PageHeader — title, description, breadcrumbs, actions. Stacks on mobile.
 * ───────────────────────────────────────────────────────────────────────── */
export interface Crumb { label: string; to?: string }

export const PageHeader: React.FC<{
  title: React.ReactNode;
  description?: React.ReactNode;
  breadcrumbs?: Crumb[];
  actions?: React.ReactNode;
  className?: string;
}> = ({ title, description, breadcrumbs, actions, className }) => (
  <div className={cn('flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between mb-6', className)}>
    <div className="min-w-0">
      {breadcrumbs && breadcrumbs.length > 0 && (
        <nav aria-label="Breadcrumb" className="mb-1.5">
          <ol className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400 flex-wrap">
            {breadcrumbs.map((c, i) => (
              <li key={i} className="flex items-center gap-1">
                {i > 0 && <ChevronRight className="w-3 h-3" aria-hidden />}
                {c.to ? <Link to={c.to} className="hover:text-slate-800 dark:hover:text-slate-200">{c.label}</Link> : <span aria-current="page">{c.label}</span>}
              </li>
            ))}
          </ol>
        </nav>
      )}
      <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-50">{title}</h1>
      {description && <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-2xl">{description}</p>}
    </div>
    {actions && <div className="flex flex-wrap items-center gap-2 shrink-0">{actions}</div>}
  </div>
);

/* ─────────────────────────────────────────────────────────────────────────
 * StatCard — KPI tile. `trend` is optional: pass it only when it is computed
 * from real data (no decorative arrows).
 * ───────────────────────────────────────────────────────────────────────── */
type StatTone = 'primary' | 'info' | 'accent' | 'success' | 'warning' | 'danger' | 'neutral';
const TONE: Record<StatTone, string> = {
  primary: 'bg-primary-50 text-primary-700 dark:bg-primary-500/15 dark:text-primary-300',
  info: 'bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300',
  accent: 'bg-accent-50 text-accent-800 dark:bg-accent-500/15 dark:text-accent-300',
  success: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
  warning: 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
  danger: 'bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-300',
  neutral: 'bg-slate-100 text-slate-700 dark:bg-white/10 dark:text-slate-300',
};

export interface StatTrend {
  direction: 'up' | 'down' | 'flat';
  label: string;
  /** Whether "up" is good (fee collection) or bad (absences). Default true. */
  upIsGood?: boolean;
}

export const StatCard: React.FC<{
  label: React.ReactNode;
  value: React.ReactNode;
  icon?: React.ReactNode;
  tone?: StatTone;
  hint?: React.ReactNode;
  trend?: StatTrend;
  onClick?: () => void;
  to?: string;
  className?: string;
}> = ({ label, value, icon, tone = 'primary', hint, trend, onClick, to, className }) => {
  const good = trend ? (trend.direction === 'flat' ? null : (trend.direction === 'up') === (trend.upIsGood ?? true)) : null;
  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <p className="text-[13px] font-medium text-slate-600 dark:text-slate-400 leading-5">{label}</p>
        {icon && <span className={cn('w-8 h-8 rounded-lg flex items-center justify-center shrink-0 [&>svg]:w-4 [&>svg]:h-4', TONE[tone])}>{icon}</span>}
      </div>
      <p className="mt-2 text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-50 tabular-nums">{value}</p>
      {(trend || hint) && (
        <div className="mt-1.5 flex items-center gap-2 text-xs">
          {trend && (
            <span
              className={cn(
                'inline-flex items-center gap-0.5 font-semibold',
                good === null ? 'text-slate-500 dark:text-slate-400' : good ? 'text-emerald-700 dark:text-emerald-300' : 'text-red-700 dark:text-red-300'
              )}
            >
              {trend.direction === 'up' ? <TrendingUp className="w-3.5 h-3.5" /> : trend.direction === 'down' ? <TrendingDown className="w-3.5 h-3.5" /> : <Minus className="w-3.5 h-3.5" />}
              {trend.label}
            </span>
          )}
          {hint && <span className="text-slate-500 dark:text-slate-400 truncate">{hint}</span>}
        </div>
      )}
    </>
  );
  const cls = cn('glass-card p-4 sm:p-5 block text-left', (onClick || to) && 'glass-card-hover cursor-pointer', className);
  if (to) return <Link to={to} className={cls}>{body}</Link>;
  if (onClick) return <button type="button" onClick={onClick} className={cn(cls, 'w-full')}>{body}</button>;
  return <div className={cls}>{body}</div>;
};

/* ─────────────────────────────────────────────────────────────────────────
 * Avatar
 * ───────────────────────────────────────────────────────────────────────── */
export const Avatar: React.FC<{ name?: string; src?: string | null; size?: 'xs' | 'sm' | 'md' | 'lg'; className?: string }> = ({
  name = '',
  src,
  size = 'md',
  className,
}) => {
  const s = { xs: 'w-6 h-6 text-[10px]', sm: 'w-8 h-8 text-xs', md: 'w-10 h-10 text-sm', lg: 'w-14 h-14 text-lg' }[size];
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join('') || '?';
  return src ? (
    <img src={src} alt={name} className={cn(s, 'rounded-full object-cover ring-1 ring-slate-200 dark:ring-white/10', className)} />
  ) : (
    <span aria-label={name || undefined} className={cn(s, 'rounded-full inline-flex items-center justify-center font-semibold bg-primary-100 text-primary-800 dark:bg-primary-500/20 dark:text-primary-200 shrink-0', className)}>
      {initials}
    </span>
  );
};

/* ─────────────────────────────────────────────────────────────────────────
 * Tooltip — CSS-only, shows on hover and keyboard focus.
 * ───────────────────────────────────────────────────────────────────────── */
export const Tooltip: React.FC<{ content: React.ReactNode; children: React.ReactElement; side?: 'top' | 'bottom' | 'right' }> = ({ content, children, side = 'top' }) => (
  <span className="relative inline-flex group/tt">
    {children}
    <span
      role="tooltip"
      className={cn(
        'pointer-events-none absolute z-50 whitespace-nowrap rounded-md bg-slate-900 dark:bg-slate-700 px-2 py-1 text-xs font-medium text-white shadow-md',
        'opacity-0 group-hover/tt:opacity-100 group-focus-within/tt:opacity-100 transition-opacity duration-100 delay-150',
        side === 'top' && 'bottom-full left-1/2 -translate-x-1/2 mb-1.5',
        side === 'bottom' && 'top-full left-1/2 -translate-x-1/2 mt-1.5',
        side === 'right' && 'left-full top-1/2 -translate-y-1/2 ml-2'
      )}
    >
      {content}
    </span>
  </span>
);

/* ─────────────────────────────────────────────────────────────────────────
 * Kbd, Divider, DescriptionList
 * ───────────────────────────────────────────────────────────────────────── */
export const Kbd: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className }) => <kbd className={cn('kbd', className)}>{children}</kbd>;

export const DescriptionList: React.FC<{ items: { label: React.ReactNode; value: React.ReactNode }[]; columns?: 1 | 2 | 3; className?: string }> = ({
  items,
  columns = 2,
  className,
}) => (
  <dl className={cn('grid gap-x-6 gap-y-4', columns === 1 ? 'grid-cols-1' : columns === 2 ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3', className)}>
    {items.map((it, i) => (
      <div key={i} className="min-w-0">
        <dt className="text-xs font-medium text-slate-500 dark:text-slate-400">{it.label}</dt>
        <dd className="mt-0.5 text-sm text-slate-900 dark:text-slate-100 break-words">{it.value ?? '—'}</dd>
      </div>
    ))}
  </dl>
);
