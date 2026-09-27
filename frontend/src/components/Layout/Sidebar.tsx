import React from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  LayoutDashboard, BookOpen,
  MessageSquare, ChevronLeft, ChevronRight, ChevronDown,
  LogOut, Receipt, ShieldCheck, Library, Briefcase, X, Search,
  Building2, CreditCard, LifeBuoy, GraduationCap, Presentation, CalendarClock, FileSignature,
} from 'lucide-react';
import { LogoMark } from '../common/LogoMark';
import { useAuthStore, User } from '@/store/authStore';
import { useUiStore } from '@/store/uiStore';
import { useAuth } from '@/hooks/useAuth';

type Role = User['role'];

/** A directly-clickable route — either a top-level entry on its own
 *  (Dashboard, Parents, …) or one row inside an expandable category
 *  (Academics > Students, Finance > Reports, …). */
interface NavLeaf {
  to: string;
  label: string;
  /** Roles allowed to see this item. Omit to allow every role. */
  roles?: Role[];
}

/** A top-level entry that is just a link — no children to expand. */
interface NavLinkEntry extends NavLeaf {
  kind: 'link';
  icon: React.ReactNode;
}

/** A top-level entry that expands/collapses to reveal its children —
 *  mirrors the eSchool-style accordion sidebar (icon + label + chevron,
 *  dot-bulleted sub-items indented underneath). */
interface NavCategoryEntry {
  kind: 'category';
  label: string;
  icon: React.ReactNode;
  children: NavLeaf[];
}

type NavEntry = NavLinkEntry | NavCategoryEntry;

// Role Permission Access Matrix — mirrors the route guards in App.tsx /
// backend *.routes.ts requireRole() calls, so the sidebar never advertises
// a link a role would be redirected away from.
// Super Admin is scoped to tenant/platform management (Institutions, Branches &
// Classes, User Accounts, Audit Logs); it deliberately does NOT see day-to-day
// school-operations resources (Students, Attendance, Exam Marks, Invoices,
// Library, Transport, HR, Notices, Messages) — those are Admin's domain.
const SUPER_ADMIN_NAV_ENTRIES: NavEntry[] = [
  { kind: 'link', to: '/', icon: <LayoutDashboard className="w-4.5 h-4.5" />, label: 'Overview' },
  {
    kind: 'category',
    label: 'Platform Control',
    icon: <Building2 className="w-4.5 h-4.5" />,
    children: [
      { to: '/super-admin/institutions', label: 'Institutions' },
      { to: '/super-admin/applications', label: 'Applications' },
      { to: '/super-admin/authorized-emails', label: 'Authorized Emails' },
      { to: '/super-admin/leads', label: 'Leads' },
      { to: '/users', label: 'Users' },
      { to: '/super-admin/billing', label: 'Billing' },
    ],
  },
  {
    kind: 'category',
    label: 'Support & Ops',
    icon: <LifeBuoy className="w-4.5 h-4.5" />,
    children: [
      { to: '/super-admin/support-access', label: 'Support Access' },
      { to: '/super-admin/audit-logs', label: 'Audit Logs' },
      { to: '/super-admin/system-health', label: 'System Health' },
    ],
  },
];

const NAV_ENTRIES: NavEntry[] = [
  { kind: 'link', to: '/', icon: <LayoutDashboard className="w-4.5 h-4.5" />, label: 'Dashboard' },
  {
    kind: 'category',
    label: 'Academics',
    icon: <BookOpen className="w-4.5 h-4.5" />,
    children: [
      // Academics setup lookups (Medium/Section/Stream/Shifts/Subject/Semester/Class) —
      // Super Admin/Admin only, ordering and labels match the eSchool reference sidebar.
      { to: '/academics/mediums', label: 'Medium', roles: ['SUPER_ADMIN', 'ADMIN'] },
      { to: '/academics/sections', label: 'Section', roles: ['SUPER_ADMIN', 'ADMIN'] },
      { to: '/academics/streams', label: 'Stream', roles: ['SUPER_ADMIN', 'ADMIN'] },
      { to: '/academics/shifts', label: 'Shifts', roles: ['SUPER_ADMIN', 'ADMIN'] },
      { to: '/academics/subjects', label: 'Subject', roles: ['SUPER_ADMIN', 'ADMIN'] },
      { to: '/academics/semesters', label: 'Semester', roles: ['SUPER_ADMIN', 'ADMIN'] },
      { to: '/academics/classes', label: 'Class', roles: ['SUPER_ADMIN', 'ADMIN'] },
      { to: '/academics/assign-class-teacher', label: 'Assign Class Teacher', roles: ['SUPER_ADMIN', 'ADMIN'] },
      { to: '/academics/assign-student-class', label: 'Assign New Student Class', roles: ['SUPER_ADMIN', 'ADMIN'] },
      // Attendance Records: Admin Full, Teacher R/W, Accountant Read, Student/Guardian Own Only
      { to: '/attendance', label: 'Attendance', roles: ['ADMIN', 'TEACHER', 'ACCOUNTANT', 'STUDENT', 'GUARDIAN'] },
      { to: '/timetables', label: 'Timetable' },
      // Lecture Materials: Admin Full, Teacher R/W (own uploads), Student/Guardian Read-only (own class/section)
      { to: '/lectures', label: 'Lecture Materials', roles: ['ADMIN', 'TEACHER', 'STUDENT', 'GUARDIAN'] },
    ],
  },
  {
    kind: 'category',
    label: 'Students',
    icon: <GraduationCap className="w-4.5 h-4.5" />,
    children: [
      { to: '/students/categories', label: 'Students Category', roles: ['SUPER_ADMIN', 'ADMIN'] },
      { to: '/students/admission', label: 'Students Admission', roles: ['SUPER_ADMIN', 'ADMIN'] },
      { to: '/students/online-registrations', label: 'Online Registrations', roles: ['SUPER_ADMIN', 'ADMIN'] },
      { to: '/students/assign-roll-no', label: 'Assign Roll No.', roles: ['SUPER_ADMIN', 'ADMIN', 'TEACHER'] },
      // Student Profiles: Admin Full, Teacher R/W, Accountant/Librarian Read, Student Own Only.
      // Existing /students route/label — relabeled to "Student Details" here
      // (STUDENT role still sees "My Profile" via getPageLabel's isStudentProfile special-case).
      { to: '/students', label: 'Student Details', roles: ['ADMIN', 'TEACHER', 'ACCOUNTANT', 'LIBRARIAN', 'STUDENT'] },
      { to: '/id-cards/generate', label: 'Generate Id Card', roles: ['SUPER_ADMIN', 'ADMIN'] },
      { to: '/students/generate-result', label: 'Generate Result', roles: ['SUPER_ADMIN', 'ADMIN', 'TEACHER'] },
      { to: '/students/reset-password', label: 'Students Reset Password', roles: ['SUPER_ADMIN', 'ADMIN'] },
      { to: '/students/bulk-data', label: 'Add Bulk Data', roles: ['SUPER_ADMIN', 'ADMIN'] },
    ],
  },
  {
    kind: 'category',
    label: 'Teacher',
    icon: <Presentation className="w-4.5 h-4.5" />,
    children: [
      { to: '/teacher/add', label: 'Add New Teacher', roles: ['SUPER_ADMIN', 'ADMIN'] },
      { to: '/teacher/details', label: 'Teacher Details', roles: ['SUPER_ADMIN', 'ADMIN'] },
      { to: '/id-cards/generate', label: 'Generate Id Card', roles: ['SUPER_ADMIN', 'ADMIN'] },
    ],
  },
  {
    kind: 'category',
    label: 'Management',
    icon: <Briefcase className="w-4.5 h-4.5" />,
    children: [
      // HR & Payroll: Admin Full, Accountant Read
      { to: '/hr', label: 'HR & Payroll', roles: ['ADMIN', 'ACCOUNTANT'] },
      { to: '/ai-insights', label: 'AI Insights', roles: ['ADMIN', 'TEACHER'] },
      { to: '/website-builder', label: 'Website Builder', roles: ['ADMIN'] },
    ],
  },
  {
    kind: 'category',
    label: 'Leave',
    icon: <CalendarClock className="w-4.5 h-4.5" />,
    children: [
      // Leave Settings (leave types): Admin only
      { to: '/leave/settings', label: 'Leave Settings', roles: ['ADMIN'] },
      // Leave Report: monthly usage-vs-allowance view for one staff member, Admin only
      { to: '/leave/report', label: 'Leave Report', roles: ['ADMIN'] },
      // Leave Request: Admin reviews/acts on all staff requests, everyone else self-service (apply/track/cancel own)
      { to: '/leave/requests', label: 'Leave Request', roles: ['ADMIN', 'TEACHER', 'ACCOUNTANT', 'LIBRARIAN', 'TRANSPORT_OFFICER', 'MANAGEMENT'] },
      // Student Leave: Admin reviews/acts on student requests, Student self-service (apply/track/cancel own) — Guardian excluded
      { to: '/leave/student', label: 'Student Leave', roles: ['ADMIN', 'STUDENT'] },
    ],
  },
  {
    kind: 'category',
    label: 'Exam',
    icon: <FileSignature className="w-4.5 h-4.5" />,
    children: [
      // Exam setup (exams, timetable, grade bands): Super Admin/Admin only
      { to: '/exams', label: 'Create Exam', roles: ['SUPER_ADMIN', 'ADMIN'] },
      { to: '/exams/timetable', label: 'Create Exam Timetable', roles: ['SUPER_ADMIN', 'ADMIN'] },
      // Exam Marks & Grades: Admin Full, Teacher R/W, Student/Guardian Own Only (published exams)
      { to: '/results', label: 'Exam Marks', roles: ['ADMIN', 'TEACHER', 'STUDENT', 'GUARDIAN'] },
      // Class-wide result summary + report cards: Admin, Teacher
      { to: '/exams/result', label: 'Exam Result', roles: ['SUPER_ADMIN', 'ADMIN', 'TEACHER'] },
      { to: '/exams/grades', label: 'Exam Grade', roles: ['SUPER_ADMIN', 'ADMIN'] },
    ],
  },
  {
    kind: 'category',
    label: 'Finance',
    icon: <Receipt className="w-4.5 h-4.5" />,
    children: [
      // Invoices & Payments: Admin Full, Accountant R/W, Student/Guardian Pay Own Only
      { to: '/fees', label: 'Fees & Billing', roles: ['ADMIN', 'ACCOUNTANT', 'STUDENT', 'GUARDIAN'] },
      { to: '/reports', label: 'Reports', roles: ['ADMIN', 'ACCOUNTANT'] },
      // Platform subscription billing (SSLCommerz) — Admin only, distinct from the school's own student-fee "Fees & Billing" above.
      { to: '/billing', label: 'Subscription', roles: ['ADMIN'] },
    ],
  },
  {
    kind: 'category',
    label: 'Communication',
    icon: <MessageSquare className="w-4.5 h-4.5" />,
    children: [
      // Messages: Admin Full, everyone else Own conversations only (Super Admin excluded)
      { to: '/messages', label: 'Messages', roles: ['ADMIN', 'TEACHER', 'ACCOUNTANT', 'LIBRARIAN', 'TRANSPORT_OFFICER', 'STUDENT', 'GUARDIAN'] },
      // Notices: Admin Full, Teacher R/W, everyone else Read (Super Admin excluded)
      { to: '/notices', label: 'Notices', roles: ['ADMIN', 'TEACHER', 'ACCOUNTANT', 'LIBRARIAN', 'TRANSPORT_OFFICER', 'STUDENT', 'GUARDIAN'] },
    ],
  },
  {
    kind: 'category',
    label: 'Facilities',
    icon: <Library className="w-4.5 h-4.5" />,
    children: [
      // Library: Admin Full, Librarian Full, Student/Guardian Own Issues
      { to: '/library', label: 'Library', roles: ['ADMIN', 'LIBRARIAN', 'STUDENT', 'GUARDIAN'] },
      // Transport: Admin Full, Transport Officer Full, Student/Guardian Own Only
      { to: '/transport', label: 'Transport', roles: ['ADMIN', 'TRANSPORT_OFFICER', 'STUDENT', 'GUARDIAN'] },
    ],
  },
  {
    kind: 'category',
    label: 'ID Cards',
    icon: <CreditCard className="w-4.5 h-4.5" />,
    children: [
      // Template design + card issuance: Admin Full (Super Admin only while impersonating via a support session, per ProtectedRoute's support-session bypass)
      { to: '/id-cards/builder', label: 'ID Card Builder', roles: ['SUPER_ADMIN', 'ADMIN'] },
      { to: '/id-cards/generate', label: 'Generate ID Cards', roles: ['SUPER_ADMIN', 'ADMIN'] },
      // Self-service "my card" view: Student + staff-like roles (matches /id-cards/me's server-side role scoping)
      { to: '/id-cards/mine', label: 'My ID Card', roles: ['TEACHER', 'ACCOUNTANT', 'LIBRARIAN', 'TRANSPORT_OFFICER', 'STUDENT', 'MANAGEMENT'] },
    ],
  },
  {
    kind: 'category',
    label: 'Administration',
    icon: <ShieldCheck className="w-4.5 h-4.5" />,
    children: [
      // User Accounts: backend (user.routes.ts) only permits SUPER_ADMIN/ADMIN — Teacher/Accountant would 403, so kept out of the nav too.
      { to: '/users', label: 'Users', roles: ['SUPER_ADMIN', 'ADMIN'] },
      // Branches & Classes: Super Admin/Admin Full, everyone else Read
      { to: '/settings', label: 'Settings', roles: ['SUPER_ADMIN', 'ADMIN', 'TEACHER', 'ACCOUNTANT', 'LIBRARIAN', 'TRANSPORT_OFFICER', 'STUDENT', 'GUARDIAN'] },
    ],
  },
];

// Not a sidebar entry (reached via role-based redirect, not a direct nav
// link) but still needs a header page title.
const EXTRA_ROUTE_LABELS: Record<string, string> = {
  '/teacher': 'Teacher Dashboard',
};

const roleCanSee = (roles: Role[] | undefined, role: Role | undefined): boolean =>
  !roles || (!!role && roles.includes(role));

/** Single source of truth for "what page is this" — reused by Header so the
 *  page title always matches the sidebar's own label for the same route,
 *  without duplicating the nav copy in two places. */
export const getPageLabel = (pathname: string, role?: Role): string => {
  const entries = role === 'SUPER_ADMIN' ? SUPER_ADMIN_NAV_ENTRIES : NAV_ENTRIES;
  for (const entry of entries) {
    if (entry.kind === 'link') {
      if (entry.to === pathname) return entry.label;
    } else {
      const match = entry.children.find((item) => item.to === pathname);
      if (match) return match.label;
    }
  }
  return EXTRA_ROUTE_LABELS[pathname] || 'Dashboard';
};

export const Sidebar: React.FC<{ isMobile?: boolean }> = ({ isMobile = false }) => {
  const { sidebarCollapsed, toggleSidebar, setMobileMenuOpen } = useUiStore();
  const { user, supportSession } = useAuthStore();
  const { logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [navFilter, setNavFilter] = React.useState('');
  const [openCategory, setOpenCategory] = React.useState<string | null>(null);

  const entries = user?.role === 'SUPER_ADMIN' ? SUPER_ADMIN_NAV_ENTRIES : NAV_ENTRIES;

  // Keep the accordion in sync with the current route: whichever category
  // owns the active page auto-expands, like eSchool's sidebar does when you
  // land on/navigate to one of its sub-pages.
  React.useEffect(() => {
    const owner = entries.find(
      (entry) => entry.kind === 'category' && entry.children.some((c) => c.to === location.pathname)
    );
    if (owner) setOpenCategory(owner.label);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname, user?.role]);

  const handleLogout = () => {
    logout.mutate(undefined, {
      onSettled: () => {
        if (isMobile) setMobileMenuOpen(false);
        navigate('/login');
      },
    });
  };

  const handleCategoryClick = (label: string) => {
    if (sidebarCollapsed && !isMobile) {
      toggleSidebar();
      setOpenCategory(label);
      return;
    }
    setOpenCategory((prev) => (prev === label ? null : label));
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

  const { institutionLogo, institutionName } = useUiStore();
  // A bare Super Admin is on the global platform view, not scoped to any one
  // institution — only show institution branding while actively impersonating
  // one via a support session. Otherwise always show the platform's own mark,
  // regardless of what's cached from a previous session/institution.
  const showInstitutionBranding = user?.role !== 'SUPER_ADMIN' || !!supportSession;

  const navQuery = navFilter.trim().toLowerCase();
  const showLabels = !sidebarCollapsed || isMobile;

  return (
    <aside
      className={`flex flex-col h-full bg-white dark:bg-surface-950 border-r border-slate-200 dark:border-white/5 transition-all duration-300 ease-in-out flex-shrink-0 ${
        isMobile ? 'w-full' : sidebarCollapsed ? 'w-16' : 'w-64'
      }`}
    >
      {/* Logo */}
      <div className={`flex items-center justify-between px-4 py-5 border-b border-slate-200 dark:border-white/5 ${(sidebarCollapsed && !isMobile) ? 'justify-center' : ''}`}>
        <div className="flex items-center gap-3">
          {showInstitutionBranding && institutionLogo ? (
            <div className="w-8 h-8 rounded-lg bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 p-1 flex items-center justify-center flex-shrink-0 shadow-xs overflow-hidden">
              <img src={institutionLogo} alt="Logo" className="w-full h-full object-contain" />
            </div>
          ) : (
            <LogoMark className="w-8 h-8 flex-shrink-0 rounded-lg shadow-sm" />
          )}
          {showLabels && (
            <div>
              <span className="font-extrabold text-base leading-none block text-slate-900 dark:text-white">
                People<span className="text-accent-500">NIT</span>
              </span>
              <span className="text-slate-500 dark:text-slate-500 text-[11px] truncate block max-w-[10rem]">
                {showInstitutionBranding ? (institutionName || user?.institutionName || 'School Management') : 'Platform Administration'}
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

      {/* Search / filter */}
      {showLabels && (
        <div className="px-3 pt-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            <input
              type="text"
              value={navFilter}
              onChange={(e) => setNavFilter(e.target.value)}
              placeholder="Search"
              aria-label="Search navigation"
              className="w-full bg-slate-100 dark:bg-white/5 border border-transparent focus:border-primary-300 dark:focus:border-primary-500/40 focus:bg-white dark:focus:bg-white/10 focus:outline-none focus:ring-2 focus:ring-primary-500/20 rounded-lg pl-9 pr-3 py-2 text-sm text-slate-700 dark:text-slate-200 placeholder-slate-400 transition-colors"
            />
          </div>
        </div>
      )}

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5 animate-fadeIn">
        {entries.map((entry) => {
          if (entry.kind === 'link') {
            if (!roleCanSee(entry.roles, user?.role)) return null;
            if (navQuery && !entry.label.toLowerCase().includes(navQuery)) return null;
            return (
              <NavLink
                key={entry.to}
                to={entry.to}
                id={`sidebar-nav-${entry.label.toLowerCase().replace(/\s+/g, '-')}`}
                className={({ isActive }) =>
                  `sidebar-link ${isActive ? 'active' : ''} ${(sidebarCollapsed && !isMobile) ? 'justify-center' : ''}`
                }
                title={(sidebarCollapsed && !isMobile) ? entry.label : undefined}
                onClick={() => isMobile && setMobileMenuOpen(false)}
              >
                {({ isActive }) => (
                  <>
                    {isActive && (
                      <motion.span
                        layoutId={isMobile ? 'sidebar-active-indicator-mobile' : 'sidebar-active-indicator'}
                        className="absolute left-0 top-0 bottom-0 w-0.5 bg-primary-600 dark:bg-primary-500 rounded-r"
                        transition={{ type: 'spring', stiffness: 500, damping: 40 }}
                      />
                    )}
                    <span className="flex-shrink-0">{entry.icon}</span>
                    {showLabels && <span className="truncate">{entry.label}</span>}
                  </>
                )}
              </NavLink>
            );
          }

          // Category: role-filter, then (if searching) label-filter its children.
          const roleFiltered = entry.children.filter((c) => roleCanSee(c.roles, user?.role));
          const visibleChildren = navQuery
            ? roleFiltered.filter((c) => c.label.toLowerCase().includes(navQuery))
            : roleFiltered;
          if (visibleChildren.length === 0) return null;

          const isOpen = navQuery ? true : openCategory === entry.label;
          const hasActiveChild = visibleChildren.some((c) => location.pathname === c.to);

          return (
            <div key={entry.label} className="mb-0.5">
              <button
                type="button"
                onClick={() => handleCategoryClick(entry.label)}
                aria-expanded={isOpen}
                className={`sidebar-link w-full ${showLabels ? 'justify-between' : 'justify-center'} ${
                  hasActiveChild ? 'text-primary-600 dark:text-primary-400 font-semibold' : ''
                }`}
                title={(sidebarCollapsed && !isMobile) ? entry.label : undefined}
              >
                <span className="flex items-center gap-3 min-w-0">
                  <span className="flex-shrink-0">{entry.icon}</span>
                  {showLabels && <span className="truncate">{entry.label}</span>}
                </span>
                {showLabels && (
                  <ChevronDown
                    className={`w-3.5 h-3.5 flex-shrink-0 text-slate-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
                  />
                )}
              </button>

              <AnimatePresence initial={false}>
                {isOpen && showLabels && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.18, ease: 'easeOut' }}
                    className="overflow-hidden"
                  >
                    <div className="ml-[1.15rem] pl-4 border-l border-slate-200 dark:border-white/10 my-1 space-y-0.5">
                      {visibleChildren.map((child) => {
                        const isStudentProfile = child.to === '/students' && user?.role === 'STUDENT';
                        const label = isStudentProfile ? 'My Profile' : child.label;
                        return (
                          <NavLink
                            key={child.to}
                            to={child.to}
                            id={`sidebar-nav-${label.toLowerCase().replace(/\s+/g, '-')}`}
                            onClick={() => isMobile && setMobileMenuOpen(false)}
                            className={({ isActive }) =>
                              `flex items-center gap-2.5 pl-3 pr-3 py-2 rounded-lg text-sm transition-colors ${
                                isActive
                                  ? 'text-primary-600 dark:text-primary-400 font-semibold bg-primary-50 dark:bg-primary-500/10'
                                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/5'
                              }`
                            }
                          >
                            <span className="w-1 h-1 rounded-full bg-current opacity-60 flex-shrink-0" />
                            <span className="truncate">{label}</span>
                          </NavLink>
                        );
                      })}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </nav>

      {/* User Profile */}
      <div className="border-t border-slate-200 dark:border-white/5 p-3">
        {!sidebarCollapsed || isMobile ? (
          <div className="flex items-center gap-3 p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-white/5 transition-colors cursor-pointer group">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary-400 to-accent-400 flex items-center justify-center text-xs font-bold text-white flex-shrink-0">
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
