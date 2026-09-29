import React from 'react';
import { Users } from 'lucide-react';
import { Card, CardHeader, ErrorState } from '@/components/ui';
import { DataTable, type Column } from '@/components/DataTable/DataTable';
import { useT, formatDate, formatNumber } from '@/i18n';
import { useTableParams } from '@/hooks/useTableParams';
import { useCustomers, apiError } from '../../sites.queries';
import type { SiteCustomer } from '../../sites.types';

export const CustomersView: React.FC = () => {
  const t = useT();
  const { params, debouncedSearch, setPage, setPageSize, setSearch } = useTableParams(20);
  const q = useCustomers({ page: params.page, pageSize: params.pageSize, q: debouncedSearch });

  const columns: Column<SiteCustomer>[] = [
    { key: 'name', header: t('Name'), primary: true, accessor: 'name' },
    { key: 'email', header: t('Email'), accessor: 'email' },
    { key: 'phone', header: t('Phone'), render: (c) => c.phone || '—', hideOnMobile: true },
    { key: 'orders', header: t('Orders'), align: 'right', render: (c) => formatNumber(c.orderCount ?? 0), exportValue: (c) => c.orderCount ?? 0 },
    { key: 'enrollments', header: t('Courses'), align: 'right', render: (c) => formatNumber(c.enrollmentCount ?? 0), exportValue: (c) => c.enrollmentCount ?? 0, hideOnMobile: true },
    { key: 'joined', header: t('Joined'), sortable: true, accessor: 'createdAt', render: (c) => formatDate(c.createdAt), hideOnMobile: true },
  ];

  return (
    <Card>
      <CardHeader icon={<Users className="w-4 h-4" />} title={t('Customers')} description={t('Everyone who bought from your shop or enrolled in a course.')} />
      {q.isError ? (
        <ErrorState message={apiError(q.error, t('Could not load customers.'))} onRetry={() => q.refetch()} />
      ) : (
        <DataTable
          data={q.data?.items ?? []}
          columns={columns}
          isLoading={q.isLoading}
          serverSearch
          onSearch={setSearch}
          searchPlaceholder={t('Search by name or email')}
          serverPagination
          totalCount={q.data?.total ?? 0}
          page={params.page}
          pageSize={params.pageSize}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
          emptyTitle={t('No customers yet')}
          emptyDescription={t('Customer accounts are created automatically at checkout or when they enrol in a course.')}
          exportFileName="website-customers"
        />
      )}
    </Card>
  );
};
