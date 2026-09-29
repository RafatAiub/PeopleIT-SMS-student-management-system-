import React from 'react';
import { cn } from '../../lib/cn';

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  /** `current` inherits the text colour (used inside buttons). */
  tone?: 'brand' | 'current';
  label?: string;
}

export const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({ size = 'md', className = '', tone, label = 'Loading' }) => {
  const sizeClasses = {
    sm: 'w-4 h-4 border-2',
    md: 'w-8 h-8 border-2',
    lg: 'w-12 h-12 border-[3px]',
  };
  // Small spinners almost always sit inside a button/label — follow its colour.
  const resolvedTone = tone ?? (size === 'sm' ? 'current' : 'brand');

  return (
    <span role="status" aria-label={label} className={cn('inline-flex items-center justify-center', className)}>
      <span
        className={cn(
          sizeClasses[size],
          'rounded-full border-t-transparent animate-spin',
          resolvedTone === 'current' ? 'border-current' : 'border-primary-500'
        )}
      />
    </span>
  );
};

export const PageLoader: React.FC<{ label?: string }> = ({ label = 'Loading…' }) => (
  <div className="flex items-center justify-center h-64" role="status" aria-live="polite">
    <div className="flex flex-col items-center gap-3">
      <span className="w-10 h-10 rounded-full border-2 border-primary-500 border-t-transparent animate-spin" />
      <p className="text-slate-500 dark:text-slate-400 text-sm">{label}</p>
    </div>
  </div>
);
