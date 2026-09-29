import React from 'react';
import { Tags } from 'lucide-react';
import { SimpleLookupManager } from '../../components/academics/SimpleLookupManager';

const StudentsCategory = () => {
  return (
    <div className="space-y-6">
      <div className="glass-card p-6 rounded-2xl flex items-center gap-4">
        <div className="w-11 h-11 rounded-xl bg-primary-50 dark:bg-primary-500/10 text-primary-600 dark:text-primary-400 flex items-center justify-center flex-shrink-0">
          <Tags className="w-5 h-5" />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">Manage Category</h2>
          <p className="text-slate-600 dark:text-slate-400 mt-1 text-sm">
            Create and manage the student categories offered by the institution.
          </p>
        </div>
      </div>

      <SimpleLookupManager title="Category" apiBasePath="/academics/student-categories" />
    </div>
  );
};

export default StudentsCategory;
