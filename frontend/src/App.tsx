import React from 'react';
import { Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { useAuthStore } from './store/authStore';
import { Sidebar } from './components/Layout/Sidebar';
import { Header } from './components/Layout/Header';
import { Toaster } from 'react-hot-toast';
import { useUiStore } from './store/uiStore';
import { useEffect } from 'react';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import { SupportBanner } from './components/common/SupportBanner';
import apiClient from './api/client';

// Helper wrapper for React.lazy to auto-recover when deployment chunk filenames change
const lazyWithRetry = (importFn: () => Promise<any>) =>
  React.lazy(async () => {
    try {
      const component = await importFn();
      sessionStorage.removeItem('chunk_reload_retry');
      return component;
    } catch (error: any) {
      const isRefreshed = sessionStorage.getItem('chunk_reload_retry');
      if (!isRefreshed) {
        sessionStorage.setItem('chunk_reload_retry', 'true');
        window.location.reload();
      }
      throw error;
    }
  });

// Lazy load pages for performance with auto chunk-reload retry
const Login = lazyWithRetry(() => import('./pages/Login'));
const AdminDashboard = lazyWithRetry(() => import('./pages/AdminDashboard'));
const TeacherDashboard = lazyWithRetry(() => import('./pages/TeacherDashboard'));
const GuardianDashboard = lazyWithRetry(() => import('./pages/GuardianDashboard'));
const StudentList = lazyWithRetry(() => import('./pages/students/StudentList'));
const InvoiceList = lazyWithRetry(() => import('./pages/fees/InvoiceList'));
const MyInvoices = lazyWithRetry(() => import('./pages/fees/MyInvoices'));
const AttendanceEntry = lazyWithRetry(() => import('./pages/attendance/AttendanceEntry'));
const MarksEntry = lazyWithRetry(() => import('./pages/results/MarksEntry'));
const MyExamResults = lazyWithRetry(() => import('./pages/results/MyExamResults'));
const TimetableGrid = lazyWithRetry(() => import('./pages/timetables/TimetableGrid'));
const NoticeBoard = lazyWithRetry(() => import('./pages/notices/NoticeBoard'));
const LibraryManagement = lazyWithRetry(() => import('./pages/library/LibraryManagement'));
const MyLibraryIssues = lazyWithRetry(() => import('./pages/library/MyLibraryIssues'));
const TransportManagement = lazyWithRetry(() => import('./pages/transport/TransportManagement'));
const MyTransportAssignment = lazyWithRetry(() => import('./pages/transport/MyTransportAssignment'));
const HrPayrollManagement = lazyWithRetry(() => import('./pages/hr/HrPayrollManagement'));
const AiInsights = lazyWithRetry(() => import('./pages/ai/AiInsights'));
const WebsiteBuilder = lazyWithRetry(() => import('./pages/website/WebsiteBuilder'));
const Reports = lazyWithRetry(() => import('./pages/reports/Reports'));
const Messages = lazyWithRetry(() => import('./pages/communication/Messages'));
const Users = lazyWithRetry(() => import('./pages/users/Users'));
const Settings = lazyWithRetry(() => import('./pages/settings/Settings'));
const SupportAccessPortal = lazyWithRetry(() => import('./pages/superadmin/SupportAccessPortal'));
const AuditLogsPortal = lazyWithRetry(() => import('./pages/superadmin/AuditLogsPortal'));
const SystemHealthPortal = lazyWithRetry(() => import('./pages/superadmin/SystemHealthPortal'));
const InstitutionApplications = lazyWithRetry(() => import('./pages/superadmin/InstitutionApplications'));
const ApplyInstitution = lazyWithRetry(() => import('./pages/public/ApplyInstitution'));
const IdCardTemplateBuilder = lazyWithRetry(() => import('./pages/idcards/IdCardTemplateBuilder'));
const IdCardDesigner = lazyWithRetry(() => import('./pages/idcards/IdCardDesigner'));
const IdCardGenerate = lazyWithRetry(() => import('./pages/idcards/IdCardGenerate'));
const MyIdCard = lazyWithRetry(() => import('./pages/idcards/MyIdCard'));
const VerifyIdCard = lazyWithRetry(() => import('./pages/idcards/VerifyIdCard'));

// Protected Route Wrapper
const ProtectedRoute = ({ children, allowedRoles }: { children: React.ReactNode, allowedRoles?: string[] }) => {
  const { isAuthenticated, user, hasHydrated, supportSession } = useAuthStore();
  const location = useLocation();

  // The auth store hydrates from sessionStorage asynchronously — on a hard
  // refresh, isAuthenticated is briefly false before hydration completes.
  // Wait rather than redirecting to /login, or a logged-in user gets
  // bounced for a frame on every page reload.
  if (!hasHydrated) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-slate-50 dark:bg-surface-900">
        <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (allowedRoles && user && !allowedRoles.includes(user.role)) {
    return <Navigate to="/" replace />;
  }

  // Super Admin navigation restriction (bypassed during active support session)
  if (user?.role === 'SUPER_ADMIN' && !supportSession) {
    const allowedSuperAdminPaths = [
      '/',
      '/users',
      '/super-admin/institutions',
      '/super-admin/billing',
      '/super-admin/support-access',
      '/super-admin/audit-logs',
      '/super-admin/system-health',
      '/super-admin/applications',
    ];
    if (!allowedSuperAdminPaths.some((path) => location.pathname === path || location.pathname.startsWith(path))) {
      return <Navigate to="/" replace />;
    }
  }

  return <>{children}</>;
};

// Library route branches by role: staff manage the catalog, students/guardians see a read-only issues view
const LibraryRoute = () => {
  const { user } = useAuthStore();
  if (user?.role === 'STUDENT' || user?.role === 'GUARDIAN') {
    return <MyLibraryIssues />;
  }
  return <LibraryManagement />;
};

// Transport route branches by role: staff manage routes/vehicles, students/guardians see a read-only assignment view
const TransportRoute = () => {
  const { user } = useAuthStore();
  if (user?.role === 'STUDENT' || user?.role === 'GUARDIAN') {
    return <MyTransportAssignment />;
  }
  return <TransportManagement />;
};

// Results route branches by role: staff enter/manage grades, students/guardians see a read-only "my exam results" view
const ResultsRoute = () => {
  const { user } = useAuthStore();
  if (user?.role === 'STUDENT' || user?.role === 'GUARDIAN') {
    return <MyExamResults />;
  }
  return <MarksEntry />;
};

// Fees route branches by role: staff/accountant manage invoices & categories, students/guardians see a read-only "my invoices" + pay view
const FeesRoute = () => {
  const { user } = useAuthStore();
  if (user?.role === 'STUDENT' || user?.role === 'GUARDIAN') {
    return <MyInvoices />;
  }
  return <InvoiceList />;
};

// Layout Wrapper
const DashboardLayout = ({ children }: { children: React.ReactNode }) => {
  const { mobileMenuOpen, setMobileMenuOpen } = useUiStore();

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50 dark:bg-surface-900 text-slate-900 dark:text-slate-200 transition-colors duration-300">
      {/* Desktop Sidebar */}
      <div className="hidden md:flex md:flex-shrink-0 h-full">
        <Sidebar />
      </div>

      {/* Mobile Sidebar overlay */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <div className="fixed inset-0 z-50 md:hidden flex">
            {/* Backdrop overlay */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs"
              onClick={() => setMobileMenuOpen(false)}
            />
            {/* Sidebar drawer content */}
            <motion.div
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', stiffness: 350, damping: 35 }}
              className="relative w-64 bg-slate-900 h-full shadow-2xl"
            >
              <Sidebar isMobile={true} />
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <div className="relative flex flex-col flex-1 overflow-y-auto overflow-x-hidden">
        <SupportBanner />
        <Header />

        {/* Main Content */}
        <motion.main
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18, ease: 'easeOut' }}
          className="w-full max-w-7xl mx-auto p-4 sm:p-6 lg:p-8"
        >
          <ErrorBoundary>{children}</ErrorBoundary>
        </motion.main>
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
    return <GuardianDashboard />;
  }
  if (user?.role === 'TEACHER') {
    return <TeacherDashboard />;
  }
  return <AdminDashboard />;
};

// Route Configuration
const App = () => {
  const { theme, setInstitutionBranding } = useUiStore();
  const { isAuthenticated, user, supportSession } = useAuthStore();
  const location = useLocation();

  // Institution branding (logo/name) is cleared on every fresh login and
  // support-session change (authStore) to stop a previous institution's
  // branding leaking across sessions/roles. That means something has to
  // re-fetch it exactly once per session — relying on Settings.tsx's own
  // mount effect left every other page branding-less until a user happened
  // to visit Settings. A bare Super Admin (no institution context) has
  // nothing to fetch unless actively impersonating one.
  useEffect(() => {
    if (!isAuthenticated || !user) return;
    if (user.role === 'SUPER_ADMIN' && !supportSession) return;

    let cancelled = false;
    apiClient
      .get('/institution/website')
      .then((res) => {
        if (cancelled) return;
        const data = res.data?.data;
        if (data) setInstitutionBranding(data.logoUrl || null, data.name || null);
      })
      .catch(() => {
        // Non-critical — sidebar/header just fall back to the platform mark.
      });

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, user?.id, supportSession?.institution?.id]);

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
    <React.Suspense fallback={<div className="h-screen w-screen flex flex-col items-center justify-center bg-slate-50 dark:bg-surface-900 text-slate-500 dark:text-slate-400">
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
      <AnimatePresence mode="wait">
      <Routes location={location} key={location.pathname}>
        <Route path="/login" element={<Login />} />
        <Route path="/apply" element={<ApplyInstitution />} />
        <Route path="/verify/:token" element={<VerifyIdCard />} />

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
              <FeesRoute />
            </DashboardLayout>
          </ProtectedRoute>
        } />

        <Route path="/attendance" element={
          <ProtectedRoute allowedRoles={['ADMIN', 'TEACHER', 'ACCOUNTANT', 'STUDENT', 'GUARDIAN']}>
            <DashboardLayout>
              <AttendanceEntry />
            </DashboardLayout>
          </ProtectedRoute>
        } />

        <Route path="/results" element={
          <ProtectedRoute allowedRoles={['ADMIN', 'TEACHER', 'STUDENT', 'GUARDIAN']}>
            <DashboardLayout>
              <ResultsRoute />
            </DashboardLayout>
          </ProtectedRoute>
        } />

        <Route path="/id-cards/builder" element={
          <ProtectedRoute allowedRoles={['SUPER_ADMIN', 'ADMIN']}>
            <DashboardLayout>
              <IdCardTemplateBuilder />
            </DashboardLayout>
          </ProtectedRoute>
        } />

        <Route path="/id-cards/designer" element={
          <ProtectedRoute allowedRoles={['SUPER_ADMIN', 'ADMIN']}>
            <DashboardLayout>
              <IdCardDesigner />
            </DashboardLayout>
          </ProtectedRoute>
        } />

        <Route path="/id-cards/generate" element={
          <ProtectedRoute allowedRoles={['SUPER_ADMIN', 'ADMIN']}>
            <DashboardLayout>
              <IdCardGenerate />
            </DashboardLayout>
          </ProtectedRoute>
        } />

        <Route path="/id-cards/mine" element={
          <ProtectedRoute>
            <DashboardLayout>
              <MyIdCard />
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
              <LibraryRoute />
            </DashboardLayout>
          </ProtectedRoute>
        } />

        <Route path="/transport" element={
          <ProtectedRoute>
            <DashboardLayout>
              <TransportRoute />
            </DashboardLayout>
          </ProtectedRoute>
        } />

        <Route path="/hr" element={
          <ProtectedRoute allowedRoles={['ADMIN', 'ACCOUNTANT']}>
            <DashboardLayout>
              <HrPayrollManagement />
            </DashboardLayout>
          </ProtectedRoute>
        } />

        <Route path="/ai-insights" element={
          <ProtectedRoute allowedRoles={['ADMIN', 'TEACHER']}>
            <DashboardLayout>
              <AiInsights />
            </DashboardLayout>
          </ProtectedRoute>
        } />

        <Route path="/website-builder" element={
          <ProtectedRoute allowedRoles={['ADMIN']}>
            <DashboardLayout>
              <WebsiteBuilder />
            </DashboardLayout>
          </ProtectedRoute>
        } />
        
        <Route path="/reports" element={
          <ProtectedRoute allowedRoles={['ADMIN', 'ACCOUNTANT']}>
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

        <Route path="/super-admin/institutions" element={
          <ProtectedRoute allowedRoles={['SUPER_ADMIN']}>
            <DashboardLayout>
              <AdminDashboard />
            </DashboardLayout>
          </ProtectedRoute>
        } />

        <Route path="/super-admin/support-access" element={
          <ProtectedRoute allowedRoles={['SUPER_ADMIN']}>
            <DashboardLayout>
              <SupportAccessPortal />
            </DashboardLayout>
          </ProtectedRoute>
        } />

        <Route path="/super-admin/billing" element={
          <ProtectedRoute allowedRoles={['SUPER_ADMIN']}>
            <DashboardLayout>
              <InvoiceList />
            </DashboardLayout>
          </ProtectedRoute>
        } />

        <Route path="/super-admin/audit-logs" element={
          <ProtectedRoute allowedRoles={['SUPER_ADMIN']}>
            <DashboardLayout>
              <AuditLogsPortal />
            </DashboardLayout>
          </ProtectedRoute>
        } />

        <Route path="/super-admin/system-health" element={
          <ProtectedRoute allowedRoles={['SUPER_ADMIN']}>
            <DashboardLayout>
              <SystemHealthPortal />
            </DashboardLayout>
          </ProtectedRoute>
        } />

        <Route path="/super-admin/applications" element={
          <ProtectedRoute allowedRoles={['SUPER_ADMIN']}>
            <DashboardLayout>
              <InstitutionApplications />
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
          <ProtectedRoute allowedRoles={['SUPER_ADMIN', 'ADMIN', 'TEACHER', 'ACCOUNTANT', 'LIBRARIAN', 'TRANSPORT_OFFICER', 'STUDENT', 'GUARDIAN']}>
            <DashboardLayout>
              <Settings />
            </DashboardLayout>
          </ProtectedRoute>
        } />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      </AnimatePresence>
    </React.Suspense>
  );
};

export default App;
