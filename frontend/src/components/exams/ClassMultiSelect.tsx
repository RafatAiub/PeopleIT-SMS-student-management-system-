import React, { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, X } from 'lucide-react';
import { ClassOption, classLabel } from '../../api/exams.api';

interface ClassMultiSelectProps {
  id?: string;
  classes: ClassOption[];
  value: string[];
  onChange: (ids: string[]) => void;
}

/** Tag-style multi-select (selected classes as removable chips, checkbox
 *  dropdown with a filter box) — the eSchool "Class" field on Create Exam. */
export const ClassMultiSelect: React.FC<ClassMultiSelectProps> = ({ id, classes, value, onChange }) => {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClickOutside = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [open]);

  const toggle = (classId: string) =>
    onChange(value.includes(classId) ? value.filter((v) => v !== classId) : [...value, classId]);

  const selected = classes.filter((c) => value.includes(c.id));
  const visible = classes.filter((c) => classLabel(c).toLowerCase().includes(filter.trim().toLowerCase()));

  return (
    <div ref={rootRef} className="relative">
      <div
        id={id}
        role="combobox"
        aria-expanded={open}
        aria-haspopup="listbox"
        tabIndex={0}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setOpen((o) => !o);
          } else if (e.key === 'Escape') {
            setOpen(false);
          }
        }}
        className="input-field min-h-[42px] flex flex-wrap items-center gap-1.5 cursor-pointer pr-9"
      >
        {selected.length === 0 && <span className="text-slate-400 text-sm">Select classes</span>}
        {selected.map((c) => (
          <span
            key={c.id}
            className="inline-flex items-center gap-1 rounded-md bg-primary-50 dark:bg-primary-500/10 text-primary-700 dark:text-primary-300 text-xs font-medium px-2 py-1"
          >
            {classLabel(c)}
            <button
              type="button"
              aria-label={`Remove ${classLabel(c)}`}
              onClick={(e) => {
                e.stopPropagation();
                toggle(c.id);
              }}
              className="hover:text-red-600"
            >
              <X className="w-3 h-3" />
            </button>
          </span>
        ))}
        <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
      </div>

      {open && (
        <div className="absolute z-20 mt-1 w-full rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-surface-900 shadow-lg p-2">
          <input
            type="text"
            autoFocus
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Search class..."
            aria-label="Search classes"
            className="input-field text-sm mb-2"
          />
          <ul role="listbox" aria-multiselectable="true" className="max-h-60 overflow-y-auto">
            {visible.length === 0 ? (
              <li className="px-2 py-2 text-sm text-slate-500">No classes found.</li>
            ) : (
              visible.map((c) => {
                const isSelected = value.includes(c.id);
                return (
                  <li
                    key={c.id}
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => toggle(c.id)}
                    className="flex items-center gap-2 px-2 py-1.5 rounded-md text-sm cursor-pointer text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5"
                  >
                    <span
                      className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${
                        isSelected ? 'bg-primary-600 border-primary-600 text-white' : 'border-slate-300 dark:border-white/20'
                      }`}
                    >
                      {isSelected && <Check className="w-3 h-3" />}
                    </span>
                    {classLabel(c)}
                  </li>
                );
              })
            )}
          </ul>
        </div>
      )}
    </div>
  );
};
