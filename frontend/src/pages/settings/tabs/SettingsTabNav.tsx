import React from 'react';
import { cn } from '@/lib/cn';

export interface SettingsNavItem {
  id: string;
  label: string;
  icon: React.ReactNode;
}

interface SettingsTabNavProps {
  items: SettingsNavItem[];
  value: string;
  onChange: (id: string) => void;
}

/**
 * Left vertical nav on desktop, horizontally-scrolling pill row on mobile.
 * A local component (not the shared `Tabs`) because it needs two different
 * layouts at the two breakpoints rather than one that reflows.
 */
export const SettingsTabNav: React.FC<SettingsTabNavProps> = ({ items, value, onChange }) => {
  const itemClass = (active: boolean, layout: 'vertical' | 'horizontal') =>
    cn(
      'flex items-center gap-3 font-medium transition-colors border shrink-0',
      layout === 'vertical' ? 'w-full px-4 py-3 rounded-xl' : 'px-3.5 py-2 rounded-lg text-sm',
      active
        ? 'bg-primary-50 dark:bg-primary-500/10 text-primary-600 dark:text-primary-400 border-primary-200 dark:border-primary-500/20'
        : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5 hover:text-slate-900 dark:hover:text-slate-200 border-transparent'
    );

  return (
    <>
      {/* Mobile: horizontal scroll */}
      <div
        role="tablist"
        aria-label="Settings sections"
        className="md:hidden flex items-center gap-2 overflow-x-auto scrollbar-none pb-1 -mx-1 px-1"
      >
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={value === item.id}
            onClick={() => onChange(item.id)}
            className={itemClass(value === item.id, 'horizontal')}
          >
            {item.icon}
            {item.label}
          </button>
        ))}
      </div>

      {/* Desktop: vertical sidebar */}
      <div role="tablist" aria-label="Settings sections" className="hidden md:flex md:flex-col md:gap-2">
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={value === item.id}
            onClick={() => onChange(item.id)}
            className={itemClass(value === item.id, 'vertical')}
          >
            {item.icon}
            {item.label}
          </button>
        ))}
      </div>
    </>
  );
};
