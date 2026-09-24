import React, { useState, useEffect } from 'react';
import { Search, X as XIcon } from 'lucide-react';
import apiClient from '@/api/client';

// Lightweight applicant picker — leave requests/report are filtered
// server-side by exact applicantUserId, so this resolves a free-text
// name/email search against the existing (admin-only) GET /users endpoint
// into a concrete id. Not part of the leave module's own API contract.
export interface UserOption {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role?: string;
}

interface ApplicantFilterProps {
  value: UserOption | null;
  onChange: (u: UserOption | null) => void;
  /** Exact-match server-side role filter, e.g. 'STUDENT'. */
  role?: string;
  /** Client-side filter applied after fetch, e.g. ['STUDENT','GUARDIAN'] to
   *  restrict a "teacher or staff" picker — GET /users only supports a
   *  single exact-match role, not a negated/multi-role filter. */
  excludeRoles?: string[];
  placeholder?: string;
}

export function ApplicantFilter({ value, onChange, role, excludeRoles, placeholder }: ApplicantFilterProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<UserOption[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      setResults([]);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const timer = setTimeout(async () => {
      try {
        const res = await apiClient.get('/users', {
          params: { search: trimmed, pageSize: 8, ...(role ? { role } : {}) },
        });
        let data: UserOption[] = res.data.data || [];
        if (excludeRoles?.length) {
          data = data.filter((u) => !excludeRoles.includes(u.role || ''));
        }
        if (!cancelled) setResults(data);
      } catch {
        // Non-critical filter helper — fail silently.
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, role, excludeRoles?.join(',')]);

  if (value) {
    return (
      <div className="flex items-center gap-2 bg-primary-50 dark:bg-primary-500/10 border border-primary-200 dark:border-primary-500/20 rounded-lg px-3 py-1.5 text-xs text-primary-700 dark:text-primary-400">
        <span className="font-semibold">{value.firstName} {value.lastName}</span>
        <button type="button" onClick={() => onChange(null)} aria-label="Clear applicant filter">
          <XIcon className="w-3.5 h-3.5" />
        </button>
      </div>
    );
  }

  return (
    <div className="relative w-56">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={placeholder || 'Filter by applicant...'}
        className="input-field pl-8 text-xs py-1.5"
      />
      {query.trim() && (results.length > 0 || searching) && (
        <div className="absolute z-10 mt-1 w-full bg-white dark:bg-surface-900 border border-slate-200 dark:border-white/10 rounded-lg shadow-lg max-h-48 overflow-y-auto">
          {searching ? (
            <div className="px-3 py-2 text-xs text-slate-500">Searching…</div>
          ) : (
            results.map((u) => (
              <button
                key={u.id}
                type="button"
                onClick={() => {
                  onChange(u);
                  setQuery('');
                  setResults([]);
                }}
                className="w-full text-left px-3 py-2 text-xs hover:bg-slate-100 dark:hover:bg-white/5 transition-colors"
              >
                <div className="font-medium text-slate-800 dark:text-slate-200">{u.firstName} {u.lastName}</div>
                <div className="text-slate-500">{u.email}</div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
