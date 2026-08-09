import React, { useState, useEffect } from 'react';
import { Settings as SettingsIcon, Save, Building, Palette, GraduationCap, Plus, Pencil, Trash2, X, Mail, Phone, MapPin, Calendar, Award, Upload, Check } from 'lucide-react';
import toast from 'react-hot-toast';
import apiClient from '../../api/client';
import { useUiStore } from '../../store/uiStore';
import { useAuthStore } from '../../store/authStore';
import { ConfirmModal } from '../../components/common/ConfirmModal';
import { compressImage } from '../../utils/imageCompressor';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';

const toDateInputValue = (dateStr: string) => (dateStr ? dateStr.slice(0, 10) : '');

const emptyExamForm = { name: '', startDate: '', endDate: '', isActive: true };

const Settings = () => {
  const { user } = useAuthStore();
  const isAdmin = user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN';

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
  const { theme, setTheme, setInstitutionBranding } = useUiStore();

  useEffect(() => {
    fetchSettings();
    fetchExams();
  }, []);

  useEffect(() => {
    if (activeTab === 'exams' && isAdmin) {
      fetchExams();
    }
  }, [activeTab, isAdmin]);

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

  const [examToDelete, setExamToDelete] = useState<any>(null);
  const [deletingExam, setDeletingExam] = useState(false);

  const handleConfirmDeleteExam = async () => {
    if (!examToDelete) return;
    setDeletingExam(true);
    try {
      await apiClient.delete(`/results/${examToDelete.id}`);
      toast.success('Exam deleted successfully');
      setExamToDelete(null);
      fetchExams();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to delete exam. It may already have results recorded.');
    } finally {
      setDeletingExam(false);
    }
  };

  const fetchSettings = async () => {
    try {
      const res = await apiClient.get('/institution/website');
      if (res.data?.data) {
        const data = res.data.data;
        setSettings((prev: any) => ({
          ...prev,
          ...data,
          name: data.name || user?.institutionName || '',
          email: data.email || data.contactEmail || user?.email || '',
          phone: data.phone || data.contactPhone || '',
          address: data.address || '',
          logoUrl: data.logoUrl || '',
        }));

        if (data.logoUrl || data.name) {
          setInstitutionBranding(data.logoUrl || null, data.name || null);
        }
      }
    } catch (err) {
      console.error('Failed to fetch settings', err);
      toast.error('Failed to load institution settings');
    } finally {
      setLoading(false);
    }
  };

  const handleImageFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.error('Please select a valid image file');
      return;
    }

    try {
      // Smart canvas compression: Max 300x300 PNG (lossless, keeps
      // transparency, and is the format pdfkit can embed in generated PDFs —
      // report cards/timetables draw this logo server-side).
      const { dataUrl, sizeKb } = await compressImage(file, {
        maxWidth: 300,
        maxHeight: 300,
        quality: 0.82,
        format: 'image/png',
      });

      setSettings((prev: any) => ({ ...prev, logoUrl: dataUrl }));
      toast.success(`Logo compressed & optimized (${sizeKb} KB)`);
    } catch (err: any) {
      toast.error(err.message || 'Failed to process image file');
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await apiClient.put('/institution/website', settings);
      setInstitutionBranding(settings.logoUrl || null, settings.name || null);
      toast.success('Settings updated & branding synced across portal!');
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to update settings');
    } finally {
      setSaving(false);
    }
  };

  const renderSmartLogoUploader = () => (
    <div className="space-y-2">
      <label className="text-sm font-medium text-slate-700 dark:text-slate-400 flex items-center justify-between">
        <span>Institute Logo</span>
        <span className="text-xs text-slate-400 font-normal">Upload PNG, JPG, SVG or WebP</span>
      </label>

      <div className="flex flex-col sm:flex-row items-center gap-4 p-4 rounded-2xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 shadow-xs">
        <div className="relative w-20 h-20 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center overflow-hidden flex-shrink-0 shadow-xs group">
          {settings.logoUrl ? (
            <>
              <img
                src={settings.logoUrl}
                alt="Logo preview"
                className="w-full h-full object-contain p-2"
                onError={(e) => {
                  (e.target as HTMLElement).style.display = 'none';
                }}
              />
              <button
                type="button"
                onClick={() => setSettings((prev: any) => ({ ...prev, logoUrl: '' }))}
                className="absolute top-1 right-1 p-1 rounded-full bg-rose-500 text-white opacity-0 group-hover:opacity-100 transition-opacity shadow-md"
                title="Remove logo"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </>
          ) : (
            <Building className="w-8 h-8 text-slate-400 dark:text-slate-500" />
          )}
        </div>

        <div className="flex-1 space-y-2.5 w-full">
          <div className="flex flex-wrap items-center gap-2">
            <label className="cursor-pointer inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-blue-600 to-primary-600 hover:from-blue-500 hover:to-primary-500 text-white font-bold text-xs shadow-md shadow-blue-500/20 active:scale-95 transition-all">
              <Upload className="w-4 h-4" />
              <span>Upload Image File</span>
              <input
                type="file"
                accept="image/*"
                onChange={handleImageFileUpload}
                className="hidden"
              />
            </label>

            {settings.logoUrl && (
              <button
                type="button"
                onClick={() => setSettings((prev: any) => ({ ...prev, logoUrl: '' }))}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 transition-all"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Remove</span>
              </button>
            )}
          </div>

          <div className="relative">
            <input
              id="settings-logoUrl"
              type="text"
              placeholder="Or paste direct image URL (https://...)"
              value={settings.logoUrl || ''}
              onChange={(e) => setSettings((prev: any) => ({ ...prev, logoUrl: e.target.value }))}
              className="input-field text-xs py-2 pr-8"
            />
            {settings.logoUrl && (
              <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-emerald-500 text-xs font-bold flex items-center gap-1">
                <Check className="w-3.5 h-3.5" />
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  if (loading) {
    return <div className="text-slate-500 dark:text-slate-400">Loading settings...</div>;
  }

  if (!isAdmin) {
    return (
      <div className="space-y-6 max-w-4xl">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">Institution Profile</h2>
          <p className="text-slate-600 dark:text-slate-400 mt-1">Official contact information, branding, and academic schedule.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Institution Identity Card */}
          <div className="md:col-span-1 space-y-4">
            <div className="glass-card p-6 rounded-3xl border border-slate-200/50 dark:border-white/10 bg-white/50 dark:bg-slate-900/30 shadow-lg text-center flex flex-col items-center justify-center space-y-4 relative overflow-hidden group">
              <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-blue-600 to-primary-600" />
              
              <div className="w-24 h-24 rounded-2xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700/60 shadow-inner flex items-center justify-center overflow-hidden transition-transform duration-300 group-hover:scale-105">
                {settings.logoUrl ? (
                  <img 
                    src={settings.logoUrl} 
                    alt={`${settings.name || 'Institution'} Logo`} 
                    className="w-full h-full object-contain p-2"
                    onError={(e) => {
                      (e.target as HTMLElement).style.display = 'none';
                    }}
                  />
                ) : (
                  <Building className="w-10 h-10 text-slate-400 dark:text-slate-500" />
                )}
              </div>

              <div>
                <h3 className="font-extrabold text-slate-900 dark:text-white text-lg tracking-tight leading-snug">
                  {settings.name || 'Institution Name'}
                </h3>
                <span className="inline-flex items-center gap-1 mt-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-wide uppercase bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-500/20">
                  Verified Campus
                </span>
              </div>
            </div>

            <div className="glass-card p-5 rounded-3xl border border-slate-200/50 dark:border-white/10 bg-white/50 dark:bg-slate-900/30 shadow-md space-y-4">
              <h4 className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Contact Information</h4>
              
              <div className="space-y-3.5">
                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-xl bg-blue-50 dark:bg-slate-800 text-blue-600 dark:text-blue-400 border border-blue-200/20 dark:border-slate-700/60">
                    <Mail className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <span className="text-[10px] font-semibold text-slate-400 block">Email Address</span>
                    <span className="text-sm font-medium text-slate-800 dark:text-slate-200 break-all">{settings.email || 'N/A'}</span>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-xl bg-blue-50 dark:bg-slate-800 text-blue-600 dark:text-blue-400 border border-blue-200/20 dark:border-slate-700/60">
                    <Phone className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <span className="text-[10px] font-semibold text-slate-400 block">Phone Number</span>
                    <span className="text-sm font-medium text-slate-800 dark:text-slate-200">{settings.phone || 'N/A'}</span>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-xl bg-blue-50 dark:bg-slate-800 text-blue-600 dark:text-blue-400 border border-blue-200/20 dark:border-slate-700/60">
                    <MapPin className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <span className="text-[10px] font-semibold text-slate-400 block">Campus Address</span>
                    <span className="text-sm font-medium text-slate-800 dark:text-slate-200 leading-relaxed block whitespace-pre-wrap">{settings.address || 'N/A'}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Academic Schedule & Active Exams List */}
          <div className="md:col-span-2 space-y-4">
            <div className="glass-card p-6 rounded-3xl border border-slate-200/50 dark:border-white/10 bg-white/50 dark:bg-slate-900/30 shadow-md space-y-5">
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-white/5 pb-3">
                <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <GraduationCap className="w-5 h-5 text-blue-500 dark:text-blue-400" />
                  Academic Calendar & Exams
                </h3>
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                  {exams.filter(e => e.isActive).length} Active Exams
                </span>
              </div>

              {examsLoading ? (
                <div className="text-center text-slate-500 py-12">Loading exams calendar...</div>
              ) : exams.length === 0 ? (
                <div className="text-center text-slate-500 py-12">No scheduled exams found.</div>
              ) : (
                <div className="grid grid-cols-1 gap-3">
                  {exams.map((exam) => (
                    <div 
                      key={exam.id} 
                      className="p-4 rounded-2xl bg-white dark:bg-slate-900/40 border border-slate-200/60 dark:border-white/5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-all hover:border-slate-350 dark:hover:border-white/10 shadow-xs"
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center border ${
                          exam.isActive 
                            ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/20'
                            : 'bg-slate-100 dark:bg-white/5 text-slate-400 border-slate-200 dark:border-white/5'
                        }`}>
                          <Award className="w-5 h-5" />
                        </div>
                        <div>
                          <h4 className="font-bold text-slate-900 dark:text-white text-sm">{exam.name}</h4>
                          <span className="text-xs text-slate-500 dark:text-slate-400">
                            {new Date(exam.startDate).toLocaleDateString()} — {new Date(exam.endDate).toLocaleDateString()}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <Badge variant={exam.isActive ? 'success' : 'neutral'}>
                          {exam.isActive ? 'Active Schedule' : 'Completed'}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
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
                <div className="space-y-5">
                  {renderSmartLogoUploader()}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label htmlFor="settings-name" className="text-sm font-medium text-slate-700 dark:text-slate-400">Institution Name</label>
                      <input
                        id="settings-name"
                        type="text"
                        placeholder="e.g. MUAZ ISLAMIC SCHOOL"
                        value={settings.name || ''}
                        onChange={(e) => setSettings({ ...settings, name: e.target.value })}
                        className="input-field"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label htmlFor="settings-email" className="text-sm font-medium text-slate-700 dark:text-slate-400">Email Address</label>
                      <input
                        id="settings-email"
                        type="email"
                        placeholder="admin@school.com"
                        value={settings.email || ''}
                        onChange={(e) => setSettings({ ...settings, email: e.target.value })}
                        className="input-field"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label htmlFor="settings-phone" className="text-sm font-medium text-slate-700 dark:text-slate-400">Phone Number</label>
                    <input
                      id="settings-phone"
                      type="text"
                      placeholder="+880 1234 56789"
                      value={settings.phone || ''}
                      onChange={(e) => setSettings({ ...settings, phone: e.target.value })}
                      className="input-field"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label htmlFor="settings-address" className="text-sm font-medium text-slate-700 dark:text-slate-400">Address</label>
                    <textarea
                      id="settings-address"
                      placeholder="Campus Street, City, Country"
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
                <div className="space-y-5">
                  {renderSmartLogoUploader()}

                  <div className="space-y-1.5">
                    <label htmlFor="settings-theme" className="text-sm font-medium text-slate-700 dark:text-slate-400">Theme Mode</label>
                    <select
                      id="settings-theme"
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
                  <Button variant="gradient" size="sm" onClick={openCreateExam} className="px-4 py-2">
                    <Plus className="w-4 h-4" />
                    New Exam
                  </Button>
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
                              <Badge variant={exam.isActive ? 'success' : 'neutral'}>
                                {exam.isActive ? 'Active' : 'Inactive'}
                              </Badge>
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center justify-end gap-2">
                                <button
                                  onClick={() => openEditExam(exam)}
                                  title="Edit exam"
                                  aria-label={`Edit ${exam.name}`}
                                  className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-white/5 text-slate-500 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                                >
                                  <Pencil className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => setExamToDelete(exam)}
                                  title="Delete exam"
                                  aria-label={`Delete ${exam.name}`}
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
                <Button variant="gradient" onClick={handleSave} isLoading={saving} className="py-2 px-5">
                  <Save className="w-4 h-4" />
                  {saving ? 'Saving...' : 'Save Changes'}
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>

      <Modal isOpen={examModalOpen} onClose={() => setExamModalOpen(false)} className="max-w-md space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                {editingExamId ? 'Edit Exam' : 'New Exam'}
              </h3>
            </div>

            <div className="space-y-3">
              <div className="space-y-1.5">
                <label htmlFor="exam-name" className="text-sm font-medium text-slate-700 dark:text-slate-400">Exam Name</label>
                <input
                  id="exam-name"
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
                  <label htmlFor="exam-startDate" className="text-sm font-medium text-slate-700 dark:text-slate-400">Start Date</label>
                  <input
                    id="exam-startDate"
                    type="date"
                    value={examForm.startDate}
                    onChange={(e) => setExamForm({ ...examForm, startDate: e.target.value })}
                    className="input-field"
                  />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="exam-endDate" className="text-sm font-medium text-slate-700 dark:text-slate-400">End Date</label>
                  <input
                    id="exam-endDate"
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
                  className="rounded-sm"
                />
                Active
              </label>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <Button variant="ghost" size="sm" onClick={() => setExamModalOpen(false)}>
                Cancel
              </Button>
              <Button variant="gradient" size="sm" onClick={handleSaveExam} isLoading={savingExam} className="px-5">
                <Save className="w-4 h-4" />
                {savingExam ? 'Saving...' : 'Save Exam'}
              </Button>
            </div>
      </Modal>

      <ConfirmModal
        isOpen={!!examToDelete}
        title="Delete exam"
        message={`Delete exam "${examToDelete?.name}"? This cannot be undone.`}
        confirmLabel="Delete"
        variant="danger"
        isLoading={deletingExam}
        onConfirm={handleConfirmDeleteExam}
        onCancel={() => setExamToDelete(null)}
      />
    </div>
  );
};

export default Settings;
