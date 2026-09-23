import React from 'react';
import { CalendarRange } from 'lucide-react';
import { SimpleLookupManager } from '../../components/academics/SimpleLookupManager';

const Semester = () => {
  return (
    <div className="space-y-6">
      <div className="glass-card p-6 rounded-2xl flex items-center gap-4">
        <div className="w-11 h-11 rounded-xl bg-primary-50 dark:bg-primary-500/10 text-primary-600 dark:text-primary-400 flex items-center justify-center flex-shrink-0">
          <CalendarRange className="w-5 h-5" />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">Manage Semester</h2>
          <p className="text-slate-600 dark:text-slate-400 mt-1 text-sm">
            Create and manage academic semesters.
          </p>
        </div>
      </div>

      <SimpleLookupManager title="Semester" apiBasePath="/academics/semesters" />
    </div>
  );
};

export default Semester;
