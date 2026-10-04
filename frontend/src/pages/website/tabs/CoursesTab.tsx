import React from 'react';
import { GraduationCap, Plus } from 'lucide-react';
import toast from 'react-hot-toast';
import { Card, CardHeader, Button, Badge, Checkbox, Select, ErrorState } from '@/components/ui';
import { DataTable, type Column } from '@/components/DataTable/DataTable';
import { ConfirmModal } from '@/components/common/ConfirmModal';
import { useT, formatCurrency, formatNumber } from '@/i18n';
import { useTableParams } from '@/hooks/useTableParams';
import { useCourses, useDeleteCourse, useUpdateSite, apiError } from '../sites.queries';
import type { SiteCourse, SiteMeResponse, SiteStatus } from '../sites.types';
import { CourseEditorDrawer } from './courses/CourseEditorDrawer';

export const CoursesTab: React.FC<{ me: SiteMeResponse }> = ({ me }) => {
  const t = useT();
  const { params, debouncedSearch, setPage, setPageSize, setSearch, setFilter } = useTableParams(20);
  const q = useCourses({ page: params.page, pageSize: params.pageSize, q: debouncedSearch, status: (params.filters.status || '') as SiteStatus | '' });
  const del = useDeleteCourse();
  const updateSite = useUpdateSite();
  const [editor, setEditor] = React.useState<{ open: boolean; id: string | null }>({ open: false, id: null });
  const [toDelete, setToDelete] = React.useState<SiteCourse | null>(null);
  const coursesEnabled = Boolean(me.site.settings?.courses?.enabled);

  const toggleEnabled = (enabled: boolean) => {
    updateSite.mutate(
      { settings: { ...me.site.settings, courses: { enabled } } },
      { onSuccess: () => toast.success(enabled ? t('Courses are on. Publish the site to make them public.') : t('Courses are off. /courses is now hidden.')) }
    );
  };

  const columns: Column<SiteCourse>[] = [
    {
      key: 'title', header: t('Course'), primary: true, accessor: 'title',
      render: (c) => (
        <div className="min-w-0">
          <p className="font-medium text-slate-900 dark:text-slate-50 truncate">{c.title}</p>
          <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{c.category || t('Uncategorised')}{c.instructorName ? ` · ${c.instructorName}` : ''}</p>
        </div>
      ),
    },
    { key: 'price', header: t('Price'), align: 'right', render: (c) => (c.price ? formatCurrency(c.price) : <Badge variant="info">{t('Free')}</Badge>), exportValue: (c) => c.price },
    { key: 'enrollments', header: t('Enrolled'), align: 'right', hideOnMobile: true, render: (c) => formatNumber(c.enrollmentCount ?? 0), exportValue: (c) => c.enrollmentCount ?? 0 },
    { key: 'status', header: t('Status'), render: (c) => <Badge variant={c.status === 'PUBLISHED' ? 'success' : 'neutral'} dot>{c.status === 'PUBLISHED' ? t('Published') : t('Draft')}</Badge>, exportValue: (c) => c.status },
  ];

  return (
    <div className="space-y-4">
      <Card>
        <Checkbox
          label={t('Enable courses')}
          description={t('Turns on the course catalogue and learner accounts at /courses and /learn.')}
          checked={coursesEnabled}
          onChange={(e) => toggleEnabled(e.target.checked)}
        />
      </Card>

      <Card>
        <CardHeader
          icon={<GraduationCap className="w-4 h-4" />}
          title={t('Courses')}
          description={t('Build a course, add its curriculum, then publish it to the catalogue.')}
          actions={<Button leftIcon={<Plus className="w-4 h-4" />} onClick={() => setEditor({ open: true, id: null })}>{t('New course')}</Button>}
        />
        {q.isError ? (
          <ErrorState message={apiError(q.error, t('Could not load courses.'))} onRetry={() => q.refetch()} />
        ) : (
          <DataTable
            data={q.data?.items ?? []}
            columns={columns}
            isLoading={q.isLoading}
            onRowClick={(c) => setEditor({ open: true, id: c.id })}
            serverSearch
            onSearch={setSearch}
            searchPlaceholder={t('Search courses')}
            serverPagination
            totalCount={q.data?.total ?? 0}
            page={params.page}
            pageSize={params.pageSize}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
            toolbar={
              <Select
                aria-label={t('Filter by status')}
                value={params.filters.status || ''}
                onChange={(e) => setFilter('status', e.target.value)}
                className="w-auto min-w-36"
                placeholder={t('All statuses')}
                options={[{ value: 'DRAFT', label: t('Draft') }, { value: 'PUBLISHED', label: t('Published') }]}
              />
            }
            actions={[
              { label: t('Edit'), icon: 'edit', onClick: (c) => setEditor({ open: true, id: c.id }) },
              { label: t('Delete'), icon: 'delete', variant: 'danger', onClick: (c) => setToDelete(c) },
            ]}
            emptyTitle={t('No courses yet')}
            emptyDescription={t('Create your first course, then add lessons in the curriculum builder.')}
            emptyAction={<Button onClick={() => setEditor({ open: true, id: null })}>{t('New course')}</Button>}
            exportFileName="website-courses"
          />
        )}
      </Card>

      <CourseEditorDrawer open={editor.open} courseId={editor.id} onClose={() => setEditor({ open: false, id: null })} />
      <ConfirmModal
        isOpen={!!toDelete}
        title={t('Delete “{title}”?', { title: toDelete?.title ?? '' })}
        message={t('The course, its lessons and enrollment records are deleted. This cannot be undone.')}
        confirmLabel={t('Delete course')}
        isLoading={del.isPending}
        onCancel={() => setToDelete(null)}
        onConfirm={() => toDelete && del.mutate(toDelete.id, { onSuccess: () => setToDelete(null) })}
      />
    </div>
  );
};
