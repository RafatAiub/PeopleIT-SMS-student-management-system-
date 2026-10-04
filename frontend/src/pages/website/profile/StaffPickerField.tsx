import React from 'react';
import { ChevronDown, Search } from 'lucide-react';
import { useT } from '@/i18n';
import { cn } from '@/lib/cn';
import { useStaffVisibility } from '../sites.queries';

export interface StaffPickResult {
  id: string;
  name: string;
  photoUrl: string | null;
  designation: string | null;
}

/**
 * Lightweight searchable staff picker (self-contained popover, not the
 * generic `Dropdown` — that component auto-focuses its first menu item,
 * which would steal focus away from a search box). Backs the "head of
 * institution" staff-member option on the Profile screen.
 */
export const StaffPickerField: React.FC<{
  id: string;
  label: string;
  placeholder: string;
  selectedName?: string | null;
  onPick: (member: StaffPickResult) => void;
}> = ({ id, label, placeholder, selectedName, onPick }) => {
  const t = useT();
  const [open, setOpen] = React.useState(false);
  const [q, setQ] = React.useState('');
  const [debounced, setDebounced] = React.useState('');
  const wrapRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const h = setTimeout(() => setDebounced(q), 300);
    return () => clearTimeout(h);
  }, [q]);

  React.useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const staff = useStaffVisibility({ page: 1, pageSize: 8, q: debounced });
  const items = staff.data?.items ?? [];

  return (
    <div className="relative" ref={wrapRef}>
      <label className="field-label" htmlFor={id}>{label}</label>
      <button
        type="button"
        id={id}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="input-field flex items-center justify-between text-left"
      >
        <span className={cn('truncate', !selectedName && 'text-slate-400')}>{selectedName || placeholder}</span>
        <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" aria-hidden />
      </button>
      {open && (
        <div className="absolute z-30 mt-1 w-full rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 shadow-lg overflow-hidden">
          <div className="p-2 border-b border-slate-100 dark:border-white/6">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" aria-hidden />
              <input
                autoFocus
                className="input-field pl-8 h-9"
                aria-label={t('Search staff by name')}
                placeholder={t('Search staff by name')}
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>
          </div>
          <ul role="listbox" aria-label={label} className="max-h-56 overflow-y-auto py-1">
            {staff.isLoading ? (
              <li className="px-3 py-2 text-sm text-slate-500 dark:text-slate-400">{t('Searching…')}</li>
            ) : items.length === 0 ? (
              <li className="px-3 py-2 text-sm text-slate-500 dark:text-slate-400">{t('No staff found')}</li>
            ) : (
              items.map((m) => (
                <li key={m.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={selectedName === m.name}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-slate-100 dark:hover:bg-white/6"
                    onClick={() => {
                      onPick({ id: m.id, name: m.name, photoUrl: m.photoUrl, designation: m.designation });
                      setOpen(false);
                    }}
                  >
                    <span className="flex-1 min-w-0 truncate">{m.name}</span>
                    {m.designation && <span className="text-xs text-slate-500 dark:text-slate-400 shrink-0">{m.designation}</span>}
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  );
};
