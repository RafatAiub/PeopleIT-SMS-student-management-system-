import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Users, Building2, Plus, Mail, Lock, Phone, Eye, EyeOff,
  AlertTriangle, LifeBuoy, Activity, ShieldAlert, GraduationCap, Wand2,
} from 'lucide-react';
import apiClient from '../../api/client';
import toast from 'react-hot-toast';
import { DashboardSkeleton } from '../../components/common/DashboardSkeleton';
import { RegistrationWizard } from '../../components/superadmin/RegistrationWizard';
import { ConfirmModal } from '../../components/common/ConfirmModal';
import {
  Button, Modal, Input, PageHeader, StatCard, Badge, ErrorState,
} from '../../components/ui';
import { DataTable, type Column, type RowAction } from '../../components/DataTable/DataTable';
import { formatDate, useT } from '../../i18n';

interface Institution {
  id: string;
  name: string;
  slug: string;
  isActive: boolean;
  createdAt: string;
  users?: Array<{ firstName: string; lastName: string; email: string; phone?: string }>;
  _count?: { users: number; students: number };
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_REGEX = /^[0-9+\-\s()]{7,20}$/;

export const SuperAdminDashboard: React.FC = () => {
  const t = useT();
  const navigate = useNavigate();

  const [metrics, setMetrics] = useState<any>({
    totalInstitutions: 0,
    activeInstitutions: 0,
    suspendedInstitutions: 0,
    totalUsers: 0,
    totalStudents: 0,
    recentRegistrations: 0,
    systemAlerts: [],
  });

  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const [paginationMeta, setPaginationMeta] = useState<any>({ total: 0, page: 1, pageSize: 10, totalPages: 1 });

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [tableLoading, setTableLoading] = useState(false);

  const [page, setPage] = useState(1);
  const [pageSize] = useState(10);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'SUSPENDED'>('ALL');
  const [hideTest, setHideTest] = useState(true);

  const [isWizardOpen, setIsWizardOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
  const [selectedInst, setSelectedInst] = useState<Institution | null>(null);

  const [editFormData, setEditFormData] = useState({
    institutionName: '', adminFirstName: '', adminLastName: '', adminEmail: '', phone: '', adminPassword: '',
  });
  const [showEditPassword, setShowEditPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [editErrors, setEditErrors] = useState<Record<string, string>>({});

  const [deleteTarget, setDeleteTarget] = useState<Institution | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);

  const [statusTarget, setStatusTarget] = useState<Institution | null>(null);
  const [statusToggling, setStatusToggling] = useState(false);

  const validateEditForm = (data: typeof editFormData) => {
    const errors: Record<string, string> = {};
    if (data.institutionName.trim().length < 2) errors.institutionName = 'Institution name must be at least 2 characters';
    if (!data.adminFirstName.trim()) errors.adminFirstName = 'First name is required';
    if (!data.adminLastName.trim()) errors.adminLastName = 'Last name is required';
    if (!EMAIL_REGEX.test(data.adminEmail.trim())) errors.adminEmail = 'Enter a valid email address';
    if (data.phone.trim() && !PHONE_REGEX.test(data.phone.trim())) errors.phone = 'Enter a valid phone number';
    if (data.adminPassword.trim() && data.adminPassword.trim().length < 6) {
      errors.adminPassword = 'Password must be at least 6 characters, or leave blank to keep current password';
    }
    return errors;
  };

  const generateRandomPassword = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%';
    let pwd = '';
    for (let i = 0; i < 10; i++) pwd += chars.charAt(Math.floor(Math.random() * chars.length));
    setEditFormData((prev) => ({ ...prev, adminPassword: pwd }));
    setShowEditPassword(true);
    toast.success('Generated new password!');
  };

  const fetchSuperAdminMetrics = async () => {
    const res = await apiClient.get('/institution/super-admin/metrics');
    setMetrics(res.data.data);
  };

  const fetchPaginatedInstitutions = async () => {
    setTableLoading(true);
    try {
      const res = await apiClient.get('/institution/super-admin/paginated', {
        params: { page, pageSize, q: searchQuery.trim(), status: statusFilter, hideTest: hideTest ? 'true' : 'false' },
      });
      setInstitutions(res.data.data || []);
      if (res.data.meta) setPaginationMeta(res.data.meta);
    } catch (err) {
      console.error('Failed to fetch paginated institutions', err);
      toast.error('Failed to load institutions list');
    } finally {
      setTableLoading(false);
    }
  };

  const fetchData = async () => {
    setLoading(true);
    setLoadError(false);
    try {
      await Promise.all([fetchSuperAdminMetrics(), fetchPaginatedInstitutions()]);
    } catch (err) {
      console.error('Failed to fetch dashboard stats', err);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchData(); }, []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchPaginatedInstitutions(); }, [page, pageSize, statusFilter, hideTest]);
  useEffect(() => {
    const timer = setTimeout(() => { setPage(1); fetchPaginatedInstitutions(); }, 400);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery]);

  const handleOpenEditModal = (inst: Institution) => {
    setSelectedInst(inst);
    const admin = inst.users?.[0] || ({} as any);
    setEditFormData({
      institutionName: inst.name || '',
      adminFirstName: admin.firstName || '',
      adminLastName: admin.lastName || '',
      adminEmail: admin.email || '',
      phone: admin.phone || '',
      adminPassword: '',
    });
    setShowEditPassword(false);
    setEditErrors({});
    setIsEditModalOpen(true);
  };

  const handleEditAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    const errors = validateEditForm(editFormData);
    setEditErrors(errors);
    if (Object.keys(errors).length > 0) {
      toast.error('Please fix the highlighted fields');
      return;
    }
    setSubmitting(true);
    try {
      await apiClient.put(`/institution/${selectedInst!.id}/admin`, {
        ...editFormData,
        institutionName: editFormData.institutionName.trim(),
        adminFirstName: editFormData.adminFirstName.trim(),
        adminLastName: editFormData.adminLastName.trim(),
        adminEmail: editFormData.adminEmail.trim().toLowerCase(),
        phone: editFormData.phone.trim(),
        ...(editFormData.adminPassword.trim() ? { adminPassword: editFormData.adminPassword.trim() } : {}),
      });
      toast.success(
        editFormData.adminPassword.trim() ? 'Admin profile and password updated successfully!' : 'Admin profile updated successfully!'
      );
      setIsEditModalOpen(false);
      fetchPaginatedInstitutions();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to update admin profile');
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleStatus = async () => {
    if (!statusTarget) return;
    const nextIsActive = !statusTarget.isActive;
    setStatusToggling(true);
    try {
      await apiClient.patch(`/institution/${statusTarget.id}/status`, { isActive: nextIsActive });
      toast.success(`"${statusTarget.name}" ${nextIsActive ? 'activated' : 'suspended'} successfully`);
      setStatusTarget(null);
      fetchSuperAdminMetrics();
      fetchPaginatedInstitutions();
    } catch (err: any) {
      toast.error(err.response?.data?.message || `Failed to ${nextIsActive ? 'activate' : 'suspend'} institution`);
    } finally {
      setStatusToggling(false);
    }
  };

  const handleDeleteInstitution = async () => {
    if (!deleteTarget || deleteConfirmText.trim() !== deleteTarget.name) return;
    setDeleting(true);
    try {
      await apiClient.delete(`/institution/${deleteTarget.id}`);
      toast.success(`"${deleteTarget.name}" and all its data have been permanently deleted`);
      setDeleteTarget(null);
      setDeleteConfirmText('');
      fetchSuperAdminMetrics();
      fetchPaginatedInstitutions();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to delete institution');
    } finally {
      setDeleting(false);
    }
  };

  if (loading) return <DashboardSkeleton />;
  if (loadError) return <ErrorState onRetry={fetchData} message="Could not load platform metrics." />;

  const columns: Column<Institution>[] = [
    {
      key: 'name', header: 'Institution', accessor: 'name', primary: true, sortable: true,
      render: (inst) => (
        <div>
          <p className="font-bold text-slate-900 dark:text-white">{inst.name}</p>
          {inst.slug.toLowerCase().includes('demo') && <Badge variant="warning" className="mt-0.5">Demo data</Badge>}
        </div>
      ),
    },
    { key: 'slug', header: 'EIIN / Code', accessor: 'slug', render: (inst) => <span className="font-mono text-blue-600 dark:text-blue-400 font-bold">{inst.slug}</span> },
    {
      key: 'admin', header: 'Administrator',
      render: (inst) => {
        const admin = inst.users?.[0];
        return admin ? (
          <div>
            <p className="font-semibold text-slate-800 dark:text-slate-200">{admin.firstName} {admin.lastName}</p>
            <p className="text-[11px] text-slate-400">{admin.email}</p>
          </div>
        ) : <span className="text-slate-400 italic">No admin assigned</span>;
      },
    },
    { key: 'users', header: 'Users', align: 'center', hideOnMobile: true, render: (inst) => inst._count?.users || 0 },
    { key: 'students', header: 'Students', align: 'center', render: (inst) => inst._count?.students || 0 },
    {
      key: 'status', header: 'Status',
      render: (inst) => (
        <button type="button" onClick={() => setStatusTarget(inst)}>
          <Badge variant={inst.isActive ? 'success' : 'danger'}>{inst.isActive ? 'Active' : 'Suspended'}</Badge>
        </button>
      ),
    },
    { key: 'createdAt', header: 'Registered', hideOnMobile: true, render: (inst) => formatDate(inst.createdAt) },
  ];

  const rowActions: RowAction<Institution>[] = [
    { label: 'Details', icon: 'view', onClick: (inst) => { setSelectedInst(inst); setIsDetailsModalOpen(true); } },
    { label: 'Edit Profile', icon: 'edit', onClick: handleOpenEditModal },
    { label: 'Support Access', onClick: (inst) => navigate('/super-admin/support-access', { state: { institutionId: inst.id, institution: inst } }) },
    { label: 'Delete', icon: 'delete', variant: 'danger', onClick: (inst) => { setDeleteTarget(inst); setDeleteConfirmText(''); } },
  ];

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      <PageHeader
        title="SaaS Super Admin Control Center"
        description="Platform administration, multi-tenant monitoring, customer support access, and security controls."
        actions={
          <>
            <Button id="support-access-btn" variant="secondary" leftIcon={<LifeBuoy className="w-4 h-4" />} onClick={() => navigate('/super-admin/support-access')}>
              {t('Support Access')}
            </Button>
            <Button id="register-institution-btn" leftIcon={<Plus className="w-4 h-4" />} onClick={() => setIsWizardOpen(true)}>
              {t('Register Institution')}
            </Button>
          </>
        }
      />

      {metrics.systemAlerts && metrics.systemAlerts.length > 0 && (
        <div className="p-4 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 rounded-2xl flex items-center gap-3">
          <ShieldAlert className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0" />
          <span className="text-xs font-bold text-amber-900 dark:text-amber-200">{metrics.systemAlerts[0].message}</span>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Institutions" value={metrics.totalInstitutions} icon={<Building2 />} tone="primary" hint={`${metrics.activeInstitutions} active / ${metrics.suspendedInstitutions} suspended`} />
        <StatCard label="Global Users" value={metrics.totalUsers} icon={<Users />} tone="info" hint="Platform accounts" />
        <StatCard label="Total Students" value={metrics.totalStudents} icon={<GraduationCap />} tone="success" hint="Enrolled learners" />
        <StatCard label="Recent Registrations" value={metrics.recentRegistrations} icon={<Activity />} tone="accent" hint="Last 30 days" />
      </div>

      <div className="glass-card p-4 sm:p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
            Managed Institutions
            <Badge variant="neutral">Total: {paginationMeta.total}</Badge>
          </h3>
        </div>
        <DataTable
          data={institutions}
          columns={columns}
          actions={rowActions}
          isLoading={tableLoading}
          serverPagination
          totalCount={paginationMeta.total}
          page={page}
          onPageChange={setPage}
          onSearch={setSearchQuery}
          serverSearch
          searchPlaceholder="Search by name, code, admin..."
          toolbar={
            <div className="flex items-center gap-2">
              <select
                value={statusFilter}
                onChange={(e) => { setStatusFilter(e.target.value as any); setPage(1); }}
                className="input-field text-xs py-2 w-32"
              >
                <option value="ALL">All Statuses</option>
                <option value="ACTIVE">Active</option>
                <option value="SUSPENDED">Suspended</option>
              </select>
              <label className="flex items-center gap-2 text-xs font-semibold text-slate-600 dark:text-slate-400 cursor-pointer bg-slate-100 dark:bg-slate-800 px-3 py-2 rounded-xl">
                <input
                  type="checkbox"
                  checked={hideTest}
                  onChange={(e) => { setHideTest(e.target.checked); setPage(1); }}
                  className="w-3.5 h-3.5 text-blue-600 rounded-sm"
                />
                <span>Hide Demo/Test</span>
              </label>
            </div>
          }
          emptyTitle="No institutions found"
          emptyDescription="No institutions match the current filters."
        />
      </div>

      <RegistrationWizard isOpen={isWizardOpen} onClose={() => setIsWizardOpen(false)} onSuccess={() => fetchData()} />

      {isDetailsModalOpen && selectedInst && (
        <Modal isOpen onClose={() => setIsDetailsModalOpen(false)} className="max-w-lg space-y-6">
          <div className="flex justify-between items-center pb-4 border-b border-slate-200 dark:border-white/5">
            <div>
              <h3 className="text-xl font-bold text-slate-900 dark:text-white">{selectedInst.name}</h3>
              <p className="text-xs font-mono text-blue-600 dark:text-blue-400">EIIN / Code: {selectedInst.slug}</p>
            </div>
          </div>
          <div className="space-y-3 text-xs">
            <div className="p-4 bg-slate-50 dark:bg-slate-950 rounded-2xl space-y-2">
              <span className="font-bold text-slate-400 uppercase tracking-wider block">Administrator Account</span>
              {selectedInst.users?.[0] ? (
                <div>
                  <p className="font-bold text-slate-900 dark:text-white text-sm">{selectedInst.users[0].firstName} {selectedInst.users[0].lastName}</p>
                  <p className="text-slate-500">{selectedInst.users[0].email}</p>
                  {selectedInst.users[0].phone && <p className="text-slate-500">Phone: {selectedInst.users[0].phone}</p>}
                </div>
              ) : <p className="italic text-slate-500">No admin profile created.</p>}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="p-3 bg-slate-50 dark:bg-slate-950 rounded-xl">
                <span className="text-slate-400 font-bold block">Enrolled Users</span>
                <span className="text-base font-black text-slate-900 dark:text-white">{selectedInst._count?.users || 0}</span>
              </div>
              <div className="p-3 bg-slate-50 dark:bg-slate-950 rounded-xl">
                <span className="text-slate-400 font-bold block">Enrolled Students</span>
                <span className="text-base font-black text-slate-900 dark:text-white">{selectedInst._count?.students || 0}</span>
              </div>
            </div>
          </div>
          <div className="flex justify-end pt-4 border-t border-slate-200 dark:border-white/5">
            <Button variant="secondary" onClick={() => setIsDetailsModalOpen(false)}>Close</Button>
          </div>
        </Modal>
      )}

      {isEditModalOpen && selectedInst && (
        <Modal isOpen onClose={() => setIsEditModalOpen(false)} className="max-w-lg space-y-6">
          <div className="pb-4 border-b border-slate-200 dark:border-white/5">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">Edit Administrator Profile</h3>
            <p className="text-xs text-slate-500 font-mono">{selectedInst.name} ({selectedInst.slug})</p>
          </div>
          <form onSubmit={handleEditAdmin} className="space-y-4">
            <Input label="Institution Name" value={editFormData.institutionName} error={editErrors.institutionName}
              onChange={(e) => setEditFormData({ ...editFormData, institutionName: e.target.value })} />
            <div className="grid grid-cols-2 gap-4">
              <Input label="First Name" value={editFormData.adminFirstName} error={editErrors.adminFirstName}
                onChange={(e) => setEditFormData({ ...editFormData, adminFirstName: e.target.value })} />
              <Input label="Last Name" value={editFormData.adminLastName} error={editErrors.adminLastName}
                onChange={(e) => setEditFormData({ ...editFormData, adminLastName: e.target.value })} />
            </div>
            <Input label="Email Address" type="email" leftIcon={<Mail className="w-4 h-4" />} value={editFormData.adminEmail} error={editErrors.adminEmail}
              onChange={(e) => setEditFormData({ ...editFormData, adminEmail: e.target.value })} />
            <Input label="Phone Number" leftIcon={<Phone className="w-4 h-4" />} value={editFormData.phone} error={editErrors.phone}
              onChange={(e) => setEditFormData({ ...editFormData, phone: e.target.value })} />

            <div className="p-4 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-white/5 rounded-2xl space-y-3">
              <div className="flex justify-between items-center">
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">Set New Password / Change Password</label>
                <button type="button" onClick={generateRandomPassword} className="text-[11px] font-bold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1">
                  <Wand2 className="w-3.5 h-3.5" /> Generate Password
                </button>
              </div>
              <Input
                type={showEditPassword ? 'text' : 'password'}
                leftIcon={<Lock className="w-4 h-4" />}
                rightSlot={
                  <button type="button" onClick={() => setShowEditPassword(!showEditPassword)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
                    {showEditPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                }
                value={editFormData.adminPassword}
                error={editErrors.adminPassword}
                placeholder="Leave blank to keep current password"
                onChange={(e) => setEditFormData({ ...editFormData, adminPassword: e.target.value })}
              />
              <span className="text-[10px] text-slate-500 block">
                Super Admin has total override authority to update this administrator's password at any time.
              </span>
            </div>

            <div className="flex justify-end pt-2">
              <Button type="submit" isLoading={submitting}>
                {submitting ? 'Saving Profile...' : 'Save Profile & Password'}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      <ConfirmModal
        isOpen={!!statusTarget}
        title={statusTarget?.isActive ? 'Suspend institution' : 'Activate institution'}
        message={
          statusTarget?.isActive
            ? `Suspend "${statusTarget?.name}"? Its portal will freeze immediately — all users will be locked out.`
            : `Activate "${statusTarget?.name}"? Its portal will unlock immediately.`
        }
        confirmLabel={statusTarget?.isActive ? 'Suspend' : 'Activate'}
        variant={statusTarget?.isActive ? 'danger' : 'info'}
        isLoading={statusToggling}
        onConfirm={handleToggleStatus}
        onCancel={() => setStatusTarget(null)}
      />

      {deleteTarget && (
        <Modal isOpen onClose={() => setDeleteTarget(null)} className="max-w-md space-y-4">
          <div className="flex items-start gap-3">
            <div className="p-2.5 bg-red-100 dark:bg-red-500/10 text-red-600 rounded-xl">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">Delete Institution Permanently</h3>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                Deleting <strong className="text-slate-900 dark:text-white">{deleteTarget.name}</strong> will remove all records across all tables.
              </p>
            </div>
          </div>
          <Input
            label={<>Type <span className="font-mono text-red-600">{deleteTarget.name}</span> to confirm</>}
            value={deleteConfirmText}
            placeholder={deleteTarget.name}
            onChange={(e) => setDeleteConfirmText(e.target.value)}
          />
          <div className="flex justify-end gap-3 pt-4 border-t border-slate-200 dark:border-white/5">
            <Button variant="ghost" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button
              variant="danger"
              disabled={deleteConfirmText.trim() !== deleteTarget.name}
              isLoading={deleting}
              onClick={handleDeleteInstitution}
            >
              Delete Permanently
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
};

export default SuperAdminDashboard;
