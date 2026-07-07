import React, { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Users, UserCheck, BookOpen, Calendar, FileText,
  MessageSquare, Bell, Settings, ChevronLeft, ChevronRight,
  LogOut, GraduationCap, Receipt, BarChart3, ClipboardList,
  Megaphone, ShieldCheck, Library, Bus, Brain, Globe
} from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { useUiStore } from '@/store/uiStore';
import { useAuth } from '@/hooks/useAuth';

interface NavItem {
  to: string;
  icon: React.ReactNode;
  label: string;
  adminOnly?: boolean;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}
const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Overview',
    items: [
      { to: '/', icon: <LayoutDashboard className="w-4.5 h-4.5" />, label: 'Dashboard' },
    ],
  },
  {
    label: 'Academics',
    items: [
      { to: '/students', icon: <Users className="w-4.5 h-4.5" />, label: 'Students' },
      { to: '/attendance', icon: <UserCheck className="w-4.5 h-4.5" />, label: 'Attendance' },
      { to: '/results', icon: <BookOpen className="w-4.5 h-4.5" />, label: 'Results' },
      { to: '/timetables', icon: <Calendar className="w-4.5 h-4.5" />, label: 'Timetable' },
    ],
  },
  {
    label: 'Management',
    items: [
      { to: '/hr', icon: <Users className="w-4.5 h-4.5" />, label: 'HR & Payroll', adminOnly: true },
      { to: '/ai-insights', icon: <Brain className="w-4.5 h-4.5" />, label: 'AI Insights' },
      { to: '/website-builder', icon: <Globe className="w-4.5 h-4.5" />, label: 'Website Builder', adminOnly: true },
    ],
  },
  {
    label: 'Finance',
    items: [
      { to: '/fees', icon: <Receipt className="w-4.5 h-4.5" />, label: 'Fees & Billing', adminOnly: true },
      { to: '/reports', icon: <BarChart3 className="w-4.5 h-4.5" />, label: 'Reports', adminOnly: true },
    ],
  },
  {
    label: 'Communication',
    items: [
      { to: '/messages', icon: <MessageSquare className="w-4.5 h-4.5" />, label: 'Messages' },
      { to: '/notices', icon: <Megaphone className="w-4.5 h-4.5" />, label: 'Notices' },
    ],
  },
  {
    label: 'Administration',
    items: [
      { to: '/users', icon: <ShieldCheck className="w-4.5 h-4.5" />, label: 'Users', adminOnly: true },
      { to: '/settings', icon: <Settings className="w-4.5 h-4.5" />, label: 'Settings', adminOnly: true },
    ],
  },
  {
    label: 'Facilities',
    items: [
      { to: '/library', icon: <Library className="w-4.5 h-4.5" />, label: 'Library' },
      { to: '/transport', icon: <Bus className="w-4.5 h-4.5" />, label: 'Transport' },
    ],
  },
];

export const Sidebar: React.FC = () => {
  const { sidebarCollapsed, toggleSidebar } = useUiStore();
  const { user } = useAuthStore();
  const { logout, isAdmin } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout.mutate(undefined, {
      onSettled: () => navigate('/login'),
    });
  };

  const initials = user
    ? `${user.firstName[0]}${user.lastName[0]}`.toUpperCase()
    : 'U';

  const roleLabel = {
    SUPER_ADMIN: 'Super Admin',
    ADMIN: 'Administrator',
    TEACHER: 'Teacher',
    STUDENT: 'Student',
    GUARDIAN: 'Guardian',
  }[user?.role ?? 'ADMIN'] ?? 'User';

  return (
    <aside
      className={`flex flex-col h-full bg-slate-900/95 border-r border-white/10 transition-all duration-300 ease-in-out flex-shrink-0 ${
        sidebarCollapsed ? 'w-16' : 'w-60'
      }`}
      style={{ backdropFilter: 'blur(16px)' }}
    >
      {/* Logo */}
      <div className={`flex items-center gap-3 px-4 py-5 border-b border-white/5 ${sidebarCollapsed ? 'justify-center' : ''}`}>
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-teal-500 flex items-center justify-center flex-shrink-0 glow-indigo">
          <GraduationCap className="w-4.5 h-4.5 text-white" />
        </div>
        {!sidebarCollapsed && (
          <div>
            <span className="text-gradient font-bold text-sm leading-none block">PeopleIT SMS</span>
            <span className="text-slate-500 text-xs">
              {user?.institutionName || 'School Management'}
            </span>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
        {NAV_GROUPS.map((group) => {
          const visibleItems = group.items.filter((item) => {
            if (user?.role === 'SUPER_ADMIN') {
              const superAdminRoutes = ['/', '/messages'];
              return superAdminRoutes.includes(item.to);
            }
            if (item.adminOnly && !isAdmin) return false;
            if (user?.role === 'STUDENT') {
              const studentRoutes = ['/', '/students', '/timetables', '/notices', '/messages'];
              return studentRoutes.includes(item.to);
            }
            return true;
          });
          if (visibleItems.length === 0) return null;
          return (
            <div key={group.label} className="mb-2">
              {!sidebarCollapsed && (
                <p className="text-[10px] font-semibold text-slate-600 uppercase tracking-wider px-3 py-2">
                  {group.label}
                </p>
              )}
              {visibleItems.map((item) => {
                const isStudentProfile = item.to === '/students' && user?.role === 'STUDENT';
                const label = isStudentProfile ? 'My Profile' : item.label;
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    id={`sidebar-nav-${label.toLowerCase().replace(/\s+/g, '-')}`}
                    className={({ isActive }) =>
                      `sidebar-link ${isActive ? 'active' : ''} ${sidebarCollapsed ? 'justify-center' : ''}`
                    }
                    title={sidebarCollapsed ? label : undefined}
                  >
                    <span className="flex-shrink-0">{item.icon}</span>
                    {!sidebarCollapsed && <span className="truncate">{label}</span>}
                  </NavLink>
                );
              })}
              {sidebarCollapsed && group.label !== 'Administration' && (
                <div className="my-2 border-t border-white/5" />
              )}
            </div>
          );
        })}
      </nav>

      {/* User Profile */}
      <div className="border-t border-white/5 p-3">
        {!sidebarCollapsed ? (
          <div className="flex items-center gap-3 p-2 rounded-xl hover:bg-white/5 transition-colors cursor-pointer group">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-400 to-teal-400 flex items-center justify-center text-xs font-bold text-white flex-shrink-0">
              {initials}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white truncate">
                {user?.firstName} {user?.lastName}
              </p>
              <p className="text-xs text-slate-500 truncate">{roleLabel}</p>
            </div>
            <button
              id="sidebar-logout-btn"
              onClick={handleLogout}
              title="Logout"
              className="p-1 rounded-lg text-slate-600 hover:text-red-400 hover:bg-red-500/10 transition-colors opacity-0 group-hover:opacity-100"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <button
            id="sidebar-logout-collapsed-btn"
            onClick={handleLogout}
            title="Logout"
            className="w-full flex items-center justify-center p-2 rounded-xl text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
          >
            <LogOut className="w-4 h-4" />
          </button>
        )}

        {/* Collapse Toggle */}
        <button
          id="sidebar-collapse-btn"
          onClick={toggleSidebar}
          className="w-full flex items-center justify-center p-2 mt-1 rounded-xl text-slate-600 hover:text-white hover:bg-white/5 transition-colors"
          title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {sidebarCollapsed
            ? <ChevronRight className="w-4 h-4" />
            : <ChevronLeft className="w-4 h-4" />}
        </button>
      </div>
    </aside>
  );
};
