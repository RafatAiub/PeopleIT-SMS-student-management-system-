import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Users, UserCheck, BookOpen, Calendar, FileText,
  MessageSquare, Bell, Settings, ChevronLeft, ChevronRight,
  LogOut, GraduationCap, Receipt, BarChart3, ClipboardList,
  Megaphone, ShieldCheck, Library, Bus, Brain, Globe, X
} from 'lucide-react';
import { useAuthStore, User } from '@/store/authStore';
import { useUiStore } from '@/store/uiStore';
import { useAuth } from '@/hooks/useAuth';

type Role = User['role'];

interface NavItem {
  to: string;
  icon: React.ReactNode;
  label: string;
  /** Roles allowed to see this item. Omit to allow every role. */
  roles?: Role[];
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

// Role Permission Access Matrix — mirrors the route guards in App.tsx /
// backend *.routes.ts requireRole() calls, so the sidebar never advertises
// a link a role would be redirected away from.
// Role Permission Access Matrix (PROJECT_STATUS.md) — resource -> role visibility.
// Super Admin is scoped to tenant/platform management (Institutions, Branches &
// Classes, User Accounts, Audit Logs); it deliberately does NOT see day-to-day
// school-operations resources (Students, Attendance, Exam Marks, Invoices,
// Library, Transport, HR, Notices, Messages) — those are Admin's domain.
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
      // Student Profiles: Admin Full, Teacher R/W, Accountant/Librarian Read, Student Own Only
      { to: '/students', icon: <Users className="w-4.5 h-4.5" />, label: 'Students', roles: ['ADMIN', 'TEACHER', 'ACCOUNTANT', 'LIBRARIAN', 'STUDENT'] },
      // Attendance Records: Admin Full, Teacher R/W, Accountant Read, Student/Guardian Own Only
      { to: '/attendance', icon: <UserCheck className="w-4.5 h-4.5" />, label: 'Attendance', roles: ['ADMIN', 'TEACHER', 'ACCOUNTANT', 'STUDENT', 'GUARDIAN'] },
      // Exam Marks & Grades: Admin Full, Teacher R/W, Student/Guardian Own Only
      { to: '/results', icon: <BookOpen className="w-4.5 h-4.5" />, label: 'Results', roles: ['ADMIN', 'TEACHER', 'STUDENT', 'GUARDIAN'] },
      { to: '/timetables', icon: <Calendar className="w-4.5 h-4.5" />, label: 'Timetable' },
    ],
  },
  {
    label: 'Management',
    items: [
      // HR & Payroll: Admin Full, Accountant Read
      { to: '/hr', icon: <Users className="w-4.5 h-4.5" />, label: 'HR & Payroll', roles: ['ADMIN', 'ACCOUNTANT'] },
      { to: '/ai-insights', icon: <Brain className="w-4.5 h-4.5" />, label: 'AI Insights', roles: ['ADMIN', 'TEACHER'] },
      { to: '/website-builder', icon: <Globe className="w-4.5 h-4.5" />, label: 'Website Builder', roles: ['ADMIN'] },
    ],
  },
  {
    label: 'Finance',
    items: [
      // Invoices & Payments: Admin Full, Accountant R/W, Student/Guardian Pay Own Only
      { to: '/fees', icon: <Receipt className="w-4.5 h-4.5" />, label: 'Fees & Billing', roles: ['ADMIN', 'ACCOUNTANT', 'STUDENT', 'GUARDIAN'] },
      { to: '/reports', icon: <BarChart3 className="w-4.5 h-4.5" />, label: 'Reports', roles: ['ADMIN', 'ACCOUNTANT'] },
    ],
  },
  {
    label: 'Communication',
    items: [
      // Messages: Admin Full, everyone else Own conversations only (Super Admin excluded)
      { to: '/messages', icon: <MessageSquare className="w-4.5 h-4.5" />, label: 'Messages', roles: ['ADMIN', 'TEACHER', 'ACCOUNTANT', 'LIBRARIAN', 'TRANSPORT_OFFICER', 'STUDENT', 'GUARDIAN'] },
      // Notices: Admin Full, Teacher R/W, everyone else Read (Super Admin excluded)
      { to: '/notices', icon: <Megaphone className="w-4.5 h-4.5" />, label: 'Notices', roles: ['ADMIN', 'TEACHER', 'ACCOUNTANT', 'LIBRARIAN', 'TRANSPORT_OFFICER', 'STUDENT', 'GUARDIAN'] },
    ],
  },
  {
    label: 'Administration',
    items: [
      // User Accounts: backend (user.routes.ts) only permits SUPER_ADMIN/ADMIN — Teacher/Accountant would 403, so kept out of the nav too.
      { to: '/users', icon: <ShieldCheck className="w-4.5 h-4.5" />, label: 'Users', roles: ['SUPER_ADMIN', 'ADMIN'] },
      // Branches & Classes: Super Admin/Admin Full, everyone else Read
      { to: '/settings', icon: <Settings className="w-4.5 h-4.5" />, label: 'Settings', roles: ['SUPER_ADMIN', 'ADMIN', 'TEACHER', 'ACCOUNTANT', 'LIBRARIAN', 'TRANSPORT_OFFICER', 'STUDENT', 'GUARDIAN'] },
    ],
  },
  {
    label: 'Facilities',
    items: [
      // Library: Admin Full, Librarian Full, Student/Guardian Own Issues
      { to: '/library', icon: <Library className="w-4.5 h-4.5" />, label: 'Library', roles: ['ADMIN', 'LIBRARIAN', 'STUDENT', 'GUARDIAN'] },
      // Transport: Admin Full, Transport Officer Full, Student/Guardian Own Only
      { to: '/transport', icon: <Bus className="w-4.5 h-4.5" />, label: 'Transport', roles: ['ADMIN', 'TRANSPORT_OFFICER', 'STUDENT', 'GUARDIAN'] },
    ],
  },
];

export const Sidebar: React.FC<{ isMobile?: boolean }> = ({ isMobile = false }) => {
  const { sidebarCollapsed, toggleSidebar, setMobileMenuOpen } = useUiStore();
  const { user } = useAuthStore();
  const { logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout.mutate(undefined, {
      onSettled: () => {
        if (isMobile) setMobileMenuOpen(false);
        navigate('/login');
      },
    });
  };

  const initials = user
    ? `${user.firstName[0]}${user.lastName[0]}`.toUpperCase()
    : 'U';

  const roleLabel: Record<Role, string> = {
    SUPER_ADMIN: 'Super Admin',
    ADMIN: 'Administrator',
    TEACHER: 'Teacher',
    ACCOUNTANT: 'Accountant',
    LIBRARIAN: 'Librarian',
    TRANSPORT_OFFICER: 'Transport Officer',
    GUARDIAN: 'Guardian',
    STUDENT: 'Student',
    MANAGEMENT: 'Management',
  };
  const roleLabelText = user ? roleLabel[user.role] : 'User';

  return (
    <aside
      className={`flex flex-col h-full bg-white/95 dark:bg-[#0B0F19]/95 border-r border-slate-200 dark:border-white/5 transition-all duration-300 ease-in-out flex-shrink-0 ${
        isMobile ? 'w-full' : sidebarCollapsed ? 'w-16' : 'w-60'
      }`}
      style={{ backdropFilter: 'blur(16px)' }}
    >
      {/* Logo */}
      <div className={`flex items-center justify-between px-4 py-5 border-b border-slate-200 dark:border-white/5 ${(sidebarCollapsed && !isMobile) ? 'justify-center' : ''}`}>
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary-500 to-accent-500 flex items-center justify-center flex-shrink-0 glow-indigo shadow-md">
            <GraduationCap className="w-4.5 h-4.5 text-white" />
          </div>
          {(!sidebarCollapsed || isMobile) && (
            <div>
              <span className="text-gradient font-bold text-sm leading-none block">PeopleIT SMS</span>
              <span className="text-slate-600 dark:text-slate-500 text-xs">
                {user?.institutionName || 'School Management'}
              </span>
            </div>
          )}
        </div>
        {isMobile && (
          <button
            onClick={() => setMobileMenuOpen(false)}
            className="p-1.5 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white rounded-lg hover:bg-slate-100 dark:hover:bg-white/5 transition-colors"
            title="Close menu"
          >
            <X className="w-4.5 h-4.5" />
          </button>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5 animate-in fade-in duration-200">
        {NAV_GROUPS.map((group) => {
          const visibleItems = group.items.filter((item) => {
            if (!item.roles) return true;
            return !!user && item.roles.includes(user.role);
          });
          if (visibleItems.length === 0) return null;
          return (
            <div key={group.label} className="mb-2">
              {(!sidebarCollapsed || isMobile) && (
                <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider px-3 py-2">
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
                      `sidebar-link ${isActive ? 'active' : ''} ${(sidebarCollapsed && !isMobile) ? 'justify-center' : ''}`
                    }
                    title={(sidebarCollapsed && !isMobile) ? label : undefined}
                    onClick={() => isMobile && setMobileMenuOpen(false)}
                  >
                    <span className="flex-shrink-0">{item.icon}</span>
                    {(!sidebarCollapsed || isMobile) && <span className="truncate">{label}</span>}
                  </NavLink>
                );
              })}
              {sidebarCollapsed && !isMobile && group.label !== 'Administration' && (
                <div className="my-2 border-t border-slate-200 dark:border-white/5" />
              )}
            </div>
          );
        })}
      </nav>

      {/* User Profile */}
      <div className="border-t border-slate-200 dark:border-white/5 p-3">
        {!sidebarCollapsed || isMobile ? (
          <div className="flex items-center gap-3 p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-white/5 transition-colors cursor-pointer group">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-400 to-teal-400 flex items-center justify-center text-xs font-bold text-white flex-shrink-0">
              {initials}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-900 dark:text-white truncate">
                {user?.firstName} {user?.lastName}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{roleLabelText}</p>
            </div>
            <button
              id="sidebar-logout-btn"
              onClick={handleLogout}
              title="Logout"
              className="p-1 rounded-lg text-slate-500 dark:text-slate-600 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors md:opacity-0 md:group-hover:opacity-100"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <button
            id="sidebar-logout-collapsed-btn"
            onClick={handleLogout}
            title="Logout"
            className="w-full flex items-center justify-center p-2 rounded-xl text-slate-500 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
          >
            <LogOut className="w-4 h-4" />
          </button>
        )}

        {/* Collapse Toggle */}
        {!isMobile && (
          <button
            id="sidebar-collapse-btn"
            onClick={toggleSidebar}
            className="w-full flex items-center justify-center p-2 mt-1 rounded-xl text-slate-500 dark:text-slate-600 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/5 transition-colors"
            title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {sidebarCollapsed
              ? <ChevronRight className="w-4 h-4" />
              : <ChevronLeft className="w-4 h-4" />}
          </button>
        )}
      </div>
    </aside>
  );
};
