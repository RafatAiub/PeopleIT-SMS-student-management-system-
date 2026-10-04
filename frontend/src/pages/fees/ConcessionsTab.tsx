import React, { useState } from 'react';
import { Plus, UserPlus, BadgePercent, Users } from 'lucide-react';
import toast from 'react-hot-toast';
import { DataTable, type Column } from '../../components/DataTable/DataTable';
import { StatusBadge } from '../../components/common/StatusBadge';
import { ConfirmModal } from '../../components/common/ConfirmModal';
import { Button, Tabs, TabPanel, ErrorState, Badge, Select } from '../../components/ui';
import { useT, formatDate } from '../../i18n';
import { useTableParams } from '../../hooks/useTableParams';
import {
  useConcessions,
  useConcessionAssignments,
  useDeleteConcession,
  useUnassignConcession,
  useActiveConcessionOptions,
} from './feeExtras.queries';
import { AssignConcessionModal, ConcessionFormModal } from './ConcessionModals';
import { describeConcession } from './concessionUtils';
import type { Concession, ConcessionAssignment } from './types';

interface ConcessionsTabProps {
  /** SUPER_ADMIN/ADMIN may create/edit/assign (backend: requireRole SA, A). ACCOUNTANT is read-only. */
  canManage: boolean;
}

export const ConcessionsTab: React.FC<ConcessionsTabProps> = ({ canManage }) => {
  const t = useT();
  const [section, setSection] = useState<'types' | 'assignments'>('types');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Concession | null>(null);
  const [deleting, setDeleting] = useState<Concession | null>(null);
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignPreset, setAssignPreset] = useState<string | undefined>(undefined);
  const [unassigning, setUnassigning] = useState<ConcessionAssignment | null>(null);
  const [showInactive, setShowInactive] = useState(false);
  const [concessionFilter, setConcessionFilter] = useState('');

  const typesTable = useTableParams();
  const assignTable = useTableParams();

  const concessions = useConcessions({
    page: typesTable.params.page,
    pageSize: typesTable.params.pageSize,
    search: typesTable.debouncedSearch || undefined,
    includeInactive: showInactive,
  });
  const assignments = useConcessionAssignments({
    page: assignTable.params.page,
    pageSize: assignTable.params.pageSize,
    search: assignTable.debouncedSearch || undefined,
    concessionId: concessionFilter || undefined,
  });
  const concessionOptions = useActiveConcessionOptions(section === 'assignments');
  const deleteConcession = useDeleteConcession();
  const unassign = useUnassignConcession();

  const typeColumns: Column<Concession>[] = [
    { key: 'name', header: t('Name'), accessor: 'name', primary: true },
    {
      key: 'value',
      header: t('Value'),
      render: (c) => <span className="font-semibold tabular-nums">{describeConcession(c)}</span>,
      exportValue: (c) => describeConcession(c),
    },
    {
      key: 'appliesTo',
      header: t('Applies to'),
      render: (c) => c.feeCategory?.name ?? t('Whole invoice'),
      exportValue: (c) => c.feeCategory?.name ?? 'Whole invoice',
    },
    { key: 'assignedCount', header: t('Students'), align: 'right', render: (c) => c.assignedCount ?? 0 },
    {
      key: 'isActive',
      header: t('Status'),
      render: (c) => <StatusBadge status={c.isActive ? 'ACTIVE' : 'INACTIVE'} />,
      exportValue: (c) => (c.isActive ? 'Active' : 'Inactive'),
    },
    { key: 'description', header: t('Description'), hideOnMobile: true, defaultHidden: true, render: (c) => c.description || '—' },
  ];

  const assignmentColumns: Column<ConcessionAssignment>[] = [
    {
      key: 'student',
      header: t('Student'),
      primary: true,
      render: (a) => (
        <>
          <div className="font-medium text-slate-900 dark:text-white">{a.student.firstName} {a.student.lastName}</div>
          <div className="text-xs text-slate-500 dark:text-slate-400">
            {a.student.studentId}
            {a.student.class?.name ? ` · ${a.student.class.name}${a.student.section?.name ? ` ${a.student.section.name}` : ''}` : ''}
          </div>
        </>
      ),
      exportValue: (a) => `${a.student.firstName} ${a.student.lastName} (${a.student.studentId})`,
    },
    {
      key: 'concession',
      header: t('Concession'),
      render: (a) => (
        <span>
          {a.concession.name} <span className="text-slate-500">({describeConcession(a.concession)})</span>
        </span>
      ),
      exportValue: (a) => `${a.concession.name} (${describeConcession(a.concession)})`,
    },
    {
      key: 'validity',
      header: t('Valid'),
      hideOnMobile: true,
      render: (a) =>
        a.validFrom || a.validTo
          ? `${a.validFrom ? formatDate(a.validFrom) : '…'} – ${a.validTo ? formatDate(a.validTo) : '…'}`
          : t('Always'),
    },
    {
      key: 'state',
      header: t('Status'),
      render: (a) => <Badge variant={a.isCurrentlyActive ? 'success' : 'neutral'}>{a.isCurrentlyActive ? t('Applied') : t('Not in effect')}</Badge>,
      exportValue: (a) => (a.isCurrentlyActive ? 'Applied' : 'Not in effect'),
    },
    { key: 'note', header: t('Note'), hideOnMobile: true, defaultHidden: true, render: (a) => a.note || '—' },
  ];

  const handleDelete = async () => {
    if (!deleting) return;
    try {
      await deleteConcession.mutateAsync(deleting.id);
      toast.success(t('Concession deleted'));
      setDeleting(null);
    } catch (err: any) {
      toast.error(err.response?.data?.message || t('Failed to delete concession'));
    }
  };

  const handleUnassign = async () => {
    if (!unassigning) return;
    try {
      await unassign.mutateAsync(unassigning.id);
      toast.success(t('Concession unassigned'));
      setUnassigning(null);
    } catch (err: any) {
      toast.error(err.response?.data?.message || t('Failed to unassign concession'));
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs
          variant="pills"
          tabs={[
            { id: 'types', label: t('Concession types'), icon: <BadgePercent /> },
            { id: 'assignments', label: t('Assigned students'), icon: <Users /> },
          ]}
          value={section}
          onChange={(id) => setSection(id as 'types' | 'assignments')}
          label={t('Concession sections')}
        />
        {canManage && (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" leftIcon={<UserPlus className="w-4 h-4" />} onClick={() => { setAssignPreset(undefined); setAssignOpen(true); }}>
              {t('Assign to student')}
            </Button>
            <Button size="sm" leftIcon={<Plus className="w-4 h-4" />} onClick={() => { setEditing(null); setFormOpen(true); }}>
              {t('New concession')}
            </Button>
          </div>
        )}
      </div>

      <TabPanel id="types" value={section}>
        {concessions.isError ? (
          <ErrorState onRetry={() => concessions.refetch()} message={t('Failed to load concessions.')} />
        ) : (
          <DataTable
            data={concessions.data?.items ?? []}
            columns={typeColumns}
            isLoading={concessions.isLoading}
            serverPagination
            totalCount={concessions.data?.meta.total ?? 0}
            page={typesTable.params.page}
            pageSize={typesTable.params.pageSize}
            onPageChange={typesTable.setPage}
            onPageSizeChange={typesTable.setPageSize}
            serverSearch
            onSearch={typesTable.setSearch}
            searchPlaceholder={t('Search concessions...')}
            exportFileName="concessions"
            toolbar={
              <Select
                aria-label={t('Show')}
                value={showInactive ? 'all' : 'active'}
                onChange={(e) => { setShowInactive(e.target.value === 'all'); typesTable.setPage(1); }}
                options={[
                  { value: 'active', label: t('Active only') },
                  { value: 'all', label: t('Include inactive') },
                ]}
                className="w-auto min-w-40"
              />
            }
            actions={
              canManage
                ? [
                    { label: t('Assign to student'), onClick: (c: Concession) => { setAssignPreset(c.id); setAssignOpen(true); } },
                    { label: t('Edit'), icon: 'edit', onClick: (c: Concession) => { setEditing(c); setFormOpen(true); } },
                    { label: t('Delete'), icon: 'delete', variant: 'danger', onClick: (c: Concession) => setDeleting(c) },
                  ]
                : undefined
            }
            emptyTitle={t('No concessions yet')}
            emptyDescription={canManage ? t('Create a concession such as a sibling or merit discount, then assign it to students.') : t('An administrator has not set up any concessions.')}
          />
        )}
      </TabPanel>

      <TabPanel id="assignments" value={section}>
        {assignments.isError ? (
          <ErrorState onRetry={() => assignments.refetch()} message={t('Failed to load concession assignments.')} />
        ) : (
          <DataTable
            data={assignments.data?.items ?? []}
            columns={assignmentColumns}
            isLoading={assignments.isLoading}
            serverPagination
            totalCount={assignments.data?.meta.total ?? 0}
            page={assignTable.params.page}
            pageSize={assignTable.params.pageSize}
            onPageChange={assignTable.setPage}
            onPageSizeChange={assignTable.setPageSize}
            serverSearch
            onSearch={assignTable.setSearch}
            searchPlaceholder={t('Search by student name or ID...')}
            exportFileName="concession-assignments"
            toolbar={
              <Select
                aria-label={t('Filter by concession')}
                value={concessionFilter}
                onChange={(e) => { setConcessionFilter(e.target.value); assignTable.setPage(1); }}
                placeholder={t('All concessions')}
                options={(concessionOptions.data ?? []).map((c) => ({ value: c.id, label: c.name }))}
                className="w-auto min-w-40"
              />
            }
            actions={
              canManage
                ? [{ label: t('Unassign'), icon: 'delete', variant: 'danger', onClick: (a: ConcessionAssignment) => setUnassigning(a) }]
                : undefined
            }
            emptyTitle={t('No students have concessions')}
            emptyDescription={t('Assigned concessions are applied automatically as discounts when invoices are created.')}
          />
        )}
      </TabPanel>

      {canManage && (
        <>
          <ConcessionFormModal isOpen={formOpen} concession={editing} onClose={() => setFormOpen(false)} />
          <AssignConcessionModal isOpen={assignOpen} concessionId={assignPreset} onClose={() => setAssignOpen(false)} />
          <ConfirmModal
            isOpen={!!deleting}
            title={t('Delete concession?')}
            message={t('This removes the concession permanently. Invoices already created keep their discounts.')}
            confirmLabel={t('Delete')}
            onConfirm={handleDelete}
            onCancel={() => setDeleting(null)}
            isLoading={deleteConcession.isPending}
            variant="danger"
          />
          <ConfirmModal
            isOpen={!!unassigning}
            title={t('Unassign concession?')}
            message={t('Future invoices for this student will no longer get this discount. Existing invoices are not changed.')}
            confirmLabel={t('Unassign')}
            onConfirm={handleUnassign}
            onCancel={() => setUnassigning(null)}
            isLoading={unassign.isPending}
            variant="warning"
          />
        </>
      )}
    </div>
  );
};
