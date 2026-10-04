import React, { useState } from 'react';
import { Undo2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { Badge, Button, ErrorState, Select } from '../../components/ui';
import { DataTable, type Column } from '../../components/DataTable/DataTable';
import { ConfirmModal } from '../../components/common/ConfirmModal';
import { useT, formatDate } from '../../i18n';
import { useTableParams } from '../../hooks/useTableParams';
import { errorMessage } from '../results/academicLookups';
import { PROMOTION_STATUSES, useBatches, useHistory, useUndoBatch, type PromotionBatch, type PromotionRecordRow } from './promotion.queries';
import { STATUS_VARIANT, statusLabel } from './PromotionPreviewModal';

export const PromotionHistoryTab: React.FC = () => {
  const t = useT();
  const batchTable = useTableParams(10);
  const recordTable = useTableParams(20);
  const [batchFilter, setBatchFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [undoing, setUndoing] = useState<PromotionBatch | null>(null);

  const batches = useBatches(batchTable.params.page, batchTable.params.pageSize);
  const history = useHistory({
    page: recordTable.params.page,
    pageSize: recordTable.params.pageSize,
    batchId: batchFilter || undefined,
    status: statusFilter || undefined,
  });
  const undo = useUndoBatch();

  const handleUndo = async () => {
    if (!undoing) return;
    try {
      const res = await undo.mutateAsync(undoing.batchId);
      toast.success(t('{n} student(s) reverted', { n: res.reverted }));
      if (res.conflicts.length) {
        toast.error(t('{n} student(s) were changed after the promotion and were left as they are', { n: res.conflicts.length }));
      }
      setUndoing(null);
    } catch (err) {
      toast.error(errorMessage(err, t('Undo failed')));
    }
  };

  const batchColumns: Column<PromotionBatch>[] = [
    { key: 'createdAt', header: t('Date'), primary: true, render: (b) => formatDate(b.createdAt, true), exportValue: (b) => b.createdAt },
    { key: 'sessions', header: t('Session'), render: (b) => `${b.fromSession ?? '—'} → ${b.toSession ?? '—'}` },
    { key: 'classes', header: t('Class'), render: (b) => `${b.fromClass ?? '—'}${b.toClasses.length ? ` → ${b.toClasses.join(', ')}` : ''}` },
    {
      key: 'counts',
      header: t('Students'),
      render: (b) => (
        <div className="flex flex-wrap gap-1">
          {PROMOTION_STATUSES.filter((s) => b.counts[s] > 0).map((s) => (
            <Badge key={s} variant={STATUS_VARIANT[s]}>{statusLabel(t, s)} {b.counts[s]}</Badge>
          ))}
        </div>
      ),
      exportValue: (b) => b.total,
    },
    { key: 'promotedBy', header: t('By'), hideOnMobile: true, render: (b) => b.promotedBy ?? '—' },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (b) => (
        <div className="flex justify-end gap-2">
          <Button size="xs" variant="ghost" onClick={() => { setBatchFilter(b.batchId); recordTable.setPage(1); }}>
            {t('View students')}
          </Button>
          {b.canUndo && (
            <Button size="xs" variant="danger-soft" leftIcon={<Undo2 className="w-3.5 h-3.5" />} onClick={() => setUndoing(b)}>
              {t('Undo')}
            </Button>
          )}
        </div>
      ),
    },
  ];

  const recordColumns: Column<PromotionRecordRow>[] = [
    {
      key: 'student',
      header: t('Student'),
      primary: true,
      render: (r) => (
        <div>
          <div className="font-medium text-slate-900 dark:text-white">{r.student.firstName} {r.student.lastName}</div>
          <div className="text-xs text-slate-500">{r.student.studentId}</div>
        </div>
      ),
      exportValue: (r) => `${r.student.firstName} ${r.student.lastName} (${r.student.studentId})`,
    },
    { key: 'status', header: t('Decision'), render: (r) => <Badge variant={STATUS_VARIANT[r.status]}>{statusLabel(t, r.status)}</Badge>, exportValue: (r) => r.status },
    {
      key: 'from',
      header: t('From'),
      render: (r) => `${r.fromClass?.name ?? '—'}${r.fromSection ? ` ${r.fromSection.name}` : ''} · ${r.fromAcademicYear?.label ?? '—'}`,
    },
    {
      key: 'to',
      header: t('To'),
      render: (r) =>
        r.status === 'GRADUATED' || r.status === 'TRANSFERRED'
          ? `${statusLabel(t, r.status)} · ${r.toAcademicYear?.label ?? '—'}`
          : `${r.toClass?.name ?? '—'}${r.toSection ? ` ${r.toSection.name}` : ''} · ${r.toAcademicYear?.label ?? '—'}`,
    },
    { key: 'createdAt', header: t('Date'), hideOnMobile: true, render: (r) => formatDate(r.createdAt, true), exportValue: (r) => r.createdAt },
    { key: 'note', header: t('Note'), defaultHidden: true, render: (r) => r.note || '—' },
  ];

  return (
    <div className="space-y-6">
      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-white">{t('Batches')}</h3>
        <p className="text-xs text-slate-500 dark:text-slate-400">{t('Only the most recent batch can be undone, within 24 hours.')}</p>
        {batches.isError ? (
          <ErrorState onRetry={() => batches.refetch()} />
        ) : (
          <DataTable
            data={batches.data?.items ?? []}
            columns={batchColumns}
            isLoading={batches.isLoading}
            serverPagination
            totalCount={batches.data?.meta.total ?? 0}
            page={batchTable.params.page}
            pageSize={batchTable.params.pageSize}
            onPageChange={batchTable.setPage}
            onPageSizeChange={batchTable.setPageSize}
            emptyTitle={t('No promotions yet')}
            emptyDescription={t('Run a promotion to see it here.')}
          />
        )}
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-white">{t('Student records')}</h3>
        {history.isError ? (
          <ErrorState onRetry={() => history.refetch()} />
        ) : (
          <DataTable
            data={history.data?.items ?? []}
            columns={recordColumns}
            isLoading={history.isLoading}
            serverPagination
            totalCount={history.data?.meta.total ?? 0}
            page={recordTable.params.page}
            pageSize={recordTable.params.pageSize}
            onPageChange={recordTable.setPage}
            onPageSizeChange={recordTable.setPageSize}
            exportFileName="promotion-history"
            toolbar={
              <div className="flex flex-wrap gap-2 items-center">
                <Select
                  aria-label={t('Filter by decision')}
                  value={statusFilter}
                  onChange={(e) => { setStatusFilter(e.target.value); recordTable.setPage(1); }}
                  placeholder={t('All decisions')}
                  options={PROMOTION_STATUSES.map((s) => ({ value: s, label: statusLabel(t, s) }))}
                />
                {batchFilter && (
                  <Button size="sm" variant="ghost" onClick={() => setBatchFilter('')}>
                    {t('Show all batches')}
                  </Button>
                )}
              </div>
            }
            emptyTitle={t('No promotion records')}
          />
        )}
      </section>

      <ConfirmModal
        isOpen={!!undoing}
        title={t('Undo this promotion batch?')}
        message={t('Students return to the class, section and session they had before. Students changed since the promotion are left untouched.')}
        confirmLabel={t('Undo batch')}
        variant="warning"
        onConfirm={handleUndo}
        onCancel={() => setUndoing(null)}
        isLoading={undo.isPending}
      />
    </div>
  );
};
