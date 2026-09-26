import React from 'react';
import { useAuthStore } from '../../store/authStore';
import { Skeleton } from '../../components/ui/Skeleton';
import StudentListStaff from './StudentListStaff';
import StudentPortalView from './StudentPortalView';

/**
 * Role dispatcher: STUDENT gets their own read/edit-limited portal view
 * (StudentPortalView); every staff role that can reach this route (per
 * ProtectedRoute in App.tsx) gets the admissions/directory table
 * (StudentListStaff).
 */
const StudentList = () => {
  const { user } = useAuthStore();

  // The auth store hydrates from sessionStorage asynchronously, so `user` is
  // null on the very first render — bail out with a skeleton rather than
  // firing the staff-only /students list with a still-unresolved role.
  if (!user) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full rounded-2xl" />
      </div>
    );
  }

  return user.role === 'STUDENT' ? <StudentPortalView /> : <StudentListStaff />;
};

export default StudentList;
