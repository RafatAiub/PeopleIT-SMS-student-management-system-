import React, { useState } from 'react';
import { Plus, Filter, Pencil, Trash2 } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { useTableParams } from '@/hooks/useTableParams';
import { DataTable, type Column } from '@/components/DataTable/DataTable';
import { ConfirmModal } from '@/components/common/ConfirmModal';
import { PageHeader, Button, Badge, Tabs, ErrorState } from '@/components/ui';
import PendingRegistrations from './PendingRegistrations';
import UserFormDrawer from './UserFormDrawer';
import { useDeleteUser, usePendingRegistrations, useUsersList } from './users.queries';
import type { UserRow } from './users.types';

export default function Users() {
  const { user } = useAuthStore();
  const currentUserRole = user?.role;
  // Historic rule, unchanged: a super admin manages users through a different
  // flow, so the create action is only offered to institution admins here.
  const canAddUser = currentUserRole !== 'SUPER_ADMIN';

  const { params, debouncedSearch, setPage, setPageSize, setSearch, setFilter } = useTableParams();
  const { data, isLoading, isError, refetch } = useUsersList({
    page: params.page,
    pageSize: params.pageSize,
    search: debouncedSearch,
    role: params.filters.role || undefined,
  });
  const users = data?.users || [];
  const total = data?.total || 0;

  const { data: pendingRows = [] } = usePendingRegistrations();
  const deleteMutation = useDeleteUser();

  const [activeTab, setActiveTab] = useState<'users' | 'pending'>('users');
  const [drawerMode, setDrawerMode] = useState<'create' | 'edit'>('create');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserRow | null>(null);
  const [userToDelete, setUserToDelete] = useState<UserRow | null>(null);

  const openCreate = () => {
    setDrawerMode('create');
    setEditingUser(null);
    setDrawerOpen(true);
  };
  const openEdit = (row: UserRow) => {
    setDrawerMode('edit');
    setEditingUser(row);
    setDrawerOpen(true);
  };

  // A non-super-admin may never edit or delete a super admin's account — the
  // backend already rejects the write, this just keeps the action out of
  // reach instead of letting them hit a 403.
  const canModify = (row: UserRow) => row.role !== 'SUPER_ADMIN' || currentUserRole === 'SUPER_ADMIN';

  const handleConfirmDelete = () => {
    if (!userToDelete) return;
    deleteMutation.mutate(userToDelete.id, { onSuccess: () => setUserToDelete(null) });
  };

  const roleFilterOptions = [
    { value: '', label: 'All Roles' },
    { value: 'ADMIN', label: 'Admin' },
    { value: 'TEACHER', label: 'Teacher' },
    { value: 'STUDENT', label: 'Student' },
    { value: 'GUARDIAN', label: 'Guardian' },
    ...(currentUserRole === 'SUPER_ADMIN' ? [{ value: 'SUPER_ADMIN', label: 'Super Admin' }] : []),
  ];

  const columns: Column<UserRow>[] = [
    {
      key: 'user',
      header: 'User',
      accessor: 'firstName',
      primary: true,
      render: (row) => (
        <div className="flex items-center gap-3">
          {row.avatarUrl ? (
            <img
              src={row.avatarUrl}
              alt="Avatar"
              className="w-10 h-10 rounded-full object-cover border border-slate-200 dark:border-white/10 shadow-xs"
            />
          ) : (
            <div className="w-10 h-10 rounded-full bg-primary-50 dark:bg-primary-500/20 flex items-center justify-center text-primary-600 dark:text-primary-400 font-bold border border-slate-200 dark:border-transparent">
              {row.firstName?.charAt(0) || 'U'}
            </div>
          )}
          <div className="min-w-0">
            <div className="font-medium text-slate-900 dark:text-white truncate">{row.firstName} {row.lastName}</div>
            <div className="text-xs text-slate-500 truncate">{row.email}</div>
          </div>
        </div>
      ),
      exportValue: (row) => `${row.firstName} ${row.lastName} <${row.email}>`,
    },
    {
      key: 'role',
      header: 'Role',
      accessor: 'role',
      render: (row) => <Badge variant="neutral">{row.role}</Badge>,
      exportValue: (row) => row.role,
    },
    {
      key: 'status',
      header: 'Status',
      sortable: false,
      render: (row) => (
        <Badge variant={row.isActive !== false ? 'success' : 'danger'} motionKey={String(row.isActive)}>
          {row.isActive !== false ? 'Active' : 'Inactive'}
        </Badge>
      ),
      exportValue: (row) => (row.isActive !== false ? 'Active' : 'Inactive'),
    },
    {
      key: 'actions',
      header: 'Actions',
      sortable: false,
      align: 'right',
      render: (row) => {
        if (!canModify(row)) {
          return <span className="text-xs text-slate-400 dark:text-slate-500 italic">Super admin only</span>;
        }
        return (
          <div className="flex items-center justify-end gap-0.5" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={() => openEdit(row)}
              aria-label={`Edit ${row.firstName} ${row.lastName}`}
              title="Edit user"
              className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/10 transition-colors"
            >
              <Pencil className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setUserToDelete(row)}
              aria-label={`Delete ${row.firstName} ${row.lastName}`}
              title="Delete user"
              className="p-1.5 rounded-lg text-slate-500 hover:text-red-700 dark:text-slate-400 dark:hover:text-red-300 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        );
      },
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="User Management"
        description="Manage Admins, Teachers, Students, and Guardians."
        actions={
          canAddUser ? (
            <Button variant="gradient" onClick={openCreate} leftIcon={<Plus className="w-5 h-5" />}>
              Add User
            </Button>
          ) : undefined
        }
      />

      <Tabs
        tabs={[
          { id: 'users', label: 'All Users' },
          { id: 'pending', label: 'Pending Registrations', count: pendingRows.length || undefined },
        ]}
        value={activeTab}
        onChange={(id) => setActiveTab(id as 'users' | 'pending')}
      />

      {activeTab === 'users' ? (
        <div className="space-y-4">
          <div className="glass-card p-4 rounded-2xl flex flex-wrap items-center gap-4">
            <div className="relative">
              <select
                aria-label="Filter by role"
                value={params.filters.role || ''}
                onChange={(e) => setFilter('role', e.target.value)}
                className="input-field pl-10 pr-8 cursor-pointer"
              >
                {roleFilterOptions.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              <Filter className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
          </div>

          <div className="glass-card rounded-2xl overflow-hidden p-4">
            {isError ? (
              <ErrorState message="Could not load users." onRetry={() => refetch()} />
            ) : (
              <DataTable
                data={users}
                columns={columns}
                isLoading={isLoading}
                searchPlaceholder="Search users by name, email..."
                serverSearch
                onSearch={setSearch}
                serverPagination
                totalCount={total}
                page={params.page}
                pageSize={params.pageSize}
                onPageChange={setPage}
                onPageSizeChange={setPageSize}
                exportFileName="users"
                emptyTitle="No users found"
                emptyDescription="Try adjusting your search or role filter, or add a new user."
              />
            )}
          </div>
        </div>
      ) : (
        <PendingRegistrations />
      )}

      <UserFormDrawer isOpen={drawerOpen} onClose={() => setDrawerOpen(false)} mode={drawerMode} user={editingUser} currentUserRole={currentUserRole} />

      <ConfirmModal
        isOpen={!!userToDelete}
        title="Delete user"
        message={`Are you sure you want to delete ${userToDelete?.firstName} ${userToDelete?.lastName}? This cannot be undone.`}
        confirmLabel="Delete"
        variant="danger"
        isLoading={deleteMutation.isPending}
        onConfirm={handleConfirmDelete}
        onCancel={() => setUserToDelete(null)}
      />
    </div>
  );
}
