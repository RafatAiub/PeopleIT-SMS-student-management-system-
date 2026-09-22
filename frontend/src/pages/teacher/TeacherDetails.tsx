import React, { useState, useEffect } from 'react';
import { Users as UsersIcon } from 'lucide-react';
import apiClient from '../../api/client';
import toast from 'react-hot-toast';
import { useTableParams } from '../../hooks/useTableParams';
import { DataTable, Column, RowAction } from '../../components/DataTable/DataTable';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
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

const TeacherDetails = () => {
  const [teachers, setTeachers] = useState<TeacherRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const { params, debouncedSearch, setPage, setPageSize, setSearch } = useTableParams();

  const [editTarget, setEditTarget] = useState<TeacherRow | null>(null);
  const [editData, setEditData] = useState(emptyEdit());
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<TeacherRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchTeachers = async () => {
    setLoading(true);
    try {
      const res = await apiClient.get('/users', {
        params: { role: 'TEACHER', page: params.page, pageSize: params.pageSize, search: debouncedSearch || undefined },
      });
      setTeachers(res.data.data || []);
      setTotal(res.data.meta?.total || 0);
    } catch (error) {
      console.error('Failed to fetch teachers', error);
      toast.error('Failed to load teachers');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTeachers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.page, params.pageSize, debouncedSearch]);

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

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editTarget) return;
    setSaving(true);
    try {
      await apiClient.put(`/users/${editTarget.id}`, {
        firstName: editData.firstName,
        lastName: editData.lastName,
        phone: editData.phone || undefined,
        gender: editData.gender,
        dateOfBirth: editData.dateOfBirth || undefined,
        qualification: editData.qualification || undefined,
        address: editData.address || undefined,
        permanentAddress: editData.permanentAddress || undefined,
        canManageStudents: editData.canManageStudents,
      });
      toast.success('Teacher updated successfully');
      setEditTarget(null);
      fetchTeachers();
    } catch (error: any) {
      console.error('Failed to update teacher', error);
      toast.error(error.response?.data?.message || 'Failed to update teacher');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await apiClient.delete(`/users/${deleteTarget.id}`);
      toast.success('Teacher deleted successfully');
      setDeleteTarget(null);
      fetchTeachers();
    } catch (error: any) {
      console.error('Failed to delete teacher', error);
      toast.error(error.response?.data?.message || 'Failed to delete teacher');
    } finally {
      setDeleting(false);
    }
  };

  const columns: Column<TeacherRow>[] = [
    {
      key: 'no', header: 'No.', sortable: false, width: '60px',
      render: (row) => <span className="text-slate-500 dark:text-slate-400">{teachers.findIndex((t) => t.id === row.id) + 1 + (params.page - 1) * params.pageSize}</span>,
    },
    {
      key: 'teacher', header: 'Teacher',
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
    { key: 'gender', header: 'Gender', render: (row) => row.teacherProfile?.gender ? row.teacherProfile.gender.charAt(0) + row.teacherProfile.gender.slice(1).toLowerCase() : '—' },
    { key: 'dob', header: 'Date of Birth', render: (row) => row.teacherProfile?.dateOfBirth ? new Date(row.teacherProfile.dateOfBirth).toLocaleDateString('en-GB').replace(/\//g, '-') : '—' },
    { key: 'qualification', header: 'Qualification', render: (row) => row.teacherProfile?.qualification || '—' },
  ];

  const actions: RowAction<TeacherRow>[] = [
    { label: 'Edit', icon: 'edit', onClick: openEdit },
    { label: 'Delete', icon: 'delete', onClick: (row) => setDeleteTarget(row), variant: 'danger' },
  ];

  return (
    <div className="space-y-6">
      <div className="glass-card p-6 rounded-2xl flex items-center gap-4">
        <div className="w-11 h-11 rounded-xl bg-primary-50 dark:bg-primary-500/10 text-primary-600 dark:text-primary-400 flex items-center justify-center flex-shrink-0">
          <UsersIcon className="w-5 h-5" />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">Manage Teacher</h2>
          <p className="text-slate-600 dark:text-slate-400 mt-1 text-sm">List Teacher</p>
        </div>
      </div>

      <div className="glass-card rounded-2xl overflow-hidden border border-slate-200/50 dark:border-white/10 shadow-xs">
        <div className="p-4">
          <DataTable
            data={teachers}
            columns={columns}
            actions={actions}
            isLoading={loading}
            searchPlaceholder="Search by name or email..."
            serverSearch
            onSearch={setSearch}
            serverPagination
            totalCount={total}
            page={params.page}
            pageSize={params.pageSize}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
            emptyTitle="No teachers found"
            emptyDescription="Add a teacher from Add New Teacher."
          />
        </div>
      </div>

      <Modal isOpen={!!editTarget} onClose={() => setEditTarget(null)} className="max-w-2xl space-y-5">
        <h3 className="text-lg font-bold text-slate-900 dark:text-white pb-2 border-b border-slate-200 dark:border-white/5">Edit Teacher</h3>
        <form onSubmit={handleSaveEdit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">First Name</label>
              <input type="text" value={editData.firstName} onChange={(e) => setEditData((p) => ({ ...p, firstName: e.target.value }))} className="input-field" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Last Name</label>
              <input type="text" value={editData.lastName} onChange={(e) => setEditData((p) => ({ ...p, lastName: e.target.value }))} className="input-field" />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Mobile</label>
              <input type="text" value={editData.phone} onChange={(e) => setEditData((p) => ({ ...p, phone: e.target.value }))} className="input-field" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Gender</label>
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
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Date of Birth</label>
              <input type="date" value={editData.dateOfBirth} onChange={(e) => setEditData((p) => ({ ...p, dateOfBirth: e.target.value }))} className="input-field" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Qualification</label>
              <input type="text" value={editData.qualification} onChange={(e) => setEditData((p) => ({ ...p, qualification: e.target.value }))} className="input-field" />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Current Address</label>
              <input type="text" value={editData.address} onChange={(e) => setEditData((p) => ({ ...p, address: e.target.value }))} className="input-field" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Permanent Address</label>
              <input type="text" value={editData.permanentAddress} onChange={(e) => setEditData((p) => ({ ...p, permanentAddress: e.target.value }))} className="input-field" />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300 cursor-pointer">
            <input type="checkbox" checked={editData.canManageStudents} onChange={(e) => setEditData((p) => ({ ...p, canManageStudents: e.target.checked }))} className="w-4 h-4 rounded-sm accent-primary-500 cursor-pointer" />
            Grant permission to manage students and parents
          </label>
          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="ghost" onClick={() => setEditTarget(null)}>Cancel</Button>
            <Button type="submit" variant="gradient" isLoading={saving}>{saving ? 'Saving…' : 'Save Changes'}</Button>
          </div>
        </form>
      </Modal>

      <ConfirmModal
        isOpen={!!deleteTarget}
        title="Delete this teacher?"
        message={`This permanently removes ${deleteTarget?.firstName} ${deleteTarget?.lastName}'s account. This cannot be undone.`}
        confirmLabel="Delete"
        variant="danger"
        isLoading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
};

export default TeacherDetails;
