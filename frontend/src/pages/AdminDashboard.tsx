import React from 'react';
import { useAuthStore } from '../store/authStore';
import SuperAdminDashboard from './dashboards/SuperAdminDashboard';
import SchoolAdminDashboard from './dashboards/SchoolAdminDashboard';
import AccountantDashboard from './dashboards/AccountantDashboard';
import LibrarianDashboard from './dashboards/LibrarianDashboard';
import TransportOfficerDashboard from './dashboards/TransportOfficerDashboard';

/**
 * Entry point picking the right dashboard by role. Kept as the default export
 * so existing imports (`./pages/AdminDashboard`, and the SUPER_ADMIN-only
 * `/super-admin/institutions` route) keep working unchanged.
 */
const AdminDashboard: React.FC = () => {
  const { user } = useAuthStore();

  switch (user?.role) {
    case 'SUPER_ADMIN':
      return <SuperAdminDashboard />;
    case 'ACCOUNTANT':
      return <AccountantDashboard />;
    case 'LIBRARIAN':
      return <LibrarianDashboard />;
    case 'TRANSPORT_OFFICER':
      return <TransportOfficerDashboard />;
    // ADMIN, MANAGEMENT, and any other staff role that falls through here.
    default:
      return <SchoolAdminDashboard />;
  }
};

export default AdminDashboard;
