import React, { useEffect, useMemo, useState } from 'react';
import { GraduationCap, Plus, Save } from 'lucide-react';
import toast from 'react-hot-toast';
import apiClient from '../../api/client';
import { DataTable, Column, RowAction } from '../../components/DataTable/DataTable';
import { ConfirmModal } from '../../components/common/ConfirmModal';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';

interface LookupRef {
  id: string;
  name: string;
}

interface ClassRow {
  id: string;
  name: string;
  level: number;
  mediumId?: string | null;
  streamId?: string | null;
  shiftId?: string | null;
  semesterId?: string | null;
  // Defensive: /students/meta/classes currently returns raw Class scalar
  // fields only (no nested relations) — these are here in case a future
  // response does include them, with the id->name maps below as the
  // fallback for today's shape.
  medium?: { name: string } | null;
  stream?: { name: string } | null;
  shift?: { name: string } | null;
  semester?: { name: string } | null;
  _count?: { sections?: number };
}

const emptyForm = { name: '', level: '', mediumId: '', streamId: '', shiftId: '', semesterId: '' };

// Fetches a lookup list defensively — a 404 (endpoint not deployed yet) or
// any other failure just yields an empty list instead of blocking the page.
const fetchLookupList = async (path: string): Promise<LookupRef[]> => {
  try {
    const res = await apiClient.get(path);
    return res.data?.data || [];
  } catch (err) {
    console.warn(`Failed to load ${path}`, err);
    return [];
  }
};

const Classes = () => {
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [mediums, setMediums] = useState<LookupRef[]>([]);
  const [streams, setStreams] = useState<LookupRef[]>([]);
  const [shifts, setShifts] = useState<LookupRef[]>([]);
  const [semesters, setSemesters] = useState<LookupRef[]>([]);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const [classToDelete, setClassToDelete] = useState<ClassRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchClasses = async () => {
    setLoading(true);
    try {
      const res = await apiClient.get('/students/meta/classes');
      setClasses(res.data?.data || []);
    } catch (err) {
      console.error('Failed to fetch classes', err);
      toast.error('Failed to load classes');
    } finally {
      setLoading(false);
    }
  };

  const fetchLookups = async () => {
    const [m, s, sh, sem] = await Promise.all([
      fetchLookupList('/academics/mediums'),
      fetchLookupList('/academics/streams'),
      fetchLookupList('/academics/shifts'),
      fetchLookupList('/academics/semesters'),
    ]);
    setMediums(m);
    setStreams(s);
    setShifts(sh);
    setSemesters(sem);
  };

  useEffect(() => {
    fetchClasses();
    fetchLookups();
  }, []);

  const mediumMap = useMemo(() => Object.fromEntries(mediums.map((m) => [m.id, m.name])), [mediums]);
  const streamMap = useMemo(() => Object.fromEntries(streams.map((s) => [s.id, s.name])), [streams]);
  const shiftMap = useMemo(() => Object.fromEntries(shifts.map((s) => [s.id, s.name])), [shifts]);
  const semesterMap = useMemo(() => Object.fromEntries(semesters.map((s) => [s.id, s.name])), [semesters]);

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setModalOpen(true);
  };

  const openEdit = (row: ClassRow) => {
    setEditingId(row.id);
    setForm({
      name: row.name,
      level: String(row.level ?? ''),
      mediumId: row.mediumId || '',
      streamId: row.streamId || '',
      shiftId: row.shiftId || '',
      semesterId: row.semesterId || '',
    });
    setModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      toast.error('Name is required');
      return;
    }
    const levelNum = Number(form.level);
    if (!Number.isInteger(levelNum) || levelNum < 1) {
      toast.error('Level must be a whole number of at least 1');
      return;
    }

    const payload: Record<string, any> = { name: form.name.trim(), level: levelNum };
    if (form.mediumId) payload.mediumId = form.mediumId;
    if (form.streamId) payload.streamId = form.streamId;
    if (form.shiftId) payload.shiftId = form.shiftId;
    if (form.semesterId) payload.semesterId = form.semesterId;

    setSaving(true);
    try {
      if (editingId) {
        await apiClient.put(`/academics/classes/${editingId}`, payload);
        toast.success('Class updated successfully');
      } else {
        await apiClient.post('/academics/classes', payload);
        toast.success('Class created successfully');
      }
      setModalOpen(false);
      fetchClasses();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to save class');
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!classToDelete) return;
    setDeleting(true);
    try {
      await apiClient.delete(`/academics/classes/${classToDelete.id}`);
      toast.success('Class deleted successfully');
      setClassToDelete(null);
      fetchClasses();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Cannot delete this class.');
    } finally {
      setDeleting(false);
    }
  };

  const columns: Column<ClassRow>[] = [
    { key: 'name', header: 'Name', accessor: 'name' },
    { key: 'level', header: 'Level', accessor: 'level' },
    { key: 'medium', header: 'Medium', sortable: false, render: (row) => row.medium?.name || mediumMap[row.mediumId || ''] || '—' },
    { key: 'stream', header: 'Stream', sortable: false, render: (row) => row.stream?.name || streamMap[row.streamId || ''] || '—' },
    { key: 'shift', header: 'Shift', sortable: false, render: (row) => row.shift?.name || shiftMap[row.shiftId || ''] || '—' },
    { key: 'semester', header: 'Semester', sortable: false, render: (row) => row.semester?.name || semesterMap[row.semesterId || ''] || '—' },
    { key: 'sections', header: 'Sections', sortable: false, render: (row) => row._count?.sections ?? '—' },
  ];

  const actions: RowAction<ClassRow>[] = [
    { label: 'Edit', icon: 'edit', onClick: openEdit },
    { label: 'Delete', icon: 'delete', variant: 'danger', onClick: (row) => setClassToDelete(row) },
  ];

  const selectClass = 'input-field cursor-pointer';

  return (
    <div className="space-y-6">
      <div className="glass-card p-6 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-11 h-11 rounded-xl bg-primary-50 dark:bg-primary-500/10 text-primary-600 dark:text-primary-400 flex items-center justify-center flex-shrink-0">
            <GraduationCap className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">Manage Class</h2>
            <p className="text-slate-600 dark:text-slate-400 mt-1 text-sm">
              Create classes and tag them with a medium, stream, shift, or semester.
            </p>
          </div>
        </div>
        <Button variant="gradient" onClick={openCreate} className="flex-shrink-0">
          <Plus className="w-4 h-4" />
          Add Class
        </Button>
      </div>

      <div className="glass-card p-6 rounded-2xl">
        <DataTable
          data={classes}
          columns={columns}
          actions={actions}
          isLoading={loading}
          searchPlaceholder="Search classes..."
          emptyTitle="No classes found"
          emptyDescription="Create your first class to get started."
        />
      </div>

      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} className="max-w-lg space-y-4">
        <h3 className="text-lg font-bold text-slate-900 dark:text-white">
          {editingId ? 'Edit Class' : 'Add Class'}
        </h3>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label htmlFor="class-name" className="text-sm font-medium text-slate-700 dark:text-slate-400">
                Name<span className="text-red-500 ml-1">*</span>
              </label>
              <input
                id="class-name"
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="input-field"
                placeholder="e.g. Class 6"
                required
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="class-level" className="text-sm font-medium text-slate-700 dark:text-slate-400">
                Level<span className="text-red-500 ml-1">*</span>
              </label>
              <input
                id="class-level"
                type="number"
                min={1}
                value={form.level}
                onChange={(e) => setForm({ ...form, level: e.target.value })}
                className="input-field"
                placeholder="e.g. 6"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label htmlFor="class-medium" className="text-sm font-medium text-slate-700 dark:text-slate-400">Medium</label>
              <select
                id="class-medium"
                value={form.mediumId}
                onChange={(e) => setForm({ ...form, mediumId: e.target.value })}
                className={selectClass}
              >
                <option value="">None</option>
                {mediums.map((m) => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="class-stream" className="text-sm font-medium text-slate-700 dark:text-slate-400">Stream</label>
              <select
                id="class-stream"
                value={form.streamId}
                onChange={(e) => setForm({ ...form, streamId: e.target.value })}
                className={selectClass}
              >
                <option value="">None</option>
                {streams.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="class-shift" className="text-sm font-medium text-slate-700 dark:text-slate-400">Shift</label>
              <select
                id="class-shift"
                value={form.shiftId}
                onChange={(e) => setForm({ ...form, shiftId: e.target.value })}
                className={selectClass}
              >
                <option value="">None</option>
                {shifts.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="class-semester" className="text-sm font-medium text-slate-700 dark:text-slate-400">Semester</label>
              <select
                id="class-semester"
                value={form.semesterId}
                onChange={(e) => setForm({ ...form, semesterId: e.target.value })}
                className={selectClass}
              >
                <option value="">None</option>
                {semesters.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setModalOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" variant="gradient" size="sm" isLoading={saving} className="px-5">
              <Save className="w-4 h-4" />
              {saving ? 'Saving...' : editingId ? 'Update Class' : 'Save Class'}
            </Button>
          </div>
        </form>
      </Modal>

      <ConfirmModal
        isOpen={!!classToDelete}
        title="Delete class"
        message={`Delete class "${classToDelete?.name}"? This cannot be undone.`}
        confirmLabel="Delete"
        variant="danger"
        isLoading={deleting}
        onConfirm={handleConfirmDelete}
        onCancel={() => setClassToDelete(null)}
      />
    </div>
  );
};

export default Classes;
