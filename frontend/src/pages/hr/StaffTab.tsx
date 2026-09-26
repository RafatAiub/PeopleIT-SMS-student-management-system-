import React, { useState } from 'react';
import { Plus, DollarSign, Edit2, UserCheck, UserX, Users, UserPlus, Landmark, Building2 } from 'lucide-react';
import { useTableParams } from '@/hooks/useTableParams';
import { DataTable, Column } from '@/components/DataTable/DataTable';
import { StatusBadge } from '@/components/common/StatusBadge';
import { ConfirmModal } from '@/components/common/ConfirmModal';
import { Modal, Drawer, Input, Select, Button, StatCard, DescriptionList, ErrorState } from '@/components/ui';
import { formatCurrency, formatDate, useT } from '@/i18n';
import { useStaffList, useCreateStaff, useUpdateStaff } from './hr.queries';
import { DEPARTMENT_OPTIONS, ROLE_OPTIONS, type EditStaffForm, type NewStaffForm, type StaffProfile } from './hr.types';

const EMPTY_NEW_STAFF: NewStaffForm = {
  name: '',
  role: 'Teacher',
  email: '',
  phone: '',
  department: 'Science',
  joiningDate: new Date().toISOString().split('T')[0],
  basicSalary: 25000,
};

interface StaffTabProps {
  canWrite: boolean;
  onOpenPayroll: (staff: StaffProfile) => void;
}

export default function StaffTab({ canWrite, onOpenPayroll }: StaffTabProps) {
  const t = useT();
  const { params, debouncedSearch, setPage, setPageSize, setSearch } = useTableParams();
  const { data, isLoading, isError, refetch } = useStaffList({
    page: params.page,
    pageSize: params.pageSize,
    search: debouncedSearch,
  });

  const createMutation = useCreateStaff();
  const updateMutation = useUpdateStaff();

  const [viewing, setViewing] = useState<StaffProfile | null>(null);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [editing, setEditing] = useState<StaffProfile | null>(null);
  const [staffToToggle, setStaffToToggle] = useState<StaffProfile | null>(null);

  const [newStaff, setNewStaff] = useState<NewStaffForm>(EMPTY_NEW_STAFF);
  const [newErrors, setNewErrors] = useState<Record<string, string>>({});

  const [editForm, setEditForm] = useState<EditStaffForm>({ department: 'Science', designation: '', baseSalary: 0, status: 'ACTIVE' });
  const [editErrors, setEditErrors] = useState<Record<string, string>>({});

  const staffList = data?.staff ?? [];
  const summary = data?.summary ?? null;

  const validateNewStaff = (s: NewStaffForm): Record<string, string> => {
    const errs: Record<string, string> = {};
    if (!s.name.trim()) errs.name = 'Full name is required';
    if (!s.email.trim()) errs.email = 'Email is required';
    else if (!/^\S+@\S+\.\S+$/.test(s.email.trim())) errs.email = 'Enter a valid email address';
    if (!s.phone.trim()) errs.phone = 'Phone number is required';
    if (s.basicSalary <= 0) errs.basicSalary = 'Base salary must be greater than 0';
    return errs;
  };

  const validateEditStaff = (s: EditStaffForm): Record<string, string> => {
    const errs: Record<string, string> = {};
    if (!s.designation.trim()) errs.designation = 'Designation is required';
    if (s.baseSalary <= 0) errs.baseSalary = 'Base salary must be greater than 0';
    return errs;
  };

  const handleAddStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs = validateNewStaff(newStaff);
    setNewErrors(errs);
    if (Object.keys(errs).length > 0) return;
    await createMutation.mutateAsync(newStaff);
    setIsAddOpen(false);
    setNewStaff(EMPTY_NEW_STAFF);
    setNewErrors({});
  };

  const openEdit = (staff: StaffProfile) => {
    setEditing(staff);
    setEditForm({
      department: staff.department || 'Science',
      designation: staff.designation || '',
      baseSalary: staff.baseSalary || 0,
      status: staff.status,
    });
    setEditErrors({});
  };

  const handleUpdateStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    const errs = validateEditStaff(editForm);
    setEditErrors(errs);
    if (Object.keys(errs).length > 0) return;
    await updateMutation.mutateAsync({ id: editing.id, data: editForm });
    setEditing(null);
  };

  const handleConfirmToggleStatus = async () => {
    if (!staffToToggle) return;
    const nextStatus = staffToToggle.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    await updateMutation.mutateAsync({ id: staffToToggle.id, data: { status: nextStatus } });
    setStaffToToggle(null);
  };

  const columns: Column<StaffProfile>[] = [
    {
      key: 'name',
      header: 'Staff Member',
      accessor: 'name',
      primary: true,
      render: (staff) => (
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-primary-50 dark:bg-primary-500/20 text-primary-700 dark:text-primary-400 flex items-center justify-center font-bold border border-primary-200 dark:border-transparent shrink-0">
            {staff.name ? staff.name[0].toUpperCase() : '?'}
          </div>
          <div className="min-w-0">
            <div className="font-semibold text-slate-900 dark:text-white truncate">{staff.name || 'Unnamed Staff'}</div>
            {staff.employeeId && <div className="text-xs text-slate-500">ID: {staff.employeeId}</div>}
          </div>
        </div>
      ),
    },
    {
      key: 'designation',
      header: 'Role & Dept',
      accessor: 'designation',
      render: (staff) => (
        <>
          <div className="font-semibold text-slate-800 dark:text-slate-200">{staff.designation || '—'}</div>
          <div className="text-xs text-slate-500">{staff.department || '—'}</div>
        </>
      ),
    },
    {
      key: 'contact',
      header: 'Contact',
      sortable: false,
      hideOnMobile: true,
      render: (staff) => (
        <>
          <div className="text-xs text-slate-700 dark:text-slate-300">{staff.email || '—'}</div>
          <div className="text-xs text-slate-500">{staff.phone || '—'}</div>
        </>
      ),
    },
    {
      key: 'salary',
      header: 'Monthly Base Salary',
      sortable: false,
      align: 'right',
      exportValue: (staff) => staff.baseSalary ?? 0,
      render: (staff) => <div className="font-bold text-emerald-700 dark:text-emerald-400">{formatCurrency(staff.baseSalary ?? 0)}</div>,
    },
    {
      key: 'status',
      header: 'Status',
      sortable: false,
      render: (staff) => <StatusBadge status={staff.status} />,
    },
    {
      key: 'actions',
      header: 'Actions',
      sortable: false,
      render: (staff) => (
        <div className="flex items-center gap-1.5 flex-wrap justify-end" onClick={(e) => e.stopPropagation()}>
          {canWrite && (
            <>
              <button
                onClick={() => openEdit(staff)}
                title="Edit staff profile"
                aria-label={`Edit ${staff.name}`}
                className="p-1.5 rounded-lg text-slate-500 hover:text-primary-600 dark:hover:text-primary-400 hover:bg-slate-100 dark:hover:bg-white/10 transition-colors"
              >
                <Edit2 className="w-4 h-4" />
              </button>
              <button
                onClick={() => setStaffToToggle(staff)}
                title={staff.status === 'ACTIVE' ? 'Deactivate staff' : 'Activate staff'}
                aria-label={staff.status === 'ACTIVE' ? `Deactivate ${staff.name}` : `Activate ${staff.name}`}
                className={`p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-white/10 transition-colors ${
                  staff.status === 'ACTIVE' ? 'text-slate-500 hover:text-rose-600 dark:hover:text-red-400' : 'text-slate-500 hover:text-emerald-600 dark:hover:text-emerald-400'
                }`}
              >
                {staff.status === 'ACTIVE' ? <UserX className="w-4 h-4" /> : <UserCheck className="w-4 h-4" />}
              </button>
              <button
                onClick={() => onOpenPayroll(staff)}
                className="inline-flex items-center gap-1.5 bg-primary-50 dark:bg-primary-600/20 hover:bg-primary-100 dark:hover:bg-primary-600/40 text-primary-700 dark:text-primary-400 border border-primary-200 dark:border-primary-500/30 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all"
              >
                <DollarSign className="w-3.5 h-3.5" />
                Payroll
              </button>
            </>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Staff" value={summary?.totalStaff ?? 0} icon={<Users />} tone="info"
          hint={`${summary?.activeCount ?? 0} active / ${summary?.inactiveCount ?? 0} inactive`} />
        <StatCard label="Active Staff" value={summary?.activeCount ?? 0} icon={<UserCheck />} tone="success" hint={`${summary?.inactiveCount ?? 0} inactive`} />
        <StatCard label="Monthly Payroll Liability" value={formatCurrency(summary?.totalMonthlyPayroll ?? 0)} icon={<Landmark />} tone="warning" hint="Active staff base salary" />
        <StatCard label="Departments" value={summary?.byDepartment?.length ?? 0} icon={<Building2 />} tone="accent"
          hint={summary?.byDepartment?.[0] ? `${summary.byDepartment[0].department}: ${summary.byDepartment[0].count}` : 'No data yet'} />
      </div>

      {isError ? (
        <div className="glass-card rounded-2xl">
          <ErrorState message={t('Could not load the staff directory.')} onRetry={() => refetch()} />
        </div>
      ) : (
        <div className="glass-card rounded-2xl overflow-hidden border border-slate-200/50 dark:border-white/5 shadow-xs p-4">
          <DataTable
            data={staffList}
            columns={columns}
            isLoading={isLoading}
            searchPlaceholder="Search by name or department..."
            serverSearch
            onSearch={setSearch}
            serverPagination
            totalCount={data?.total ?? 0}
            page={params.page}
            pageSize={params.pageSize}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
            exportFileName="staff-directory"
            onRowClick={(staff) => setViewing(staff)}
            emptyTitle="No staff members found"
            emptyDescription="Try adjusting your search, or add a new staff profile."
            emptyAction={canWrite ? <Button size="sm" onClick={() => setIsAddOpen(true)} leftIcon={<UserPlus className="w-4 h-4" />}>Add Staff Profile</Button> : undefined}
            toolbar={
              canWrite ? (
                <Button size="sm" onClick={() => setIsAddOpen(true)} leftIcon={<Plus className="w-4 h-4" />}>
                  Add Staff
                </Button>
              ) : undefined
            }
          />
        </div>
      )}

      {/* Quick view drawer */}
      <Drawer isOpen={!!viewing} onClose={() => setViewing(null)} title={viewing?.name} description={viewing?.designation || undefined}>
        {viewing && (
          <DescriptionList
            columns={1}
            items={[
              { label: 'Department', value: viewing.department },
              { label: 'Email', value: viewing.email },
              { label: 'Phone', value: viewing.phone },
              { label: 'Joining Date', value: viewing.joiningDate ? formatDate(viewing.joiningDate) : '—' },
              { label: 'Base Salary', value: formatCurrency(viewing.baseSalary ?? 0) },
              { label: 'Status', value: <StatusBadge status={viewing.status} /> },
            ]}
          />
        )}
      </Drawer>

      {/* Add staff modal */}
      <Modal isOpen={isAddOpen} onClose={() => setIsAddOpen(false)} title="Add New Staff Profile" size="lg">
        <form onSubmit={handleAddStaff} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Full Name"
              required
              containerClassName="sm:col-span-2"
              value={newStaff.name}
              onChange={(e) => setNewStaff((prev) => ({ ...prev, name: e.target.value }))}
              placeholder="Enter staff full name"
              error={newErrors.name}
            />
            <Select
              label="Role"
              required
              value={newStaff.role}
              onChange={(e) => setNewStaff((prev) => ({ ...prev, role: e.target.value }))}
              options={ROLE_OPTIONS.map((r) => ({ value: r, label: r }))}
            />
            <Select
              label="Department"
              required
              value={newStaff.department}
              onChange={(e) => setNewStaff((prev) => ({ ...prev, department: e.target.value }))}
              options={DEPARTMENT_OPTIONS.map((d) => ({ value: d, label: d }))}
            />
            <Input
              label="Email"
              type="email"
              required
              value={newStaff.email}
              onChange={(e) => setNewStaff((prev) => ({ ...prev, email: e.target.value }))}
              placeholder="name@school.edu"
              error={newErrors.email}
            />
            <Input
              label="Phone Number"
              required
              value={newStaff.phone}
              onChange={(e) => setNewStaff((prev) => ({ ...prev, phone: e.target.value }))}
              placeholder="+880 1711-xxxxxx"
              error={newErrors.phone}
            />
            <Input
              label="Base Salary (৳)"
              type="number"
              value={newStaff.basicSalary}
              onChange={(e) => setNewStaff((prev) => ({ ...prev, basicSalary: Number(e.target.value) || 0 }))}
              error={newErrors.basicSalary}
            />
            <Input
              label="Joining Date"
              type="date"
              value={newStaff.joiningDate}
              onChange={(e) => setNewStaff((prev) => ({ ...prev, joiningDate: e.target.value }))}
            />
          </div>
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100 dark:border-white/5">
            <Button type="button" variant="secondary" onClick={() => setIsAddOpen(false)}>Cancel</Button>
            <Button type="submit" variant="gradient" isLoading={createMutation.isPending}>Create Profile</Button>
          </div>
        </form>
      </Modal>

      {/* Edit staff modal */}
      <Modal isOpen={!!editing} onClose={() => setEditing(null)} title={editing ? `Edit ${editing.name}'s Profile` : ''} size="lg">
        <form onSubmit={handleUpdateStaff} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Designation"
              required
              containerClassName="sm:col-span-2"
              value={editForm.designation}
              onChange={(e) => setEditForm((prev) => ({ ...prev, designation: e.target.value }))}
              placeholder="e.g. Senior Teacher"
              error={editErrors.designation}
            />
            <Select
              label="Department"
              value={editForm.department}
              onChange={(e) => setEditForm((prev) => ({ ...prev, department: e.target.value }))}
              options={DEPARTMENT_OPTIONS.map((d) => ({ value: d, label: d }))}
            />
            <Input
              label="Base Salary (৳)"
              type="number"
              value={editForm.baseSalary}
              onChange={(e) => setEditForm((prev) => ({ ...prev, baseSalary: Number(e.target.value) || 0 }))}
              error={editErrors.baseSalary}
            />
            <Select
              label="Status"
              containerClassName="sm:col-span-2"
              value={editForm.status}
              onChange={(e) => setEditForm((prev) => ({ ...prev, status: e.target.value as EditStaffForm['status'] }))}
              options={[
                { value: 'ACTIVE', label: 'Active' },
                { value: 'INACTIVE', label: 'Inactive' },
                { value: 'SUSPENDED', label: 'Suspended' },
              ]}
            />
          </div>
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100 dark:border-white/5">
            <Button type="button" variant="secondary" onClick={() => setEditing(null)}>Cancel</Button>
            <Button type="submit" variant="gradient" isLoading={updateMutation.isPending}>Save Changes</Button>
          </div>
        </form>
      </Modal>

      <ConfirmModal
        isOpen={!!staffToToggle}
        title={staffToToggle?.status === 'ACTIVE' ? 'Deactivate staff member' : 'Activate staff member'}
        message={
          staffToToggle?.status === 'ACTIVE'
            ? `Are you sure you want to deactivate ${staffToToggle?.name}? They will be marked inactive and excluded from active payroll totals.`
            : `Reactivate ${staffToToggle?.name}? They will be marked active again.`
        }
        confirmLabel={staffToToggle?.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
        variant={staffToToggle?.status === 'ACTIVE' ? 'danger' : 'info'}
        isLoading={updateMutation.isPending}
        onConfirm={handleConfirmToggleStatus}
        onCancel={() => setStaffToToggle(null)}
      />
    </div>
  );
}
