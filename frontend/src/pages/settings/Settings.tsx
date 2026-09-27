import React, { useState } from 'react';
import { Building, Palette, GraduationCap, ShieldCheck, Bell, Globe2, User, Scale } from 'lucide-react';
import { PageHeader } from '@/components/ui';
import { useAuthStore } from '@/store/authStore';
import { SettingsTabNav, type SettingsNavItem } from './tabs/SettingsTabNav';
import ProfileTab from './tabs/ProfileTab';
import InstitutionProfileTab from './tabs/InstitutionProfileTab';
import BrandingTab from './tabs/BrandingTab';
import ManageExamsTab from './tabs/ManageExamsTab';
import NotificationsTab from './tabs/NotificationsTab';
import LanguageRegionTab from './tabs/LanguageRegionTab';
import SecuritySettings from './SecuritySettings';
import GradingTab from './tabs/GradingTab';

type TabId = 'profile' | 'branding' | 'exams' | 'grading' | 'security' | 'notifications' | 'locale';

const Settings = () => {
  const { user } = useAuthStore();
  const isAdmin = user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN';

  const items: SettingsNavItem[] = isAdmin
    ? [
        { id: 'profile', label: 'Institution Profile', icon: <Building className="w-5 h-5" /> },
        { id: 'branding', label: 'Branding', icon: <Palette className="w-5 h-5" /> },
        { id: 'exams', label: 'Manage Exams', icon: <GraduationCap className="w-5 h-5" /> },
        { id: 'grading', label: 'Grading', icon: <Scale className="w-5 h-5" /> },
        { id: 'security', label: 'Security', icon: <ShieldCheck className="w-5 h-5" /> },
        { id: 'notifications', label: 'Notifications', icon: <Bell className="w-5 h-5" /> },
        { id: 'locale', label: 'Language & Region', icon: <Globe2 className="w-5 h-5" /> },
      ]
    : [
        { id: 'profile', label: 'Profile', icon: <User className="w-5 h-5" /> },
        { id: 'security', label: 'Security', icon: <ShieldCheck className="w-5 h-5" /> },
        { id: 'notifications', label: 'Notifications', icon: <Bell className="w-5 h-5" /> },
        { id: 'locale', label: 'Language & Region', icon: <Globe2 className="w-5 h-5" /> },
      ];

  const [activeTab, setActiveTab] = useState<TabId>('profile');

  return (
    <div className="space-y-6 max-w-5xl">
      <PageHeader
        title="Settings"
        description={
          isAdmin
            ? 'Manage institution profile, branding, exams, security and preferences.'
            : 'Manage your profile, security and preferences.'
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="md:col-span-1">
          <SettingsTabNav items={items} value={activeTab} onChange={(id) => setActiveTab(id as TabId)} />
        </div>

        <div className="md:col-span-3">
          <div className="glass-card p-6 rounded-2xl border border-slate-200 dark:border-white/5">
            {activeTab === 'profile' && (isAdmin ? <InstitutionProfileTab /> : <ProfileTab />)}
            {activeTab === 'branding' && isAdmin && <BrandingTab />}
            {activeTab === 'exams' && isAdmin && <ManageExamsTab />}
            {activeTab === 'grading' && isAdmin && <GradingTab />}
            {activeTab === 'security' && <SecuritySettings />}
            {activeTab === 'notifications' && <NotificationsTab />}
            {activeTab === 'locale' && <LanguageRegionTab />}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Settings;
