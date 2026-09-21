import React from 'react';
import { Languages } from 'lucide-react';
import { SimpleLookupManager } from '../../components/academics/SimpleLookupManager';

const Medium = () => {
  return (
    <div className="space-y-6">
      <div className="glass-card p-6 rounded-2xl flex items-center gap-4">
        <div className="w-11 h-11 rounded-xl bg-primary-50 dark:bg-primary-500/10 text-primary-600 dark:text-primary-400 flex items-center justify-center flex-shrink-0">
          <Languages className="w-5 h-5" />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">Manage Medium</h2>
          <p className="text-slate-600 dark:text-slate-400 mt-1 text-sm">
            Create and manage the mediums of instruction offered by the institution.
          </p>
        </div>
      </div>

      <SimpleLookupManager title="Medium" apiBasePath="/academics/mediums" />
    </div>
  );
};

export default Medium;
