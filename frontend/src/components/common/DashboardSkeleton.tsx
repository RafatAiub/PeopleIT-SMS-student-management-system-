import React from 'react';

export const DashboardSkeleton = () => {
  return (
    <div className="space-y-6 w-full animate-pulse">
      {/* Header Skeleton */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-2">
          <div className="h-8 w-48 bg-slate-200 dark:bg-slate-800 rounded-lg"></div>
          <div className="h-4 w-64 bg-slate-200 dark:bg-slate-800 rounded-lg"></div>
        </div>
        <div className="h-10 w-32 bg-slate-200 dark:bg-slate-800 rounded-xl"></div>
      </div>

      {/* KPI Cards Skeleton */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="glass-card p-5 h-32 flex flex-col justify-between border-slate-200 dark:border-white/5 bg-slate-50 dark:bg-slate-900/40">
            <div className="flex justify-between items-start">
              <div className="w-12 h-12 bg-slate-200 dark:bg-slate-800 rounded-xl"></div>
              <div className="w-16 h-6 bg-slate-200 dark:bg-slate-800 rounded-full"></div>
            </div>
            <div className="space-y-2 mt-4">
              <div className="h-6 w-24 bg-slate-200 dark:bg-slate-800 rounded-lg"></div>
              <div className="h-3 w-20 bg-slate-200 dark:bg-slate-800 rounded-lg"></div>
            </div>
          </div>
        ))}
      </div>

      {/* Content Area Skeleton */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
        {[1, 2].map((i) => (
          <div key={i} className="glass-card p-6 h-64 flex flex-col space-y-4 border-slate-200 dark:border-white/5 bg-slate-50 dark:bg-slate-900/40">
             <div className="h-6 w-40 bg-slate-200 dark:bg-slate-800 rounded-lg mb-2"></div>
             <div className="flex-1 flex flex-col items-center justify-center space-y-4">
                <div className="w-16 h-16 rounded-full bg-slate-200 dark:bg-slate-800"></div>
                <div className="h-4 w-48 bg-slate-200 dark:bg-slate-800 rounded-lg"></div>
             </div>
          </div>
        ))}
      </div>
    </div>
  );
};
