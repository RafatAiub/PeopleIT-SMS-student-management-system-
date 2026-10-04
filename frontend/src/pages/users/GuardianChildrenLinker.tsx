import React, { useEffect, useState } from 'react';
import { Search, X } from 'lucide-react';
import { useStudentSearch } from './users.queries';
import { RELATIONSHIP_OPTIONS, type StudentOption } from './users.types';

interface GuardianChildrenLinkerProps {
  selected: StudentOption[];
  onChange: (students: StudentOption[]) => void;
  relationship: string;
  onRelationshipChange: (value: string) => void;
}

// Lets an admin search existing students and link one or more of them to a
// GUARDIAN user as their children, right from the Add/Edit User form —
// without this, a newly created guardian has no linked children and the
// guardian portal has nothing to show them.
export default function GuardianChildrenLinker({
  selected,
  onChange,
  relationship,
  onRelationshipChange,
}: GuardianChildrenLinkerProps) {
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query), 300);
    return () => clearTimeout(timer);
  }, [query]);

  const { data: results = [], isFetching } = useStudentSearch(debounced);

  const selectedIds = new Set(selected.map((s) => s.id));
  const visibleResults = results.filter((s) => !selectedIds.has(s.id));

  const addStudent = (student: StudentOption) => {
    onChange([...selected, student]);
    setQuery('');
    setDebounced('');
  };
  const removeStudent = (id: string) => onChange(selected.filter((s) => s.id !== id));

  return (
    <div className="animate-fadeIn">
      <h4 className="text-sm font-semibold text-amber-600 dark:text-amber-400 mb-4 uppercase tracking-wider">Linked Children (Students)</h4>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Relationship</label>
          <select value={relationship} onChange={(e) => onRelationshipChange(e.target.value)} className="input-field">
            {RELATIONSHIP_OPTIONS.map((r) => (
              <option key={r} value={r} className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">
                {r.charAt(0) + r.slice(1).toLowerCase()}
              </option>
            ))}
          </select>
        </div>
        <div className="relative">
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Search Student to Link</label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name or student ID..."
              className="input-field pl-9"
            />
          </div>
          {query.trim() && (
            <div className="absolute z-10 mt-1 w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-xl shadow-xl max-h-56 overflow-y-auto">
              {isFetching ? (
                <div className="p-3 text-xs text-slate-500">Searching...</div>
              ) : visibleResults.length === 0 ? (
                <div className="p-3 text-xs text-slate-500">No matching students found.</div>
              ) : (
                visibleResults.map((s) => (
                  <button
                    type="button"
                    key={s.id}
                    onClick={() => addStudent(s)}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 dark:hover:bg-white/5 flex items-center justify-between gap-2"
                  >
                    <span className="text-slate-900 dark:text-white font-medium">{s.firstName} {s.lastName}</span>
                    <span className="text-xs text-slate-500 shrink-0">{s.class?.name || ''} {s.section?.name || ''} · {s.studentId}</span>
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      </div>

      {selected.length === 0 ? (
        <p className="text-xs text-slate-500 dark:text-slate-400 italic">No children linked yet. Search above to link this guardian to one or more students.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {selected.map((s, idx) => (
            <span
              key={s.id}
              className="inline-flex items-center gap-2 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 text-amber-700 dark:text-amber-400 text-xs font-semibold px-3 py-1.5 rounded-xl"
            >
              {idx === 0 && <span className="text-[9px] uppercase tracking-wider bg-amber-600 text-white px-1.5 py-0.5 rounded-sm">Primary</span>}
              {s.firstName} {s.lastName} ({s.studentId})
              <button type="button" onClick={() => removeStudent(s.id)} className="hover:text-rose-600">
                <X className="w-3.5 h-3.5" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
