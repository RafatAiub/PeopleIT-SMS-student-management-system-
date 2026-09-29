import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { cn } from '../../lib/cn';

export interface DropdownItem {
  id: string;
  label: React.ReactNode;
  icon?: React.ReactNode;
  onSelect?: () => void;
  danger?: boolean;
  disabled?: boolean;
  /** Render a checkmark/selected state. */
  selected?: boolean;
  hint?: React.ReactNode;
}

export interface DropdownSection {
  label?: React.ReactNode;
  items: DropdownItem[];
}

interface DropdownProps {
  /** Render prop for the trigger; spread the given props onto a <button>. */
  trigger: (props: {
    ref: React.Ref<HTMLButtonElement>;
    onClick: () => void;
    'aria-expanded': boolean;
    'aria-haspopup': 'menu';
  }) => React.ReactNode;
  sections: DropdownSection[];
  align?: 'left' | 'right';
  width?: string;
  header?: React.ReactNode;
}

/** Menu button (WAI-ARIA menu pattern): Esc closes, arrows move, click-outside closes. */
export const Dropdown: React.FC<DropdownProps> = ({ trigger, sections, align = 'right', width = 'w-56', header }) => {
  const [open, setOpen] = React.useState(false);
  const wrapRef = React.useRef<HTMLDivElement>(null);
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const menuRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    const t = window.setTimeout(() => menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]:not([disabled])')?.focus(), 20);
    return () => {
      document.removeEventListener('mousedown', onDown);
      window.clearTimeout(t);
    };
  }, [open]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      setOpen(false);
      triggerRef.current?.focus();
      return;
    }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const items = Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([disabled])') ?? []);
    const idx = items.indexOf(document.activeElement as HTMLElement);
    const next = e.key === 'ArrowDown' ? (idx + 1) % items.length : (idx - 1 + items.length) % items.length;
    items[next]?.focus();
  };

  return (
    <div className="relative" ref={wrapRef} onKeyDown={onKeyDown}>
      {trigger({ ref: triggerRef, onClick: () => setOpen((o) => !o), 'aria-expanded': open, 'aria-haspopup': 'menu' })}
      <AnimatePresence>
        {open && (
          <motion.div
            ref={menuRef}
            role="menu"
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.12 }}
            className={cn(
              'absolute z-50 mt-2 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 shadow-lg',
              align === 'right' ? 'right-0 origin-top-right' : 'left-0 origin-top-left',
              width
            )}
          >
            {header && <div className="px-3 py-2 border-b border-slate-100 dark:border-white/6 mb-1">{header}</div>}
            {sections.map((section, si) => (
              <div key={si} className={cn(si > 0 && 'border-t border-slate-100 dark:border-white/6 mt-1 pt-1')}>
                {section.label && (
                  <div className="px-3 pt-1.5 pb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    {section.label}
                  </div>
                )}
                {section.items.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    role="menuitem"
                    disabled={item.disabled}
                    onClick={() => {
                      item.onSelect?.();
                      setOpen(false);
                    }}
                    className={cn(
                      'w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left transition-colors disabled:opacity-40',
                      'focus:outline-none focus-visible:bg-slate-100 dark:focus-visible:bg-white/6',
                      item.danger
                        ? 'text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-500/10'
                        : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/6'
                    )}
                  >
                    {item.icon && <span className="text-slate-500 dark:text-slate-400 [&>svg]:w-4 [&>svg]:h-4 shrink-0">{item.icon}</span>}
                    <span className="flex-1 truncate">{item.label}</span>
                    {item.hint && <span className="text-xs text-slate-500 dark:text-slate-400">{item.hint}</span>}
                    {item.selected && <span className="w-1.5 h-1.5 rounded-full bg-primary-500" aria-label="selected" />}
                  </button>
                ))}
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
