import React from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  LayoutDashboard, BookOpen,
  MessageSquare, ChevronLeft, ChevronRight, ChevronDown,
  LogOut, Receipt, ShieldCheck, Library, Briefcase, X, Search,
  Building2, CreditCard, LifeBuoy, GraduationCap, Presentation, CalendarClock, CalendarHeart, PartyPopper,
} from 'lucide-react';
import { LogoMark } from '../common/LogoMark';
import { useAuthStore, User } from '@/store/authStore';
import { useUiStore } from '@/store/uiStore';
import { useAuth } from '@/hooks/useAuth';
import { useT } from '@/i18n';
import { cn } from '@/lib/cn';
import { Avatar } from '@/components/ui/Display';

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
      { to: '/super-admin/support', label: 'Support Tickets' },
      { to: '/super-admin/usage', label: 'Usage & Costs' },
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
      // Session Year: academic sessions + the default one used by admissions/events — Admin only
      { to: '/academics/session-years', label: 'Session Year', roles: ['SUPER_ADMIN', 'ADMIN'] },
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
      { to: '/subject-attendance', label: 'Subject Attendance', roles: ['SUPER_ADMIN', 'ADMIN', 'TEACHER', 'STUDENT', 'GUARDIAN'] },
      { to: '/staff-attendance', label: 'Staff Attendance', roles: ['SUPER_ADMIN', 'ADMIN'] },
      { to: '/staff-attendance/me', label: 'My Attendance', roles: ['TEACHER', 'ACCOUNTANT', 'LIBRARIAN', 'TRANSPORT_OFFICER', 'MANAGEMENT'] },
      { to: '/qr/kiosk', label: 'QR Check-in', roles: ['SUPER_ADMIN', 'ADMIN', 'TEACHER'] },
      { to: '/qr/codes', label: 'Check-in QR Codes', roles: ['SUPER_ADMIN', 'ADMIN'] },
      // Exam Marks & Grades: Admin Full, Teacher R/W, Student/Guardian Own Only
      { to: '/results', label: 'Results', roles: ['ADMIN', 'TEACHER', 'STUDENT', 'GUARDIAN'] },
      { to: '/exams/timetable', label: 'Exam Timetable', roles: ['SUPER_ADMIN', 'ADMIN', 'TEACHER', 'STUDENT', 'GUARDIAN'] },
      { to: '/results/merit-list', label: 'Merit List', roles: ['SUPER_ADMIN', 'ADMIN', 'TEACHER'] },
      { to: '/results/class-performance', label: 'Class Performance', roles: ['SUPER_ADMIN', 'ADMIN', 'TEACHER'] },
      { to: '/results/transcript', label: 'Transcript & Progress', roles: ['SUPER_ADMIN', 'ADMIN', 'TEACHER', 'STUDENT', 'GUARDIAN'] },
      { to: '/promotion', label: 'Promotion', roles: ['SUPER_ADMIN', 'ADMIN'] },
      { to: '/grading', label: 'Grading Scales', roles: ['SUPER_ADMIN', 'ADMIN'] },
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
      // Admission enquiries CRM (pipeline + funnel) — Admin only
      { to: '/admissions/enquiries', label: 'Admission Enquiries', roles: ['SUPER_ADMIN', 'ADMIN'] },
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
      { to: '/ai', label: 'AI Assistant', roles: ['SUPER_ADMIN', 'ADMIN', 'TEACHER', 'ACCOUNTANT', 'LIBRARIAN', 'TRANSPORT_OFFICER', 'MANAGEMENT'] },
      { to: '/ai/review', label: 'AI Review Queue', roles: ['SUPER_ADMIN', 'ADMIN', 'TEACHER'] },
      { to: '/ai/knowledge', label: 'Knowledge Base', roles: ['SUPER_ADMIN', 'ADMIN'] },
      { to: '/website-builder', label: 'Website Builder', roles: ['ADMIN'] },
      { to: '/developer', label: 'API & Webhooks', roles: ['SUPER_ADMIN', 'ADMIN'] },
      { to: '/data-export', label: 'Data Export', roles: ['SUPER_ADMIN', 'ADMIN'] },
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
    label: 'Holiday',
    icon: <CalendarHeart className="w-4.5 h-4.5" />,
    children: [
      // Holiday List: Admin manages (create/edit/delete, weekly off days, govt sync), everyone else views read-only
      { to: '/holidays', label: 'Holiday List' },
    ],
  },
  {
    kind: 'category',
    label: 'Events',
    icon: <PartyPopper className="w-4.5 h-4.5" />,
    children: [
      // Events: Admin creates/edits/deletes, everyone else sees the events addressed to their role
      { to: '/events', label: 'Events' },
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
      // Analytics hub: tabs filtered by role; teachers limited to their own sections by the API
      { to: '/analytics', label: 'Analytics', roles: ['SUPER_ADMIN', 'ADMIN', 'ACCOUNTANT', 'MANAGEMENT', 'TEACHER'] },
      { to: '/analytics/schedules', label: 'Scheduled Reports', roles: ['SUPER_ADMIN', 'ADMIN', 'ACCOUNTANT'] },
      { to: '/usage', label: 'Usage & Costs', roles: ['SUPER_ADMIN', 'ADMIN'] },
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
      { to: '/support', label: 'Support', roles: ['ADMIN', 'TEACHER', 'ACCOUNTANT', 'LIBRARIAN', 'TRANSPORT_OFFICER', 'STUDENT', 'GUARDIAN', 'MANAGEMENT'] },
      // Bulk SMS/email/in-app campaigns + message groups (teachers: own sections only, enforced by API)
      { to: '/communication/campaigns', label: 'Campaigns', roles: ['SUPER_ADMIN', 'ADMIN', 'TEACHER'] },
      // AI school assistant for guardians (answers from records; open questions go to staff review)
      { to: '/ai/assistant', label: 'School Assistant', roles: ['GUARDIAN'] },
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
      { to: '/qr/me', label: 'My Check-in QR', roles: ['TEACHER', 'ACCOUNTANT', 'LIBRARIAN', 'TRANSPORT_OFFICER', 'STUDENT', 'MANAGEMENT'] },
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
      { to: '/settings/custom-fields', label: 'Custom Fields', roles: ['SUPER_ADMIN', 'ADMIN'] },
      { to: '/onboarding/setup', label: 'Setup Wizard', roles: ['SUPER_ADMIN', 'ADMIN'] },
      // Inventory & assets: SA/A manage, Accountant read-only (enforced by API)
      { to: '/inventory', label: 'Inventory & Assets', roles: ['SUPER_ADMIN', 'ADMIN', 'ACCOUNTANT'] },
    ],
  },
];

// Not a sidebar entry (reached via role-based redirect, not a direct nav
// link) but still needs a header page title.
const EXTRA_ROUTE_LABELS: Record<string, string> = {
  '/teacher': 'Teacher Dashboard',
  '/design-system': 'Design system',
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

/** Flat, role-filtered list of every page the user can reach from the
 *  sidebar — used by the command palette so it never offers a page the
 *  sidebar (and route guards) would not. Duplicate routes are collapsed. */
export interface NavTarget { to: string; label: string; group: string }
export const getNavTargets = (role?: Role): NavTarget[] => {
  const entries = role === 'SUPER_ADMIN' ? SUPER_ADMIN_NAV_ENTRIES : NAV_ENTRIES;
  const out: NavTarget[] = [];
  const seen = new Set<string>();
  for (const entry of entries) {
    if (entry.kind === 'link') {
      if (roleCanSee(entry.roles, role) && !seen.has(entry.to)) {
        seen.add(entry.to);
        out.push({ to: entry.to, label: entry.label, group: entry.label });
      }
    } else {
      for (const c of entry.children) {
        if (!roleCanSee(c.roles, role) || seen.has(c.to)) continue;
        seen.add(c.to);
        const label = c.to === '/students' && role === 'STUDENT' ? 'My Profile' : c.label;
        out.push({ to: c.to, label, group: entry.label });
      }
    }
  }
  return out;
};

export const ROLE_LABEL: Record<Role, string> = {
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

export const Sidebar: React.FC<{ isMobile?: boolean }> = ({ isMobile = false }) => {
  const { sidebarCollapsed, toggleSidebar, setMobileMenuOpen } = useUiStore();
  const { user, supportSession } = useAuthStore();
  const { logout } = useAuth();
  const t = useT();
  const navigate = useNavigate();
  const location = useLocation();
  const [navFilter, setNavFilter] = React.useState('');
  const [openCategory, setOpenCategory] = React.useState<string | null>(null);

  const entries = user?.role === 'SUPER_ADMIN' ? SUPER_ADMIN_NAV_ENTRIES : NAV_ENTRIES;

  // Keep the accordion in sync with the current route: whichever category
  // owns the active page auto-expands.
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

  const roleLabelText = user ? t(ROLE_LABEL[user.role]) : 'User';
  const { institutionLogo, institutionName } = useUiStore();
  // A bare Super Admin is on the global platform view, not scoped to any one
  // institution — only show institution branding while actively impersonating
  // one via a support session.
  const showInstitutionBranding = user?.role !== 'SUPER_ADMIN' || !!supportSession;

  const navQuery = navFilter.trim().toLowerCase();
  const collapsed = sidebarCollapsed && !isMobile;
  const showLabels = !collapsed;
  const matches = (label: string) =>
    !navQuery || label.toLowerCase().includes(navQuery) || t(label).toLowerCase().includes(navQuery);
  const activeBar = <span aria-hidden className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r bg-primary-500" />;

  return (
    <aside
      aria-label="Main navigation"
      style={{ background: 'var(--bg-sidebar)' }}
      className={cn(
        'flex flex-col h-full shrink-0 border-r border-black/20 transition-[width] duration-200 ease-out',
        isMobile ? 'w-full' : collapsed ? 'w-[68px]' : 'w-64'
      )}
    >
      {/* Brand */}
      <div className={cn('flex items-center h-16 px-4 border-b border-white/8', collapsed ? 'justify-center' : 'justify-between')}>
        <div className="flex items-center gap-3 min-w-0">
          {showInstitutionBranding && institutionLogo ? (
            <div className="w-9 h-9 rounded-lg bg-white p-1 flex items-center justify-center shrink-0 overflow-hidden">
              <img src={institutionLogo} alt="" className="w-full h-full object-contain" />
            </div>
          ) : (
            <LogoMark className="w-9 h-9 shrink-0 rounded-lg" />
          )}
          {showLabels && (
            <div className="min-w-0">
              <span className="font-bold text-[15px] leading-none block text-white tracking-tight">
                People<span className="text-primary-400">NIT</span>
              </span>
              <span className="text-[11px] truncate block max-w-42 mt-1" style={{ color: 'var(--fg-sidebar-muted)' }}>
                {showInstitutionBranding ? (institutionName || user?.institutionName || 'School Management') : 'Platform Administration'}
              </span>
            </div>
          )}
        </div>
        {isMobile && (
          <button
            type="button"
            onClick={() => setMobileMenuOpen(false)}
            className="p-1.5 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-colors"
            aria-label={t('Close')}
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Filter */}
      {showLabels && (
        <div className="px-3 pt-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none text-white/45" aria-hidden />
            <input
              type="search"
              value={navFilter}
              onChange={(e) => setNavFilter(e.target.value)}
              placeholder={t('Filter menu…')}
              aria-label="Filter navigation"
              className="w-full h-9 rounded-lg pl-9 pr-3 text-sm bg-white/7 border border-white/6 text-white placeholder:text-white/45 focus:outline-none focus:border-primary-400/60 focus:bg-white/10 transition-colors"
            />
          </div>
        </div>
      )}

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-3 px-2.5 space-y-0.5">
        {entries.map((entry) => {
          if (entry.kind === 'link') {
            if (!roleCanSee(entry.roles, user?.role)) return null;
            if (!matches(entry.label)) return null;
            return (
              <NavLink
                key={entry.to}
                to={entry.to}
                end
                id={`sidebar-nav-${entry.label.toLowerCase().replace(/\s+/g, '-')}`}
                className={({ isActive }) => cn('sidebar-link', isActive && 'active', collapsed && 'justify-center px-0')}
                title={collapsed ? t(entry.label) : undefined}
                onClick={() => isMobile && setMobileMenuOpen(false)}
              >
                {({ isActive }) => (
                  <>
                    {isActive && activeBar}
                    <span className="shrink-0">{entry.icon}</span>
                    {showLabels && <span className="truncate">{t(entry.label)}</span>}
                  </>
                )}
              </NavLink>
            );
          }

          // Category: role-filter, then (if searching) label-filter its children.
          const roleFiltered = entry.children.filter((c) => roleCanSee(c.roles, user?.role));
          const visibleChildren = navQuery ? roleFiltered.filter((c) => matches(c.label)) : roleFiltered;
          if (visibleChildren.length === 0) return null;

          const isOpen = navQuery ? true : openCategory === entry.label;
          const hasActiveChild = visibleChildren.some((c) => location.pathname === c.to);

          return (
            <div key={entry.label}>
              <button
                type="button"
                onClick={() => handleCategoryClick(entry.label)}
                aria-expanded={showLabels ? isOpen : undefined}
                className={cn('sidebar-link w-full', showLabels ? 'justify-between' : 'justify-center px-0', hasActiveChild && 'text-white!')}
                title={collapsed ? t(entry.label) : undefined}
              >
                {hasActiveChild && collapsed && activeBar}
                <span className="flex items-center gap-3 min-w-0">
                  <span className={cn('shrink-0', hasActiveChild && 'text-primary-400')}>{entry.icon}</span>
                  {showLabels && <span className="truncate">{t(entry.label)}</span>}
                </span>
                {showLabels && (
                  <ChevronDown className={cn('w-3.5 h-3.5 shrink-0 opacity-60 transition-transform duration-200', isOpen && 'rotate-180')} aria-hidden />
                )}
              </button>

              <AnimatePresence initial={false}>
                {isOpen && showLabels && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.16, ease: 'easeOut' }}
                    className="overflow-hidden"
                  >
                    <div className="ml-[1.35rem] pl-3 border-l border-white/10 my-0.5 space-y-px">
                      {visibleChildren.map((child) => {
                        const isStudentProfile = child.to === '/students' && user?.role === 'STUDENT';
                        const label = isStudentProfile ? 'My Profile' : child.label;
                        return (
                          <NavLink
                            key={`${entry.label}-${child.to}`}
                            to={child.to}
                            end
                            id={`sidebar-nav-${label.toLowerCase().replace(/\s+/g, '-')}`}
                            onClick={() => isMobile && setMobileMenuOpen(false)}
                            className={({ isActive }) =>
                              cn(
                                'flex items-center gap-2 px-2.5 py-1.5 rounded-md text-[13px] transition-colors',
                                isActive ? 'font-semibold' : 'hover:text-white! hover:bg-white/6'
                              )
                            }
                            style={({ isActive }) =>
                              isActive
                                ? { color: 'var(--fg-sidebar-active)', background: 'var(--bg-sidebar-active)' }
                                : { color: 'var(--fg-sidebar-muted)' }
                            }
                          >
                            <span className="truncate">{t(label)}</span>
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

      {/* User + collapse */}
      <div className="border-t border-white/8 p-2.5 space-y-1">
        {showLabels ? (
          <div className="flex items-center gap-3 p-2 rounded-lg">
            <Avatar name={`${user?.firstName ?? ''} ${user?.lastName ?? ''}`} src={user?.avatarUrl} size="sm" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white truncate">
                {user?.firstName} {user?.lastName}
              </p>
              <p className="text-xs truncate" style={{ color: 'var(--fg-sidebar-muted)' }}>{roleLabelText}</p>
            </div>
            <button
              type="button"
              id="sidebar-logout-btn"
              onClick={handleLogout}
              aria-label={t('Sign out')}
              title={t('Sign out')}
              className="p-1.5 rounded-lg text-white/60 hover:text-red-300 hover:bg-red-500/15 transition-colors"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            id="sidebar-logout-collapsed-btn"
            onClick={handleLogout}
            aria-label={t('Sign out')}
            title={t('Sign out')}
            className="w-full flex items-center justify-center p-2 rounded-lg text-white/60 hover:text-red-300 hover:bg-red-500/15 transition-colors"
          >
            <LogOut className="w-4 h-4" />
          </button>
        )}

        {!isMobile && (
          <button
            type="button"
            id="sidebar-collapse-btn"
            onClick={toggleSidebar}
            className="w-full flex items-center justify-center gap-2 p-2 rounded-lg text-white/55 hover:text-white hover:bg-white/6 transition-colors text-xs"
            aria-label={sidebarCollapsed ? t('Expand sidebar') : t('Collapse sidebar')}
            title={sidebarCollapsed ? t('Expand sidebar') : t('Collapse sidebar')}
          >
            {sidebarCollapsed ? (
              <ChevronRight className="w-4 h-4" />
            ) : (
              <>
                <ChevronLeft className="w-4 h-4" />
                {t('Collapse sidebar')}
              </>
            )}
          </button>
        )}
      </div>
    </aside>
  );
};
