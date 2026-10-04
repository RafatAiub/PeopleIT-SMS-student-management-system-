import React from 'react';
import { cn } from '../../lib/cn';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  interactive?: boolean;
  /** Fade + rise entrance on mount (e.g. KPI cards on dashboard load). */
  animateIn?: boolean;
  /** Remove the default padding (for tables / media flush to the edge). */
  flush?: boolean;
  children?: React.ReactNode;
}

export const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ interactive = false, animateIn = false, flush = false, className, children, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        interactive ? 'glass-card-hover' : 'glass-card',
        !flush && 'p-5',
        animateIn && 'animate-fadeIn',
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
);
Card.displayName = 'Card';

interface CardHeaderProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  icon?: React.ReactNode;
}

export const CardHeader: React.FC<CardHeaderProps> = ({ title, description, actions, icon, className, ...props }) => (
  <div className={cn('flex items-start justify-between gap-3 mb-4', className)} {...props}>
    <div className="flex items-start gap-3 min-w-0">
      {icon && (
        <div className="w-9 h-9 rounded-lg bg-primary-50 dark:bg-primary-500/15 text-primary-600 dark:text-primary-300 flex items-center justify-center shrink-0">
          {icon}
        </div>
      )}
      <div className="min-w-0">
        <h3 className="text-[15px] font-semibold text-slate-900 dark:text-slate-50 leading-6 truncate">{title}</h3>
        {description && <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">{description}</p>}
      </div>
    </div>
    {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
  </div>
);
