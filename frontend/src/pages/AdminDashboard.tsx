import React, { useState, useEffect } from 'react';
import { Users, BookOpen, CircleDollarSign, GraduationCap, Building2, Plus, Shield, Globe, Mail, Lock, Phone } from 'lucide-react';
import { KpiCard } from '../components/Charts/KpiCard';
import apiClient from '../api/client';
import { useAuthStore } from '../store/authStore';
import toast from 'react-hot-toast';

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
    adminFirstName: '',
    adminLastName: '',
    adminEmail: '',
    phone: '',
    adminPassword: ''
  });

  const [submitting, setSubmitting] = useState(false);

  const fetchData = async () => {
    try {
      setLoading(true);
      if (isSuperAdmin) {
        // Fetch all institutions for Super Admin
        const res = await apiClient.get('/institution');
        setInstitutions(res.data.data || []);
      } else {
        // Fetch standard dashboard stats for regular Admin
        const [studentsRes, usersRes, invoicesRes, insightsRes] = await Promise.all([
          apiClient.get('/students').catch(() => ({ data: { data: [] } })),
          apiClient.get('/users').catch(() => ({ data: { data: [] } })),
          apiClient.get('/fees/invoices').catch(() => ({ data: { data: [] } })),
          apiClient.get('/ai/dashboard-insights').catch(() => ({ data: { data: { statistics: { attendanceAvg: 0 } } } }))
        ]);

        const students = studentsRes.data?.data || [];
        const users = usersRes.data?.data || [];
        const invoices = invoicesRes.data?.data || [];
        
        const teachers = users.filter((u: any) => u.role === 'TEACHER');
        
        let totalFees = 0;
        invoices.forEach((inv: any) => {
          if (inv.status === 'PAID') {
            totalFees += inv.totalAmount;
          }
        });

        const attendanceAvg = insightsRes.data?.data?.statistics?.attendanceAvg || 0;

        setStats({
          totalStudents: students.length,
          totalTeachers: teachers.length,
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
    setSubmitting(true);
    try {
      await apiClient.post('/institution', formData);
      toast.success('Institution and Admin registered successfully!');
      setIsModalOpen(false);
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
      adminFirstName: admin.firstName || '',
      adminLastName: admin.lastName || '',
      adminEmail: admin.email || '',
      phone: admin.phone || '',
      adminPassword: ''
    });
    setIsEditModalOpen(true);
  };

  const handleEditAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await apiClient.put(`/institution/${selectedInst.id}/admin`, editFormData);
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
    return <div className="text-slate-400 p-8 text-center">Loading dashboard...</div>;
  }

  // ── SUPER ADMIN DASHBOARD VIEW ─────────────────────────────────────────────
  if (isSuperAdmin) {
    return (
      <div className="space-y-8 max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 glass p-6 rounded-3xl border border-white/5 bg-slate-900/40 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 to-emerald-500 opacity-50"></div>
          <div>
            <h2 className="text-3xl font-black text-white tracking-tight">SaaS Super Admin Panel</h2>
            <p className="text-slate-400 mt-2 text-sm leading-relaxed max-w-lg">
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
        <div className="glass rounded-3xl border border-white/5 overflow-hidden shadow-xl bg-slate-900/20">
          <div className="p-6 border-b border-white/5 flex items-center justify-between">
            <h3 className="text-lg font-bold text-white">Registered Institutions</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-white/5 bg-slate-900/40 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  <th className="p-4 pl-6">Institution Name</th>
                  <th className="p-4">Institution Code (Slug / EIIN)</th>
                  <th className="p-4">Users Count</th>
                  <th className="p-4">Students Count</th>
                  <th className="p-4">Status</th>
                  <th className="p-4">Registered Date</th>
                  <th className="p-4 pr-6 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 text-sm text-slate-300">
                {institutions.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-slate-500 italic">No institutions found. Click "Register Institution" to add one.</td>
                  </tr>
                ) : (
                  institutions.map(inst => (
                    <tr key={inst.id} className="hover:bg-white/[0.01] transition-colors">
                      <td className="p-4 pl-6 font-semibold text-white">{inst.name}</td>
                      <td className="p-4 font-mono text-xs text-blue-400">{inst.slug}</td>
                      <td className="p-4">{inst._count?.users || 0}</td>
                      <td className="p-4">{inst._count?.students || 0}</td>
                      <td className="p-4">
                        <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${inst.isActive ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'}`}>
                          {inst.isActive ? 'Active' : 'Suspended'}
                        </span>
                      </td>
                      <td className="p-4 text-xs text-slate-500">
                        {new Date(inst.createdAt).toLocaleDateString()}
                      </td>
                      <td className="p-4 pr-6 text-right">
                        <button
                          onClick={() => handleOpenEditModal(inst)}
                          className="text-xs font-bold text-blue-400 hover:text-white bg-blue-500/10 hover:bg-blue-600 border border-blue-500/20 hover:border-transparent px-3 py-1.5 rounded-xl transition-all shadow-sm"
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
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
            <div className="w-full max-w-2xl bg-slate-900/95 backdrop-blur-xl border border-white/10 rounded-3xl p-8 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
              <div className="flex justify-between items-center mb-6 pb-4 border-b border-white/5">
                <h3 className="text-2xl font-bold text-white flex items-center gap-3">
                  <div className="p-2 bg-blue-500/20 text-blue-400 rounded-xl">
                    <Building2 className="w-6 h-6" />
                  </div>
                  Register Sub-Institution
                </h3>
                <button
                  onClick={() => setIsModalOpen(false)}
                  className="p-2 text-slate-400 hover:text-white hover:bg-white/5 rounded-xl transition-all"
                >
                  <Plus className="w-6 h-6 rotate-45" />
                </button>
              </div>

              <form onSubmit={handleCreateInstitution} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-bold text-slate-300 mb-2">Institution Name</label>
                    <input
                      type="text"
                      required
                      value={formData.name}
                      onChange={e => setFormData({ ...formData, name: e.target.value })}
                      placeholder="e.g. Mirpur Cadet School"
                      className="w-full bg-slate-950/50 border border-slate-700/50 rounded-2xl px-5 py-3.5 text-slate-200 placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all font-medium text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-slate-300 mb-2">Institution Code (EIIN / Slug)</label>
                    <input
                      type="text"
                      required
                      pattern="[0-9]*"
                      value={formData.slug}
                      onChange={e => setFormData({ ...formData, slug: e.target.value.replace(/\D/g, '') })}
                      placeholder="e.g. 102030"
                      className="w-full bg-slate-950/50 border border-slate-700/50 rounded-2xl px-5 py-3.5 text-slate-200 placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all font-mono text-sm"
                    />
                  </div>
                </div>

                <div className="p-5 bg-slate-950/40 rounded-2xl border border-white/5 space-y-4">
                  <h4 className="text-sm font-bold text-blue-400 uppercase tracking-wider">Sub-Institution Administrator Account</h4>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-400 mb-1.5">First Name</label>
                      <input
                        type="text"
                        required
                        value={formData.adminFirstName}
                        onChange={e => setFormData({ ...formData, adminFirstName: e.target.value })}
                        placeholder="Admin First Name"
                        className="w-full bg-slate-950/70 border border-slate-800 rounded-xl px-4 py-2.5 text-slate-200 placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500/50 text-sm font-medium"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-400 mb-1.5">Last Name</label>
                      <input
                        type="text"
                        required
                        value={formData.adminLastName}
                        onChange={e => setFormData({ ...formData, adminLastName: e.target.value })}
                        placeholder="Admin Last Name"
                        className="w-full bg-slate-950/70 border border-slate-800 rounded-xl px-4 py-2.5 text-slate-200 placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500/50 text-sm font-medium"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-400 mb-1.5">Email Address</label>
                      <div className="relative">
                        <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                        <input
                          type="email"
                          required
                          value={formData.adminEmail}
                          onChange={e => setFormData({ ...formData, adminEmail: e.target.value })}
                          placeholder="admin@school.com"
                          className="w-full bg-slate-950/70 border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-slate-200 placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500/50 text-sm font-medium"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-400 mb-1.5">Password</label>
                      <div className="relative">
                        <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                        <input
                          type="password"
                          required
                          value={formData.adminPassword}
                          onChange={e => setFormData({ ...formData, adminPassword: e.target.value })}
                          placeholder="Password (Min 6 chars)"
                          className="w-full bg-slate-950/70 border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-slate-200 placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500/50 text-sm font-medium"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex justify-end gap-4 pt-4 border-t border-white/5">
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="px-6 py-3 rounded-2xl text-slate-400 hover:text-white hover:bg-slate-800 transition-all text-sm font-bold"
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
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
            <div className="w-full max-w-lg bg-slate-900/95 backdrop-blur-xl border border-white/10 rounded-3xl p-8 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
              <div className="flex justify-between items-center mb-6 pb-4 border-b border-white/5">
                <h3 className="text-xl font-bold text-white flex flex-col">
                  <span>View / Edit Administrator</span>
                  <span className="text-xs text-slate-400 font-medium mt-1 font-mono">Institution: {selectedInst.name} ({selectedInst.slug})</span>
                </h3>
                <button
                  onClick={() => setIsEditModalOpen(false)}
                  className="p-2 text-slate-400 hover:text-white hover:bg-white/5 rounded-xl transition-all"
                >
                  <Plus className="w-6 h-6 rotate-45" />
                </button>
              </div>

              <form onSubmit={handleEditAdmin} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-300 mb-1.5">First Name</label>
                    <input
                      type="text"
                      required
                      value={editFormData.adminFirstName}
                      onChange={e => setEditFormData({ ...editFormData, adminFirstName: e.target.value })}
                      className="w-full bg-slate-950/50 border border-slate-700/50 rounded-xl px-4 py-2.5 text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50 text-sm font-medium"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-300 mb-1.5">Last Name</label>
                    <input
                      type="text"
                      required
                      value={editFormData.adminLastName}
                      onChange={e => setEditFormData({ ...editFormData, adminLastName: e.target.value })}
                      className="w-full bg-slate-950/50 border border-slate-700/50 rounded-xl px-4 py-2.5 text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50 text-sm font-medium"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1.5">Email Address</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                    <input
                      type="email"
                      required
                      value={editFormData.adminEmail}
                      onChange={e => setEditFormData({ ...editFormData, adminEmail: e.target.value })}
                      className="w-full bg-slate-950/50 border border-slate-700/50 rounded-xl pl-9 pr-4 py-2.5 text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50 text-sm font-medium"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1.5">Phone Number</label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                    <input
                      type="text"
                      value={editFormData.phone}
                      onChange={e => setEditFormData({ ...editFormData, phone: e.target.value })}
                      className="w-full bg-slate-950/50 border border-slate-700/50 rounded-xl pl-9 pr-4 py-2.5 text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50 text-sm font-medium"
                      placeholder="e.g. 017000000"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1.5">Upgrade Password</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                    <input
                      type="password"
                      value={editFormData.adminPassword}
                      onChange={e => setEditFormData({ ...editFormData, adminPassword: e.target.value })}
                      placeholder="Leave blank to keep current password"
                      className="w-full bg-slate-950/50 border border-slate-700/50 rounded-xl pl-9 pr-4 py-2.5 text-slate-200 placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500/50 text-sm font-medium"
                    />
                  </div>
                  <span className="text-[10px] text-slate-500 mt-1 block">Super Admin has the override authority to update this admin's credentials at any time.</span>
                </div>

                <div className="flex justify-end gap-4 pt-4 border-t border-white/5">
                  <button
                    type="button"
                    onClick={() => setIsEditModalOpen(false)}
                    className="px-5 py-2.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-all text-xs font-bold"
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
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white tracking-tight">Admin Dashboard</h2>
          <p className="text-slate-400 mt-1">Welcome back. Here is today's overview.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
        <div className="glass p-6 rounded-2xl">
          <h3 className="text-lg font-semibold text-white mb-4">Recent Admissions</h3>
          <div className="flex flex-col items-center justify-center py-12 text-slate-400">
             <div className="w-16 h-16 rounded-full bg-slate-800 flex items-center justify-center mb-4">
               <Users className="w-8 h-8 text-slate-600" />
             </div>
             <p>No recent admission data to display.</p>
          </div>
        </div>
        
        <div className="glass p-6 rounded-2xl">
          <h3 className="text-lg font-semibold text-white mb-4">Upcoming Fee Deadlines</h3>
          <div className="flex flex-col items-center justify-center py-12 text-slate-400">
             <div className="w-16 h-16 rounded-full bg-slate-800 flex items-center justify-center mb-4">
               <CircleDollarSign className="w-8 h-8 text-slate-600" />
             </div>
             <p>All fees are up to date.</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;
