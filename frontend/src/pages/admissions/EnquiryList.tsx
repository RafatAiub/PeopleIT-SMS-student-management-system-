import React from 'react';
import { DataTable, type Column } from '@/components/DataTable/DataTable';
import { Select } from '@/components/ui';
import { EnquiryStatusBadge } from './EnquiryStatusBadge';
import { cn } from '@/lib/cn';
import { useT, formatDate } from '@/i18n';
import { useTableParams } from '@/hooks/useTableParams';
import { useEnquiries, useEnquiryAssignees } from './enquiries.queries';
import { SOURCE_OPTIONS, STATUS_OPTIONS, isFollowUpOverdue, type Enquiry } from './enquiries.types';

interface EnquiryListProps {
  /** Fixed to 'due' for the Follow-ups tab; undefined for the plain List tab. */
  followUp?: 'due' | 'upcoming';
  onOpen: (enquiry: Enquiry) => void;
}

export default function EnquiryList({ followUp, onOpen }: EnquiryListProps) {
  const t = useT();
  const { params, debouncedSearch, setPage, setPageSize, setSearch, setFilter } = useTableParams();
  const { data: assignees = [] } = useEnquiryAssignees();

  const { data, isLoading, isError, refetch } = useEnquiries({
    page: params.page,
    pageSize: params.pageSize,
    search: debouncedSearch,
    status: (params.filters.status || '') as Enquiry['status'] | '',
    assignedToUserId: params.filters.assignedToUserId || '',
    source: params.filters.source || '',
    followUp,
  });

  const items = data?.items || [];
  const total = data?.total || 0;

  const columns: Column<Enquiry>[] = [
    { key: 'studentName', header: t('Student'), accessor: 'studentName', primary: true },
    { key: 'guardianName', header: t('Guardian'), render: (row) => row.guardianName || '—', hideOnMobile: true },
    { key: 'phone', header: t('Phone'), accessor: 'phone' },
    { key: 'classInterested', header: t('Class'), render: (row) => row.classInterested || '—', hideOnMobile: true },
    { key: 'source', header: t('Source'), accessor: 'source', hideOnMobile: true },
    {
      key: 'status',
      header: t('Status'),
      render: (row) => <EnquiryStatusBadge status={row.status} />,
    },
    {
      key: 'assignedTo',
      header: t('Assignee'),
      render: (row) => (row.assignedTo ? `${row.assignedTo.firstName} ${row.assignedTo.lastName}` : '—'),
      hideOnMobile: true,
    },
    {
      key: 'followUpAt',
      header: t('Follow-up'),
      render: (row) =>
        row.followUpAt ? (
          <span className={cn(isFollowUpOverdue(row) && 'text-red-600 dark:text-red-400 font-semibold')}>
            {formatDate(row.followUpAt, true)}
          </span>
        ) : (
          '—'
        ),
    },
    { key: 'createdAt', header: t('Created'), render: (row) => formatDate(row.createdAt), hideOnMobile: true },
  ];

  const toolbar = (
    <>
      <Select
        aria-label={t('Filter by status')}
        value={params.filters.status || ''}
        onChange={(e) => setFilter('status', e.target.value)}
        className="w-auto min-w-36"
        placeholder={t('All statuses')}
        options={STATUS_OPTIONS.map((o) => ({ value: o.value, label: t(o.label) }))}
      />
      <Select
        aria-label={t('Filter by assignee')}
        value={params.filters.assignedToUserId || ''}
        onChange={(e) => setFilter('assignedToUserId', e.target.value)}
        className="w-auto min-w-36"
        placeholder={t('All assignees')}
        options={assignees.map((a) => ({ value: a.id, label: `${a.firstName} ${a.lastName}`.trim() }))}
      />
      <Select
        aria-label={t('Filter by source')}
        value={params.filters.source || ''}
        onChange={(e) => setFilter('source', e.target.value)}
        className="w-auto min-w-32"
        placeholder={t('All sources')}
        options={SOURCE_OPTIONS.map((o) => ({ value: o.value, label: t(o.label) }))}
      />
    </>
  );

  if (isError) {
    return (
      <div className="glass-card p-6 text-center">
        <p className="text-sm text-red-600 dark:text-red-400 mb-3">{t('Could not load enquiries.')}</p>
        <button type="button" onClick={() => refetch()} className="btn-secondary">
          {t('Retry')}
        </button>
      </div>
    );
  }

  return (
    <DataTable
      data={items}
      columns={columns}
      isLoading={isLoading}
      onRowClick={onOpen}
      serverSearch
      onSearch={setSearch}
      searchPlaceholder={t('Search by name, guardian, phone, email...')}
      serverPagination
      totalCount={total}
      page={params.page}
      pageSize={params.pageSize}
      onPageChange={setPage}
      onPageSizeChange={setPageSize}
      toolbar={toolbar}
      exportFileName={followUp ? 'admission-followups-due' : 'admission-enquiries'}
      emptyTitle={followUp ? t('No follow-ups due') : t('No enquiries found')}
      emptyDescription={
        followUp
          ? t('Every open enquiry is on schedule — nothing needs a follow-up right now.')
          : t('Try adjusting your search or filters, or create a new enquiry.')
      }
      caption={followUp ? t('Admission enquiries with a follow-up due') : t('Admission enquiries')}
    />
  );
}
