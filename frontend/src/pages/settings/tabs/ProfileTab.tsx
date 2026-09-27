import React from 'react';
import { Building, Mail, Phone, MapPin, GraduationCap, Award } from 'lucide-react';
import { Badge, Skeleton, SkeletonText, ErrorState } from '@/components/ui';
import { formatDate } from '@/i18n';
import { useAuthStore } from '@/store/authStore';
import { useInstitutionWebsite, useExams } from '../settings.queries';

/**
 * Read-only institution profile shown to every non-admin role: their own
 * campus's contact details plus the academic calendar / exam schedule.
 */
const ProfileTab: React.FC = () => {
  const { user } = useAuthStore();
  const {
    data: settings,
    isLoading: settingsLoading,
    isError: settingsError,
    refetch: refetchSettings,
  } = useInstitutionWebsite();
  const { data: exams, isLoading: examsLoading, isError: examsError, refetch: refetchExams } = useExams();

  if (settingsLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-1 space-y-4">
          <Skeleton className="h-56 rounded-2xl" />
        </div>
        <div className="md:col-span-2">
          <Skeleton className="h-72 rounded-2xl" />
        </div>
      </div>
    );
  }

  if (settingsError) {
    return <ErrorState message="Failed to load institution profile." onRetry={refetchSettings} />;
  }

  const name = settings?.name || user?.institutionName || '';
  const email = settings?.email || settings?.contactEmail || user?.email || '';
  const phone = settings?.phone || settings?.contactPhone || '';
  const address = settings?.address || '';
  const logoUrl = settings?.logoUrl || '';

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      {/* Institution Identity Card */}
      <div className="md:col-span-1 space-y-4">
        <div className="glass-card p-6 rounded-2xl text-center flex flex-col items-center justify-center space-y-4 relative overflow-hidden group">
          <div className="w-24 h-24 rounded-2xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700/60 shadow-inner flex items-center justify-center overflow-hidden transition-transform duration-300 group-hover:scale-105">
            {logoUrl ? (
              <img
                src={logoUrl}
                alt={`${name || 'Institution'} Logo`}
                className="w-full h-full object-contain p-2"
                onError={(e) => {
                  (e.target as HTMLElement).style.display = 'none';
                }}
              />
            ) : (
              <Building className="w-10 h-10 text-slate-400 dark:text-slate-500" />
            )}
          </div>

          <div>
            <h3 className="font-extrabold text-slate-900 dark:text-white text-lg tracking-tight leading-snug">
              {name || 'Institution Name'}
            </h3>
            <span className="inline-flex items-center gap-1 mt-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-wide uppercase bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-500/20">
              Verified Campus
            </span>
          </div>
        </div>

        <div className="glass-card p-5 rounded-2xl space-y-4">
          <h4 className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Contact Information</h4>

          <div className="space-y-3.5">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-xl bg-blue-50 dark:bg-slate-800 text-blue-600 dark:text-blue-400 border border-blue-200/20 dark:border-slate-700/60">
                <Mail className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <span className="text-[10px] font-semibold text-slate-400 block">Email Address</span>
                <span className="text-sm font-medium text-slate-800 dark:text-slate-200 break-all">{email || 'N/A'}</span>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="p-2 rounded-xl bg-blue-50 dark:bg-slate-800 text-blue-600 dark:text-blue-400 border border-blue-200/20 dark:border-slate-700/60">
                <Phone className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <span className="text-[10px] font-semibold text-slate-400 block">Phone Number</span>
                <span className="text-sm font-medium text-slate-800 dark:text-slate-200">{phone || 'N/A'}</span>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="p-2 rounded-xl bg-blue-50 dark:bg-slate-800 text-blue-600 dark:text-blue-400 border border-blue-200/20 dark:border-slate-700/60">
                <MapPin className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <span className="text-[10px] font-semibold text-slate-400 block">Campus Address</span>
                <span className="text-sm font-medium text-slate-800 dark:text-slate-200 leading-relaxed block whitespace-pre-wrap">
                  {address || 'N/A'}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Academic Schedule & Active Exams List */}
      <div className="md:col-span-2 space-y-4">
        <div className="glass-card p-6 rounded-2xl space-y-5">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-white/5 pb-3">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <GraduationCap className="w-5 h-5 text-blue-500 dark:text-blue-400" />
              Academic Calendar &amp; Exams
            </h3>
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              {(exams ?? []).filter((e) => e.isActive).length} Active Exams
            </span>
          </div>

          {examsLoading ? (
            <SkeletonText lines={4} />
          ) : examsError ? (
            <ErrorState compact message="Failed to load the exam calendar." onRetry={refetchExams} />
          ) : (exams ?? []).length === 0 ? (
            <div className="text-center text-slate-500 py-12">No scheduled exams found.</div>
          ) : (
            <div className="grid grid-cols-1 gap-3">
              {(exams ?? []).map((exam) => (
                <div
                  key={exam.id}
                  className="p-4 rounded-2xl bg-white dark:bg-slate-900/40 border border-slate-200/60 dark:border-white/5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-all hover:border-slate-350 dark:hover:border-white/10 shadow-xs"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-10 h-10 rounded-xl flex items-center justify-center border ${
                        exam.isActive
                          ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/20'
                          : 'bg-slate-100 dark:bg-white/5 text-slate-400 border-slate-200 dark:border-white/5'
                      }`}
                    >
                      <Award className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="font-bold text-slate-900 dark:text-white text-sm">{exam.name}</h4>
                      <span className="text-xs text-slate-500 dark:text-slate-400">
                        {formatDate(exam.startDate)} — {formatDate(exam.endDate)}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <Badge variant={exam.isActive ? 'success' : 'neutral'}>
                      {exam.isActive ? 'Active Schedule' : 'Completed'}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ProfileTab;
