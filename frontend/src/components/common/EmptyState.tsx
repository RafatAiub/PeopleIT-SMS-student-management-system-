import React from 'react';
import { InboxIcon } from 'lucide-react';

interface EmptyStateProps {
  title?: string;
  description?: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  title = 'No data found',
  description = 'There are no items to display.',
  icon,
  action,
}) => {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center animate-fadeIn">
      <div className="w-16 h-16 rounded-2xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 flex items-center justify-center mb-5">
        {icon || <InboxIcon className="w-8 h-8 text-slate-400 dark:text-slate-500" />}
      </div>
      <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">{title}</h3>
      <p className="text-slate-500 dark:text-slate-400 text-sm max-w-sm mb-6 leading-relaxed">
        {description}
      </p>
      {action && (
        <div className="animate-in fade-in slide-in-from-bottom-2 duration-500 delay-150">
          {action}
        </div>
      )}
    </div>
  );
};
