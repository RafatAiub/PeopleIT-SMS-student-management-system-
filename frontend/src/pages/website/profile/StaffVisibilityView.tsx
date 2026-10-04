import React from 'react';
import { Eye, EyeOff, Users } from 'lucide-react';
import { Card, CardHeader, Badge, Select, Alert, ErrorState } from '@/components/ui';
import { DataTable, type Column } from '@/components/DataTable/DataTable';
import { useT } from '@/i18n';
import { useTableParams } from '@/hooks/useTableParams';
import { useStaffVisibility, useSetStaffVisibility, apiError } from '../sites.queries';
import type { StaffVisibilityMember, StaffVisibilityRole } from '../sites.types';

const titleCase = (s: string) => s.charAt(0) + s.slice(1).toLowerCase().replace(/_/g, ' ');

const VisibilityToggle: React.FC<{ member: StaffVisibilityMember }> = ({ member }) => {
  const t = useT();
  const toggle = useSetStaffVisibility();
  return (
    <label className="inline-flex items-center gap-2 cursor-pointer" onClick={(e) => e.stopPropagation()}>
      <input
        type="checkbox"
        aria-label={t('Show {name} on the website', { name: member.name })}
        checked={member.showOnWebsite}
        disabled={toggle.isPending}
        onChange={(e) => toggle.mutate({ userIds: [member.id], showOnWebsite: e.target.checked })}
        className="w-4 h-4 rounded border-slate-300 dark:border-white/20 accent-primary-600 cursor-pointer"
      />
      <span className="text-xs text-slate-500 dark:text-slate-400">{member.showOnWebsite ? t('Visible') : t('Hidden')}</span>
    </label>
  );
};

/**
 * Website > Staff visibility — owner decision 3: staff and teachers are
 * hidden from the public site until switched on here.
 */
export const StaffVisibilityView: React.FC = () => {
  const t = useT();
  const { params, debouncedSearch, setPage, setPageSize, setSearch, setFilter } = useTableParams(20);
  const role = (params.filters.role || '') as StaffVisibilityRole | '';
  const q = useStaffVisibility({ page: params.page, pageSize: params.pageSize, q: debouncedSearch, role });
  const bulkToggle = useSetStaffVisibility();

  const columns: Column<StaffVisibilityMember>[] = [
    {
      key: 'name',
      header: t('Staff'),
      primary: true,
      accessor: 'name',
      render: (m) => (
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-full overflow-hidden border border-slate-200 dark:border-white/10 shrink-0 bg-slate-50 dark:bg-white/5 flex items-center justify-center">
            {m.photoUrl ? <img src={m.photoUrl} alt="" className="w-full h-full object-cover" /> : <Users className="w-4 h-4 text-slate-300" aria-hidden />}
          </div>
          <div className="min-w-0">
            <p className="font-medium text-slate-900 dark:text-slate-50 truncate">{m.name}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{m.designation || '—'}</p>
          </div>
        </div>
      ),
    },
    { key: 'role', header: t('Role'), render: (m) => <Badge variant="info">{titleCase(m.role)}</Badge>, exportValue: (m) => m.role },
    { key: 'department', header: t('Department'), hideOnMobile: true, render: (m) => m.department || '—' },
    {
      key: 'visibility',
      header: t('Show on website'),
      sortable: false,
      render: (m) => <VisibilityToggle member={m} />,
    },
  ];

  return (
    <Card>
      <CardHeader
        icon={<Users className="w-4 h-4" />}
        title={t('Staff visibility')}
        description={t('Teachers and staff are hidden from the public website until you switch them on here.')}
      />
      <Alert tone="info" className="mb-4">
        {t('New teachers and staff are hidden by default. Nothing shows on the website until you turn it on for each person, or select several and use “Show selected” below.')}
      </Alert>
      {q.isError ? (
        <ErrorState message={apiError(q.error, t('Could not load staff.'))} onRetry={() => q.refetch()} />
      ) : (
        <DataTable
          data={q.data?.items ?? []}
          columns={columns}
          isLoading={q.isLoading}
          serverSearch
          onSearch={setSearch}
          searchPlaceholder={t('Search by name')}
          serverPagination
          totalCount={q.data?.total ?? 0}
          page={params.page}
          pageSize={params.pageSize}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
          selectable
          bulkActions={(selected, clear) => (
            <>
              <button
                type="button"
                className="btn-secondary h-8 px-3 text-xs inline-flex items-center gap-1.5"
                disabled={bulkToggle.isPending}
                onClick={() => bulkToggle.mutate({ userIds: selected.map((s) => s.id), showOnWebsite: true }, { onSuccess: clear })}
              >
                <Eye className="w-3.5 h-3.5" aria-hidden /> {t('Show selected')}
              </button>
              <button
                type="button"
                className="btn-secondary h-8 px-3 text-xs inline-flex items-center gap-1.5"
                disabled={bulkToggle.isPending}
                onClick={() => bulkToggle.mutate({ userIds: selected.map((s) => s.id), showOnWebsite: false }, { onSuccess: clear })}
              >
                <EyeOff className="w-3.5 h-3.5" aria-hidden /> {t('Hide selected')}
              </button>
            </>
          )}
          toolbar={
            <Select
              aria-label={t('Filter by role')}
              value={role}
              onChange={(e) => setFilter('role', e.target.value)}
              className="w-auto min-w-36"
              placeholder={t('All roles')}
              options={[{ value: 'TEACHER', label: t('Teachers') }, { value: 'STAFF', label: t('Other staff') }]}
            />
          }
          emptyTitle={t('No staff found')}
          emptyDescription={t('Active teacher and staff accounts appear here.')}
        />
      )}
    </Card>
  );
};
