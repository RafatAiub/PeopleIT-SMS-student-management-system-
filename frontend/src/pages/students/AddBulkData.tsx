import React, { useState } from 'react';
import { Upload, Download, FileSpreadsheet, CheckCircle2, AlertCircle } from 'lucide-react';
import * as XLSX from 'xlsx';
import apiClient from '../../api/client';
import toast from 'react-hot-toast';
import { Button } from '../../components/ui/Button';

// Column names must match BulkImportRowDto in backend/src/modules/students/student.dto.ts.
// className / sectionName are human-readable strings resolved to IDs server-side.
const IMPORT_COLUMNS = [
  'studentId', 'firstName', 'lastName', 'className', 'sectionName',
  'rollNumber', 'gender', 'dateOfBirth', 'phone', 'email', 'bloodGroup',
];

const AddBulkData = () => {
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string>('');
  const [importResult, setImportResult] = useState<
    { successCount: number; errorCount: number; errors: { row: number; issues: string[] }[] } | null
  >(null);

  const downloadImportTemplate = () => {
    const example = [
      'STU-2026-001', 'Ayesha', 'Rahman', 'Class 1', 'A',
      '1', 'FEMALE', '2015-04-12', '+8801700000000', 'ayesha.rahman@example.com', 'B+',
    ];
    const ws = XLSX.utils.aoa_to_sheet([IMPORT_COLUMNS, example]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Students');
    XLSX.writeFile(wb, 'student_import_template.xlsx');
  };

  const handleImportFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    setImportError('');
    setImportResult(null);
    if (file && file.size > 5 * 1024 * 1024) {
      setImportFile(null);
      setImportError('File is larger than 5 MB. Split it into smaller batches.');
      e.target.value = '';
      return;
    }
    setImportFile(file);
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
      const result = res.data.data as {
        successCount: number;
        errorCount: number;
        errors: { row: number; issues: string[] }[];
      };
      setImportResult(result);
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
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="glass-card p-6 rounded-2xl flex items-center gap-4">
        <div className="w-11 h-11 rounded-xl bg-primary-50 dark:bg-primary-500/10 text-primary-600 dark:text-primary-400 flex items-center justify-center flex-shrink-0">
          <Upload className="w-5 h-5" />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">Add Bulk Data</h2>
          <p className="text-slate-600 dark:text-slate-400 mt-1 text-sm">
            Upload an Excel (.xlsx) or CSV file. Each row becomes one student. Rows that fail
            validation are reported back individually — the valid rows still import.
          </p>
        </div>
      </div>

      <div className="glass-card p-6 rounded-2xl max-w-2xl space-y-4">
        {/* Step 1 — template */}
        <div className="rounded-xl border border-slate-200/70 dark:border-white/10 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-slate-800 dark:text-slate-200">1. Download the template</p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Columns: {IMPORT_COLUMNS.join(', ')}. <span className="font-medium">studentId, firstName, lastName</span> are required.
              </p>
            </div>
            <Button type="button" variant="ghost" onClick={downloadImportTemplate} className="shrink-0 text-sm">
              <Download className="w-4 h-4" />
              Template
            </Button>
          </div>
        </div>

        {/* Step 2 — file */}
        <div className="rounded-xl border border-slate-200/70 dark:border-white/10 p-4">
          <p className="text-sm font-medium text-slate-800 dark:text-slate-200 mb-2">2. Choose your file</p>
          <label className="flex items-center gap-3 cursor-pointer">
            <span className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold bg-primary-600/10 text-primary-600 dark:text-primary-400 hover:bg-primary-600/20 transition-colors">
              <FileSpreadsheet className="w-4 h-4" />
              Browse…
            </span>
            <span className="text-sm text-slate-600 dark:text-slate-400 truncate">
              {importFile ? importFile.name : 'No file selected'}
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

        {importError && (
          <div className="flex items-start gap-2 rounded-xl border border-rose-300/60 dark:border-rose-500/30 bg-rose-50 dark:bg-rose-500/10 p-3 text-sm text-rose-700 dark:text-rose-300">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{importError}</span>
          </div>
        )}

        {/* Step 3 — result */}
        {importResult && (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-3">
              <span className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-500/10 px-3 py-1.5 text-sm font-medium text-emerald-700 dark:text-emerald-400">
                <CheckCircle2 className="w-4 h-4" />
                {importResult.successCount} imported
              </span>
              {importResult.errorCount > 0 && (
                <span className="inline-flex items-center gap-1.5 rounded-lg bg-rose-50 dark:bg-rose-500/10 px-3 py-1.5 text-sm font-medium text-rose-700 dark:text-rose-400">
                  <AlertCircle className="w-4 h-4" />
                  {importResult.errorCount} failed
                </span>
              )}
            </div>

            {importResult.errors.length > 0 && (
              <div className="rounded-xl border border-slate-200/70 dark:border-white/10 overflow-hidden">
                <div className="max-h-56 overflow-y-auto">
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
                          <td className="px-3 py-2 text-rose-600 dark:text-rose-400">{err.issues.join('; ')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        <div className="pt-2 flex justify-end gap-3">
          <Button
            type="button"
            variant="gradient"
            onClick={handleRunImport}
            isLoading={importing}
            disabled={!importFile || importing}
          >
            {importing ? 'Importing…' : 'Run Import'}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default AddBulkData;
