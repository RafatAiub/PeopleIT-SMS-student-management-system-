import React, { useEffect, useState } from 'react';
import { Info, Plus, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { Button } from '../../components/ui/Button';
import { LoadingSpinner } from '../../components/common/LoadingSpinner';
import { gradesApi } from '../../api/exams.api';

interface GradeRow {
  key: number;
  minPercent: string;
  maxPercent: string;
  grade: string;
}

let rowKey = 0;
const makeRow = (minPercent = '', maxPercent = '', grade = ''): GradeRow => ({ key: ++rowKey, minPercent, maxPercent, grade });

// Mirrors the backend's built-in scale (utils/grading.ts DEFAULT_GRADE_BANDS),
// shown as a starting point until the institution saves its own.
const builtInScale = () => [
  makeRow('0', '32', 'F'),
  makeRow('33', '39', 'D'),
  makeRow('40', '49', 'C'),
  makeRow('50', '59', 'B'),
  makeRow('60', '69', 'A-'),
  makeRow('70', '79', 'A'),
  makeRow('80', '100', 'A+'),
];

/** Exam > Exam Grade — eSchool "Manage Grade": editable percentage bands. */
const ExamGrade = () => {
  const [rows, setRows] = useState<GradeRow[]>([]);
  const [usingBuiltIn, setUsingBuiltIn] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    gradesApi
      .list()
      .then((grades) => {
        if (grades.length === 0) {
          setRows(builtInScale());
          setUsingBuiltIn(true);
        } else {
          setRows(grades.map((g) => makeRow(String(Number(g.minPercent)), String(Number(g.maxPercent)), g.grade)));
        }
      })
      .catch((err) => toast.error(err.response?.data?.message || 'Failed to load grades'))
      .finally(() => setLoading(false));
  }, []);

  const updateRow = (key: number, patch: Partial<GradeRow>) =>
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const validate = (): string | null => {
    if (rows.length === 0) return 'Add at least one grade';
    const parsed = rows.map((r, i) => ({ n: i + 1, min: Number(r.minPercent), max: Number(r.maxPercent), grade: r.grade.trim(), r }));
    for (const p of parsed) {
      if (p.r.minPercent === '' || p.r.maxPercent === '' || !p.grade) return `Row ${p.n}: all fields are required`;
      if (p.min < 0 || p.max > 100) return `Row ${p.n}: ranges must be between 0 and 100`;
      if (p.max < p.min) return `Row ${p.n}: ending range must be at least the starting range`;
    }
    const grades = parsed.map((p) => p.grade.toUpperCase());
    const dup = grades.find((g, i) => grades.indexOf(g) !== i);
    if (dup) return `Grade "${dup}" is listed more than once`;
    const sorted = [...parsed].sort((a, b) => a.min - b.min);
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i].min <= sorted[i - 1].max) return `Rows ${sorted[i - 1].n} and ${sorted[i].n} have overlapping ranges`;
    }
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const error = validate();
    if (error) return toast.error(error);
    setSaving(true);
    try {
      await gradesApi.save(
        rows.map((r) => ({ minPercent: Number(r.minPercent), maxPercent: Number(r.maxPercent), grade: r.grade.trim() })),
      );
      setUsingBuiltIn(false);
      toast.success('Grades saved successfully');
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to save grades');
    } finally {
      setSaving(false);
    }
  };

  const labelClass = 'text-sm font-medium text-slate-700 dark:text-slate-400';

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">Manage Grade</h2>

      <div className="glass-card p-6 rounded-2xl space-y-5">
        <h3 className="text-lg font-bold text-slate-900 dark:text-white">Create Grade</h3>

        {usingBuiltIn && !loading && (
          <p className="flex items-center gap-1.5 text-xs text-primary-600 dark:text-primary-400">
            <Info className="w-3.5 h-3.5" />
            No custom grades saved yet — this is the default scale currently in use. Edit and submit to replace it.
          </p>
        )}

        {loading ? (
          <div className="py-10 flex justify-center">
            <LoadingSpinner />
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-4">
              {rows.map((row) => (
                <div key={row.key} className="grid grid-cols-1 md:grid-cols-[1fr_1fr_1fr_auto] gap-4 md:items-end">
                  <div className="space-y-1.5">
                    <label htmlFor={`grade-min-${row.key}`} className={labelClass}>Starting Range</label>
                    <input
                      id={`grade-min-${row.key}`}
                      type="number"
                      min={0}
                      max={100}
                      step="0.01"
                      value={row.minPercent}
                      onChange={(e) => updateRow(row.key, { minPercent: e.target.value })}
                      className="input-field"
                      placeholder="Starting Range"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor={`grade-max-${row.key}`} className={labelClass}>Ending Range</label>
                    <input
                      id={`grade-max-${row.key}`}
                      type="number"
                      min={0}
                      max={100}
                      step="0.01"
                      value={row.maxPercent}
                      onChange={(e) => updateRow(row.key, { maxPercent: e.target.value })}
                      className="input-field"
                      placeholder="Ending Range"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor={`grade-name-${row.key}`} className={labelClass}>Grade</label>
                    <input
                      id={`grade-name-${row.key}`}
                      type="text"
                      maxLength={10}
                      value={row.grade}
                      onChange={(e) => updateRow(row.key, { grade: e.target.value })}
                      className="input-field"
                      placeholder="Grade"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => setRows((prev) => prev.filter((r) => r.key !== row.key))}
                    title="Remove grade"
                    aria-label="Remove grade"
                    className="justify-self-start p-2.5 rounded-lg bg-red-50 dark:bg-red-500/10 text-red-500 hover:bg-red-100 dark:hover:bg-red-500/20 transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>

            <div className="space-y-4">
              <button
                type="button"
                onClick={() => setRows((prev) => [...prev, makeRow()])}
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold px-4 py-2 transition-colors"
              >
                <Plus className="w-4 h-4" />
                Add New Data
              </button>
              <div>
                <Button type="submit" variant="primary" isLoading={saving} className="px-8">
                  Submit
                </Button>
              </div>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

export default ExamGrade;
