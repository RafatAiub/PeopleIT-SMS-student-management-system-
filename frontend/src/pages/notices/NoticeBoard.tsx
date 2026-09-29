import React, { useState } from 'react';
import { Megaphone, Plus, Users, Clock, BookOpen, UserCheck, Shield, Search, Pencil, Trash2, CalendarClock, GraduationCap, Eye } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { useTableParams } from '@/hooks/useTableParams';
import { Pagination } from '@/components/Pagination';
import { ConfirmModal } from '@/components/common/ConfirmModal';
import { EmptyState } from '@/components/common/EmptyState';
import { PageHeader, Button, Badge, Skeleton, ErrorState } from '@/components/ui';
import { formatDate, useT } from '@/i18n';
import { useNotices, useCreateNotice, useUpdateNotice, useDeleteNotice } from './notices.queries';
import NoticeFormModal from './NoticeFormModal';
import { isScheduled, toPayload, type Notice, type NoticeAudience, type NoticeFormValues } from './notices.types';

const WRITE_ROLES = ['SUPER_ADMIN', 'ADMIN', 'TEACHER'];

const AUDIENCE_STYLES: Record<NoticeAudience, { icon: React.ReactNode; color: string; badge: string }> = {
  ALL: {
    icon: <Megaphone className="w-5 h-5 text-primary-500 dark:text-primary-400" />,
    color: 'border-l-primary-500',
    badge: 'bg-primary-50 dark:bg-primary-500/10 text-primary-700 dark:text-primary-400 border-primary-200 dark:border-primary-500/20',
  },
  TEACHERS: {
    icon: <Shield className="w-5 h-5 text-accent-500 dark:text-accent-400" />,
    color: 'border-l-accent-500',
    badge: 'bg-accent-50 dark:bg-accent-500/10 text-accent-700 dark:text-accent-400 border-accent-200 dark:border-accent-500/20',
  },
  GUARDIANS: {
    icon: <UserCheck className="w-5 h-5 text-amber-500 dark:text-amber-400" />,
    color: 'border-l-amber-500',
    badge: 'bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-500/20',
  },
  STUDENTS: {
    icon: <BookOpen className="w-5 h-5 text-pink-500 dark:text-pink-400" />,
    color: 'border-l-pink-500',
    badge: 'bg-pink-50 dark:bg-pink-500/10 text-pink-700 dark:text-pink-400 border-pink-200 dark:border-pink-500/20',
  },
};

const NoticeBoard = () => {
  const t = useT();
  const { user } = useAuthStore();
  const canWrite = !!user && WRITE_ROLES.includes(user.role);

  const { params, debouncedSearch, setPage, setPageSize, setSearch, setFilter } = useTableParams();

  const { data, isLoading, isError, refetch } = useNotices({
    page: params.page,
    pageSize: params.pageSize,
    search: debouncedSearch,
    audience: (params.filters.audience || '') as NoticeAudience | '',
    // Staff-only: the backend already hides scheduled notices from everyone else.
    visibility: canWrite ? ((params.filters.visibility || '') as '' | 'scheduled' | 'published') : '',
    // No status filter here: the backend's `isActive` query param is
    // `z.coerce.boolean()`, which coerces the *string* "false" to `true`
    // (JS `Boolean("false") === true`) — so a working "Inactive only" filter
    // isn't reliably possible without a backend fix. Active/inactive is
    // still visible per-notice via the badge on each card below.
  });
  const notices = data?.notices || [];
  const total = data?.total || 0;

  const createMutation = useCreateNotice();
  const updateMutation = useUpdateNotice();
  const deleteMutation = useDeleteNotice();

  const [formOpen, setFormOpen] = useState(false);
  const [editingNotice, setEditingNotice] = useState<Notice | null>(null);
  const [noticeToDelete, setNoticeToDelete] = useState<Notice | null>(null);

  const openCreate = () => {
    setEditingNotice(null);
    setFormOpen(true);
  };
  const openEdit = (notice: Notice) => {
    setEditingNotice(notice);
    setFormOpen(true);
  };

  const handleSubmit = (formValues: NoticeFormValues) => {
    const values = toPayload(formValues);
    if (editingNotice) {
      updateMutation.mutate(
        { id: editingNotice.id, data: values },
        { onSuccess: () => setFormOpen(false) }
      );
    } else {
      createMutation.mutate(values, { onSuccess: () => setFormOpen(false) });
    }
  };

  const handleConfirmDelete = () => {
    if (!noticeToDelete) return;
    deleteMutation.mutate(noticeToDelete.id, { onSuccess: () => setNoticeToDelete(null) });
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <PageHeader
        title="Notice Board"
        description="Stay updated with the latest official announcements, schedules, and important information for all members of the institution."
        actions={
          canWrite ? (
            <Button variant="gradient" onClick={openCreate} leftIcon={<Plus className="w-5 h-5" />}>
              Post notice
            </Button>
          ) : undefined
        }
      />

      {/* Filters Toolbar */}
      <div className="glass-card p-4 rounded-2xl flex flex-wrap gap-4 items-center">
        <div className="relative flex-1 min-w-50">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            aria-label="Search notices"
            placeholder="Search notices by title or content..."
            value={params.search}
            onChange={(e) => setSearch(e.target.value)}
            className="input-field pl-11"
          />
        </div>
        <div className="relative">
          <Users className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          <select
            aria-label="Filter by audience"
            value={params.filters.audience || ''}
            onChange={(e) => setFilter('audience', e.target.value)}
            className="input-field pl-11 pr-8 cursor-pointer"
          >
            <option value="">All Audiences</option>
            <option value="ALL">Public (All)</option>
            <option value="TEACHERS">Teachers</option>
            <option value="GUARDIANS">Guardians</option>
            <option value="STUDENTS">Students</option>
          </select>
        </div>
        {canWrite && (
          <div className="relative">
            <Eye className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            <select
              aria-label={t('Filter by visibility')}
              value={params.filters.visibility || ''}
              onChange={(e) => setFilter('visibility', e.target.value)}
              className="input-field pl-11 pr-8 cursor-pointer"
            >
              <option value="">{t('All notices')}</option>
              <option value="published">{t('Published')}</option>
              <option value="scheduled">{t('Scheduled')}</option>
            </select>
          </div>
        )}
      </div>

      {/* Notices Feed List */}
      {isError ? (
        <ErrorState message="Could not load notices." onRetry={() => refetch()} />
      ) : (
        <div className="relative">
          <div className="absolute left-8 top-4 bottom-4 w-px bg-slate-200 dark:bg-white/5 hidden md:block" />

          <div className="space-y-6 relative z-10">
            {isLoading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="glass-card p-6 md:p-8 rounded-2xl space-y-3">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-5 w-2/3" />
                  <Skeleton className="h-3.5 w-full" />
                  <Skeleton className="h-3.5 w-5/6" />
                </div>
              ))
            ) : notices.length === 0 ? (
              <div className="glass-card rounded-2xl">
                <EmptyState
                  icon={<Megaphone />}
                  title="No notices published yet."
                  description="When new announcements are posted, they will appear here."
                />
              </div>
            ) : (
              notices.map((notice) => {
                const styles = AUDIENCE_STYLES[notice.audience] ?? AUDIENCE_STYLES.ALL;
                return (
                  <div
                    key={notice.id}
                    className={`glass-card p-6 md:p-8 rounded-2xl hover:bg-slate-50/50 dark:hover:bg-white/2 transition-all flex flex-col md:flex-row gap-6 border-l-4 ${styles.color}`}
                  >
                    <div className="md:w-64 shrink-0 flex flex-col space-y-4">
                      <div className="flex items-center gap-3 flex-wrap">
                        <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-900/50 shadow-inner flex items-center justify-center border border-slate-200 dark:border-white/5">
                          {styles.icon}
                        </div>
                        <span className={`px-3 py-1 rounded-full text-[10px] font-bold tracking-wider uppercase border ${styles.badge}`}>
                          {notice.audience}
                        </span>
                        {!notice.isActive && <Badge variant="neutral">Inactive</Badge>}
                        {isScheduled(notice) && (
                          <Badge variant="warning">
                            <CalendarClock className="w-3 h-3 mr-1 inline" aria-hidden="true" />
                            {t('Scheduled')}
                          </Badge>
                        )}
                        {notice.class && (
                          <Badge variant="info">
                            <GraduationCap className="w-3 h-3 mr-1 inline" aria-hidden="true" />
                            {notice.class.name}
                            {notice.section ? ` · ${notice.section.name}` : ''}
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 text-xs font-medium bg-slate-50 dark:bg-slate-900/30 w-fit px-3 py-1.5 rounded-lg border border-slate-200 dark:border-white/5">
                        <Clock className="w-3.5 h-3.5" />
                        {isScheduled(notice)
                          ? t('Goes live {date}', { date: formatDate(notice.scheduledAt, true) })
                          : formatDate(notice.publishedAt, true)}
                      </div>
                      {canWrite && (
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => openEdit(notice)}
                            aria-label={`Edit ${notice.title}`}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/10 border border-slate-200 dark:border-white/10"
                          >
                            <Pencil className="w-3.5 h-3.5" /> Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => setNoticeToDelete(notice)}
                            aria-label={`Delete ${notice.title}`}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 border border-red-200 dark:border-red-500/20"
                          >
                            <Trash2 className="w-3.5 h-3.5" /> Delete
                          </button>
                        </div>
                      )}
                    </div>

                    <div className="flex-1 space-y-3 pt-1 min-w-0">
                      <h3 className="text-xl font-bold text-slate-900 dark:text-white leading-tight">{notice.title}</h3>
                      <div className="text-slate-600 dark:text-slate-300 text-sm leading-relaxed max-w-4xl whitespace-pre-wrap font-medium wrap-break-word">
                        {notice.content}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {!isLoading && !isError && notices.length > 0 && (
        <div className="glass-card rounded-2xl overflow-hidden">
          <Pagination page={params.page} pageSize={params.pageSize} total={total} onPageChange={setPage} onPageSizeChange={setPageSize} />
        </div>
      )}

      <NoticeFormModal
        isOpen={formOpen}
        onClose={() => setFormOpen(false)}
        notice={editingNotice}
        onSubmit={handleSubmit}
        isSubmitting={createMutation.isPending || updateMutation.isPending}
      />

      <ConfirmModal
        isOpen={!!noticeToDelete}
        title="Delete notice"
        message={noticeToDelete ? `Are you sure you want to delete "${noticeToDelete.title}"? This cannot be undone.` : ''}
        confirmLabel="Delete"
        variant="danger"
        isLoading={deleteMutation.isPending}
        onConfirm={handleConfirmDelete}
        onCancel={() => setNoticeToDelete(null)}
      />
    </div>
  );
};

export default NoticeBoard;
