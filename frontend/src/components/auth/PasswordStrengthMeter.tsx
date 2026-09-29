import React from 'react';
import { Check, X } from 'lucide-react';
import type { PasswordCheck } from '../../utils/identifier';

// =============================================================================
// Password strength meter — a visual read of the same rules the backend
// enforces (auth.dto.ts `passwordSchema`: 8+ chars, lower, upper, digit).
// Purely a presentation of `checkPassword()`'s result, so the two can never
// disagree about what "strong" means.
// =============================================================================

const LEVELS = [
  { label: 'Very weak', bar: 'bg-red-500', text: 'text-red-600 dark:text-red-400' },
  { label: 'Weak', bar: 'bg-red-500', text: 'text-red-600 dark:text-red-400' },
  { label: 'Fair', bar: 'bg-amber-500', text: 'text-amber-600 dark:text-amber-400' },
  { label: 'Good', bar: 'bg-blue-500', text: 'text-blue-600 dark:text-blue-400' },
  { label: 'Strong', bar: 'bg-emerald-500', text: 'text-emerald-600 dark:text-emerald-400' },
];

interface PasswordStrengthMeterProps {
  password: string;
  checks: PasswordCheck[];
}

export function PasswordStrengthMeter({ password, checks }: PasswordStrengthMeterProps) {
  if (!password) return null;

  const score = checks.filter((c) => c.met).length; // 0–4
  const level = LEVELS[score];

  return (
    <div className="pt-2 space-y-2" aria-hidden={false}>
      <div className="flex items-center gap-2">
        <div className="flex-1 grid grid-cols-4 gap-1" role="presentation">
          {[0, 1, 2, 3].map((i) => (
            <span
              key={i}
              className={`h-1.5 rounded-full transition-colors ${
                i < score ? level.bar : 'bg-slate-200 dark:bg-white/10'
              }`}
            />
          ))}
        </div>
        <span className={`text-xs font-bold shrink-0 ${level.text}`} role="status">
          {level.label}
        </span>
      </div>

      <ul className="grid grid-cols-2 gap-x-3 gap-y-1 pl-1">
        {checks.map((check) => (
          <li
            key={check.label}
            className={`flex items-center gap-1.5 text-xs ${
              check.met ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-500 dark:text-slate-400'
            }`}
          >
            {check.met ? (
              <Check className="w-3 h-3 shrink-0" />
            ) : (
              <X className="w-3 h-3 shrink-0 opacity-50" />
            )}
            {check.label}
          </li>
        ))}
      </ul>
    </div>
  );
}
