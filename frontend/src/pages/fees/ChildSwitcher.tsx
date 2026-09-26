import React from 'react';
import { cn } from '../../lib/cn';
import type { LinkedChild } from './hooks';

interface ChildSwitcherProps {
  items: LinkedChild[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

/** Pill switcher for a guardian with more than one linked child. */
export const ChildSwitcher: React.FC<ChildSwitcherProps> = ({ items, selectedId, onSelect }) => {
  if (items.length <= 1) return null;
  return (
    <div className="flex gap-2 flex-wrap" role="tablist" aria-label="Select child">
      {items.map((child) => (
        <button
          key={child.id}
          type="button"
          role="tab"
          aria-selected={selectedId === child.id}
          onClick={() => onSelect(child.id)}
          className={cn(
            'px-4 py-2 rounded-xl text-sm font-semibold transition-all',
            selectedId === child.id
              ? 'bg-primary-600 text-white shadow-sm'
              : 'bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-white/10'
          )}
        >
          {child.firstName} {child.lastName}
        </button>
      ))}
    </div>
  );
};
