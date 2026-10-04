import React, { useState } from 'react';
import { Download, FileSpreadsheet, CheckCircle2, AlertCircle, ArrowLeft, ArrowRight, RotateCcw } from 'lucide-react';
import apiClient from '../../api/client';
import toast from 'react-hot-toast';
import { Button } from '../../components/ui/Button';
import { PageHeader } from '../../components/ui/Display';
import { Badge } from '../../components/ui/Badge';
import { cn } from '../../lib/cn';
import { IMPORT_COLUMNS, parseBulkImportFile, PreviewRow } from './bulkImportPreview';

type Step = 1 | 2 | 3 | 4;

const STEPS: { id: Step; label: string }[] = [
  { id: 1, label: 'Download template' },
  { id: 2, label: 'Upload file' },
  { id: 3, label: 'Preview & validate' },
  { id: 4, label: 'Import result' },
];

interface ImportResult {
  successCount: number;
  errorCount: number;
  errors: { row: number; issues: string[] }[];
}

const StepIndicator: React.FC<{ current: Step }> = ({ current }) => (
  <ol className="flex flex-wrap items-center gap-2 sm:gap-3" aria-label="Import steps">
    {STEPS.map((step, i) => {
      const state = step.id === current ? 'current' : step.id < current ? 'done' : 'upcoming';
      return (
        <li key={step.id} className="flex items-center gap-2 sm:gap-3">
          <span
            className={cn(
              'flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold',
              state === 'current' && 'bg-primary-600 text-white',
              state === 'done' && 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
              state === 'upcoming' && 'bg-slate-100 text-slate-500 dark:bg-white/6 dark:text-slate-400'
            )}
          >
            <span
              className={cn(
                'w-4 h-4 rounded-full flex items-center justify-center text-[10px]',
                state === 'current' && 'bg-white/25',
                state === 'done' && 'bg-emerald-500 text-white',
                state === 'upcoming' && 'bg-slate-300 dark:bg-white/15'
              )}
            >
              {state === 'done' ? <CheckCircle2 className="w-3 h-3" /> : step.id}
            </span>
            <span className="hidden sm:inline">{step.label}</span>
          </span>
          {i < STEPS.length - 1 && <span className="w-4 sm:w-6 h-px bg-slate-300 dark:bg-white/15" aria-hidden />}
        </li>
      );
    })}
  </ol>
);

const AddBulkData = () => {
  const [step, setStep] = useState<Step>(1);

  const [importFile, setImportFile] = useState<File | null>(null);
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState('');
  const [previewRows, setPreviewRows] = useState<PreviewRow[]>([]);

  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState('');
  const [importResult, setImportResult] = useState<ImportResult | null>(null);

  const downloadImportTemplate = async () => {
    const XLSX = await import('xlsx');
    const example = [
      'STU-2026-001', 'Ayesha', 'Rahman', 'Class 1', 'A',
      '1', 'FEMALE', '2015-04-12', '+8801700000000', 'ayesha.rahman@example.com', 'B+',
    ];
    const ws = XLSX.utils.aoa_to_sheet([[...IMPORT_COLUMNS], example]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Students');
    XLSX.writeFile(wb, 'student_import_template.xlsx');
  };

  const handleImportFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    setParseError('');
    setPreviewRows([]);
    if (!file) {
      setImportFile(null);
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setImportFile(null);
      setParseError('File is larger than 5 MB. Split it into smaller batches.');
      e.target.value = '';
      return;
    }
    setImportFile(file);

    setParsing(true);
    try {
      const rows = await parseBulkImportFile(file);
      if (rows.length === 0) {
        setParseError('No data rows were found in this file. Check it matches the template layout.');
      } else {
        setPreviewRows(rows);
        setStep(3);
      }
    } catch (err) {
      console.error('Failed to parse import file', err);
      setParseError('Could not read this file. Make sure it is a valid .xlsx, .xls or .csv file.');
    } finally {
      setParsing(false);
    }
  };

  const handleRunImport = async () => {
    if (!importFile) return;
    setImporting(true);
    setImportError('');
    setImportResult(null);
    try {
      const formData = new FormData();
      formData.append('file', importFile);
      const res = await apiClient.post('/students/bulk-import', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const result = res.data.data as ImportResult;
      setImportResult(result);
      setStep(4);
      if (result.successCount > 0) {
        toast.success(`${result.successCount} student${result.successCount === 1 ? '' : 's'} imported`);
      }
      if (result.errorCount > 0 && result.successCount === 0) {
        toast.error('No rows imported — every row failed validation');
      }
    } catch (error: any) {
      // 403 already surfaces its own toast via the axios interceptor; 413 and
      // network failures do not, so show an inline message here.
      const status = error.response?.status;
      if (status === 413) {
        setImportError('File is too large for the server to accept. Split it into smaller batches.');
      } else if (!error.response) {
        setImportError('Could not reach the server. Check your connection and try again.');
      } else {
        setImportError(error.response?.data?.message || 'Import failed. Check the file format and try again.');
      }
      setStep(4);
    } finally {
      setImporting(false);
    }
  };

  const handleStartOver = () => {
    setStep(1);
    setImportFile(null);
    setPreviewRows([]);
    setParseError('');
    setImportError('');
    setImportResult(null);
  };

  const rowsWithIssues = previewRows.filter((r) => r.issues.length > 0);
  const PREVIEW_LIMIT = 50;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Add Bulk Data"
        description="Upload an Excel (.xlsx) or CSV file. Each row becomes one student. Rows that fail validation are reported back individually — the valid rows still import."
      />

      <div className="glass-card p-5 sm:p-6 rounded-2xl space-y-6">
        <StepIndicator current={step} />

        {/* Step 1 — template */}
        {step === 1 && (
          <div className="space-y-4">
            <div className="rounded-xl border border-slate-200/70 dark:border-white/10 p-4">
              <p className="text-sm font-medium text-slate-800 dark:text-slate-200">Download the template</p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Columns: {IMPORT_COLUMNS.join(', ')}. <span className="font-medium">studentId, firstName, lastName</span> are required.
              </p>
              <Button type="button" variant="secondary" onClick={downloadImportTemplate} className="mt-3">
                <Download className="w-4 h-4" />
                Download Template
              </Button>
            </div>
            <div className="flex justify-end">
              <Button type="button" variant="primary" onClick={() => setStep(2)} rightIcon={<ArrowRight className="w-4 h-4" />}>
                Continue
              </Button>
            </div>
          </div>
        )}

        {/* Step 2 — file */}
        {step === 2 && (
          <div className="space-y-4">
            <div className="rounded-xl border border-slate-200/70 dark:border-white/10 p-4">
              <p className="text-sm font-medium text-slate-800 dark:text-slate-200 mb-2">Choose your file</p>
              <label className="flex flex-wrap items-center gap-3 cursor-pointer">
                <span className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold bg-primary-600/10 text-primary-600 dark:text-primary-400 hover:bg-primary-600/20 transition-colors">
                  <FileSpreadsheet className="w-4 h-4" />
                  Browse…
                </span>
                <span className="text-sm text-slate-600 dark:text-slate-400 truncate">
                  {parsing ? 'Reading file…' : importFile ? importFile.name : 'No file selected'}
                </span>
                <input
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  onChange={handleImportFileChange}
                  className="hidden"
                />
              </label>
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-2">Max 5 MB per file.</p>
            </div>

            {parseError && (
              <div className="flex items-start gap-2 rounded-xl border border-red-300/60 dark:border-red-500/30 bg-red-50 dark:bg-red-500/10 p-3 text-sm text-red-700 dark:text-red-300">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                <span>{parseError}</span>
              </div>
            )}

            <div className="flex justify-between">
              <Button type="button" variant="ghost" onClick={() => setStep(1)} leftIcon={<ArrowLeft className="w-4 h-4" />}>
                Back
              </Button>
            </div>
          </div>
        )}

        {/* Step 3 — preview & validate */}
        {step === 3 && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <Badge variant="neutral">{previewRows.length} row{previewRows.length === 1 ? '' : 's'} parsed</Badge>
              {rowsWithIssues.length > 0 ? (
                <Badge variant="warning">{rowsWithIssues.length} row{rowsWithIssues.length === 1 ? '' : 's'} with warnings</Badge>
              ) : (
                <Badge variant="success">No client-side warnings</Badge>
              )}
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              These are quick client-side checks — the server still re-validates every row (e.g. duplicate student IDs, unknown classes) when you run the import.
            </p>

            <div className="rounded-xl border border-slate-200/70 dark:border-white/10 overflow-hidden">
              <div className="max-h-80 overflow-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 dark:bg-white/5 sticky top-0">
                    <tr>
                      <th className="text-left font-semibold text-slate-500 dark:text-slate-400 px-3 py-2 w-12">#</th>
                      <th className="text-left font-semibold text-slate-500 dark:text-slate-400 px-3 py-2">Student ID</th>
                      <th className="text-left font-semibold text-slate-500 dark:text-slate-400 px-3 py-2">Name</th>
                      <th className="text-left font-semibold text-slate-500 dark:text-slate-400 px-3 py-2 hidden sm:table-cell">Class / Section</th>
                      <th className="text-left font-semibold text-slate-500 dark:text-slate-400 px-3 py-2 hidden md:table-cell">Gender</th>
                      <th className="text-left font-semibold text-slate-500 dark:text-slate-400 px-3 py-2">Issues</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewRows.slice(0, PREVIEW_LIMIT).map((row) => (
                      <tr key={row.rowNumber} className={cn('border-t border-slate-200/60 dark:border-white/5 align-top', row.issues.length > 0 && 'bg-red-50/60 dark:bg-red-500/5')}>
                        <td className="px-3 py-2 font-medium text-slate-700 dark:text-slate-300">{row.rowNumber}</td>
                        <td className="px-3 py-2 text-slate-800 dark:text-slate-200">{row.studentId || '—'}</td>
                        <td className="px-3 py-2 text-slate-800 dark:text-slate-200">{[row.firstName, row.lastName].filter(Boolean).join(' ') || '—'}</td>
                        <td className="px-3 py-2 text-slate-600 dark:text-slate-400 hidden sm:table-cell">
                          {row.className || '—'}{row.sectionName ? ` / ${row.sectionName}` : ''}
                        </td>
                        <td className="px-3 py-2 text-slate-600 dark:text-slate-400 hidden md:table-cell">{row.gender || '—'}</td>
                        <td className="px-3 py-2">
                          {row.issues.length > 0 ? (
                            <span className="text-red-600 dark:text-red-400">{row.issues.join('; ')}</span>
                          ) : (
                            <span className="text-emerald-600 dark:text-emerald-400 inline-flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> Looks good</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {previewRows.length > PREVIEW_LIMIT && (
                <p className="text-xs text-slate-500 dark:text-slate-400 px-3 py-2 border-t border-slate-200/60 dark:border-white/5">
                  Showing the first {PREVIEW_LIMIT} of {previewRows.length} rows. All rows will still be imported.
                </p>
              )}
            </div>

            {importError && (
              <div className="flex items-start gap-2 rounded-xl border border-red-300/60 dark:border-red-500/30 bg-red-50 dark:bg-red-500/10 p-3 text-sm text-red-700 dark:text-red-300">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                <span>{importError}</span>
              </div>
            )}

            <div className="flex justify-between">
              <Button type="button" variant="ghost" onClick={() => setStep(2)} leftIcon={<ArrowLeft className="w-4 h-4" />}>
                Back
              </Button>
              <Button type="button" variant="primary" onClick={handleRunImport} isLoading={importing} disabled={importing}>
                {importing ? 'Importing…' : 'Run Import'}
              </Button>
            </div>
          </div>
        )}

        {/* Step 4 — result */}
        {step === 4 && (
          <div className="space-y-4">
            {importResult && (
              <>
                <div className="flex flex-wrap gap-3">
                  <span className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-500/10 px-3 py-1.5 text-sm font-medium text-emerald-700 dark:text-emerald-400">
                    <CheckCircle2 className="w-4 h-4" />
                    {importResult.successCount} imported
                  </span>
                  {importResult.errorCount > 0 && (
                    <span className="inline-flex items-center gap-1.5 rounded-lg bg-red-50 dark:bg-red-500/10 px-3 py-1.5 text-sm font-medium text-red-700 dark:text-red-400">
                      <AlertCircle className="w-4 h-4" />
                      {importResult.errorCount} failed
                    </span>
                  )}
                </div>

                {importResult.errors.length > 0 && (
                  <div className="rounded-xl border border-slate-200/70 dark:border-white/10 overflow-hidden">
                    <div className="max-h-64 overflow-y-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-slate-50 dark:bg-white/5 sticky top-0">
                          <tr>
                            <th className="text-left font-semibold text-slate-500 dark:text-slate-400 px-3 py-2 w-16">Row</th>
                            <th className="text-left font-semibold text-slate-500 dark:text-slate-400 px-3 py-2">Issues</th>
                          </tr>
                        </thead>
                        <tbody>
                          {importResult.errors.map((err) => (
                            <tr key={err.row} className="border-t border-slate-200/60 dark:border-white/5 align-top">
                              <td className="px-3 py-2 font-medium text-slate-700 dark:text-slate-300">{err.row}</td>
                              <td className="px-3 py-2 text-red-600 dark:text-red-400">{err.issues.join('; ')}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </>
            )}

            {importError && !importResult && (
              <div className="flex items-start gap-2 rounded-xl border border-red-300/60 dark:border-red-500/30 bg-red-50 dark:bg-red-500/10 p-3 text-sm text-red-700 dark:text-red-300">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                <span>{importError}</span>
              </div>
            )}

            <div className="flex justify-end">
              <Button type="button" variant="secondary" onClick={handleStartOver} leftIcon={<RotateCcw className="w-4 h-4" />}>
                Import Another File
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AddBulkData;
