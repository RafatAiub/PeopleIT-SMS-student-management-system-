import React, { useState } from 'react';
import { Download, FileArchive } from 'lucide-react';
import toast from 'react-hot-toast';
import { Alert, Badge, Button, Card, ErrorState, PageHeader } from '@/components/ui';
import { DataTable, type Column } from '@/components/DataTable/DataTable';
import { formatDate, useT } from '@/i18n';
import { useTableParams } from '@/hooks/useTableParams';
import { blobErrMsg, downloadExport, useExportJobs, useRequestExport, type ExportJob, type ExportStatus } from './dataExport.api';

const STATUS: Record<ExportStatus, { label: string; variant: 'info' | 'warning' | 'success' | 'danger' | 'neutral' }> = {
  PENDING: { label: 'Queued', variant: 'info' },
  RUNNING: { label: 'Preparing', variant: 'warning' },
  COMPLETED: { label: 'Ready', variant: 'success' },
  FAILED: { label: 'Failed', variant: 'danger' },
  EXPIRED: { label: 'Expired', variant: 'neutral' },
};

const CONTENTS = ['Students', 'Guardians & student links', 'Staff', 'Attendance', 'Exam results', 'Invoices', 'Payments'];

/**
 * Tenant data export. Route: /data-export (SUPER_ADMIN, ADMIN — mirrors /api/v1/data-export).
 */
const DataExport: React.FC = () => {
  const t = useT();
  const tp = useTableParams(10);
  const query = useExportJobs(tp.params.page, tp.params.pageSize);
  const request = useRequestExport();
  const [downloading, setDownloading] = useState<string | null>(null);
  const active = query.data?.items.some((j) => j.status === 'PENDING' || j.status === 'RUNNING') ?? false;
  const retention = query.data?.retentionDays ?? 7;

  const start = async () => {
    try {
      await request.mutateAsync();
      toast.success(t('Export requested — this page updates when it is ready'));
    } catch (err) {
      toast.error(await blobErrMsg(err, t('Could not start the export')));
    }
  };

  const download = async (job: ExportJob) => {
    setDownloading(job.id);
    try {
      await downloadExport(job);
    } catch (err) {
      toast.error(await blobErrMsg(err, t('Download failed')));
      query.refetch();
    } finally {
      setDownloading(null);
    }
  };

  const columns: Column<ExportJob>[] = [
    { key: 'createdAt', header: t('Requested'), primary: true, render: (j) => formatDate(j.createdAt, true), exportValue: (j) => j.createdAt },
    { key: 'requestedBy', header: t('By'), render: (j) => `${j.requestedBy.firstName} ${j.requestedBy.lastName}`.trim(), exportValue: (j) => `${j.requestedBy.firstName} ${j.requestedBy.lastName}` },
    { key: 'status', header: t('Status'), render: (j) => <Badge variant={STATUS[j.status].variant}>{t(STATUS[j.status].label)}</Badge>, exportValue: (j) => j.status },
    {
      key: 'expiresAt',
      header: t('Available until'),
      hideOnMobile: true,
      render: (j) => (j.expiresAt && j.status === 'COMPLETED' ? formatDate(j.expiresAt, true) : <span className="text-slate-400">—</span>),
      exportValue: (j) => j.expiresAt ?? '',
    },
    {
      key: 'download',
      header: '',
      sortable: false,
      align: 'right',
      render: (j) =>
        j.downloadable ? (
          <Button size="xs" variant="outline" leftIcon={<Download className="w-3.5 h-3.5" />} isLoading={downloading === j.id} onClick={() => download(j)}>
            {t('Download')}
          </Button>
        ) : null,
    },
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        title={t('Export your data')}
        description={t('Download everything your institution has stored, as spreadsheets in one ZIP file.')}
        breadcrumbs={[{ label: t('Settings') }, { label: t('Data export') }]}
        actions={
          <Button variant="gradient" leftIcon={<FileArchive className="w-4 h-4" />} onClick={start} isLoading={request.isPending} disabled={active}>
            {active ? t('Export in progress…') : t('Request export')}
          </Button>
        }
      />
      <Card>
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-2">{t('What is included')}</h2>
        <ul className="flex flex-wrap gap-2">
          {CONTENTS.map((c) => (
            <li key={c}>
              <Badge variant="neutral">{t(c)}</Badge>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-sm text-slate-600 dark:text-slate-400">
          {t('Files are UTF-8 CSV (open in Excel or Google Sheets). Each download is recorded in the audit log. Exports are deleted after {n} days.', { n: retention })}
        </p>
      </Card>
      <Alert tone="warning" title={t('Contains personal data')}>
        {t('The export includes names, phone numbers, addresses and medical notes. Store it securely and share it only with people who are allowed to see it.')}
      </Alert>
      {query.isError && !query.data ? (
        <ErrorState message={t('Could not load exports.')} onRetry={() => query.refetch()} />
      ) : (
        <DataTable
          data={query.data?.items ?? []}
          columns={columns}
          isLoading={query.isLoading}
          serverPagination
          totalCount={query.data?.meta.total ?? 0}
          page={tp.params.page}
          pageSize={tp.params.pageSize}
          onPageChange={tp.setPage}
          onPageSizeChange={tp.setPageSize}
          emptyTitle={t('No exports yet')}
          emptyDescription={t('Request an export to get a ZIP of all your data.')}
        />
      )}
    </div>
  );
};

export default DataExport;
