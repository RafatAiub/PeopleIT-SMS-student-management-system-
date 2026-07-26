import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Users, BookOpen, CircleDollarSign, GraduationCap, Building2, Plus, Shield, Globe,
  Mail, Lock, Phone, Eye, EyeOff, Search, Trash2, AlertTriangle, X, MoreVertical,
  LifeBuoy, KeyRound, UserX, RefreshCw, SlidersHorizontal, ArrowUpRight, Activity,
  ShieldAlert, CheckCircle2, ChevronLeft, ChevronRight, Copy, Wand2
} from 'lucide-react';
import { KpiCard } from '../components/Charts/KpiCard';
import apiClient from '../api/client';
import { useAuthStore } from '../store/authStore';
import toast from 'react-hot-toast';
import { DashboardSkeleton } from '../components/common/DashboardSkeleton';
import { EmptyState } from '../components/common/EmptyState';
import { RegistrationWizard } from '../components/superadmin/RegistrationWizard';

const AdminDashboard = () => {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const isSuperAdmin = user?.role === 'SUPER_ADMIN';

  // Regular Admin stats
  const [stats, setStats] = useState({
    totalStudents: 0,
    totalTeachers: 0,
    feeCollections: 0,
    attendanceAvg: 0
  });

  // Super Admin metrics & data
  const [metrics, setMetrics] = useState<any>({
    totalInstitutions: 0,
    activeInstitutions: 0,
    suspendedInstitutions: 0,
    totalUsers: 0,
    totalStudents: 0,
    recentRegistrations: 0,
    recentAuditLogs: [],
    systemAlerts: [],
  });

  const [institutions, setInstitutions] = useState<any[]>([]);
  const [paginationMeta, setPaginationMeta] = useState<any>({
    total: 0,
    page: 1,
    pageSize: 10,
    totalPages: 1,
  });

  const [loading, setLoading] = useState(true);
  const [tableLoading, setTableLoading] = useState(false);

  // Pagination & Filtering state
  const [page, setPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(10);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'SUSPENDED'>('ALL');
  const [hideTest, setHideTest] = useState<boolean>(true);

  // Modals & Action States
  const [isWizardOpen, setIsWizardOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
  const [selectedInst, setSelectedInst] = useState<any>(null);
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);

  const [editFormData, setEditFormData] = useState({
    institutionName: '',
    adminFirstName: '',
    adminLastName: '',
    adminEmail: '',
    phone: '',
    adminPassword: '',
  });

  const [showEditPassword, setShowEditPassword] = useState<boolean>(false);
  const [generatedResetUrl, setGeneratedResetUrl] = useState<string | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [actionProcessing, setActionProcessing] = useState(false);
  const [editErrors, setEditErrors] = useState<Record<string, string>>({});

  // Delete institution state
  const [deleteTarget, setDeleteTarget] = useState<any>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [statusTogglingId, setStatusTogglingId] = useState<string | null>(null);

  const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const PHONE_REGEX = /^[0-9+\-\s()]{7,20}$/;



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
    for (let i = 0; i < 10; i++) {
      pwd += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setEditFormData(prev => ({ ...prev, adminPassword: pwd }));
    setShowEditPassword(true);
    toast.success('Generated new password!');
  };

  const fetchSuperAdminMetrics = async () => {
    try {
      const res = await apiClient.get('/institution/super-admin/metrics');
      setMetrics(res.data.data);
    } catch (err) {
      console.error('Failed to fetch platform metrics', err);
    }
  };

  const fetchPaginatedInstitutions = async () => {
    try {
      setTableLoading(true);
      const res = await apiClient.get('/institution/super-admin/paginated', {
        params: {
          page,
          pageSize,
          q: searchQuery.trim(),
          status: statusFilter,
          hideTest: hideTest ? 'true' : 'false',
        },
      });
      setInstitutions(res.data.data || []);
      if (res.data.meta) {
        setPaginationMeta(res.data.meta);
      }
    } catch (err) {
      console.error('Failed to fetch paginated institutions', err);
      toast.error('Failed to load institutions list');
    } finally {
      setTableLoading(false);
    }
  };

  const fetchData = async () => {
    try {
      setLoading(true);
      if (isSuperAdmin) {
        await Promise.all([fetchSuperAdminMetrics(), fetchPaginatedInstitutions()]);
      } else {
        const [studentsRes, teachersRes, paidInvoicesRes, insightsRes] = await Promise.all([
          apiClient.get('/students', { params: { pageSize: 1 } }).catch(() => ({ data: { meta: { total: 0 } } })),
          apiClient.get('/users', { params: { role: 'TEACHER', pageSize: 1 } }).catch(() => ({ data: { meta: { total: 0 } } })),
          apiClient.get('/fees/invoices', { params: { status: 'PAID', pageSize: 500 } }).catch(() => ({ data: { data: [] } })),
          apiClient.get('/ai/dashboard-insights').catch(() => ({ data: { data: { statistics: { attendanceAvg: 0 } } } }))
        ]);

        const paidInvoices = paidInvoicesRes.data?.data || [];
        const totalFees = paidInvoices.reduce(
          (sum: number, inv: any) => sum + Number(inv.totalAmount || 0),
          0
        );

        const attendanceAvg = insightsRes.data?.data?.statistics?.attendanceAvg || 0;

        setStats({
          totalStudents: studentsRes.data?.meta?.total ?? 0,
          totalTeachers: teachersRes.data?.meta?.total ?? 0,
          feeCollections: totalFees,
          attendanceAvg: attendanceAvg
        });
      }
    } catch (err) {
      console.error('Failed to fetch dashboard stats', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [isSuperAdmin]);

  useEffect(() => {
    if (isSuperAdmin) {
      fetchPaginatedInstitutions();
    }
  }, [page, pageSize, statusFilter, hideTest]);

  // Debounced search trigger
  useEffect(() => {
    if (!isSuperAdmin) return;
    const timer = setTimeout(() => {
      setPage(1);
      fetchPaginatedInstitutions();
    }, 400);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const handleOpenEditModal = (inst: any) => {
    setSelectedInst(inst);
    const admin = inst.users?.[0] || {};
    setEditFormData({
      institutionName: inst.name || '',
      adminFirstName: admin.firstName || '',
      adminLastName: admin.lastName || '',
      adminEmail: admin.email || '',
      phone: admin.phone || '',
      adminPassword: '',
    });
    setShowEditPassword(false);
    setGeneratedResetUrl(null);
    setEditErrors({});
    setIsEditModalOpen(true);
    setActiveMenuId(null);
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
      await apiClient.put(`/institution/${selectedInst.id}/admin`, {
        ...editFormData,
        institutionName: editFormData.institutionName.trim(),
        adminFirstName: editFormData.adminFirstName.trim(),
        adminLastName: editFormData.adminLastName.trim(),
        adminEmail: editFormData.adminEmail.trim().toLowerCase(),
        phone: editFormData.phone.trim(),
        ...(editFormData.adminPassword.trim() ? { adminPassword: editFormData.adminPassword.trim() } : {}),
      });
      toast.success(
        editFormData.adminPassword.trim()
          ? 'Admin profile and password updated successfully!'
          : 'Admin profile updated successfully!'
      );
      setIsEditModalOpen(false);
      fetchPaginatedInstitutions();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to update admin profile');
    } finally {
      setSubmitting(false);
    }
  };



  const handleToggleStatus = async (inst: any) => {
    const nextIsActive = !inst.isActive;
    const verb = nextIsActive ? 'activate' : 'suspend';
    if (!window.confirm(`${nextIsActive ? 'Activate' : 'Suspend'} "${inst.name}"? ${nextIsActive ? 'Its portal will unlock immediately.' : 'Its portal will freeze immediately — all users will be locked out.'}`)) {
      return;
    }
    setStatusTogglingId(inst.id);
    setActiveMenuId(null);
    try {
      await apiClient.patch(`/institution/${inst.id}/status`, { isActive: nextIsActive });
      toast.success(`"${inst.name}" ${nextIsActive ? 'activated' : 'suspended'} successfully`);
      fetchSuperAdminMetrics();
      fetchPaginatedInstitutions();
    } catch (err: any) {
      toast.error(err.response?.data?.message || `Failed to ${verb} institution`);
    } finally {
      setStatusTogglingId(null);
    }
  };

  const handleOpenDeleteModal = (inst: any) => {
    setSelectedInst(inst);
    setDeleteTarget(inst);
    setDeleteConfirmText('');
    setActiveMenuId(null);
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

  if (loading) {
    return <DashboardSkeleton />;
  }

  // ── SUPER ADMIN DASHBOARD VIEW ─────────────────────────────────────────────
  if (isSuperAdmin) {
    return (
      <div className="space-y-8 max-w-7xl mx-auto pb-12">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 glass-card p-6 relative overflow-hidden bg-white/40 dark:bg-slate-900/40 animate-fadeIn">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 via-indigo-500 to-emerald-500 opacity-80" />
          <div>
            <h2 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight">SaaS Super Admin Control Center</h2>
            <p className="text-slate-600 dark:text-slate-400 mt-1 text-sm leading-relaxed max-w-xl">
              Platform administration, multi-tenant monitoring, customer support access, and security controls.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/super-admin/support-access')}
              className="flex items-center gap-2 bg-amber-500 hover:bg-amber-400 text-slate-950 px-4 py-2.5 rounded-2xl transition-all shadow-md font-bold text-xs min-h-[44px]"
            >
              <LifeBuoy className="w-4 h-4" />
              <span>Support Access</span>
            </button>

            <button
              onClick={() => setIsWizardOpen(true)}
              className="flex items-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white px-5 py-2.5 rounded-2xl transition-all shadow-xl shadow-blue-500/20 text-xs font-bold active:scale-[0.98] min-h-[44px]"
            >
              <Plus className="w-4.5 h-4.5" />
              <span>Register Institution</span>
            </button>
          </div>
        </div>

        {/* System Alerts */}
        {metrics.systemAlerts && metrics.systemAlerts.length > 0 && (
          <div className="p-4 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 rounded-2xl flex items-center justify-between gap-4 animate-fadeIn">
            <div className="flex items-center gap-3">
              <ShieldAlert className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0" />
              <span className="text-xs font-bold text-amber-900 dark:text-amber-200">
                {metrics.systemAlerts[0].message}
              </span>
            </div>
            <span className="text-[10px] font-mono uppercase bg-amber-200 dark:bg-amber-500/20 text-amber-900 dark:text-amber-200 px-2 py-0.5 rounded">
              Platform Alert
            </span>
          </div>
        )}

        {/* Overview KPI Metrics */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          <KpiCard
            title="Total Institutions"
            value={metrics.totalInstitutions}
            trend="up"
            trendValue={`${metrics.activeInstitutions} Active / ${metrics.suspendedInstitutions} Suspended`}
            icon={<Building2 className="w-6 h-6" />}
            color="indigo"
          />
          <KpiCard
            title="Global Users"
            value={metrics.totalUsers}
            trend="up"
            trendValue="Platform Accounts"
            icon={<Users className="w-6 h-6" />}
            color="teal"
          />
          <KpiCard
            title="Total Students"
            value={metrics.totalStudents}
            trend="up"
            trendValue="Enrolled Learners"
            icon={<GraduationCap className="w-6 h-6" />}
            color="amber"
          />
          <KpiCard
            title="Recent Registrations"
            value={metrics.recentRegistrations}
            trend="up"
            trendValue="Last 30 Days"
            icon={<Activity className="w-6 h-6" />}
            color="rose"
          />
        </div>

        {/* Institutions Data Table */}
        <div className="glass-card overflow-hidden bg-white/60 dark:bg-slate-900/40 border border-slate-200 dark:border-white/5 rounded-3xl shadow-xl animate-fadeIn">
          <div className="p-6 border-b border-slate-200 dark:border-white/5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div>
              <h3 className="text-lg font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                <span>Managed Institutions</span>
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-2.5 py-0.5 rounded-full">
                  Total: {paginationMeta.total}
                </span>
              </h3>
            </div>

            {/* Filter Controls */}
            <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
              <div className="relative flex-1 sm:w-64">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search by name, code, admin..."
                  className="input-field pl-10 text-xs py-2"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              <select
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value as any);
                  setPage(1);
                }}
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
                  onChange={(e) => {
                    setHideTest(e.target.checked);
                    setPage(1);
                  }}
                  className="w-3.5 h-3.5 text-blue-600 rounded"
                />
                <span>Hide Demo/Test</span>
              </label>
            </div>
          </div>

          <div className="overflow-x-auto min-h-[300px]">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-white/5 bg-slate-100/50 dark:bg-slate-900/60 text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  <th className="p-4 pl-6">Institution</th>
                  <th className="p-4">EIIN / Code</th>
                  <th className="p-4">Administrator</th>
                  <th className="p-4 text-center">Users</th>
                  <th className="p-4 text-center">Students</th>
                  <th className="p-4">Status</th>
                  <th className="p-4">Registered</th>
                  <th className="p-4 pr-6 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-white/5 text-xs text-slate-700 dark:text-slate-300">
                {tableLoading ? (
                  <tr>
                    <td colSpan={8} className="p-12 text-center text-slate-500">
                      <div className="flex items-center justify-center gap-2">
                        <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-blue-500" />
                        <span>Loading institutions...</span>
                      </div>
                    </td>
                  </tr>
                ) : institutions.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="p-12 text-center text-slate-500 italic">
                      No institutions found matching criteria.
                    </td>
                  </tr>
                ) : (
                  institutions.map((inst) => {
                    const admin = inst.users?.[0];
                    return (
                      <tr key={inst.id} className="border-b border-slate-200 dark:border-white/5 hover:bg-slate-50/50 dark:hover:bg-white/5 transition-colors">
                        <td className="p-4 pl-6 font-bold text-slate-900 dark:text-white">
                          <div>
                            <p>{inst.name}</p>
                            {inst.slug.toLowerCase().includes('demo') && (
                              <span className="text-[9px] font-mono uppercase bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300 px-1.5 py-0.2 rounded">
                                DEMO DATA
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="p-4 font-mono text-blue-600 dark:text-blue-400 font-bold">{inst.slug}</td>
                        <td className="p-4">
                          {admin ? (
                            <div>
                              <p className="font-semibold text-slate-800 dark:text-slate-200">{admin.firstName} {admin.lastName}</p>
                              <p className="text-[11px] text-slate-400">{admin.email}</p>
                            </div>
                          ) : <span className="text-slate-400 italic">No admin assigned</span>}
                        </td>
                        <td className="p-4 text-center font-semibold">{inst._count?.users || 0}</td>
                        <td className="p-4 text-center font-semibold">{inst._count?.students || 0}</td>
                        <td className="p-4">
                          <button
                            onClick={() => handleToggleStatus(inst)}
                            disabled={statusTogglingId === inst.id}
                            className={`px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-wider transition-all min-h-[32px] ${
                              inst.isActive
                                ? 'bg-emerald-50 text-emerald-600 border border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20'
                                : 'bg-red-50 text-red-600 border border-red-200 dark:bg-red-500/10 dark:text-red-400 dark:border-red-500/20'
                            }`}
                          >
                            {statusTogglingId === inst.id ? '...' : inst.isActive ? 'Active' : 'Suspended'}
                          </button>
                        </td>
                        <td className="p-4 text-slate-500">{new Date(inst.createdAt).toLocaleDateString()}</td>
                        <td className="p-4 pr-6 text-right relative">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => {
                                setSelectedInst(inst);
                                setIsDetailsModalOpen(true);
                              }}
                              className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold transition-all text-[11px] min-h-[36px]"
                            >
                              Details
                            </button>

                            <button
                              onClick={() => handleOpenEditModal(inst)}
                              className="px-2.5 py-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 dark:bg-blue-500/10 dark:hover:bg-blue-500/20 text-blue-600 dark:text-blue-400 font-bold transition-all text-[11px] min-h-[36px]"
                            >
                              Edit Profile
                            </button>

                            <button
                              onClick={() => navigate('/super-admin/support-access', { state: { institutionId: inst.id, institution: inst } })}
                              title={`Launch Support Access for ${inst.name}`}
                              className="p-2 rounded-lg bg-amber-50 hover:bg-amber-100 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400 transition-all min-h-[36px] min-w-[36px] flex items-center justify-center"
                            >
                              <LifeBuoy className="w-4 h-4" />
                            </button>

                            <button
                              onClick={() => handleOpenDeleteModal(inst)}
                              title="Delete Institution"
                              className="p-2 rounded-lg bg-red-50 hover:bg-red-100 dark:bg-red-500/10 text-red-600 dark:text-red-400 transition-all min-h-[36px] min-w-[36px] flex items-center justify-center"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination Footer */}
          <div className="p-4 border-t border-slate-200 dark:border-white/5 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs">
            <span className="text-slate-500">
              Showing Page {paginationMeta.page} of {paginationMeta.totalPages} ({paginationMeta.total} Total Institutions)
            </span>

            <div className="flex items-center gap-2">
              <button
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
                className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-white/10 disabled:opacity-40 font-bold flex items-center gap-1 min-h-[36px]"
              >
                <ChevronLeft className="w-4 h-4" /> Prev
              </button>
              <button
                disabled={page >= paginationMeta.totalPages}
                onClick={() => setPage(page + 1)}
                className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-white/10 disabled:opacity-40 font-bold flex items-center gap-1 min-h-[36px]"
              >
                Next <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Registration Wizard Component */}
        <RegistrationWizard
          isOpen={isWizardOpen}
          onClose={() => setIsWizardOpen(false)}
          onSuccess={() => fetchData()}
        />

        {/* View Details Drawer / Modal */}
        {isDetailsModalOpen && selectedInst && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
            <div className="w-full max-w-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6">
              <div className="flex justify-between items-center pb-4 border-b border-slate-200 dark:border-white/5">
                <div>
                  <h3 className="text-xl font-bold text-slate-900 dark:text-white">{selectedInst.name}</h3>
                  <p className="text-xs font-mono text-blue-600 dark:text-blue-400">EIIN / Code: {selectedInst.slug}</p>
                </div>
                <button onClick={() => setIsDetailsModalOpen(false)} className="p-2 text-slate-400 hover:text-slate-900 min-h-[44px]">
                  <X className="w-5 h-5" />
                </button>
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
                <button
                  onClick={() => setIsDetailsModalOpen(false)}
                  className="px-6 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 font-bold text-xs min-h-[44px]"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Refactored Edit Administrator Modal (No Direct Password Override) */}
        {isEditModalOpen && selectedInst && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
            <div className="w-full max-w-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6">
              <div className="flex justify-between items-center pb-4 border-b border-slate-200 dark:border-white/5">
                <div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white">Edit Administrator Profile</h3>
                  <p className="text-xs text-slate-500 font-mono">{selectedInst.name} ({selectedInst.slug})</p>
                </div>
                <button onClick={() => setIsEditModalOpen(false)} className="p-2 text-slate-400 hover:text-slate-900 min-h-[44px]">
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Profile Edit Form */}
              <form onSubmit={handleEditAdmin} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Institution Name</label>
                  <input
                    type="text"
                    value={editFormData.institutionName}
                    onChange={(e) => setEditFormData({ ...editFormData, institutionName: e.target.value })}
                    className="input-field text-xs"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">First Name</label>
                    <input
                      type="text"
                      value={editFormData.adminFirstName}
                      onChange={(e) => setEditFormData({ ...editFormData, adminFirstName: e.target.value })}
                      className="input-field text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Last Name</label>
                    <input
                      type="text"
                      value={editFormData.adminLastName}
                      onChange={(e) => setEditFormData({ ...editFormData, adminLastName: e.target.value })}
                      className="input-field text-xs"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Email Address</label>
                  <input
                    type="email"
                    value={editFormData.adminEmail}
                    onChange={(e) => setEditFormData({ ...editFormData, adminEmail: e.target.value })}
                    className="input-field text-xs"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Phone Number</label>
                  <input
                    type="text"
                    value={editFormData.phone}
                    onChange={(e) => setEditFormData({ ...editFormData, phone: e.target.value })}
                    className="input-field text-xs"
                  />
                </div>

                {/* Direct Password Override / Reset Field */}
                <div className="p-4 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-white/5 rounded-2xl space-y-3">
                  <div className="flex justify-between items-center">
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                      Set New Password / Change Password
                    </label>
                    <button
                      type="button"
                      onClick={generateRandomPassword}
                      className="text-[11px] font-bold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 min-h-[32px]"
                    >
                      <Wand2 className="w-3.5 h-3.5" /> Generate Password
                    </button>
                  </div>

                  <div className="relative">
                    <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type={showEditPassword ? 'text' : 'password'}
                      value={editFormData.adminPassword}
                      onChange={(e) => setEditFormData({ ...editFormData, adminPassword: e.target.value })}
                      placeholder="Leave blank to keep current password"
                      className={`input-field pl-10 pr-10 text-xs ${editErrors.adminPassword ? 'border-red-500' : ''}`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowEditPassword(!showEditPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 min-h-[32px] min-w-[32px] flex items-center justify-center"
                    >
                      {showEditPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  {editErrors.adminPassword && <span className="text-xs text-red-500 block">{editErrors.adminPassword}</span>}
                  <span className="text-[10px] text-slate-500 block">
                    Super Admin has total override authority to update this administrator's password at any time.
                  </span>
                </div>

                <div className="flex justify-end pt-2">
                  <button
                    type="submit"
                    disabled={submitting}
                    className="bg-blue-600 hover:bg-blue-500 text-white font-bold px-6 py-2.5 rounded-xl text-xs shadow-md transition-all min-h-[44px]"
                  >
                    {submitting ? 'Saving Profile...' : 'Save Profile & Password'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Delete Confirmation Modal */}
        {deleteTarget && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
            <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-red-200 dark:border-red-500/20 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-4">
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

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Type <span className="font-mono text-red-600">{deleteTarget.name}</span> to confirm
                </label>
                <input
                  type="text"
                  value={deleteConfirmText}
                  onChange={(e) => setDeleteConfirmText(e.target.value)}
                  placeholder={deleteTarget.name}
                  className="input-field text-xs"
                />
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-200 dark:border-white/5">
                <button
                  type="button"
                  onClick={() => setDeleteTarget(null)}
                  className="px-5 py-2.5 rounded-xl font-bold text-xs text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 min-h-[44px]"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={deleting || deleteConfirmText.trim() !== deleteTarget.name}
                  onClick={handleDeleteInstitution}
                  className="bg-red-600 hover:bg-red-500 text-white font-bold px-6 py-2.5 rounded-xl text-xs shadow-md disabled:opacity-40 min-h-[44px]"
                >
                  {deleting ? 'Deleting...' : 'Delete Permanently'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── STANDARD ADMIN DASHBOARD VIEW ──────────────────────────────────────────
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between animate-fadeIn" style={{ animationDelay: '0ms' }}>
        <div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">Admin Dashboard</h2>
          <p className="text-slate-600 dark:text-slate-400 mt-1">Welcome back. Here is today's overview.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 animate-fadeIn" style={{ animationDelay: '60ms' }}>
        <KpiCard
          title="Total Students"
          value={stats.totalStudents}
          trend="up"
          trendValue="Live"
          icon={<Users className="w-6 h-6" />}
          color="indigo"
        />
        <KpiCard
          title="Total Teachers"
          value={stats.totalTeachers}
          trend="up"
          trendValue="Live"
          icon={<BookOpen className="w-6 h-6" />}
          color="teal"
        />
        <KpiCard
          title="Fee Collections (Paid)"
          value={stats.feeCollections}
          trend="up"
          trendValue="Live"
          icon={<CircleDollarSign className="w-6 h-6" />}
          color="amber"
          prefix="৳"
        />
        <KpiCard
          title="Avg. Attendance"
          value={stats.attendanceAvg}
          trend="up"
          trendValue="Live"
          icon={<GraduationCap className="w-6 h-6" />}
          color="rose"
          suffix="%"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6 animate-fadeIn" style={{ animationDelay: '120ms' }}>
        <div className="glass-card p-6">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Recent Admissions</h3>
          <EmptyState 
            title="No recent admissions" 
            description="No recent admission data to display." 
            icon={<Users className="w-10 h-10 text-slate-400 dark:text-slate-500" />} 
          />
        </div>
        
        <div className="glass-card p-6">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Upcoming Fee Deadlines</h3>
          <EmptyState 
            title="Up to date" 
            description="All fees are up to date." 
            icon={<CircleDollarSign className="w-10 h-10 text-slate-400 dark:text-slate-500" />} 
          />
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;
