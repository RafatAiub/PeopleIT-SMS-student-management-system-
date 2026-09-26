import React, { useMemo, useState } from 'react';
import { Plus, Save } from 'lucide-react';
import toast from 'react-hot-toast';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import apiClient from '../../api/client';
import { DataTable, Column, RowAction } from '../../components/DataTable/DataTable';
import { ConfirmModal } from '../../components/common/ConfirmModal';
import { Modal, Button, Input, Select, PageHeader, ErrorState } from '../../components/ui';

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

const CLASSES_KEY = ['academics', 'classes'];

const Classes = () => {
  const queryClient = useQueryClient();

  const { data: classes = [], isLoading, isError, refetch } = useQuery({
    queryKey: CLASSES_KEY,
    queryFn: async () => {
      const res = await apiClient.get('/students/meta/classes');
      return (res.data?.data || []) as ClassRow[];
    },
  });

  const { data: mediums = [] } = useQuery({ queryKey: ['lookup-ref', 'mediums'], queryFn: () => fetchLookupList('/academics/mediums') });
  const { data: streams = [] } = useQuery({ queryKey: ['lookup-ref', 'streams'], queryFn: () => fetchLookupList('/academics/streams') });
  const { data: shifts = [] } = useQuery({ queryKey: ['lookup-ref', 'shifts'], queryFn: () => fetchLookupList('/academics/shifts') });
  const { data: semesters = [] } = useQuery({ queryKey: ['lookup-ref', 'semesters'], queryFn: () => fetchLookupList('/academics/semesters') });

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [errors, setErrors] = useState<{ name?: string; level?: string }>({});

  const [classToDelete, setClassToDelete] = useState<ClassRow | null>(null);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: CLASSES_KEY });

  const createMutation = useMutation({
    mutationFn: (payload: Record<string, any>) => apiClient.post('/academics/classes', payload),
    onSuccess: () => {
      toast.success('Class created successfully');
      invalidate();
      setModalOpen(false);
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Failed to save class'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Record<string, any> }) => apiClient.put(`/academics/classes/${id}`, payload),
    onSuccess: () => {
      toast.success('Class updated successfully');
      invalidate();
      setModalOpen(false);
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Failed to save class'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/academics/classes/${id}`),
    onSuccess: () => {
      toast.success('Class deleted successfully');
      setClassToDelete(null);
      invalidate();
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Cannot delete this class.'),
  });

  const saving = createMutation.isPending || updateMutation.isPending;

  const mediumMap = useMemo(() => Object.fromEntries(mediums.map((m) => [m.id, m.name])), [mediums]);
  const streamMap = useMemo(() => Object.fromEntries(streams.map((s) => [s.id, s.name])), [streams]);
  const shiftMap = useMemo(() => Object.fromEntries(shifts.map((s) => [s.id, s.name])), [shifts]);
  const semesterMap = useMemo(() => Object.fromEntries(semesters.map((s) => [s.id, s.name])), [semesters]);

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setErrors({});
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
    setErrors({});
    setModalOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const nextErrors: { name?: string; level?: string } = {};
    if (!form.name.trim()) nextErrors.name = 'Name is required';
    const levelNum = Number(form.level);
    if (!form.level.trim() || !Number.isInteger(levelNum) || levelNum < 1) {
      nextErrors.level = 'Level must be a whole number of at least 1';
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    const payload: Record<string, any> = { name: form.name.trim(), level: levelNum };
    if (form.mediumId) payload.mediumId = form.mediumId;
    if (form.streamId) payload.streamId = form.streamId;
    if (form.shiftId) payload.shiftId = form.shiftId;
    if (form.semesterId) payload.semesterId = form.semesterId;

    if (editingId) {
      updateMutation.mutate({ id: editingId, payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const columns: Column<ClassRow>[] = [
    { key: 'name', header: 'Name', accessor: 'name', primary: true },
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

  const lookupOptions = (list: LookupRef[]) => list.map((l) => ({ value: l.id, label: l.name }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Manage Class"
        description="Create classes and tag them with a medium, stream, shift, or semester."
        actions={
          <Button variant="gradient" onClick={openCreate}>
            <Plus className="w-4 h-4" />
            Add Class
          </Button>
        }
      />

      <div className="glass-card p-4 sm:p-6 rounded-2xl">
        {isError ? (
          <ErrorState title="Failed to load classes" onRetry={() => refetch()} />
        ) : (
          <DataTable
            data={classes}
            columns={columns}
            actions={actions}
            isLoading={isLoading}
            searchPlaceholder="Search classes..."
            emptyTitle="No classes found"
            emptyDescription="Create your first class to get started."
            emptyAction={
              <Button variant="primary" size="sm" onClick={openCreate}>
                <Plus className="w-4 h-4" />
                Add Class
              </Button>
            }
          />
        )}
      </div>

      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingId ? 'Edit Class' : 'Add Class'}
        size="lg"
        footer={
          <>
            <Button type="button" variant="secondary" onClick={() => setModalOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" form="class-form" variant="primary" isLoading={saving}>
              <Save className="w-4 h-4" />
              {editingId ? 'Update Class' : 'Save Class'}
            </Button>
          </>
        }
      >
        <form id="class-form" onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              id="class-name"
              label="Name"
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g. Class 6"
              error={errors.name}
              data-autofocus
            />
            <Input
              id="class-level"
              label="Level"
              type="number"
              min={1}
              required
              value={form.level}
              onChange={(e) => setForm({ ...form, level: e.target.value })}
              placeholder="e.g. 6"
              error={errors.level}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Select
              id="class-medium"
              label="Medium"
              placeholder="None"
              value={form.mediumId}
              onChange={(e) => setForm({ ...form, mediumId: e.target.value })}
              options={lookupOptions(mediums)}
            />
            <Select
              id="class-stream"
              label="Stream"
              placeholder="None"
              value={form.streamId}
              onChange={(e) => setForm({ ...form, streamId: e.target.value })}
              options={lookupOptions(streams)}
            />
            <Select
              id="class-shift"
              label="Shift"
              placeholder="None"
              value={form.shiftId}
              onChange={(e) => setForm({ ...form, shiftId: e.target.value })}
              options={lookupOptions(shifts)}
            />
            <Select
              id="class-semester"
              label="Semester"
              placeholder="None"
              value={form.semesterId}
              onChange={(e) => setForm({ ...form, semesterId: e.target.value })}
              options={lookupOptions(semesters)}
            />
          </div>
        </form>
      </Modal>

      <ConfirmModal
        isOpen={!!classToDelete}
        title="Delete class"
        message={`Delete class "${classToDelete?.name}"? This cannot be undone.`}
        confirmLabel="Delete"
        variant="danger"
        isLoading={deleteMutation.isPending}
        onConfirm={() => classToDelete && deleteMutation.mutate(classToDelete.id)}
        onCancel={() => setClassToDelete(null)}
      />
    </div>
  );
};

export default Classes;
