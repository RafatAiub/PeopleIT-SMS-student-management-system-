import React from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from './store/authStore';
import { Sidebar } from './components/Layout/Sidebar';
import { Toaster } from 'react-hot-toast';
import { Menu, X, Bell, Sun, Moon, Monitor } from 'lucide-react';
import { useUiStore } from './store/uiStore';
import { useEffect } from 'react';

// Lazy load pages for performance
const Login = React.lazy(() => import('./pages/Login'));
const AdminDashboard = React.lazy(() => import('./pages/AdminDashboard'));
const TeacherDashboard = React.lazy(() => import('./pages/TeacherDashboard'));
const StudentList = React.lazy(() => import('./pages/students/StudentList'));
const InvoiceList = React.lazy(() => import('./pages/fees/InvoiceList'));
const AttendanceEntry = React.lazy(() => import('./pages/attendance/AttendanceEntry'));
const MarksEntry = React.lazy(() => import('./pages/results/MarksEntry'));
const TimetableGrid = React.lazy(() => import('./pages/timetables/TimetableGrid'));
const NoticeBoard = React.lazy(() => import('./pages/notices/NoticeBoard'));
const LibraryManagement = React.lazy(() => import('./pages/library/LibraryManagement'));
const TransportManagement = React.lazy(() => import('./pages/transport/TransportManagement'));
const HrPayrollManagement = React.lazy(() => import('./pages/hr/HrPayrollManagement'));
const AiInsights = React.lazy(() => import('./pages/ai/AiInsights'));
const WebsiteBuilder = React.lazy(() => import('./pages/website/WebsiteBuilder'));
const Reports = React.lazy(() => import('./pages/reports/Reports'));
const Messages = React.lazy(() => import('./pages/communication/Messages'));
const Users = React.lazy(() => import('./pages/users/Users'));
const Settings = React.lazy(() => import('./pages/settings/Settings'));

// Protected Route Wrapper
const ProtectedRoute = ({ children, allowedRoles }: { children: React.ReactNode, allowedRoles?: string[] }) => {
  const { isAuthenticated, user } = useAuthStore();
  const location = useLocation();

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (allowedRoles && user && !allowedRoles.includes(user.role)) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
};

// Layout Wrapper
const DashboardLayout = ({ children }: { children: React.ReactNode }) => {
  const { mobileMenuOpen, toggleMobileMenu, setMobileMenuOpen, notifications, theme, setTheme } = useUiStore();
  const { user } = useAuthStore();
  const [themeMenuOpen, setThemeMenuOpen] = React.useState(false);
  const themeMenuRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (themeMenuRef.current && !themeMenuRef.current.contains(event.target as Node)) {
        setThemeMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const unreadCount = notifications.filter(n => !n.read).length;
  const initials = user ? `${user.firstName[0]}${user.lastName[0]}`.toUpperCase() : 'U';

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50 dark:bg-[#0F172A] text-slate-900 dark:text-slate-200 transition-colors duration-300">
      {/* Desktop Sidebar */}
      <div className="hidden md:flex md:flex-shrink-0 h-full">
        <Sidebar />
      </div>

      {/* Mobile Sidebar overlay */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 md:hidden flex animate-in fade-in duration-200">
          {/* Backdrop overlay */}
          <div 
            className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm"
            onClick={() => setMobileMenuOpen(false)}
          />
          {/* Sidebar drawer content */}
          <div className="relative w-64 bg-slate-900 animate-in slide-in-from-left duration-300 h-full shadow-2xl">
            <Sidebar isMobile={true} />
          </div>
        </div>
      )}

      <div className="relative flex flex-col flex-1 overflow-y-auto overflow-x-hidden">
        {/* Simple Header */}
        <header className="sticky top-0 z-30 flex items-center justify-between px-4 py-4 sm:px-6 lg:px-8 bg-white/80 dark:bg-[#0F172A]/80 backdrop-blur-md shadow-sm border-b border-slate-200 dark:border-white/5 transition-colors duration-300">
          <div className="flex items-center">
            {/* Mobile Hamburger toggle */}
            <button
              id="mobile-menu-toggle"
              onClick={toggleMobileMenu}
              className="p-2 -ml-2 mr-2 text-slate-450 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/5 rounded-xl md:hidden transition-colors"
              title="Open menu"
            >
              <Menu className="w-6 h-6" />
            </button>
            <h1 className="text-xl font-extrabold text-slate-900 dark:text-white bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-indigo-600 dark:from-blue-400 dark:to-emerald-400">
              PeopleIT SMS
            </h1>
          </div>
          <div className="flex items-center gap-3">
            {/* Smart Theme Toggle Button */}
            <div className="relative" ref={themeMenuRef}>
              <button
                onClick={() => setThemeMenuOpen(!themeMenuOpen)}
                className="relative p-2.5 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/5 rounded-full transition-all duration-300 active:scale-95 flex items-center justify-center border border-transparent hover:border-slate-200 dark:hover:border-white/10"
                title={`Theme: ${theme.toUpperCase()} (Click to change)`}
              >
                {theme === 'light' && <Sun className="w-4.5 h-4.5 text-amber-500 animate-spin-slow" />}
                {theme === 'dark' && <Moon className="w-4.5 h-4.5 text-indigo-500 dark:text-indigo-400" />}
                {theme === 'system' && <Monitor className="w-4.5 h-4.5 text-blue-500 dark:text-blue-400" />}
              </button>

              {themeMenuOpen && (
                <div className="absolute right-0 mt-2.5 w-36 bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-2xl py-1.5 shadow-xl z-50 animate-in fade-in slide-in-from-top-2 duration-150">
                  <button
                    onClick={() => {
                      setTheme('light');
                      setThemeMenuOpen(false);
                    }}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold transition-all ${
                      theme === 'light'
                        ? 'bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400'
                        : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-white/5 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    <Sun className="w-4 h-4 text-amber-500" />
                    Light
                  </button>
                  <button
                    onClick={() => {
                      setTheme('dark');
                      setThemeMenuOpen(false);
                    }}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold transition-all ${
                      theme === 'dark'
                        ? 'bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400'
                        : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-white/5 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    <Moon className="w-4 h-4 text-indigo-500 dark:text-indigo-400" />
                    Dark
                  </button>
                  <button
                    onClick={() => {
                      setTheme('system');
                      setThemeMenuOpen(false);
                    }}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold transition-all ${
                      theme === 'system'
                        ? 'bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400'
                        : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-white/5 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    <Monitor className="w-4 h-4 text-blue-500 dark:text-blue-400" />
                    System
                  </button>
                </div>
              )}
            </div>

            <button className="relative p-2 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/5 rounded-full transition-colors">
              <Bell className="w-5 h-5" />
              {unreadCount > 0 && (
                <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full ring-2 ring-white dark:ring-[#0F172A]" />
              )}
            </button>
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-400 to-teal-400 flex items-center justify-center text-xs font-bold text-white shadow-sm ring-2 ring-white dark:ring-white/10">
              {initials}
            </div>
          </div>
        </header>
        
        {/* Main Content */}
        <main className="w-full max-w-7xl mx-auto p-4 sm:p-6 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  );
};

const DashboardRouter = () => {
  const { user } = useAuthStore();
  if (user?.role === 'STUDENT') {
    return <Navigate to="/students" replace />;
  }
  if (user?.role === 'GUARDIAN') {
    // No guardian-specific dashboard exists yet; AdminDashboard requires
    // admin-only data access and would 403. Land on Notices instead.
    return <Navigate to="/notices" replace />;
  }
  if (user?.role === 'TEACHER') {
    return <TeacherDashboard />;
  }
  return <AdminDashboard />;
};

// Route Configuration
const App = () => {
  const { theme } = useUiStore();

  useEffect(() => {
    const applyTheme = () => {
      const isDark = 
        theme === 'dark' || 
        (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
      
      if (isDark) {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    };

    applyTheme();

    if (theme === 'system') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      mediaQuery.addEventListener('change', applyTheme);
      return () => mediaQuery.removeEventListener('change', applyTheme);
    }
  }, [theme]);

  return (
    <React.Suspense fallback={<div className="h-screen w-screen flex flex-col items-center justify-center bg-slate-50 dark:bg-[#0F172A] text-slate-500 dark:text-slate-400">
      <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500 mb-4"></div>
      Loading PeopleIT SMS...
    </div>}>
      <Toaster 
        position="top-right" 
        toastOptions={{ 
          className: 'dark:bg-slate-800 dark:text-white dark:border-white/10 bg-white text-slate-900 border-slate-200 shadow-xl',
          style: {
            border: '1px solid',
            borderRadius: '12px'
          }
        }} 
      />
      <Routes>
        <Route path="/login" element={<Login />} />
        
        {/* Protected Dashboard Routes */}
        <Route path="/" element={
          <ProtectedRoute>
            <DashboardLayout>
              <DashboardRouter />
            </DashboardLayout>
          </ProtectedRoute>
        } />
        
        <Route path="/teacher" element={
          <ProtectedRoute allowedRoles={['SUPER_ADMIN', 'ADMIN', 'TEACHER']}>
            <DashboardLayout>
              <TeacherDashboard />
            </DashboardLayout>
          </ProtectedRoute>
        } />
        
        <Route path="/students" element={
          <ProtectedRoute>
            <DashboardLayout>
              <StudentList />
            </DashboardLayout>
          </ProtectedRoute>
        } />

        <Route path="/fees" element={
          <ProtectedRoute>
            <DashboardLayout>
              <InvoiceList />
            </DashboardLayout>
          </ProtectedRoute>
        } />

        <Route path="/attendance" element={
          <ProtectedRoute allowedRoles={['SUPER_ADMIN', 'ADMIN', 'TEACHER']}>
            <DashboardLayout>
              <AttendanceEntry />
            </DashboardLayout>
          </ProtectedRoute>
        } />

        <Route path="/results" element={
          <ProtectedRoute allowedRoles={['SUPER_ADMIN', 'ADMIN', 'TEACHER']}>
            <DashboardLayout>
              <MarksEntry />
            </DashboardLayout>
          </ProtectedRoute>
        } />

        <Route path="/timetables" element={
          <ProtectedRoute>
            <DashboardLayout>
              <TimetableGrid />
            </DashboardLayout>
          </ProtectedRoute>
        } />

        <Route path="/notices" element={
          <ProtectedRoute>
            <DashboardLayout>
              <NoticeBoard />
            </DashboardLayout>
          </ProtectedRoute>
        } />
        <Route path="/library" element={
          <ProtectedRoute>
            <DashboardLayout>
              <LibraryManagement />
            </DashboardLayout>
          </ProtectedRoute>
        } />

        <Route path="/transport" element={
          <ProtectedRoute>
            <DashboardLayout>
              <TransportManagement />
            </DashboardLayout>
          </ProtectedRoute>
        } />

        <Route path="/hr" element={
          <ProtectedRoute allowedRoles={['SUPER_ADMIN', 'ADMIN']}>
            <DashboardLayout>
              <HrPayrollManagement />
            </DashboardLayout>
          </ProtectedRoute>
        } />

        <Route path="/ai-insights" element={
          <ProtectedRoute allowedRoles={['SUPER_ADMIN', 'ADMIN', 'TEACHER']}>
            <DashboardLayout>
              <AiInsights />
            </DashboardLayout>
          </ProtectedRoute>
        } />

        <Route path="/website-builder" element={
          <ProtectedRoute allowedRoles={['SUPER_ADMIN', 'ADMIN']}>
            <DashboardLayout>
              <WebsiteBuilder />
            </DashboardLayout>
          </ProtectedRoute>
        } />
        
        <Route path="/reports" element={
          <ProtectedRoute allowedRoles={['SUPER_ADMIN', 'ADMIN']}>
            <DashboardLayout>
              <Reports />
            </DashboardLayout>
          </ProtectedRoute>
        } />

        <Route path="/messages" element={
          <ProtectedRoute>
            <DashboardLayout>
              <Messages />
            </DashboardLayout>
          </ProtectedRoute>
        } />

        <Route path="/users" element={
          <ProtectedRoute allowedRoles={['SUPER_ADMIN', 'ADMIN']}>
            <DashboardLayout>
              <Users />
            </DashboardLayout>
          </ProtectedRoute>
        } />

        <Route path="/settings" element={
          <ProtectedRoute allowedRoles={['SUPER_ADMIN', 'ADMIN']}>
            <DashboardLayout>
              <Settings />
            </DashboardLayout>
          </ProtectedRoute>
        } />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </React.Suspense>
  );
};

export default App;
