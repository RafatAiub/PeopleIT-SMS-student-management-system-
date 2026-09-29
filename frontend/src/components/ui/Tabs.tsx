import React from 'react';
import { cn } from '../../lib/cn';

export interface TabItem {
  id: string;
  label: React.ReactNode;
  icon?: React.ReactNode;
  count?: number;
  disabled?: boolean;
}

interface TabsProps {
  tabs: TabItem[];
  value: string;
  onChange: (id: string) => void;
  variant?: 'underline' | 'pills';
  className?: string;
  /** Accessible name for the tab list. */
  label?: string;
  idPrefix?: string;
}

/**
 * Accessible tabs (WAI-ARIA tabs pattern): arrow keys move between tabs,
 * Home/End jump. Scrolls horizontally on narrow screens instead of wrapping.
 * Pair each panel with <TabPanel> using the same idPrefix.
 */
export const Tabs: React.FC<TabsProps> = ({ tabs, value, onChange, variant = 'underline', className, label, idPrefix = 'tab' }) => {
  const refs = React.useRef<(HTMLButtonElement | null)[]>([]);
  const enabled = tabs.filter((t) => !t.disabled);

  const onKeyDown = (e: React.KeyboardEvent) => {
    const idx = enabled.findIndex((t) => t.id === value);
    let next = -1;
    if (e.key === 'ArrowRight') next = (idx + 1) % enabled.length;
    else if (e.key === 'ArrowLeft') next = (idx - 1 + enabled.length) % enabled.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = enabled.length - 1;
    if (next < 0) return;
    e.preventDefault();
    const target = enabled[next];
    onChange(target.id);
    refs.current[tabs.indexOf(target)]?.focus();
  };

  return (
    <div
      role="tablist"
      aria-label={label}
      onKeyDown={onKeyDown}
      className={cn(
        'flex items-center overflow-x-auto scrollbar-none',
        variant === 'underline'
          ? 'gap-5 border-b border-slate-200 dark:border-white/8'
          : 'gap-1 p-1 rounded-lg bg-slate-100 dark:bg-white/5 w-fit max-w-full',
        className
      )}
    >
      {tabs.map((t, i) => {
        const selected = t.id === value;
        return (
          <button
            key={t.id}
            ref={(el) => (refs.current[i] = el)}
            role="tab"
            type="button"
            id={`${idPrefix}-${t.id}`}
            aria-selected={selected}
            aria-controls={`${idPrefix}-panel-${t.id}`}
            tabIndex={selected ? 0 : -1}
            disabled={t.disabled}
            onClick={() => onChange(t.id)}
            className={cn(
              'inline-flex items-center gap-2 whitespace-nowrap text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed',
              variant === 'underline'
                ? cn(
                    'relative py-3 -mb-px border-b-2',
                    selected
                      ? 'border-primary-500 text-slate-900 dark:text-white'
                      : 'border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
                  )
                : cn(
                    'px-3 py-1.5 rounded-md',
                    selected
                      ? 'bg-white dark:bg-white/10 text-slate-900 dark:text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
                  )
            )}
          >
            {t.icon && <span className="[&>svg]:w-4 [&>svg]:h-4">{t.icon}</span>}
            {t.label}
            {typeof t.count === 'number' && (
              <span
                className={cn(
                  'min-w-5 h-5 px-1.5 rounded-full text-[11px] font-semibold inline-flex items-center justify-center tabular-nums',
                  selected ? 'bg-primary-100 text-primary-800 dark:bg-primary-500/20 dark:text-primary-200' : 'bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-300'
                )}
              >
                {t.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
};

export const TabPanel: React.FC<{ id: string; value: string; idPrefix?: string; children: React.ReactNode; className?: string }> = ({
  id,
  value,
  idPrefix = 'tab',
  children,
  className,
}) =>
  id === value ? (
    <div role="tabpanel" id={`${idPrefix}-panel-${id}`} aria-labelledby={`${idPrefix}-${id}`} tabIndex={0} className={cn('focus:outline-none', className)}>
      {children}
    </div>
  ) : null;
