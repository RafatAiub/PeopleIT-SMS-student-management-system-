import React from 'react';
import { BookMarked } from 'lucide-react';
import { SimpleLookupManager } from '../../components/academics/SimpleLookupManager';

// GET /curriculum/subjects requires a `className` query param and returns
// SubjectOffering rows (subjectName/label/paper/...) for mark entry — not
// the flat Subject catalogue this page manages. GET /curriculum/subjects/catalog
// is the un-scoped Subject { id, name } list added alongside the
// POST/PUT/DELETE /curriculum/subjects routes for this page.
const Subjects = () => {
  return (
    <div className="space-y-6">
      <div className="glass-card p-6 rounded-2xl flex items-center gap-4">
        <div className="w-11 h-11 rounded-xl bg-primary-50 dark:bg-primary-500/10 text-primary-600 dark:text-primary-400 flex items-center justify-center flex-shrink-0">
          <BookMarked className="w-5 h-5" />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">Manage Subject</h2>
          <p className="text-slate-600 dark:text-slate-400 mt-1 text-sm">
            Create and manage the subject catalogue offered by the institution.
          </p>
        </div>
      </div>

      <SimpleLookupManager
        title="Subject"
        apiBasePath="/curriculum/subjects"
        listPath="/curriculum/subjects/catalog"
        getDisplayName={(item) => item.name ?? ''}
      />
    </div>
  );
};

export default Subjects;
