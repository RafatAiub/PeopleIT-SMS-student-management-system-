import React from 'react';
import { Save } from 'lucide-react';
import { PageHeader, Skeleton, Tabs } from '../../components/ui';
import { useMarksData } from './marks/useMarksData';
import { UploadTab } from './marks/UploadTab';
import { ResultSheetTab } from './marks/ResultSheetTab';
import { StudentMarksheetTab } from './marks/StudentMarksheetTab';

const MarksEntry = () => {
  const data = useMarksData();
  const { initialLoading, activeTab, setActiveTab, unsavedChanges, uploadSummary, handleSave, loading } = data;

  if (initialLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-96" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Grade Book Portal" description="Upload and view examination grades, reports and remarks." />

      <Tabs
        label="Grade Book Portal tabs"
        variant="underline"
        value={activeTab}
        onChange={(id) => setActiveTab(id as 'upload' | 'sheet' | 'marksheet')}
        tabs={[
          { id: 'upload', label: 'Grade Sheet Upload' },
          { id: 'sheet', label: 'Complete Result Sheet' },
          { id: 'marksheet', label: 'Student Marksheet' },
        ]}
      />

      {activeTab === 'upload' ? (
        <UploadTab data={data} />
      ) : activeTab === 'sheet' ? (
        <ResultSheetTab data={data} />
      ) : (
        <StudentMarksheetTab data={data} />
      )}

      {/* Floating Save Action Bar when there are unsaved changes */}
      {unsavedChanges && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 animate-bounce">
          <div className="glass-card px-6 py-4 rounded-full shadow-sm border border-blue-500/40 flex items-center gap-6">
            <div className="flex items-center gap-3">
              <div className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-pulse" />
              <span className="text-sm font-bold text-slate-900 dark:text-white tracking-wide">
                {uploadSummary ? `Parsed ${uploadSummary.marks} grades for ${uploadSummary.students} students.` : 'You have unsaved changes.'}
              </span>
            </div>
            <button
              onClick={handleSave}
              disabled={loading}
              className="flex items-center gap-2 bg-primary-600 hover:bg-primary-700 text-white font-bold py-2.5 px-6 rounded-full transition-all shadow-sm active:scale-[0.98]"
            >
              <Save className="w-4 h-4" />
              {loading ? 'Saving...' : 'Confirm & Save All'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default MarksEntry;
