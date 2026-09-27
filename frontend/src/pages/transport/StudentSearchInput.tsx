import React, { useEffect, useRef, useState } from 'react';
import { Search, User, X } from 'lucide-react';
import apiClient from '../../api/client';

export interface StudentSearchResult {
  id: string;
  studentId: string;
  firstName: string;
  lastName: string;
  class?: { name: string } | null;
  section?: { name: string } | null;
}

interface StudentSearchInputProps {
  value: StudentSearchResult | null;
  onChange: (student: StudentSearchResult | null) => void;
  error?: string;
  label?: string;
  required?: boolean;
}

/**
 * Debounced student search/select, mirroring the same `/students?search=`
 * pattern used across the app (e.g. fees/StudentPicker.tsx).
 */
export const StudentSearchInput: React.FC<StudentSearchInputProps> = ({ value, onChange, error, label = 'Student', required }) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<StudentSearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const fieldId = React.useId();

  useEffect(() => {
    if (!open || query.trim().length === 0) {
      setResults([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const { data } = await apiClient.get('/students', { params: { search: query, pageSize: 10, page: 1 } });
        if (!cancelled) setResults(data.data || []);
      } catch {
        if (!cancelled) setResults([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, open]);

  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={fieldId} className="field-label">
        {label}
        {required && <span className="text-red-600 dark:text-red-400 ml-0.5" aria-hidden>*</span>}
      </label>
      {value ? (
        <div className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 px-3 py-2.5">
          <div className="flex items-center gap-2 min-w-0">
            <User className="w-4 h-4 text-slate-400 shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-medium text-slate-900 dark:text-white truncate">
                {value.firstName} {value.lastName}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                ID: {value.studentId}
                {value.class?.name ? ` · ${value.class.name}${value.section?.name ? ` - ${value.section.name}` : ''}` : ''}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => { onChange(null); setQuery(''); }}
            aria-label="Clear selected student"
            className="p-1 rounded-md text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-white/10 shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <div ref={containerRef} className="relative">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" aria-hidden />
            <input
              id={fieldId}
              type="text"
              value={query}
              onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
              onFocus={() => setOpen(true)}
              placeholder="Search by name or student ID..."
              aria-invalid={error ? true : undefined}
              className={`input-field pl-9 ${error ? 'border-rose-500 focus:ring-rose-500' : ''}`}
            />
          </div>
          {open && query.trim().length > 0 && (
            <div className="absolute z-20 mt-1 w-full max-h-60 overflow-y-auto rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 shadow-lg">
              {loading ? (
                <p className="px-3 py-2.5 text-sm text-slate-500 dark:text-slate-400">Searching...</p>
              ) : results.length === 0 ? (
                <p className="px-3 py-2.5 text-sm text-slate-500 dark:text-slate-400">No students found.</p>
              ) : (
                results.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => { onChange(s); setOpen(false); setQuery(''); }}
                    className="w-full text-left px-3 py-2.5 text-sm hover:bg-slate-50 dark:hover:bg-white/5 border-b border-slate-100 dark:border-white/5 last:border-0"
                  >
                    <span className="font-medium text-slate-900 dark:text-white">{s.firstName} {s.lastName}</span>
                    <span className="block text-xs text-slate-500 dark:text-slate-400">
                      ID: {s.studentId}
                      {s.class?.name ? ` · ${s.class.name}${s.section?.name ? ` - ${s.section.name}` : ''}` : ''}
                    </span>
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      )}
      {error && <p className="field-error">{error}</p>}
    </div>
  );
};
