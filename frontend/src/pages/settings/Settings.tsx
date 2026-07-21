import React, { useState, useEffect } from 'react';
import { Settings as SettingsIcon, Save, Building, Palette, GraduationCap, Plus, Pencil, Trash2, X } from 'lucide-react';
import toast from 'react-hot-toast';
import apiClient from '../../api/client';
import { useUiStore } from '../../store/uiStore';

const toDateInputValue = (dateStr: string) => (dateStr ? dateStr.slice(0, 10) : '');

const emptyExamForm = { name: '', startDate: '', endDate: '', isActive: true };

const Settings = () => {
  const [activeTab, setActiveTab] = useState<'profile' | 'branding' | 'exams'>('profile');

  const [exams, setExams] = useState<any[]>([]);
  const [examsLoading, setExamsLoading] = useState(false);
  const [examModalOpen, setExamModalOpen] = useState(false);
  const [editingExamId, setEditingExamId] = useState<string | null>(null);
  const [examForm, setExamForm] = useState(emptyExamForm);
  const [savingExam, setSavingExam] = useState(false);
  const [settings, setSettings] = useState<any>({
    name: '',
    email: '',
    phone: '',
    address: '',
    theme: 'dark',
    logoUrl: ''
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { theme, setTheme } = useUiStore();

  useEffect(() => {
    fetchSettings();
  }, []);

  useEffect(() => {
    if (activeTab === 'exams') {
      fetchExams();
    }
  }, [activeTab]);

  const fetchExams = async () => {
    setExamsLoading(true);
    try {
      const res = await apiClient.get('/results?pageSize=100');
      setExams(res.data.data || []);
    } catch (err) {
      console.error('Failed to fetch exams', err);
      toast.error('Failed to load exams');
    } finally {
      setExamsLoading(false);
    }
  };

  const openCreateExam = () => {
    setEditingExamId(null);
    setExamForm(emptyExamForm);
    setExamModalOpen(true);
  };

  const openEditExam = (exam: any) => {
    setEditingExamId(exam.id);
    setExamForm({
      name: exam.name,
      startDate: toDateInputValue(exam.startDate),
      endDate: toDateInputValue(exam.endDate),
      isActive: exam.isActive,
    });
    setExamModalOpen(true);
  };

  const handleSaveExam = async () => {
    if (!examForm.name.trim() || !examForm.startDate || !examForm.endDate) {
      toast.error('Please fill in exam name, start date, and end date.');
      return;
    }
    setSavingExam(true);
    try {
      if (editingExamId) {
        await apiClient.put(`/results/${editingExamId}`, examForm);
        toast.success('Exam updated successfully');
      } else {
        await apiClient.post('/results', examForm);
        toast.success('Exam created successfully');
      }
      setExamModalOpen(false);
      fetchExams();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to save exam');
    } finally {
      setSavingExam(false);
    }
  };

  const handleDeleteExam = async (exam: any) => {
    if (!window.confirm(`Delete exam "${exam.name}"? This cannot be undone.`)) return;
    try {
      await apiClient.delete(`/results/${exam.id}`);
      toast.success('Exam deleted successfully');
      fetchExams();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to delete exam. It may already have results recorded.');
    }
  };

  const fetchSettings = async () => {
    try {
      const res = await apiClient.get('/institution/website');
      if (res.data?.data) {
        setSettings({ ...settings, ...res.data.data });
      }
    } catch (err) {
      console.error('Failed to fetch settings', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await apiClient.put('/institution/website', settings);
      toast.success('Settings updated successfully');
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to update settings');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="text-slate-500 dark:text-slate-400">Loading settings...</div>;
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">System Settings</h2>
        <p className="text-slate-600 dark:text-slate-400 mt-1">Manage institution profile, branding, and exams.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Sidebar Nav */}
        <div className="space-y-2">
          <button 
            onClick={() => setActiveTab('profile')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-colors ${
              activeTab === 'profile' 
                ? 'bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-500/20' 
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5 hover:text-slate-900 dark:hover:text-slate-200 border border-transparent'
            }`}
          >
            <Building className="w-5 h-5" />
            Institution Profile
          </button>
          <button
            onClick={() => setActiveTab('branding')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-colors ${
              activeTab === 'branding' 
                ? 'bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-500/20' 
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5 hover:text-slate-900 dark:hover:text-slate-200 border border-transparent'
            }`}
          >
            <Palette className="w-5 h-5" />
            Branding
          </button>
          <button
            onClick={() => setActiveTab('exams')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-colors ${
              activeTab === 'exams'
                ? 'bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-500/20'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5 hover:text-slate-900 dark:hover:text-slate-200 border border-transparent'
            }`}
          >
            <GraduationCap className="w-5 h-5" />
            Manage Exams
          </button>
        </div>

        {/* Settings Form */}
        <div className="md:col-span-2 space-y-6">
          <div className="glass-card p-6 rounded-2xl border border-slate-200 dark:border-white/5 space-y-6">
            
            {activeTab === 'profile' && (
              <>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Building className="w-5 h-5 text-blue-500 dark:text-blue-400" />
                  Institution Profile
                </h3>
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium text-slate-700 dark:text-slate-400">Institution Name</label>
                      <input
                        type="text"
                        value={settings.name || ''}
                        onChange={(e) => setSettings({ ...settings, name: e.target.value })}
                        className="input-field"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium text-slate-700 dark:text-slate-400">Email Address</label>
                      <input
                        type="email"
                        value={settings.email || ''}
                        onChange={(e) => setSettings({ ...settings, email: e.target.value })}
                        className="input-field"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-slate-700 dark:text-slate-400">Phone Number</label>
                    <input
                      type="text"
                      value={settings.phone || ''}
                      onChange={(e) => setSettings({ ...settings, phone: e.target.value })}
                      className="input-field"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-slate-700 dark:text-slate-400">Address</label>
                    <textarea
                      value={settings.address || ''}
                      onChange={(e) => setSettings({ ...settings, address: e.target.value })}
                      rows={3}
                      className="input-field resize-none"
                    />
                  </div>
                </div>
              </>
            )}

            {activeTab === 'branding' && (
              <>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Palette className="w-5 h-5 text-blue-500 dark:text-blue-400" />
                  Branding
                </h3>
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-slate-700 dark:text-slate-400">Logo URL</label>
                    <input
                      type="url"
                      placeholder="https://example.com/logo.png"
                      value={settings.logoUrl || ''}
                      onChange={(e) => setSettings({ ...settings, logoUrl: e.target.value })}
                      className="input-field"
                    />
                  </div>
                  
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-slate-700 dark:text-slate-400">Theme Mode</label>
                    <select
                      value={theme}
                      onChange={(e) => {
                        const newTheme = e.target.value as 'dark' | 'light' | 'system';
                        setTheme(newTheme);
                        setSettings({ ...settings, theme: newTheme });
                      }}
                      className="input-field"
                    >
                      <option value="dark">Dark Theme</option>
                      <option value="light">Light Theme</option>
                      <option value="system">System Default</option>
                    </select>
                  </div>
                </div>
              </>
            )}

            {activeTab === 'exams' && (
              <>
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <GraduationCap className="w-5 h-5 text-blue-500 dark:text-blue-400" />
                    Manage Exams
                  </h3>
                  <button
                    onClick={openCreateExam}
                    className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white font-semibold py-2 px-4 rounded-xl transition-all shadow-lg shadow-blue-500/20 active:scale-[0.98] text-sm"
                  >
                    <Plus className="w-4 h-4" />
                    New Exam
                  </button>
                </div>

                <div className="rounded-2xl overflow-hidden border border-slate-200 dark:border-white/10">
                  <table className="w-full text-left text-sm text-slate-700 dark:text-slate-300">
                    <thead className="bg-slate-50 dark:bg-slate-900/40 text-xs uppercase text-slate-500 dark:text-slate-400">
                      <tr>
                        <th className="px-4 py-3 font-medium">Name</th>
                        <th className="px-4 py-3 font-medium">Start Date</th>
                        <th className="px-4 py-3 font-medium">End Date</th>
                        <th className="px-4 py-3 font-medium">Status</th>
                        <th className="px-4 py-3 font-medium text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                      {examsLoading ? (
                        <tr>
                          <td colSpan={5} className="px-4 py-8 text-center text-slate-500">Loading exams...</td>
                        </tr>
                      ) : exams.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="px-4 py-8 text-center text-slate-500">No exams yet. Create one to get started.</td>
                        </tr>
                      ) : (
                        exams.map((exam) => (
                          <tr key={exam.id} className="hover:bg-slate-50/50 dark:hover:bg-white/[0.02] transition-colors">
                            <td className="px-4 py-3 font-medium text-slate-900 dark:text-white">{exam.name}</td>
                            <td className="px-4 py-3">{new Date(exam.startDate).toLocaleDateString()}</td>
                            <td className="px-4 py-3">{new Date(exam.endDate).toLocaleDateString()}</td>
                            <td className="px-4 py-3">
                              <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                                exam.isActive
                                  ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                                  : 'bg-slate-100 dark:bg-white/5 text-slate-500'
                              }`}>
                                {exam.isActive ? 'Active' : 'Inactive'}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center justify-end gap-2">
                                <button
                                  onClick={() => openEditExam(exam)}
                                  title="Edit exam"
                                  className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-white/5 text-slate-500 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                                >
                                  <Pencil className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => handleDeleteExam(exam)}
                                  title="Delete exam"
                                  className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-white/5 text-slate-500 hover:text-rose-600 dark:hover:text-rose-400 transition-colors"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            {activeTab !== 'exams' && (
              <div className="pt-4 flex justify-end">
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white font-semibold py-2 px-5 rounded-xl transition-all shadow-lg shadow-blue-500/20 active:scale-[0.98] disabled:opacity-50"
                >
                  <Save className="w-4 h-4" />
                  {saving ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {examModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-sm p-4">
          <div className="glass-card w-full max-w-md rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                {editingExamId ? 'Edit Exam' : 'New Exam'}
              </h3>
              <button
                onClick={() => setExamModalOpen(false)}
                className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-white/5 text-slate-500"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-slate-700 dark:text-slate-400">Exam Name</label>
                <input
                  type="text"
                  list="standard-exam-names"
                  placeholder="e.g. Mid Term"
                  value={examForm.name}
                  onChange={(e) => setExamForm({ ...examForm, name: e.target.value })}
                  className="input-field"
                />
                <datalist id="standard-exam-names">
                  <option value="Mid Term" />
                  <option value="Half Yearly" />
                  <option value="Final Term" />
                </datalist>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-slate-700 dark:text-slate-400">Start Date</label>
                  <input
                    type="date"
                    value={examForm.startDate}
                    onChange={(e) => setExamForm({ ...examForm, startDate: e.target.value })}
                    className="input-field"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-slate-700 dark:text-slate-400">End Date</label>
                  <input
                    type="date"
                    value={examForm.endDate}
                    onChange={(e) => setExamForm({ ...examForm, endDate: e.target.value })}
                    className="input-field"
                  />
                </div>
              </div>

              <label className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-400">
                <input
                  type="checkbox"
                  checked={examForm.isActive}
                  onChange={(e) => setExamForm({ ...examForm, isActive: e.target.checked })}
                  className="rounded"
                />
                Active
              </label>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => setExamModalOpen(false)}
                className="py-2 px-4 rounded-xl font-semibold text-sm text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveExam}
                disabled={savingExam}
                className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white font-semibold py-2 px-5 rounded-xl transition-all shadow-lg shadow-blue-500/20 active:scale-[0.98] disabled:opacity-50 text-sm"
              >
                <Save className="w-4 h-4" />
                {savingExam ? 'Saving...' : 'Save Exam'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Settings;
