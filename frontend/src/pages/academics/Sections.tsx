import React, { useEffect, useState } from 'react';
import { Users2, Plus, Save } from 'lucide-react';
import toast from 'react-hot-toast';
import apiClient from '../../api/client';
import { DataTable, Column, RowAction } from '../../components/DataTable/DataTable';
import { ConfirmModal } from '../../components/common/ConfirmModal';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';

interface ClassOption {
  id: string;
  name: string;
}

// Section.classTeacherId references Teacher.id (not User.id) — the option
// value below is `user.teacherProfile.id`, matching how /users?role=TEACHER
// already nests the Teacher profile per user (see user.repository.ts).
interface TeacherOption {
  id: string;
  label: string;
}

interface SectionRow {
  id: string;
  name: string;
  classId: string;
  classTeacherId?: string | null;
  classTeacher?: { id: string; user?: { firstName: string; lastName: string } } | null;
  _count?: { students?: number };
  students?: unknown[];
}

const emptyForm = { name: '', classTeacherId: '' };

const Sections = () => {
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [selectedClassId, setSelectedClassId] = useState('');
  const [sections, setSections] = useState<SectionRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [classesLoading, setClassesLoading] = useState(true);

  const [teachers, setTeachers] = useState<TeacherOption[]>([]);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const [sectionToDelete, setSectionToDelete] = useState<SectionRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchClasses = async () => {
    setClassesLoading(true);
    try {
      const res = await apiClient.get('/students/meta/classes');
      const list = res.data?.data || [];
      setClasses(list);
      setSelectedClassId((prev) => prev || (list[0]?.id ?? ''));
    } catch (err) {
      console.error('Failed to fetch classes', err);
      toast.error('Failed to load classes');
    } finally {
      setClassesLoading(false);
    }
  };

  const fetchTeachers = async () => {
    try {
      const res = await apiClient.get('/users?role=TEACHER&pageSize=100');
      const users = res.data?.data || [];
      const options: TeacherOption[] = users
        .filter((u: any) => !!u.teacherProfile)
        .map((u: any) => ({ id: u.teacherProfile.id, label: `${u.firstName} ${u.lastName}` }));
      setTeachers(options);
    } catch (err) {
      console.warn('Failed to load teacher list', err);
      setTeachers([]);
    }
  };

  const fetchSections = async (classId: string) => {
    if (!classId) {
      setSections([]);
      return;
    }
    setLoading(true);
    try {
      const res = await apiClient.get(`/students/meta/sections?classId=${classId}`);
      setSections(res.data?.data || []);
    } catch (err) {
      console.error('Failed to fetch sections', err);
      toast.error('Failed to load sections');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchClasses();
    fetchTeachers();
  }, []);

  useEffect(() => {
    if (selectedClassId) fetchSections(selectedClassId);
  }, [selectedClassId]);

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setModalOpen(true);
  };

  const openEdit = (row: SectionRow) => {
    setEditingId(row.id);
    setForm({
      name: row.name,
      classTeacherId: row.classTeacherId || row.classTeacher?.id || '',
    });
    setModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedClassId) {
      toast.error('Select a class first');
      return;
    }
    if (!form.name.trim()) {
      toast.error('Name is required');
      return;
    }

    const payload: Record<string, any> = { name: form.name.trim(), classId: selectedClassId };
    if (form.classTeacherId) payload.classTeacherId = form.classTeacherId;

    setSaving(true);
    try {
      if (editingId) {
        await apiClient.put(`/academics/sections/${editingId}`, payload);
        toast.success('Section updated successfully');
      } else {
        await apiClient.post('/academics/sections', payload);
        toast.success('Section created successfully');
      }
      setModalOpen(false);
      fetchSections(selectedClassId);
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to save section');
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!sectionToDelete) return;
    setDeleting(true);
    try {
      await apiClient.delete(`/academics/sections/${sectionToDelete.id}`);
      toast.success('Section deleted successfully');
      setSectionToDelete(null);
      fetchSections(selectedClassId);
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Cannot delete this section.');
    } finally {
      setDeleting(false);
    }
  };

  const columns: Column<SectionRow>[] = [
    { key: 'name', header: 'Name', accessor: 'name' },
    {
      key: 'classTeacher',
      header: 'Class Teacher',
      sortable: false,
      render: (row) => (row.classTeacher?.user ? `${row.classTeacher.user.firstName} ${row.classTeacher.user.lastName}` : 'Unassigned'),
    },
    {
      key: 'students',
      header: 'Student Count',
      sortable: false,
      render: (row) => row._count?.students ?? row.students?.length ?? '—',
    },
  ];

  const actions: RowAction<SectionRow>[] = [
    { label: 'Edit', icon: 'edit', onClick: openEdit },
    { label: 'Delete', icon: 'delete', variant: 'danger', onClick: (row) => setSectionToDelete(row) },
  ];

  return (
    <div className="space-y-6">
      <div className="glass-card p-6 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-11 h-11 rounded-xl bg-primary-50 dark:bg-primary-500/10 text-primary-600 dark:text-primary-400 flex items-center justify-center flex-shrink-0">
            <Users2 className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">Manage Section</h2>
            <p className="text-slate-600 dark:text-slate-400 mt-1 text-sm">
              Create sections per class and assign an optional class teacher.
            </p>
          </div>
        </div>
        <Button variant="gradient" onClick={openCreate} disabled={!selectedClassId} className="flex-shrink-0">
          <Plus className="w-4 h-4" />
          Add Section
        </Button>
      </div>

      <div className="glass-card p-6 rounded-2xl space-y-5">
        <div className="max-w-xs space-y-1.5">
          <label htmlFor="section-class-filter" className="text-sm font-medium text-slate-700 dark:text-slate-400">Class</label>
          <select
            id="section-class-filter"
            value={selectedClassId}
            onChange={(e) => setSelectedClassId(e.target.value)}
            className="input-field cursor-pointer"
            disabled={classesLoading || classes.length === 0}
          >
            {classes.length === 0 && <option value="">No classes found</option>}
            {classes.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>

        <DataTable
          data={sections}
          columns={columns}
          actions={actions}
          isLoading={loading || classesLoading}
          searchPlaceholder="Search sections..."
          emptyTitle="No sections found"
          emptyDescription="Create a section for this class to get started."
        />
      </div>

      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} className="max-w-md space-y-4">
        <h3 className="text-lg font-bold text-slate-900 dark:text-white">
          {editingId ? 'Edit Section' : 'Add Section'}
        </h3>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="section-name" className="text-sm font-medium text-slate-700 dark:text-slate-400">
              Name<span className="text-red-500 ml-1">*</span>
            </label>
            <input
              id="section-name"
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="input-field"
              placeholder="e.g. A"
              required
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="section-teacher" className="text-sm font-medium text-slate-700 dark:text-slate-400">Class Teacher</label>
            <select
              id="section-teacher"
              value={form.classTeacherId}
              onChange={(e) => setForm({ ...form, classTeacherId: e.target.value })}
              className="input-field cursor-pointer"
            >
              <option value="">Unassigned</option>
              {teachers.map((t) => (
                <option key={t.id} value={t.id}>{t.label}</option>
              ))}
            </select>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setModalOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" variant="gradient" size="sm" isLoading={saving} className="px-5">
              <Save className="w-4 h-4" />
              {saving ? 'Saving...' : editingId ? 'Update Section' : 'Save Section'}
            </Button>
          </div>
        </form>
      </Modal>

      <ConfirmModal
        isOpen={!!sectionToDelete}
        title="Delete section"
        message={`Delete section "${sectionToDelete?.name}"? This cannot be undone.`}
        confirmLabel="Delete"
        variant="danger"
        isLoading={deleting}
        onConfirm={handleConfirmDelete}
        onCancel={() => setSectionToDelete(null)}
      />
    </div>
  );
};

export default Sections;
