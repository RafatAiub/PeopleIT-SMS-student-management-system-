import React from 'react';
import { Check } from 'lucide-react';
import { cn } from '@/lib/cn';
import { STEP_TITLES, WIZARD_STEP_COUNT, WizardStep } from './types';

export const StepIndicator: React.FC<{
  step: WizardStep;
  highestStepReached: WizardStep;
  onStepClick: (step: WizardStep) => void;
}> = ({ step, highestStepReached, onStepClick }) => {
  const steps = [1, 2, 3, 4, 5] as WizardStep[];
  return (
    <div>
      {/* Mobile: collapsed "Step X of 5" */}
      <div className="sm:hidden flex items-center justify-between mb-1">
        <p className="text-sm font-semibold text-slate-900 dark:text-white">
          Step {step} of {WIZARD_STEP_COUNT}: {STEP_TITLES[step]}
        </p>
      </div>
      <div className="sm:hidden h-1.5 w-full rounded-full bg-slate-200 dark:bg-white/10 mb-4">
        <div
          className="h-1.5 rounded-full bg-primary-600 transition-all"
          style={{ width: `${(step / WIZARD_STEP_COUNT) * 100}%` }}
        />
      </div>

      {/* Desktop: full step rail, clickable for completed steps */}
      <ol className="hidden sm:flex items-center gap-2 mb-2">
        {steps.map((s, i) => {
          const isCompleted = s < highestStepReached || (s <= highestStepReached && s < step);
          const isCurrent = s === step;
          const isClickable = s <= highestStepReached;
          return (
            <li key={s} className="flex items-center flex-1 last:flex-none">
              <button
                type="button"
                disabled={!isClickable}
                onClick={() => isClickable && onStepClick(s)}
                className={cn(
                  'flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs font-medium transition-colors',
                  isCurrent
                    ? 'bg-primary-50 text-primary-700 dark:bg-primary-500/15 dark:text-primary-300'
                    : isClickable
                      ? 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/5 cursor-pointer'
                      : 'text-slate-400 dark:text-slate-600 cursor-not-allowed',
                )}
              >
                <span
                  className={cn(
                    'flex items-center justify-center w-5 h-5 rounded-full text-[11px] font-semibold shrink-0',
                    isCurrent
                      ? 'bg-primary-600 text-white'
                      : isCompleted
                        ? 'bg-emerald-500 text-white'
                        : 'bg-slate-200 text-slate-600 dark:bg-white/10 dark:text-slate-300',
                  )}
                >
                  {isCompleted ? <Check className="w-3 h-3" /> : s}
                </span>
                <span className="hidden md:inline whitespace-nowrap">{STEP_TITLES[s]}</span>
              </button>
              {i < steps.length - 1 && <span className="flex-1 h-px bg-slate-200 dark:bg-white/10 mx-1" />}
            </li>
          );
        })}
      </ol>
    </div>
  );
};
