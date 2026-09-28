import React, { useState, useEffect, useMemo } from 'react';
import { Layers, Plus, Trash2, Pencil } from 'lucide-react';
import apiClient from '../../api/client';
import toast from 'react-hot-toast';
import { Button } from '../../components/ui/Button';
import { ConfirmModal } from '../../components/common/ConfirmModal';

interface ClassFee {
  id: string;
  amount: string;
  class: { id: string; name: string };
  feeCategory: { id: string; name: string; frequency: string };
}

interface FeeRow {
  key: number;
  feeCategoryId: string;
  amount: string;
}

let keySeq = 0;
const emptyRow = (): FeeRow => ({ key: keySeq++, feeCategoryId: '', amount: '' });
const money = (v: number) => v.toLocaleString('en-BD', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const AssignFeesClasses = () => {
  const [classes, setClasses] = useState<{ id: string; name: string }[]>([]);
  const [categories, setCategories] = useState<{ id: string; name: string; amount: string; isActive?: boolean }[]>([]);
  const [assignments, setAssignments] = useState<ClassFee[]>([]);
  const [loading, setLoading] = useState(true);

  const [classId, setClassId] = useState('');
  const [rows, setRows] = useState<FeeRow[]>([emptyRow()]);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ classId: string; className: string; ids: string[] } | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchAssignments = async () => {
    setLoading(true);
    try {
      const res = await apiClient.get('/fee-setup/class-fees');
      setAssignments(res.data.data || []);
    } catch (error) {
      console.error('Failed to fetch class fees', error);
      toast.error('Failed to load class fees');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    apiClient.get('/students/meta/classes').then((res) => setClasses(res.data.data || [])).catch((e) => console.error(e));
    apiClient.get('/fees/categories').then((res) => setCategories(res.data.data || [])).catch((e) => console.error(e));
    fetchAssignments();
  }, []);

  const grouped = useMemo(() => {
    const map = new Map<string, { classId: string; className: string; fees: ClassFee[]; total: number }>();
    for (const a of assignments) {
      const g = map.get(a.class.id) ?? { classId: a.class.id, className: a.class.name, fees: [], total: 0 };
      g.fees.push(a);
      g.total += Number(a.amount);
      map.set(a.class.id, g);
    }
    return Array.from(map.values());
  }, [assignments]);

  const loadClassIntoForm = (id: string) => {
    setClassId(id);
    const existing = assignments.filter((a) => a.class.id === id);
    setRows(existing.length > 0
      ? existing.map((a) => ({ key: keySeq++, feeCategoryId: a.feeCategory.id, amount: String(Number(a.amount)) }))
      : [emptyRow()]);
  };

  const updateRow = (key: number, patch: Partial<FeeRow>) =>
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const handleCategoryChange = (key: number, feeCategoryId: string) => {
    const cat = categories.find((c) => c.id === feeCategoryId);
    updateRow(key, { feeCategoryId, ...(cat ? { amount: String(Number(cat.amount)) } : {}) });
  };

  const resetForm = () => {
    setClassId('');
    setRows([emptyRow()]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!classId) { toast.error('Please select a class'); return; }
    const filled = rows.filter((r) => r.feeCategoryId || r.amount);
    if (filled.length === 0) { toast.error('Add at least one fee type'); return; }
    if (filled.some((r) => !r.feeCategoryId || !(Number(r.amount) > 0))) {
      toast.error('Every row needs a fee type and an amount greater than 0');
      return;
    }
    if (new Set(filled.map((r) => r.feeCategoryId)).size !== filled.length) {
      toast.error('Each fee type can only be added once');
      return;
    }
    setSaving(true);
    try {
      await apiClient.put('/fee-setup/class-fees', {
        classId,
        items: filled.map((r) => ({ feeCategoryId: r.feeCategoryId, amount: Number(r.amount) })),
      });
      toast.success('Class fees saved successfully');
      resetForm();
      fetchAssignments();
    } catch (error: any) {
      console.error('Failed to save class fees', error);
      toast.error(error.response?.data?.message || 'Failed to save class fees');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await Promise.all(deleteTarget.ids.map((id) => apiClient.delete(`/fee-setup/class-fees/${id}`)));
      toast.success('Class fees removed');
      if (classId === deleteTarget.classId) resetForm();
      setDeleteTarget(null);
      fetchAssignments();
    } catch (error: any) {
      console.error('Failed to remove class fees', error);
      toast.error(error.response?.data?.message || 'Failed to remove class fees');
    } finally {
      setDeleting(false);
    }
  };

  const formTotal = rows.reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
  const activeCategories = categories.filter((c) => c.isActive !== false);

  return (
    <div className="space-y-6">
      <div className="glass-card p-6 rounded-2xl flex items-center gap-4">
        <div className="w-11 h-11 rounded-xl bg-primary-50 dark:bg-primary-500/10 text-primary-600 dark:text-primary-400 flex items-center justify-center flex-shrink-0">
          <Layers className="w-5 h-5" />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">Assign Fees Classes</h2>
          <p className="text-slate-600 dark:text-slate-400 mt-1 text-sm">Set which fee types each class pays, and how much.</p>
        </div>
      </div>

      <div className="glass-card p-6 rounded-2xl">
        <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Assign Fees</h3>
        {activeCategories.length === 0 && (
          <p className="text-sm text-amber-700 dark:text-amber-400 mb-4">Create a fee type under Fees Type first.</p>
        )}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="max-w-sm">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Class <span className="text-rose-500">*</span></label>
            <select value={classId} onChange={(e) => loadClassIntoForm(e.target.value)} className="input-field">
              <option value="">Select Class</option>
              {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>

          <div className="space-y-2">
            {rows.map((row) => (
              <div key={row.key} className="grid grid-cols-[1fr_180px_auto] gap-3 items-center">
                <select value={row.feeCategoryId} onChange={(e) => handleCategoryChange(row.key, e.target.value)} className="input-field">
                  <option value="">Select Fee Type</option>
                  {activeCategories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <input type="number" min="0" step="0.01" value={row.amount} placeholder="Amount"
                  onChange={(e) => updateRow(row.key, { amount: e.target.value })} className="input-field" />
                <button type="button" title="Remove" onClick={() => setRows((prev) => (prev.length > 1 ? prev.filter((r) => r.key !== row.key) : [emptyRow()]))}
                  className="p-2 rounded-lg text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <button type="button" onClick={() => setRows((prev) => [...prev, emptyRow()])}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-dashed border-slate-300 dark:border-white/20 text-sm font-medium text-slate-600 dark:text-slate-300 hover:border-primary-400 hover:text-primary-600">
              <Plus className="w-4 h-4" /> Add Fee Type
            </button>
            <span className="text-sm text-slate-600 dark:text-slate-400">Total: <span className="font-semibold text-slate-900 dark:text-white">{money(formTotal)}</span></span>
          </div>

          <div className="flex gap-3">
            <Button type="submit" variant="gradient" isLoading={saving}>{saving ? 'Saving…' : 'Submit'}</Button>
            {classId && <Button type="button" variant="ghost" onClick={resetForm}>Cancel</Button>}
          </div>
        </form>
      </div>

      <div className="glass-card p-6 rounded-2xl">
        <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">List Fees Classes</h3>
        {loading ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">Loading…</p>
        ) : grouped.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">No fees assigned to any class yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase bg-slate-50 dark:bg-white/5">
                  <th className="px-3 py-2.5">No.</th>
                  <th className="px-3 py-2.5">Class</th>
                  <th className="px-3 py-2.5">Fees</th>
                  <th className="px-3 py-2.5">Total</th>
                  <th className="px-3 py-2.5">Action</th>
                </tr>
              </thead>
              <tbody>
                {grouped.map((g, i) => (
                  <tr key={g.classId} className="border-t border-slate-100 dark:border-white/5 align-top">
                    <td className="px-3 py-3 text-slate-500 dark:text-slate-400">{i + 1}</td>
                    <td className="px-3 py-3 font-medium text-slate-900 dark:text-white">{g.className}</td>
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap gap-1.5">
                        {g.fees.map((f) => (
                          <span key={f.id} className="px-2 py-0.5 rounded-full text-xs bg-primary-50 dark:bg-primary-500/10 text-primary-700 dark:text-primary-400">
                            {f.feeCategory.name}: {money(Number(f.amount))}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-3 py-3 font-semibold text-slate-900 dark:text-white">{money(g.total)}</td>
                    <td className="px-3 py-3">
                      <div className="flex gap-1">
                        <button type="button" title="Edit" onClick={() => { loadClassIntoForm(g.classId); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                          className="p-2 rounded-lg bg-slate-100 dark:bg-white/5 text-primary-600 hover:bg-primary-50">
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button type="button" title="Remove" onClick={() => setDeleteTarget({ classId: g.classId, className: g.className, ids: g.fees.map((f) => f.id) })}
                          className="p-2 rounded-lg bg-rose-50 dark:bg-rose-500/10 text-rose-600 hover:bg-rose-100">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ConfirmModal
        isOpen={!!deleteTarget}
        title="Remove class fees?"
        message={`All fee types assigned to ${deleteTarget?.className} will be removed. Existing invoices are not affected.`}
        confirmLabel="Remove"
        variant="danger"
        isLoading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
};

export default AssignFeesClasses;
