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
      <div className="relative mb-6">
        {/* Subtle glow effect behind the icon */}
        <div className="absolute inset-0 bg-blue-500/20 dark:bg-blue-500/10 blur-xl rounded-full" />
        <div className="relative w-20 h-20 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 shadow-xl shadow-slate-200/50 dark:shadow-black/50 flex items-center justify-center rotate-3 hover:rotate-0 transition-transform duration-300">
          {icon || <InboxIcon className="w-10 h-10 text-slate-400 dark:text-slate-500" />}
        </div>
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
