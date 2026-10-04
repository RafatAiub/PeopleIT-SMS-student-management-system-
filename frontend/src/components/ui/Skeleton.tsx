import React from 'react';
import { cn } from '../../lib/cn';

export const Skeleton: React.FC<{ className?: string; style?: React.CSSProperties }> = ({ className, style }) => (
  <div aria-hidden className={cn('rounded-md bg-slate-200/80 dark:bg-white/7 animate-pulse', className)} style={style} />
);

export const SkeletonText: React.FC<{ lines?: number; className?: string }> = ({ lines = 3, className }) => (
  <div className={cn('space-y-2', className)} aria-hidden>
    {Array.from({ length: lines }).map((_, i) => (
      <Skeleton key={i} className="h-3.5" style={{ width: i === lines - 1 ? '60%' : '100%' }} />
    ))}
  </div>
);

export const SkeletonStatGrid: React.FC<{ count?: number }> = ({ count = 4 }) => (
  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4" role="status" aria-label="Loading">
    {Array.from({ length: count }).map((_, i) => (
      <div key={i} className="glass-card p-4 sm:p-5 space-y-3">
        <Skeleton className="h-3.5 w-24" />
        <Skeleton className="h-7 w-20" />
        <Skeleton className="h-3 w-28" />
      </div>
    ))}
  </div>
);
