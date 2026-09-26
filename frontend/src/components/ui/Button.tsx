import React from 'react';
import { cn } from '../../lib/cn';
import { LoadingSpinner } from '../common/LoadingSpinner';

/**
 * Button variants:
 *  primary   — darkened brand orange (#c2550a) + white text, AA-compliant
 *  gradient  — kept for backward compatibility (49 call sites): the larger
 *              "standout CTA" look, now the same brand fill at size lg
 *  secondary — white/outlined
 *  outline   — brand-coloured outline
 *  ghost     — no chrome
 *  danger    — solid red for destructive confirmation
 *  danger-soft — tinted red for secondary destructive actions
 *  link      — inline text link
 */
export type ButtonVariant =
  | 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'danger-soft' | 'link' | 'gradient';
export type ButtonSize = 'xs' | 'sm' | 'md' | 'lg' | 'icon' | 'icon-sm';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  isLoading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  fullWidth?: boolean;
}

const BASE =
  'inline-flex items-center justify-center gap-2 font-semibold rounded-lg whitespace-nowrap select-none ' +
  'transition-[background-color,border-color,color,box-shadow,transform] duration-150 active:translate-y-px ' +
  'disabled:opacity-50 disabled:cursor-not-allowed disabled:active:translate-y-0';

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: 'bg-primary-600 hover:bg-primary-700 text-white shadow-xs',
  gradient: 'bg-primary-600 hover:bg-primary-700 text-white shadow-sm',
  secondary:
    'bg-white hover:bg-slate-50 text-slate-800 border border-slate-300 shadow-xs ' +
    'dark:bg-white/6 dark:hover:bg-white/10 dark:text-slate-100 dark:border-white/12',
  outline:
    'bg-transparent text-primary-700 border border-primary-600/40 hover:bg-primary-50 hover:border-primary-600 ' +
    'dark:text-primary-300 dark:border-primary-400/40 dark:hover:bg-primary-500/10',
  ghost: 'bg-transparent text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-white/6 font-medium',
  danger: 'bg-red-600 hover:bg-red-700 text-white shadow-xs',
  'danger-soft':
    'bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 ' +
    'dark:bg-red-500/15 dark:hover:bg-red-500/25 dark:text-red-300 dark:border-red-500/25',
  link: 'bg-transparent text-primary-600 hover:text-primary-700 hover:underline underline-offset-2 dark:text-blue-400 dark:hover:text-blue-300 px-0! py-0! h-auto!',
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  xs: 'min-h-7 px-2.5 text-xs',
  sm: 'min-h-8 px-3 text-xs',
  md: 'min-h-9 px-4 text-sm',
  lg: 'min-h-11 px-5 text-base',
  icon: 'h-9 w-9 p-0',
  'icon-sm': 'h-8 w-8 p-0',
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'primary',
      size,
      isLoading = false,
      disabled,
      className,
      children,
      leftIcon,
      rightIcon,
      fullWidth,
      ...props
    },
    ref
  ) => {
    // `gradient` historically rendered larger than the default button.
    const resolvedSize: ButtonSize = size ?? (variant === 'gradient' ? 'lg' : 'md');
    return (
      <button
        ref={ref}
        disabled={disabled || isLoading}
        aria-busy={isLoading || undefined}
        className={cn(
          BASE,
          VARIANT_CLASSES[variant],
          SIZE_CLASSES[resolvedSize],
          // lg + gradient: 16px semibold on the darkened primary
          variant === 'gradient' && resolvedSize === 'lg' && 'text-[15px] rounded-xl',
          fullWidth && 'w-full',
          className
        )}
        {...props}
      >
        {isLoading ? <LoadingSpinner size="sm" /> : leftIcon}
        {children}
        {!isLoading && rightIcon}
      </button>
    );
  }
);

Button.displayName = 'Button';
