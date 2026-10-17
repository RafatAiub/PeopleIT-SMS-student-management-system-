import React, { useEffect, useState } from 'react';
import { DataTable, type Column } from '@/components/DataTable/DataTable';
import { Badge } from '@/components/ui';
import { cn } from '@/lib/cn';
import { useT, formatDate, useLocale } from '@/i18n';
import apiClient from '@/api/client';
import { useQuery } from '@tanstack/react-query';
import { ENQUIRIES_KEY } from './enquiries.queries';
import { filtersToQuery, type CrmFilters } from './crm.api';
import { stageLabel } from './crm.logic';
import { isFollowUpOverdue, SOURCE_OPTIONS, type Enquiry } from './enquiries.types';

interface EnquiryListProps {
  /** Fixed to 'due' for the Follow-ups tab; undefined for the plain List tab. */
  followUp?: 'due' | 'upcoming';
  /** T4 quick filters from the page (search lives here too). */
  filters?: CrmFilters;
  onOpen: (enquiry: Enquiry) => void;
}

export default function EnquiryList({ followUp, filters = {}, onOpen }: EnquiryListProps) {
  const t = useT();
  const { lang } = useLocale();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const filterKey = JSON.stringify(filters);
  useEffect(() => setPage(1), [filterKey]);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: [ENQUIRIES_KEY, 'crm-list', { followUp, filters, page, pageSize }],
    queryFn: async (): Promise<{ items: Enquiry[]; total: number }> => {
      const q = filtersToQuery(filters);
      q.set('page', String(page));
      q.set('pageSize', String(pageSize));
      if (followUp) q.set('followUp', followUp);
      const res = await apiClient.get(`/enquiries?${q.toString()}`);
      return { items: res.data.data || [], total: res.data.meta?.total ?? 0 };
    },
  });

  const items = data?.items || [];
  const total = data?.total || 0;
  const sourceLabel = (s: string) => t(SOURCE_OPTIONS.find((o) => o.value === s)?.label ?? s);

  const columns: Column<Enquiry>[] = [
    { key: 'studentName', header: t('Student'), accessor: 'studentName', primary: true },
    { key: 'guardianName', header: t('Guardian'), render: (row) => row.guardianName || '—', hideOnMobile: true },
    { key: 'phone', header: t('Phone'), accessor: 'phone' },
    { key: 'classInterested', header: t('Class'), render: (row) => row.classInterested || '—', hideOnMobile: true },
    { key: 'source', header: t('Source'), render: (row) => (row.source ? sourceLabel(row.source) : '—'), hideOnMobile: true },
    {
      key: 'stage',
      header: t('Stage'),
      render: (row) => (
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full shrink-0" style={{ background: row.stage?.color ?? '#94a3b8' }} aria-hidden />
          {stageLabel(row.stage, lang)}
          {row.priority === 'HIGH' && <Badge variant="danger">{t('High')}</Badge>}
        </span>
      ),
    },
    {
      key: 'assignedTo',
      header: t('Owner'),
      render: (row) => (row.assignedTo ? `${row.assignedTo.firstName} ${row.assignedTo.lastName}` : '—'),
      hideOnMobile: true,
    },
    { key: 'nextStep', header: t('Next step'), render: (row) => row.nextStep || '—', hideOnMobile: true },
    {
      key: 'followUpAt',
      header: t('Due'),
      render: (row) =>
        row.followUpAt ? (
          <span className={cn(isFollowUpOverdue(row) && 'text-red-700 dark:text-red-400 font-semibold')}>{formatDate(row.followUpAt, true)}</span>
        ) : (
          '—'
        ),
    },
    { key: 'createdAt', header: t('Created'), render: (row) => formatDate(row.createdAt), hideOnMobile: true },
  ];

  if (isError) {
    return (
      <div className="glass-card p-6 text-center">
        <p className="text-sm text-red-700 dark:text-red-400 mb-3">{t('Could not load enquiries.')}</p>
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
      serverPagination
      totalCount={total}
      page={page}
      pageSize={pageSize}
      onPageChange={setPage}
      onPageSizeChange={setPageSize}
      exportFileName={followUp ? 'admission-followups-due' : 'admission-enquiries'}
      emptyTitle={followUp ? t('No follow-ups due') : t('No enquiries found')}
      emptyDescription={
        followUp ? t('Every open enquiry is on schedule — nothing needs a follow-up right now.') : t('Try adjusting your search or filters, or create a new enquiry.')
      }
      caption={followUp ? t('Admission enquiries with a follow-up due') : t('Admission enquiries')}
    />
  );
}
