import React from 'react';

/**
 * `stops` is a free-text field on TransportRoute (e.g. "Gate 1, Central Park,
 * Market Road") — this renders it as a chip list for display only; the
 * underlying string is never modified or re-split back into the API payload.
 */
export const StopsChips: React.FC<{ stops: string | null | undefined; className?: string }> = ({ stops, className }) => {
  const list = (stops || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  if (list.length === 0) return <span className="text-slate-400 dark:text-slate-500 text-sm">—</span>;

  return (
    <div className={`flex flex-wrap gap-1.5 ${className || ''}`}>
      {list.map((stop, i) => (
        <span
          key={`${stop}-${i}`}
          className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 dark:bg-white/8 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-white/10"
        >
          {stop}
        </span>
      ))}
    </div>
  );
};
