import React from 'react';
import { Inbox } from 'lucide-react';
import { cn } from '../../lib/cn';

interface EmptyStateProps {
  title?: string;
  description?: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  compact?: boolean;
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  title = 'No data found',
  description = 'There are no items to display.',
  icon,
  action,
  compact = false,
  className,
}) => (
  <div className={cn('flex flex-col items-center justify-center px-4 text-center animate-fadeIn', compact ? 'py-8' : 'py-14', className)}>
    <div className="w-12 h-12 rounded-xl bg-slate-100 dark:bg-white/6 flex items-center justify-center mb-4 text-slate-500 dark:text-slate-400 [&>svg]:w-6 [&>svg]:h-6">
      {icon || <Inbox />}
    </div>
    <h3 className="text-base font-semibold text-slate-900 dark:text-slate-50">{title}</h3>
    <p className="text-sm text-slate-500 dark:text-slate-400 max-w-sm mt-1 leading-relaxed">{description}</p>
    {action && <div className="mt-5">{action}</div>}
  </div>
);
