import React, { useState } from 'react';
import apiClient from '../../api/client';
import toast from 'react-hot-toast';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTableParams } from '../../hooks/useTableParams';
import { DataTable, Column, RowAction } from '../../components/DataTable/DataTable';
import { Drawer, Button, Input, PageHeader, ErrorState } from '../../components/ui';
import { ConfirmModal } from '../../components/common/ConfirmModal';

interface TeacherRow {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string | null;
  avatarUrl?: string | null;
  teacherProfile?: {
    gender?: string | null;
    dateOfBirth?: string | null;
    qualification?: string | null;
    address?: string | null;
    permanentAddress?: string | null;
    canManageStudents?: boolean;
  } | null;
}

const emptyEdit = () => ({
  firstName: '', lastName: '', phone: '', gender: 'MALE', dateOfBirth: '', qualification: '',
  address: '', permanentAddress: '', canManageStudents: false,
});

const TEACHERS_KEY = 'teachers';

const TeacherDetails = () => {
  const queryClient = useQueryClient();
  const { params, debouncedSearch, setPage, setPageSize, setSearch } = useTableParams();

  const {
    data,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: [TEACHERS_KEY, params.page, params.pageSize, debouncedSearch],
    queryFn: async () => {
      const res = await apiClient.get('/users', {
        params: { role: 'TEACHER', page: params.page, pageSize: params.pageSize, search: debouncedSearch || undefined },
      });
      return { teachers: (res.data?.data || []) as TeacherRow[], total: res.data?.meta?.total || 0 };
    },
  });
  const teachers = data?.teachers ?? [];
  const total = data?.total ?? 0;

  const [editTarget, setEditTarget] = useState<TeacherRow | null>(null);
  const [editData, setEditData] = useState(emptyEdit());
  const [deleteTarget, setDeleteTarget] = useState<TeacherRow | null>(null);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: [TEACHERS_KEY] });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Record<string, any> }) => apiClient.put(`/users/${id}`, payload),
    onSuccess: () => {
      toast.success('Teacher updated successfully');
      setEditTarget(null);
      invalidate();
    },
    onError: (error: any) => {
      console.error('Failed to update teacher', error);
      toast.error(error.response?.data?.message || 'Failed to update teacher');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/users/${id}`),
    onSuccess: () => {
      toast.success('Teacher deleted successfully');
      setDeleteTarget(null);
      invalidate();
    },
    onError: (error: any) => {
      console.error('Failed to delete teacher', error);
      toast.error(error.response?.data?.message || 'Failed to delete teacher');
    },
  });

  const openEdit = (row: TeacherRow) => {
    setEditTarget(row);
    setEditData({
      firstName: row.firstName,
      lastName: row.lastName,
      phone: row.phone || '',
      gender: row.teacherProfile?.gender || 'MALE',
      dateOfBirth: row.teacherProfile?.dateOfBirth ? String(row.teacherProfile.dateOfBirth).slice(0, 10) : '',
      qualification: row.teacherProfile?.qualification || '',
      address: row.teacherProfile?.address || '',
      permanentAddress: row.teacherProfile?.permanentAddress || '',
      canManageStudents: !!row.teacherProfile?.canManageStudents,
    });
  };

  const [editErrors, setEditErrors] = useState<Record<string, string>>({});

  const handleSaveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editTarget) return;
    const errs: Record<string, string> = {};
    if (!editData.firstName.trim()) errs.firstName = 'First name is required';
    if (!editData.lastName.trim()) errs.lastName = 'Last name is required';
    setEditErrors(errs);
    if (Object.keys(errs).length > 0) return;

    updateMutation.mutate({
      id: editTarget.id,
      payload: {
        firstName: editData.firstName,
        lastName: editData.lastName,
        phone: editData.phone || undefined,
        gender: editData.gender,
        dateOfBirth: editData.dateOfBirth || undefined,
        qualification: editData.qualification || undefined,
        address: editData.address || undefined,
        permanentAddress: editData.permanentAddress || undefined,
        canManageStudents: editData.canManageStudents,
      },
    });
  };

  const columns: Column<TeacherRow>[] = [
    {
      key: 'no', header: 'No.', sortable: false, width: '60px',
      render: (row) => <span className="text-slate-500 dark:text-slate-400">{teachers.findIndex((t) => t.id === row.id) + 1 + (params.page - 1) * params.pageSize}</span>,
    },
    {
      key: 'teacher', header: 'Teacher', primary: true,
      exportValue: (row) => `${row.firstName} ${row.lastName}`,
      render: (row) => (
        <div className="flex items-center gap-3">
          {row.avatarUrl ? (
            <img src={row.avatarUrl} alt="Avatar" className="w-8 h-8 rounded-full object-cover border border-slate-200 dark:border-white/10" />
          ) : (
            <div className="w-8 h-8 rounded-full bg-primary-500/10 dark:bg-primary-500/20 text-primary-600 dark:text-primary-400 flex items-center justify-center font-bold text-xs flex-shrink-0">
              {row.firstName?.[0] || '?'}
            </div>
          )}
          <div className="min-w-0">
            <div className="font-medium text-slate-900 dark:text-white truncate">{row.firstName} {row.lastName}</div>
            <div className="text-xs text-slate-500 dark:text-slate-400 truncate">{row.email}</div>
          </div>
        </div>
      ),
    },
    {
      key: 'gender', header: 'Gender',
      exportValue: (row) => row.teacherProfile?.gender || '',
      render: (row) => row.teacherProfile?.gender ? row.teacherProfile.gender.charAt(0) + row.teacherProfile.gender.slice(1).toLowerCase() : '—',
    },
    {
      key: 'dob', header: 'Date of Birth',
      exportValue: (row) => row.teacherProfile?.dateOfBirth ? String(row.teacherProfile.dateOfBirth).slice(0, 10) : '',
      render: (row) => row.teacherProfile?.dateOfBirth ? new Date(row.teacherProfile.dateOfBirth).toLocaleDateString('en-GB').replace(/\//g, '-') : '—',
    },
    {
      key: 'qualification', header: 'Qualification',
      exportValue: (row) => row.teacherProfile?.qualification || '',
      render: (row) => row.teacherProfile?.qualification || '—',
    },
  ];

  const actions: RowAction<TeacherRow>[] = [
    { label: 'Edit', icon: 'edit', onClick: openEdit },
    { label: 'Delete', icon: 'delete', onClick: (row) => setDeleteTarget(row), variant: 'danger' },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="Manage Teacher" description="List Teacher" />

      <div className="glass-card rounded-2xl overflow-hidden border border-slate-200/50 dark:border-white/10 shadow-xs">
        <div className="p-4">
          {isError ? (
            <ErrorState title="Failed to load teachers" onRetry={() => refetch()} />
          ) : (
            <DataTable
              data={teachers}
              columns={columns}
              actions={actions}
              isLoading={isLoading}
              searchPlaceholder="Search by name or email..."
              serverSearch
              onSearch={setSearch}
              serverPagination
              totalCount={total}
              page={params.page}
              pageSize={params.pageSize}
              onPageChange={setPage}
              onPageSizeChange={setPageSize}
              exportFileName="teachers"
              emptyTitle="No teachers found"
              emptyDescription="Add a teacher from Add New Teacher."
            />
          )}
        </div>
      </div>

      <Drawer
        isOpen={!!editTarget}
        onClose={() => setEditTarget(null)}
        title="Edit Teacher"
        width="lg"
        footer={
          <>
            <Button type="button" variant="secondary" onClick={() => setEditTarget(null)}>Cancel</Button>
            <Button type="submit" form="teacher-edit-form" variant="primary" isLoading={updateMutation.isPending}>
              {updateMutation.isPending ? 'Saving…' : 'Save Changes'}
            </Button>
          </>
        }
      >
        <form id="teacher-edit-form" onSubmit={handleSaveEdit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              id="edit-teacher-first-name"
              label="First Name"
              required
              value={editData.firstName}
              onChange={(e) => setEditData((p) => ({ ...p, firstName: e.target.value }))}
              error={editErrors.firstName}
              data-autofocus
            />
            <Input
              id="edit-teacher-last-name"
              label="Last Name"
              required
              value={editData.lastName}
              onChange={(e) => setEditData((p) => ({ ...p, lastName: e.target.value }))}
              error={editErrors.lastName}
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              id="edit-teacher-phone"
              label="Mobile"
              value={editData.phone}
              onChange={(e) => setEditData((p) => ({ ...p, phone: e.target.value }))}
            />
            <div>
              <label className="field-label">Gender</label>
              <div className="flex items-center gap-6 h-10">
                {(['MALE', 'FEMALE'] as const).map((g) => (
                  <label key={g} className="flex items-center gap-1.5 text-sm text-slate-700 dark:text-slate-300 cursor-pointer">
                    <input type="radio" checked={editData.gender === g} onChange={() => setEditData((p) => ({ ...p, gender: g }))} className="w-4 h-4 accent-primary-500 cursor-pointer" />
                    {g.charAt(0) + g.slice(1).toLowerCase()}
                  </label>
                ))}
              </div>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              id="edit-teacher-dob"
              type="date"
              label="Date of Birth"
              value={editData.dateOfBirth}
              onChange={(e) => setEditData((p) => ({ ...p, dateOfBirth: e.target.value }))}
            />
            <Input
              id="edit-teacher-qualification"
              label="Qualification"
              value={editData.qualification}
              onChange={(e) => setEditData((p) => ({ ...p, qualification: e.target.value }))}
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              id="edit-teacher-address"
              label="Current Address"
              value={editData.address}
              onChange={(e) => setEditData((p) => ({ ...p, address: e.target.value }))}
            />
            <Input
              id="edit-teacher-permanent-address"
              label="Permanent Address"
              value={editData.permanentAddress}
              onChange={(e) => setEditData((p) => ({ ...p, permanentAddress: e.target.value }))}
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300 cursor-pointer">
            <input type="checkbox" checked={editData.canManageStudents} onChange={(e) => setEditData((p) => ({ ...p, canManageStudents: e.target.checked }))} className="w-4 h-4 rounded-sm accent-primary-500 cursor-pointer" />
            Grant permission to manage students and parents
          </label>
        </form>
      </Drawer>

      <ConfirmModal
        isOpen={!!deleteTarget}
        title="Delete this teacher?"
        message={`This permanently removes ${deleteTarget?.firstName} ${deleteTarget?.lastName}'s account. This cannot be undone.`}
        confirmLabel="Delete"
        variant="danger"
        isLoading={deleteMutation.isPending}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
};

export default TeacherDetails;
