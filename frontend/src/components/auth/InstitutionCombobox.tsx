import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Building2, ChevronDown, Search } from 'lucide-react';

// =============================================================================
// Institution picker with search — used on Login and Register.
// =============================================================================
// The institutions list is fetched once and filtered entirely client-side (no
// new API contract). Built as a WAI-ARIA 1.2 combobox: a single text input
// owns both the typed search text and the currently selected value's label,
// with a listbox of matching options underneath.

export interface InstitutionOption {
  value: string;
  label: string;
}

interface InstitutionComboboxProps {
  id: string;
  value: string;
  onChange: (value: string) => void;
  options: InstitutionOption[];
  /** Shown when `value` matches no option (e.g. nothing chosen yet, or still loading). */
  placeholder: string;
  disabled?: boolean;
  required?: boolean;
  'aria-invalid'?: boolean;
  'aria-describedby'?: string;
  className?: string;
  noMatchesLabel?: string;
}

export const InstitutionCombobox = React.forwardRef<HTMLInputElement, InstitutionComboboxProps>(function InstitutionCombobox(
  {
    id,
    value,
    onChange,
    options,
    placeholder,
    disabled,
    required,
    className,
    noMatchesLabel = 'No institutions match your search.',
    ...aria
  },
  forwardedRef,
) {
  const selectedLabel = useMemo(
    () => options.find((o) => o.value === value)?.label ?? '',
    [options, value],
  );

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(selectedLabel);
  const [activeIndex, setActiveIndex] = useState(0);

  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const setRefs = (node: HTMLInputElement | null) => {
    inputRef.current = node;
    if (typeof forwardedRef === 'function') forwardedRef(node);
    else if (forwardedRef) (forwardedRef as React.MutableRefObject<HTMLInputElement | null>).current = node;
  };
  const listboxId = `${id}-listbox`;

  // Keep the visible text in sync with the selection whenever it changes
  // from outside (e.g. a remembered institution loads after the fetch).
  useEffect(() => {
    if (!open) setQuery(selectedLabel);
  }, [selectedLabel, open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!open || !q || q === selectedLabel.toLowerCase()) return options;
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, query, open, selectedLabel]);

  useEffect(() => {
    if (activeIndex >= filtered.length) setActiveIndex(Math.max(0, filtered.length - 1));
  }, [filtered.length, activeIndex]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery(selectedLabel);
      }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open, selectedLabel]);

  const commit = (opt: InstitutionOption) => {
    onChange(opt.value);
    setQuery(opt.label);
    setOpen(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      setActiveIndex((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      if (open && filtered[activeIndex]) {
        e.preventDefault();
        commit(filtered[activeIndex]);
      }
    } else if (e.key === 'Escape') {
      if (open) {
        e.preventDefault();
        setOpen(false);
        setQuery(selectedLabel);
      }
    } else if (e.key === 'Tab') {
      setOpen(false);
      setQuery(selectedLabel);
    }
  };

  return (
    <div className="relative" ref={wrapRef}>
      <Building2 className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none z-10" />
      <input
        id={id}
        ref={setRefs}
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-autocomplete="list"
        aria-activedescendant={open && filtered[activeIndex] ? `${id}-opt-${activeIndex}` : undefined}
        autoComplete="off"
        disabled={disabled}
        required={required}
        value={open ? query : selectedLabel || query}
        placeholder={placeholder}
        onFocus={() => {
          setOpen(true);
          setQuery('');
          setActiveIndex(0);
          window.requestAnimationFrame(() => inputRef.current?.select());
        }}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          setActiveIndex(0);
        }}
        onKeyDown={handleKeyDown}
        className={className ?? 'input-field pl-11 pr-10 py-3 text-sm font-medium'}
        {...aria}
      />
      <button
        type="button"
        tabIndex={-1}
        aria-hidden="true"
        onClick={() => inputRef.current?.focus()}
        className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
      >
        {open ? <Search className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </button>

      {open && (
        <ul
          id={listboxId}
          role="listbox"
          className="absolute z-30 mt-1.5 w-full max-h-64 overflow-auto rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 shadow-lg py-1"
        >
          {filtered.length === 0 && (
            <li className="px-4 py-2.5 text-xs text-slate-500 dark:text-slate-400">{noMatchesLabel}</li>
          )}
          {filtered.map((opt, i) => (
            <li
              key={opt.value || '__empty__'}
              id={`${id}-opt-${i}`}
              role="option"
              aria-selected={opt.value === value}
              onMouseDown={(e) => {
                // mousedown (not click) so it fires before the input's blur.
                e.preventDefault();
                commit(opt);
              }}
              onMouseEnter={() => setActiveIndex(i)}
              className={`px-4 py-2.5 text-sm font-medium cursor-pointer truncate ${
                i === activeIndex
                  ? 'bg-primary-50 dark:bg-primary-500/10 text-primary-700 dark:text-primary-300'
                  : 'text-slate-700 dark:text-slate-200'
              } ${opt.value === value ? 'font-bold' : ''}`}
            >
              {opt.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
});
