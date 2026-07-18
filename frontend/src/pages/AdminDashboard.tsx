import React, { useState, useEffect } from 'react';
import { Users, BookOpen, CircleDollarSign, GraduationCap, Building2, Plus, Shield, Globe, Mail, Lock, Phone, Eye, EyeOff } from 'lucide-react';
import { KpiCard } from '../components/Charts/KpiCard';
import apiClient from '../api/client';
import { useAuthStore } from '../store/authStore';
import toast from 'react-hot-toast';
import { DashboardSkeleton } from '../components/common/DashboardSkeleton';
import { EmptyState } from '../components/common/EmptyState';

const AdminDashboard = () => {
  const { user } = useAuthStore();
  const isSuperAdmin = user?.role === 'SUPER_ADMIN';

  // Regular Admin stats
  const [stats, setStats] = useState({
    totalStudents: 0,
    totalTeachers: 0,
    feeCollections: 0,
    attendanceAvg: 0
  });

  // Super Admin data
  const [institutions, setInstitutions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // New Institution Modal/Form State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    slug: '',
    adminEmail: '',
    adminPassword: '',
    adminFirstName: '',
    adminLastName: ''
  });
  
  // Edit Admin Credentials State
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [selectedInst, setSelectedInst] = useState<any>(null);
  const [editFormData, setEditFormData] = useState({
    institutionName: '',
    adminFirstName: '',
    adminLastName: '',
    adminEmail: '',
    phone: '',
    adminPassword: ''
  });

  const [submitting, setSubmitting] = useState(false);
  const [showCreatePassword, setShowCreatePassword] = useState(false);
  const [showEditPassword, setShowEditPassword] = useState(false);
  const [createErrors, setCreateErrors] = useState<Record<string, string>>({});
  const [editErrors, setEditErrors] = useState<Record<string, string>>({});

  const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const PHONE_REGEX = /^[0-9+\-\s()]{7,20}$/;

  const validateCreateForm = (data: typeof formData) => {
    const errors: Record<string, string> = {};
    if (data.name.trim().length < 2) errors.name = 'Institution name must be at least 2 characters';
    if (!/^\d+$/.test(data.slug)) errors.slug = 'Institution Code / EIIN must be numeric';
    if (!data.adminFirstName.trim()) errors.adminFirstName = 'First name is required';
    if (!data.adminLastName.trim()) errors.adminLastName = 'Last name is required';
    if (!EMAIL_REGEX.test(data.adminEmail.trim())) errors.adminEmail = 'Enter a valid email address';
    if (data.adminPassword.length < 6) errors.adminPassword = 'Password must be at least 6 characters';
    return errors;
  };

  const validateEditForm = (data: typeof editFormData) => {
    const errors: Record<string, string> = {};
    if (data.institutionName.trim().length < 2) errors.institutionName = 'Institution name must be at least 2 characters';
    if (!data.adminFirstName.trim()) errors.adminFirstName = 'First name is required';
    if (!data.adminLastName.trim()) errors.adminLastName = 'Last name is required';
    if (!EMAIL_REGEX.test(data.adminEmail.trim())) errors.adminEmail = 'Enter a valid email address';
    if (data.phone.trim() && !PHONE_REGEX.test(data.phone.trim())) errors.phone = 'Enter a valid phone number';
    if (data.adminPassword.trim() && data.adminPassword.trim().length < 6) {
      errors.adminPassword = 'Password must be at least 6 characters, or leave blank to keep the current one';
    }
    return errors;
  };

  const fetchData = async () => {
    try {
      setLoading(true);
      if (isSuperAdmin) {
        // Fetch all institutions for Super Admin
        const res = await apiClient.get('/institution');
        setInstitutions(res.data.data || []);
      } else {
        // Fetch standard dashboard stats for regular Admin.
        // Use meta.total (not array length) for counts — the students/users
        // endpoints are paginated, so a fetched page's length undercounts
        // once an institution has more records than the default page size.
        const [studentsRes, teachersRes, paidInvoicesRes, insightsRes] = await Promise.all([
          apiClient.get('/students', { params: { pageSize: 1 } }).catch(() => ({ data: { meta: { total: 0 } } })),
          apiClient.get('/users', { params: { role: 'TEACHER', pageSize: 1 } }).catch(() => ({ data: { meta: { total: 0 } } })),
          apiClient.get('/fees/invoices', { params: { status: 'PAID', pageSize: 500 } }).catch(() => ({ data: { data: [] } })),
          apiClient.get('/ai/dashboard-insights').catch(() => ({ data: { data: { statistics: { attendanceAvg: 0 } } } }))
        ]);

        const paidInvoices = paidInvoicesRes.data?.data || [];

        // Prisma Decimal fields serialize as strings over JSON — Number()
        // them before summing, or `+=` silently does string concatenation.
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

  const handleCreateInstitution = async (e: React.FormEvent) => {
    e.preventDefault();
    const errors = validateCreateForm(formData);
    setCreateErrors(errors);
    if (Object.keys(errors).length > 0) {
      toast.error('Please fix the highlighted fields');
      return;
    }
    setSubmitting(true);
    try {
      await apiClient.post('/institution', {
        ...formData,
        name: formData.name.trim(),
        adminEmail: formData.adminEmail.trim().toLowerCase(),
        adminFirstName: formData.adminFirstName.trim(),
        adminLastName: formData.adminLastName.trim(),
      });
      toast.success('Institution and Admin registered successfully!');
      setIsModalOpen(false);
      setCreateErrors({});
      setFormData({
        name: '',
        slug: '',
        adminEmail: '',
        adminPassword: '',
        adminFirstName: '',
        adminLastName: ''
      });
      fetchData();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to register institution');
    } finally {
      setSubmitting(false);
    }
  };

  const handleOpenEditModal = (inst: any) => {
    setSelectedInst(inst);
    const admin = inst.users?.[0] || {};
    setEditFormData({
      institutionName: inst.name || '',
      adminFirstName: admin.firstName || '',
      adminLastName: admin.lastName || '',
      adminEmail: admin.email || '',
      phone: admin.phone || '',
      adminPassword: ''
    });
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
      await apiClient.put(`/institution/${selectedInst.id}/admin`, {
        ...editFormData,
        institutionName: editFormData.institutionName.trim(),
        adminFirstName: editFormData.adminFirstName.trim(),
        adminLastName: editFormData.adminLastName.trim(),
        adminEmail: editFormData.adminEmail.trim().toLowerCase(),
        phone: editFormData.phone.trim(),
      });
      toast.success('Admin credentials updated successfully!');
      setIsEditModalOpen(false);
      fetchData();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to update credentials');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <DashboardSkeleton />;
  }

  // ── SUPER ADMIN DASHBOARD VIEW ─────────────────────────────────────────────
  if (isSuperAdmin) {
    return (
      <div className="space-y-8 max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 glass-card p-6 relative overflow-hidden bg-white/40 dark:bg-slate-900/40 animate-fadeIn" style={{ animationDelay: '0ms' }}>
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 to-emerald-500 opacity-50"></div>
          <div>
            <h2 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight">SaaS Super Admin Panel</h2>
            <p className="text-slate-600 dark:text-slate-400 mt-2 text-sm leading-relaxed max-w-lg">
              Manage institutions, view overall status, and create new sub-institutions with dedicated administrators.
            </p>
          </div>
          <button
            onClick={() => setIsModalOpen(true)}
            className="flex-shrink-0 flex items-center justify-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white px-6 py-3 rounded-2xl transition-all shadow-xl shadow-blue-500/20 text-sm font-bold active:scale-[0.98]"
          >
            <Plus className="w-5 h-5" />
            Register Institution
          </button>
        </div>

        {/* Overview Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <KpiCard
            title="Total Registered Institutes"
            value={institutions.length}
            trend="up"
            trendValue="SaaS Scope"
            icon={<Building2 className="w-6 h-6" />}
            color="indigo"
          />
          <KpiCard
            title="Active Institutes"
            value={institutions.filter(inst => inst.isActive).length}
            trend="up"
            trendValue="Live"
            icon={<Globe className="w-6 h-6" />}
            color="teal"
          />
          <KpiCard
            title="Global SaaS Power"
            value="Super"
            trend="up"
            trendValue="No Scopes"
            icon={<Shield className="w-6 h-6" />}
            color="amber"
          />
        </div>

        {/* Institutions Table */}
        <div className="glass-card overflow-hidden bg-slate-50 dark:bg-slate-900/20 animate-fadeIn" style={{ animationDelay: '120ms' }}>
          <div className="p-6 border-b border-slate-200 dark:border-white/5 flex items-center justify-between">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">Registered Institutions</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-white/5 bg-slate-100 dark:bg-slate-900/40 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  <th className="p-4 pl-6">Institution Name</th>
                  <th className="p-4">Institution Code (Slug / EIIN)</th>
                  <th className="p-4">Users Count</th>
                  <th className="p-4">Students Count</th>
                  <th className="p-4">Status</th>
                  <th className="p-4">Registered Date</th>
                  <th className="p-4 pr-6 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-white/5 text-sm text-slate-700 dark:text-slate-300">
                {institutions.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-slate-500 italic">No institutions found. Click "Register Institution" to add one.</td>
                  </tr>
                ) : (
                  institutions.map(inst => (
                    <tr key={inst.id} className="border-b border-slate-200 dark:border-white/5 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors">
                      <td className="p-4 pl-6 font-semibold text-slate-900 dark:text-white">{inst.name}</td>
                      <td className="p-4 font-mono text-xs text-blue-600 dark:text-blue-400">{inst.slug}</td>
                      <td className="p-4">{inst._count?.users || 0}</td>
                      <td className="p-4">{inst._count?.students || 0}</td>
                      <td className="p-4">
                        <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${inst.isActive ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/20' : 'bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-500/20'}`}>
                          {inst.isActive ? 'Active' : 'Suspended'}
                        </span>
                      </td>
                      <td className="p-4 text-xs text-slate-500 dark:text-slate-400">
                        {new Date(inst.createdAt).toLocaleDateString()}
                      </td>
                      <td className="p-4 pr-6 text-right">
                        <button
                          onClick={() => handleOpenEditModal(inst)}
                          className="text-xs font-bold text-blue-600 dark:text-blue-400 hover:text-white bg-blue-50 dark:bg-blue-500/10 hover:bg-blue-600 border border-blue-200 dark:border-blue-500/20 hover:border-transparent px-3 py-1.5 rounded-xl transition-all shadow-sm"
                        >
                          View/Edit Admin
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Register Modal */}
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setIsModalOpen(false)} />
            <div className="relative glass-card w-full max-w-2xl p-8 bg-white dark:bg-slate-900/95 shadow-2xl animate-fadeIn max-h-[95vh] overflow-y-auto">
              <div className="flex justify-between items-center mb-6 pb-4 border-b border-slate-200 dark:border-white/5">
                <h3 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-3">
                  <div className="p-2 bg-blue-50 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400 rounded-xl">
                    <Building2 className="w-6 h-6" />
                  </div>
                  Register Sub-Institution
                </h3>
                <button
                  onClick={() => setIsModalOpen(false)}
                  className="p-2 text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/5 rounded-xl transition-all"
                >
                  <Plus className="w-6 h-6 rotate-45" />
                </button>
              </div>

              <form onSubmit={handleCreateInstitution} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">Institution Name</label>
                    <input
                      type="text"
                      name="organization"
                      autoComplete="organization"
                      required
                      value={formData.name}
                      onChange={e => setFormData({ ...formData, name: e.target.value })}
                      placeholder="e.g. Mirpur Cadet School"
                      className={`input-field ${createErrors.name ? 'border-red-500 focus:ring-red-500' : ''}`}
                    />
                    {createErrors.name && <span className="text-[11px] text-red-500 mt-1 block">{createErrors.name}</span>}
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">Institution Code (EIIN / Slug)</label>
                    <input
                      type="text"
                      name="organization-id"
                      autoComplete="off"
                      required
                      pattern="[0-9]*"
                      value={formData.slug}
                      onChange={e => setFormData({ ...formData, slug: e.target.value.replace(/\D/g, '') })}
                      placeholder="e.g. 102030"
                      className={`input-field font-mono ${createErrors.slug ? 'border-red-500 focus:ring-red-500' : ''}`}
                    />
                    {createErrors.slug && <span className="text-[11px] text-red-500 mt-1 block">{createErrors.slug}</span>}
                  </div>
                </div>

                <div className="p-5 bg-slate-50 dark:bg-slate-950/40 rounded-2xl border border-slate-200 dark:border-white/5 space-y-4">
                  <h4 className="text-sm font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wider">Sub-Institution Administrator Account</h4>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 dark:text-slate-400 mb-1.5">First Name</label>
                      <input
                        type="text"
                        name="given-name"
                        autoComplete="given-name"
                        required
                        value={formData.adminFirstName}
                        onChange={e => setFormData({ ...formData, adminFirstName: e.target.value })}
                        placeholder="Admin First Name"
                        className={`input-field ${createErrors.adminFirstName ? 'border-red-500 focus:ring-red-500' : ''}`}
                      />
                      {createErrors.adminFirstName && <span className="text-[11px] text-red-500 mt-1 block">{createErrors.adminFirstName}</span>}
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 dark:text-slate-400 mb-1.5">Last Name</label>
                      <input
                        type="text"
                        name="family-name"
                        autoComplete="family-name"
                        required
                        value={formData.adminLastName}
                        onChange={e => setFormData({ ...formData, adminLastName: e.target.value })}
                        placeholder="Admin Last Name"
                        className={`input-field ${createErrors.adminLastName ? 'border-red-500 focus:ring-red-500' : ''}`}
                      />
                      {createErrors.adminLastName && <span className="text-[11px] text-red-500 mt-1 block">{createErrors.adminLastName}</span>}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 dark:text-slate-400 mb-1.5">Email Address</label>
                      <div className="relative">
                        <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-slate-500" />
                        <input
                          type="email"
                          name="email"
                          autoComplete="email"
                          required
                          value={formData.adminEmail}
                          onChange={e => setFormData({ ...formData, adminEmail: e.target.value })}
                          placeholder="admin@school.com"
                          className={`input-field pl-10 ${createErrors.adminEmail ? 'border-red-500 focus:ring-red-500' : ''}`}
                        />
                      </div>
                      {createErrors.adminEmail && <span className="text-[11px] text-red-500 mt-1 block">{createErrors.adminEmail}</span>}
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 dark:text-slate-400 mb-1.5">Password</label>
                      <div className="relative">
                        <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-slate-500" />
                        <input
                          type={showCreatePassword ? 'text' : 'password'}
                          name="new-password"
                          autoComplete="new-password"
                          required
                          value={formData.adminPassword}
                          onChange={e => setFormData({ ...formData, adminPassword: e.target.value })}
                          placeholder="Password (Min 6 chars)"
                          className={`input-field pl-10 pr-10 ${createErrors.adminPassword ? 'border-red-500 focus:ring-red-500' : ''}`}
                        />
                        <button
                          type="button"
                          onClick={() => setShowCreatePassword(!showCreatePassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300 focus:outline-none transition-colors"
                          title={showCreatePassword ? 'Hide password' : 'Show password'}
                        >
                          {showCreatePassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                      {createErrors.adminPassword && <span className="text-[11px] text-red-500 mt-1 block">{createErrors.adminPassword}</span>}
                    </div>
                  </div>
                </div>

                <div className="flex justify-end gap-4 pt-4 border-t border-slate-200 dark:border-white/5">
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="px-6 py-3 rounded-2xl text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-all text-sm font-bold"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold py-3 px-8 rounded-2xl transition-all shadow-xl shadow-blue-500/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 text-sm"
                  >
                    {submitting ? 'Registering...' : 'Register & Create Admin'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Edit Admin Modal */}
        {isEditModalOpen && selectedInst && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <div className="w-full max-w-lg bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl border border-slate-200 dark:border-white/10 rounded-3xl p-8 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
              <div className="flex justify-between items-center mb-6 pb-4 border-b border-slate-200 dark:border-white/5">
                <h3 className="text-xl font-bold text-slate-900 dark:text-white flex flex-col">
                  <span>View / Edit Administrator</span>
                  <span className="text-xs text-slate-600 dark:text-slate-400 font-medium mt-1 font-mono">Institution: {selectedInst.name} ({selectedInst.slug})</span>
                </h3>
                <button
                  onClick={() => setIsEditModalOpen(false)}
                  className="p-2 text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/5 rounded-xl transition-all"
                >
                  <Plus className="w-6 h-6 rotate-45" />
                </button>
              </div>

              <form onSubmit={handleEditAdmin} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">Institution Name</label>
                  <input
                    type="text"
                    name="organization"
                    autoComplete="organization"
                    required
                    value={editFormData.institutionName}
                    onChange={e => setEditFormData({ ...editFormData, institutionName: e.target.value })}
                    className={`input-field ${editErrors.institutionName ? 'border-red-500 focus:ring-red-500' : ''}`}
                    placeholder="e.g. Government Science College School"
                  />
                  {editErrors.institutionName && <span className="text-[11px] text-red-500 mt-1 block">{editErrors.institutionName}</span>}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">First Name</label>
                    <input
                      type="text"
                      name="given-name"
                      autoComplete="given-name"
                      required
                      value={editFormData.adminFirstName}
                      onChange={e => setEditFormData({ ...editFormData, adminFirstName: e.target.value })}
                      className={`input-field ${editErrors.adminFirstName ? 'border-red-500 focus:ring-red-500' : ''}`}
                    />
                    {editErrors.adminFirstName && <span className="text-[11px] text-red-500 mt-1 block">{editErrors.adminFirstName}</span>}
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">Last Name</label>
                    <input
                      type="text"
                      name="family-name"
                      autoComplete="family-name"
                      required
                      value={editFormData.adminLastName}
                      onChange={e => setEditFormData({ ...editFormData, adminLastName: e.target.value })}
                      className={`input-field ${editErrors.adminLastName ? 'border-red-500 focus:ring-red-500' : ''}`}
                    />
                    {editErrors.adminLastName && <span className="text-[11px] text-red-500 mt-1 block">{editErrors.adminLastName}</span>}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">Email Address</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-slate-500" />
                    <input
                      type="email"
                      name="email"
                      autoComplete="email"
                      required
                      value={editFormData.adminEmail}
                      onChange={e => setEditFormData({ ...editFormData, adminEmail: e.target.value })}
                      className={`input-field pl-9 ${editErrors.adminEmail ? 'border-red-500 focus:ring-red-500' : ''}`}
                    />
                  </div>
                  {editErrors.adminEmail && <span className="text-[11px] text-red-500 mt-1 block">{editErrors.adminEmail}</span>}
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">Phone Number</label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-slate-500" />
                    <input
                      type="text"
                      name="tel"
                      autoComplete="tel"
                      value={editFormData.phone}
                      onChange={e => setEditFormData({ ...editFormData, phone: e.target.value })}
                      className={`input-field pl-9 ${editErrors.phone ? 'border-red-500 focus:ring-red-500' : ''}`}
                      placeholder="e.g. 017000000"
                    />
                  </div>
                  {editErrors.phone && <span className="text-[11px] text-red-500 mt-1 block">{editErrors.phone}</span>}
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">Upgrade Password</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-slate-500" />
                    <input
                      type={showEditPassword ? 'text' : 'password'}
                      name="new-password"
                      autoComplete="new-password"
                      value={editFormData.adminPassword}
                      onChange={e => setEditFormData({ ...editFormData, adminPassword: e.target.value })}
                      placeholder="Leave blank to keep current password"
                      className={`input-field pl-9 pr-10 ${editErrors.adminPassword ? 'border-red-500 focus:ring-red-500' : ''}`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowEditPassword(!showEditPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:text-slate-500 hover:dark:text-slate-300 focus:outline-none transition-colors"
                      title={showEditPassword ? 'Hide password' : 'Show password'}
                    >
                      {showEditPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  {editErrors.adminPassword && <span className="text-[11px] text-red-500 mt-1 block">{editErrors.adminPassword}</span>}
                  <span className="text-[10px] text-slate-500 mt-1 block">Super Admin has the override authority to update this admin's credentials at any time.</span>
                </div>

                <div className="flex justify-end gap-4 pt-4 border-t border-slate-200 dark:border-white/5">
                  <button
                    type="button"
                    onClick={() => setIsEditModalOpen(false)}
                    className="px-5 py-2.5 rounded-xl text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-all text-xs font-bold"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="bg-blue-600 hover:bg-blue-500 text-white font-bold py-2.5 px-6 rounded-xl transition-all shadow-lg shadow-blue-500/20 disabled:opacity-50 text-xs flex items-center gap-2"
                  >
                    {submitting ? 'Updating...' : 'Save Credentials'}
                  </button>
                </div>
              </form>
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
