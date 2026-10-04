import React from 'react';
import { cn } from '../../lib/cn';

export type BadgeVariant = 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'primary' | 'accent';

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  /** Re-plays a subtle fade when the key changes (e.g. status transitions). */
  motionKey?: string;
  /** Show a leading status dot. */
  dot?: boolean;
  children?: React.ReactNode;
}

const VARIANT_CLASSES: Record<BadgeVariant, string> = {
  success: 'badge-success',
  warning: 'badge-warning',
  danger: 'badge-danger',
  info: 'badge-info',
  neutral: 'badge-neutral',
  primary: 'badge-primary',
  accent: 'badge-accent',
};

const DOT_CLASSES: Record<BadgeVariant, string> = {
  success: 'bg-emerald-500',
  warning: 'bg-amber-500',
  danger: 'bg-red-500',
  info: 'bg-blue-500',
  neutral: 'bg-slate-400',
  primary: 'bg-primary-500',
  accent: 'bg-accent-500',
};

export const Badge: React.FC<BadgeProps> = ({ variant = 'neutral', motionKey, dot, className, children, ...props }) => (
  <span
    key={motionKey}
    className={cn(VARIANT_CLASSES[variant], motionKey && 'animate-fadeIn', className)}
    {...props}
  >
    {dot && <span aria-hidden className={cn('w-1.5 h-1.5 rounded-full', DOT_CLASSES[variant])} />}
    {children}
  </span>
);
