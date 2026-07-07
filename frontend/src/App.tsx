import React from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from './store/authStore';
import { Sidebar } from './components/Layout/Sidebar';
import { Toaster } from 'react-hot-toast';

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
  return (
    <div className="flex h-screen overflow-hidden bg-[#0F172A] text-slate-200">
      <Sidebar />
      <div className="relative flex flex-col flex-1 overflow-y-auto overflow-x-hidden">
        {/* Simple Header */}
        <header className="sticky top-0 z-30 flex items-center justify-between px-4 py-4 sm:px-6 lg:px-8 glass shadow-sm border-b border-white/5">
          <div className="flex items-center">
            <h1 className="text-xl font-bold text-white bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-emerald-400">
              PeopleIT SMS
            </h1>
          </div>
          <div className="flex items-center gap-4">
             <div className="w-8 h-8 rounded-full bg-blue-500/20 border border-blue-500/50 flex items-center justify-center text-sm font-semibold text-blue-400">
               A
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
  if (user?.role === 'TEACHER') {
    return <TeacherDashboard />;
  }
  return <AdminDashboard />;
};

// Route Configuration
const App = () => {
  return (
    <React.Suspense fallback={<div className="h-screen w-screen flex items-center justify-center bg-[#0F172A] text-slate-400">Loading PeopleIT SMS...</div>}>
      <Toaster 
        position="top-right" 
        toastOptions={{ 
          style: { 
            background: '#1e293b', 
            color: '#fff', 
            border: '1px solid rgba(255,255,255,0.1)',
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
