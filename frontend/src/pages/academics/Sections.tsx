import React, { useEffect, useState } from 'react';
import { Plus, Save } from 'lucide-react';
import toast from 'react-hot-toast';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import apiClient from '../../api/client';
import { DataTable, Column, RowAction } from '../../components/DataTable/DataTable';
import { ConfirmModal } from '../../components/common/ConfirmModal';
import { Modal, Button, Input, Select, PageHeader, ErrorState } from '../../components/ui';

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
  const queryClient = useQueryClient();
  const [selectedClassId, setSelectedClassId] = useState('');

  const { data: classes = [], isLoading: classesLoading } = useQuery({
    queryKey: ['academics', 'classes-lite'],
    queryFn: async () => {
      const res = await apiClient.get('/students/meta/classes');
      return (res.data?.data || []) as ClassOption[];
    },
  });

  useEffect(() => {
    if (!selectedClassId && classes.length > 0) setSelectedClassId(classes[0].id);
  }, [classes, selectedClassId]);

  const { data: teachers = [] } = useQuery({
    queryKey: ['teachers-lite'],
    queryFn: async () => {
      try {
        const res = await apiClient.get('/users?role=TEACHER&pageSize=100');
        const users = res.data?.data || [];
        return users
          .filter((u: any) => !!u.teacherProfile)
          .map((u: any) => ({ id: u.teacherProfile.id, label: `${u.firstName} ${u.lastName}` })) as TeacherOption[];
      } catch (err) {
        console.warn('Failed to load teacher list', err);
        return [] as TeacherOption[];
      }
    },
  });

  const sectionsKey = ['academics', 'sections', selectedClassId];
  const { data: sections = [], isLoading: sectionsLoading, isError, refetch } = useQuery({
    queryKey: sectionsKey,
    queryFn: async () => {
      const res = await apiClient.get(`/students/meta/sections?classId=${selectedClassId}`);
      return (res.data?.data || []) as SectionRow[];
    },
    enabled: !!selectedClassId,
  });

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [nameError, setNameError] = useState('');

  const [sectionToDelete, setSectionToDelete] = useState<SectionRow | null>(null);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['academics', 'sections'] });

  const createMutation = useMutation({
    mutationFn: (payload: Record<string, any>) => apiClient.post('/academics/sections', payload),
    onSuccess: () => {
      toast.success('Section created successfully');
      invalidate();
      setModalOpen(false);
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Failed to save section'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Record<string, any> }) => apiClient.put(`/academics/sections/${id}`, payload),
    onSuccess: () => {
      toast.success('Section updated successfully');
      invalidate();
      setModalOpen(false);
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Failed to save section'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/academics/sections/${id}`),
    onSuccess: () => {
      toast.success('Section deleted successfully');
      setSectionToDelete(null);
      invalidate();
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Cannot delete this section.'),
  });

  const saving = createMutation.isPending || updateMutation.isPending;

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setNameError('');
    setModalOpen(true);
  };

  const openEdit = (row: SectionRow) => {
    setEditingId(row.id);
    setForm({
      name: row.name,
      classTeacherId: row.classTeacherId || row.classTeacher?.id || '',
    });
    setNameError('');
    setModalOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedClassId) {
      toast.error('Select a class first');
      return;
    }
    if (!form.name.trim()) {
      setNameError('Name is required');
      return;
    }

    const payload: Record<string, any> = { name: form.name.trim(), classId: selectedClassId };
    if (form.classTeacherId) payload.classTeacherId = form.classTeacherId;

    if (editingId) {
      updateMutation.mutate({ id: editingId, payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const columns: Column<SectionRow>[] = [
    { key: 'name', header: 'Name', accessor: 'name', primary: true },
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
      <PageHeader
        title="Manage Section"
        description="Create sections per class and assign an optional class teacher."
        actions={
          <Button variant="gradient" onClick={openCreate} disabled={!selectedClassId}>
            <Plus className="w-4 h-4" />
            Add Section
          </Button>
        }
      />

      <div className="glass-card p-4 sm:p-6 rounded-2xl space-y-5">
        <Select
          id="section-class-filter"
          label="Class"
          containerClassName="max-w-xs"
          value={selectedClassId}
          onChange={(e) => setSelectedClassId(e.target.value)}
          disabled={classesLoading || classes.length === 0}
          options={classes.map((c) => ({ value: c.id, label: c.name }))}
          placeholder={classes.length === 0 ? 'No classes found' : undefined}
        />

        {isError ? (
          <ErrorState title="Failed to load sections" onRetry={() => refetch()} />
        ) : (
          <DataTable
            data={sections}
            columns={columns}
            actions={actions}
            isLoading={sectionsLoading || classesLoading}
            searchPlaceholder="Search sections..."
            emptyTitle="No sections found"
            emptyDescription="Create a section for this class to get started."
            emptyAction={
              <Button variant="primary" size="sm" onClick={openCreate} disabled={!selectedClassId}>
                <Plus className="w-4 h-4" />
                Add Section
              </Button>
            }
          />
        )}
      </div>

      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingId ? 'Edit Section' : 'Add Section'}
        footer={
          <>
            <Button type="button" variant="secondary" onClick={() => setModalOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" form="section-form" variant="primary" isLoading={saving}>
              <Save className="w-4 h-4" />
              {editingId ? 'Update Section' : 'Save Section'}
            </Button>
          </>
        }
      >
        <form id="section-form" onSubmit={handleSubmit} className="space-y-4">
          <Input
            id="section-name"
            label="Name"
            required
            value={form.name}
            onChange={(e) => {
              setForm({ ...form, name: e.target.value });
              if (nameError) setNameError('');
            }}
            placeholder="e.g. A"
            error={nameError}
            data-autofocus
          />

          <Select
            id="section-teacher"
            label="Class Teacher"
            placeholder="Unassigned"
            value={form.classTeacherId}
            onChange={(e) => setForm({ ...form, classTeacherId: e.target.value })}
            options={teachers.map((t) => ({ value: t.id, label: t.label }))}
          />
        </form>
      </Modal>

      <ConfirmModal
        isOpen={!!sectionToDelete}
        title="Delete section"
        message={`Delete section "${sectionToDelete?.name}"? This cannot be undone.`}
        confirmLabel="Delete"
        variant="danger"
        isLoading={deleteMutation.isPending}
        onConfirm={() => sectionToDelete && deleteMutation.mutate(sectionToDelete.id)}
        onCancel={() => setSectionToDelete(null)}
      />
    </div>
  );
};

export default Sections;
