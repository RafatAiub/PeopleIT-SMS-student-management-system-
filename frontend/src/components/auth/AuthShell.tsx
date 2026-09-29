import React from 'react';
import { Check } from 'lucide-react';
import { LogoMark } from '../common/LogoMark';

// =============================================================================
// Shared frame for every unauthenticated page
// =============================================================================
// Sign in, sign up, email confirmation and password reset all sit in the same
// card so they read as one system — a signup page that looks like a different
// product is a real drop-off cause. Only the right-hand panel changes.

const FEATURES = [
  'Attendance & academic records',
  'Fees, invoices & online payments',
  'Timetables, exams & staff management',
];

interface AuthShellProps {
  children: React.ReactNode;
  /** Announced to screen readers even when the toast is not read aloud. */
  liveMessage?: string;
}

export function AuthShell({ children, liveMessage }: AuthShellProps) {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-slate-100 dark:bg-surface-950 p-4 sm:p-6 lg:p-10 transition-colors duration-300">
      <div role="alert" aria-live="assertive" className="sr-only">
        {liveMessage}
      </div>

      {/* One bounded, centered card — not a full-bleed 50/50 split — so it
          stays visually balanced instead of floating in a sea of empty space
          on wide/ultrawide screens. */}
      <div className="w-full max-w-5xl bg-white dark:bg-surface-900 rounded-3xl shadow-xl border border-slate-200 dark:border-white/10 overflow-hidden grid lg:grid-cols-2 animate-in fade-in slide-in-from-bottom-4 duration-300">
        <BrandPanel />

        <div className="flex items-center justify-center p-6 sm:p-10 lg:p-12">
          <div className="relative z-10 w-full max-w-sm">
            {/* The wordmark only appears here on small screens, where the
                brand panel beside it is hidden. */}
            <div className="text-center mb-8 lg:hidden">
              <LogoMark className="w-14 h-14 mx-auto mb-4 shadow-lg" />
              <h1 className="text-3xl font-black tracking-tight text-slate-900 dark:text-white mb-2">
                PeopleNIT <span className="text-accent-500">SMS</span>
              </h1>
            </div>

            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Brand story panel — decorative, so hidden rather than stacked on mobile. */
function BrandPanel() {
  return (
    <div className="hidden lg:flex flex-col justify-between relative overflow-hidden bg-gradient-to-br from-primary-800 via-primary-700 to-primary-900 p-10 xl:p-12">
      <div
        className="absolute inset-0 opacity-[0.08]"
        style={{
          backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)',
          backgroundSize: '28px 28px',
        }}
      />
      <div className="absolute -top-24 -left-24 w-96 h-96 rounded-full bg-accent-400/10 blur-3xl" />
      <div className="absolute -bottom-32 -right-16 w-[28rem] h-[28rem] rounded-full bg-primary-300/10 blur-3xl" />

      <div className="relative z-10 flex items-center gap-3">
        <LogoMark className="w-10 h-10 shadow-lg" />
        <span className="text-white font-bold text-lg tracking-tight">PeopleNIT SMS</span>
      </div>

      <div className="relative z-10">
        <svg
          viewBox="0 0 200 160"
          className="w-40 xl:w-48 h-auto mb-8 text-white/25"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M30 130 L30 70 L70 70 L70 130 M40 90 h20 M40 105 h20" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M100 40 L140 55 L100 70 L60 55 Z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M75 60 v22 c0 8 12 14 25 14 s25 -6 25 -14 v-22" />
          <circle cx="140" cy="55" r="2" fill="currentColor" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M140 55 v18" />
          <rect x="150" y="95" width="30" height="24" rx="2" strokeLinecap="round" strokeLinejoin="round" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M156 95 v-6 a9 9 0 0 1 18 0 v6" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M20 40 l6 6 m0 -6 l-6 6" />
          <circle cx="170" cy="30" r="4" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M95 130 h50 m-50 8 h35" />
        </svg>
        <h1 className="text-2xl xl:text-3xl font-black text-white tracking-tight leading-tight mb-3">
          Run your entire institution from one dashboard
        </h1>
        <p className="text-primary-100/80 text-sm leading-relaxed mb-6">
          PeopleNIT SMS brings every academic workflow into a single, reliable platform for
          administrators, teachers, students and guardians alike.
        </p>
        <ul className="space-y-2.5">
          {FEATURES.map((feature) => (
            <li key={feature} className="flex items-center gap-2.5 text-sm text-primary-50/90">
              <span className="w-5 h-5 rounded-full bg-white/10 flex items-center justify-center flex-shrink-0">
                <Check className="w-3 h-3" />
              </span>
              {feature}
            </li>
          ))}
        </ul>
      </div>

      <p className="relative z-10 text-primary-200/50 text-xs">
        © {new Date().getFullYear()} PeopleNIT SMS. All rights reserved.
      </p>
    </div>
  );
}

/** Shared spinner for submit buttons across the auth pages. */
export function ButtonSpinner() {
  return (
    <svg
      className="animate-spin -ml-1 mr-3 h-5 w-5 text-white"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );
}
