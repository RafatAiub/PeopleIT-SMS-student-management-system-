import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Edit2, Users, UserCheck, BookOpen, Receipt,
  Library, Bus, Megaphone, Calendar, Mail, Phone, Droplet, MapPin, Cake,
} from 'lucide-react';
import apiClient from '../../api/client';
import toast from 'react-hot-toast';
import { Button } from '../../components/ui/Button';
import { Skeleton, SkeletonText } from '../../components/ui/Skeleton';
import { ErrorState } from '../../components/ui/Feedback';
import { StudentEditDrawer } from './StudentEditDrawer';

const QUICK_LINKS = [
  { to: '/attendance', icon: UserCheck, label: 'Attendance', desc: 'My attendance history & fines', color: 'from-emerald-500 to-accent-500' },
  { to: '/results', icon: BookOpen, label: 'Results', desc: 'Exam marks & report cards', color: 'from-primary-500 to-blue-500' },
  { to: '/fees', icon: Receipt, label: 'Fees & Billing', desc: 'Invoices & online payment', color: 'from-amber-500 to-orange-500' },
  { to: '/timetables', icon: Calendar, label: 'Timetable', desc: 'My class routine', color: 'from-purple-500 to-fuchsia-500' },
  { to: '/library', icon: Library, label: 'Library', desc: 'My borrowed books', color: 'from-cyan-500 to-sky-500' },
  { to: '/transport', icon: Bus, label: 'Transport', desc: 'My route & vehicle', color: 'from-rose-500 to-pink-500' },
  { to: '/notices', icon: Megaphone, label: 'Notices', desc: 'School announcements', color: 'from-lime-500 to-green-500' },
];

const StudentPortalView = () => {
  const [student, setStudent] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);

  const fetchMe = async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const response = await apiClient.get('/students/me');
      setStudent(response.data.data);
    } catch (error: any) {
      console.error('Failed to fetch student profile', error);
      toast.error(error.response?.data?.message || 'Failed to fetch student data');
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMe();
  }, []);

  if (loading) {
    return (
      <div className="space-y-6 max-w-5xl">
        <div className="glass-card rounded-2xl border border-slate-200/50 dark:border-white/5 p-6 sm:p-8">
          <div className="flex flex-col sm:flex-row sm:items-center gap-6">
            <Skeleton className="w-24 h-24 rounded-2xl shrink-0" />
            <div className="flex-1 min-w-0 space-y-2">
              <SkeletonText lines={3} />
            </div>
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }

  if (loadError) {
    return <ErrorState message="Failed to load your student profile." onRetry={fetchMe} />;
  }

  if (!student) {
    return (
      <div className="glass-card p-8 text-center text-slate-600 dark:text-slate-400 rounded-2xl border border-slate-200/50 dark:border-white/5">
        Your student profile record could not be found. Please contact the administrator.
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Hero / profile card */}
      <div className="glass-card rounded-2xl border border-slate-200/50 dark:border-white/5 p-5 sm:p-8">
        <div className="flex flex-col sm:flex-row sm:items-center gap-5 sm:gap-6">
          {student.avatarUrl || student.user?.avatarUrl ? (
            <img
              src={student.avatarUrl || student.user?.avatarUrl}
              alt="Avatar"
              className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl object-cover border border-slate-200/50 dark:border-white/10 shadow-lg shrink-0 mx-auto sm:mx-0"
            />
          ) : (
            <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl bg-gradient-to-br from-primary-500 to-accent-500 flex items-center justify-center text-3xl font-bold text-white shadow-sm shrink-0 mx-auto sm:mx-0">
              {student.firstName?.[0] || '?'}
            </div>
          )}
          <div className="flex-1 min-w-0 text-center sm:text-left">
            <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
              <h2 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
                {student.firstName} {student.lastName}
              </h2>
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wide bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/20">
                {student.status || 'ACTIVE'}
              </span>
            </div>
            <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
              Student ID {student.studentId} · {student.class?.name || 'No class'} {student.section?.name ? `- ${student.section.name}` : ''} · Roll {student.rollNumber || 'N/A'}
            </p>
            <p className="text-slate-600 dark:text-slate-400 text-sm mt-2">Welcome back! Here's your student hub — everything about your school life in one place.</p>
          </div>
          <Button
            variant="primary"
            onClick={() => setIsEditOpen(true)}
            className="w-full sm:w-auto shrink-0"
          >
            <Edit2 className="w-4 h-4" />
            Edit Personal Data
          </Button>
        </div>
      </div>

      {/* Quick access grid — mobile-first: 2 columns on phones, scaling up */}
      <div>
        <h3 className="text-sm font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3">Quick Access</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {QUICK_LINKS.map(({ to, icon: Icon, label, desc, color }) => (
            <Link
              key={to}
              to={to}
              className="glass-card group p-4 rounded-2xl border border-slate-200/50 dark:border-white/5 hover:border-slate-300 dark:hover:border-white/20 hover:-translate-y-0.5 transition-all duration-200 flex flex-col gap-3"
            >
              <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${color} flex items-center justify-center text-white shadow-md group-hover:scale-105 transition-transform`}>
                <Icon className="w-5 h-5" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-900 dark:text-white">{label}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{desc}</p>
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* Personal & Academic Details */}
      <div className="glass-card p-5 sm:p-6 rounded-2xl border border-slate-200/50 dark:border-white/5">
        <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-5">Personal &amp; Academic Details</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 text-sm">
          {[
            { icon: Users, label: 'Full Name', value: `${student.firstName} ${student.lastName}` },
            { icon: Mail, label: 'Email Address', value: student.email || 'N/A' },
            { icon: Phone, label: 'Phone Number', value: student.phone || 'N/A' },
            { icon: Users, label: 'Gender', value: student.gender ? student.gender.charAt(0) + student.gender.slice(1).toLowerCase() : 'N/A' },
            { icon: Droplet, label: 'Blood Group', value: student.bloodGroup || 'N/A' },
            { icon: MapPin, label: 'Address', value: student.address || 'N/A' },
            { icon: Cake, label: 'Admission Date', value: student.admissionDate ? new Date(student.admissionDate).toLocaleDateString() : 'N/A' },
            { icon: Users, label: 'Branch', value: student.branch?.name || 'Main Branch' },
            { icon: Calendar, label: 'Academic Year', value: student.academicYear?.label || new Date().getFullYear().toString() },
          ].map(({ icon: Icon, label, value }) => (
            <div key={label} className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-white/5 flex items-center justify-center text-slate-500 dark:text-slate-400 shrink-0">
                <Icon className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <span className="text-xs text-slate-500 block">{label}</span>
                <span className="text-slate-800 dark:text-white font-medium mt-0.5 block truncate" title={value}>{value}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <StudentEditDrawer
        isOpen={isEditOpen}
        onClose={() => setIsEditOpen(false)}
        mode="student"
        student={student}
        onSaved={fetchMe}
      />
    </div>
  );
};

export default StudentPortalView;
