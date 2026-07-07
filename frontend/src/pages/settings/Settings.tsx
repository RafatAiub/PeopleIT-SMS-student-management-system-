import React, { useState, useEffect } from 'react';
import { Settings as SettingsIcon, Save, Building, Palette, Calendar } from 'lucide-react';
import toast from 'react-hot-toast';
import apiClient from '../../api/client';

const Settings = () => {
  const [activeTab, setActiveTab] = useState<'profile' | 'academic' | 'branding'>('profile');
  const [settings, setSettings] = useState<any>({
    institutionName: '',
    email: '',
    phone: '',
    address: '',
    academicYear: '2023-2024',
    theme: 'dark',
    gradingSystem: 'GPA',
    termStructure: 'Semesters',
    primaryColor: '#3b82f6',
    logoUrl: ''
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchSettings();
  }, []);

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
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to update settings');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="text-slate-400">Loading settings...</div>;
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h2 className="text-2xl font-bold text-white tracking-tight">System Settings</h2>
        <p className="text-slate-400 mt-1">Manage institution profile, branding, and academic configurations.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Sidebar Nav */}
        <div className="space-y-2">
          <button 
            onClick={() => setActiveTab('profile')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-colors ${
              activeTab === 'profile' 
                ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' 
                : 'text-slate-400 hover:bg-white/5 hover:text-slate-200 border border-transparent'
            }`}
          >
            <Building className="w-5 h-5" />
            Institution Profile
          </button>
          <button 
            onClick={() => setActiveTab('academic')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-colors ${
              activeTab === 'academic' 
                ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' 
                : 'text-slate-400 hover:bg-white/5 hover:text-slate-200 border border-transparent'
            }`}
          >
            <Calendar className="w-5 h-5" />
            Academic Setup
          </button>
          <button 
            onClick={() => setActiveTab('branding')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-colors ${
              activeTab === 'branding' 
                ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' 
                : 'text-slate-400 hover:bg-white/5 hover:text-slate-200 border border-transparent'
            }`}
          >
            <Palette className="w-5 h-5" />
            Branding
          </button>
        </div>

        {/* Settings Form */}
        <div className="md:col-span-2 space-y-6">
          <div className="glass p-6 rounded-2xl border border-white/5 space-y-6">
            
            {activeTab === 'profile' && (
              <>
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <Building className="w-5 h-5 text-blue-400" />
                  Institution Profile
                </h3>
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium text-slate-400">Institution Name</label>
                      <input
                        type="text"
                        value={settings.institutionName || ''}
                        onChange={(e) => setSettings({ ...settings, institutionName: e.target.value })}
                        className="w-full bg-slate-900 border border-slate-700/50 rounded-xl px-4 py-2 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium text-slate-400">Email Address</label>
                      <input
                        type="email"
                        value={settings.email || ''}
                        onChange={(e) => setSettings({ ...settings, email: e.target.value })}
                        className="w-full bg-slate-900 border border-slate-700/50 rounded-xl px-4 py-2 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                      />
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium text-slate-400">Phone Number</label>
                      <input
                        type="text"
                        value={settings.phone || ''}
                        onChange={(e) => setSettings({ ...settings, phone: e.target.value })}
                        className="w-full bg-slate-900 border border-slate-700/50 rounded-xl px-4 py-2 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium text-slate-400">Current Academic Year</label>
                      <input
                        type="text"
                        value={settings.academicYear || ''}
                        onChange={(e) => setSettings({ ...settings, academicYear: e.target.value })}
                        className="w-full bg-slate-900 border border-slate-700/50 rounded-xl px-4 py-2 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-slate-400">Address</label>
                    <textarea
                      value={settings.address || ''}
                      onChange={(e) => setSettings({ ...settings, address: e.target.value })}
                      rows={3}
                      className="w-full bg-slate-900 border border-slate-700/50 rounded-xl px-4 py-2 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50 resize-none"
                    />
                  </div>
                </div>
              </>
            )}

            {activeTab === 'academic' && (
              <>
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <Calendar className="w-5 h-5 text-blue-400" />
                  Academic Setup
                </h3>
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium text-slate-400">Grading System</label>
                      <select
                        value={settings.gradingSystem || 'GPA'}
                        onChange={(e) => setSettings({ ...settings, gradingSystem: e.target.value })}
                        className="w-full bg-slate-900 border border-slate-700/50 rounded-xl px-4 py-2 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                      >
                        <option value="GPA">GPA (4.0 / 5.0)</option>
                        <option value="Percentage">Percentage (%)</option>
                        <option value="Letter">Letter Grades (A, B, C...)</option>
                      </select>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium text-slate-400">Term Structure</label>
                      <select
                        value={settings.termStructure || 'Semesters'}
                        onChange={(e) => setSettings({ ...settings, termStructure: e.target.value })}
                        className="w-full bg-slate-900 border border-slate-700/50 rounded-xl px-4 py-2 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                      >
                        <option value="Semesters">Semesters (2 Terms)</option>
                        <option value="Trimesters">Trimesters (3 Terms)</option>
                        <option value="Quarters">Quarters (4 Terms)</option>
                        <option value="Annual">Annual (1 Term)</option>
                      </select>
                    </div>
                  </div>
                </div>
              </>
            )}

            {activeTab === 'branding' && (
              <>
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <Palette className="w-5 h-5 text-blue-400" />
                  Branding
                </h3>
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-slate-400">Logo URL</label>
                    <input
                      type="url"
                      placeholder="https://example.com/logo.png"
                      value={settings.logoUrl || ''}
                      onChange={(e) => setSettings({ ...settings, logoUrl: e.target.value })}
                      className="w-full bg-slate-900 border border-slate-700/50 rounded-xl px-4 py-2 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                    />
                  </div>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium text-slate-400">Primary Color</label>
                      <div className="flex items-center gap-3">
                        <input
                          type="color"
                          value={settings.primaryColor || '#3b82f6'}
                          onChange={(e) => setSettings({ ...settings, primaryColor: e.target.value })}
                          className="h-10 w-10 rounded cursor-pointer bg-transparent border-0 p-0"
                        />
                        <input
                          type="text"
                          value={settings.primaryColor || '#3b82f6'}
                          onChange={(e) => setSettings({ ...settings, primaryColor: e.target.value })}
                          className="flex-1 bg-slate-900 border border-slate-700/50 rounded-xl px-4 py-2 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50 uppercase"
                        />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium text-slate-400">Theme Mode</label>
                      <select
                        value={settings.theme || 'dark'}
                        onChange={(e) => setSettings({ ...settings, theme: e.target.value })}
                        className="w-full bg-slate-900 border border-slate-700/50 rounded-xl px-4 py-2 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                      >
                        <option value="dark">Dark Theme (Default)</option>
                        <option value="light">Light Theme</option>
                        <option value="system">System Default</option>
                      </select>
                    </div>
                  </div>
                </div>
              </>
            )}

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
          </div>
        </div>
      </div>
    </div>
  );
};

export default Settings;
