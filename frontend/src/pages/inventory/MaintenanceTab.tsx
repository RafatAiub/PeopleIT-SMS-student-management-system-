import React, { useEffect, useState } from 'react';
import { Plus, CheckCircle2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { Button, Badge, Select, ErrorState, Modal, Input, Textarea } from '../../components/ui';
import { DataTable, type Column } from '../../components/DataTable/DataTable';
import { ConfirmModal } from '../../components/common/ConfirmModal';
import { useT, formatCurrency, formatDate } from '../../i18n';
import { useTableParams } from '../../hooks/useTableParams';
import {
  MAINT_STATUS_OPTIONS,
  MAINT_STATUS_VARIANT,
  dateKey,
  errMsg,
  invApi,
  todayKey,
  useAssets,
  useInvMutation,
  useMaintenance,
  type Maintenance,
  type MaintenanceStatus,
} from './inventory.api';

export const MaintenanceTab: React.FC<{ canManage: boolean }> = ({ canManage }) => {
  const t = useT();
  const tp = useTableParams(10);
  const [status, setStatus] = useState('');
  const query = useMaintenance({ page: tp.params.page, pageSize: tp.params.pageSize, search: tp.debouncedSearch, status });
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Maintenance | null>(null);
  const [completing, setCompleting] = useState<Maintenance | null>(null);
  const [deleting, setDeleting] = useState<Maintenance | null>(null);
  const del = useInvMutation((id: string) => invApi.del(`/maintenance/${id}`));

  const isOpenRec = (m: Maintenance) => m.status === 'SCHEDULED' || m.status === 'IN_PROGRESS';

  const columns: Column<Maintenance>[] = [
    { key: 'date', header: t('Date'), render: (m) => formatDate(m.date), exportValue: (m) => m.date.slice(0, 10) },
    {
      key: 'asset',
      header: t('Asset'),
      primary: true,
      exportValue: (m) => (m.asset ? `${m.asset.code} ${m.asset.name}` : ''),
      render: (m) => (m.asset ? <span><span className="font-mono text-xs text-slate-500 dark:text-slate-400">{m.asset.code}</span> {m.asset.name}</span> : '—'),
    },
    { key: 'description', header: t('Work'), accessor: 'description' },
    { key: 'vendor', header: t('Vendor'), render: (m) => m.vendor || '—', hideOnMobile: true },
    {
      key: 'status',
      header: t('Status'),
      sortable: false,
      exportValue: (m) => m.status,
      render: (m) => <Badge variant={MAINT_STATUS_VARIANT[m.status]}>{t(MAINT_STATUS_OPTIONS.find((o) => o.value === m.status)?.label || m.status)}</Badge>,
    },
    { key: 'cost', header: t('Cost'), align: 'right', exportValue: (m) => (m.cost === null ? '' : Number(m.cost)), render: (m) => (m.cost === null ? '—' : <span className="tabular-nums">{formatCurrency(m.cost)}</span>) },
    ...(canManage
      ? [
          {
            key: 'complete',
            header: t('Action'),
            sortable: false,
            exportValue: () => null,
            render: (m: Maintenance) =>
              isOpenRec(m) ? (
                <Button size="xs" variant="outline" leftIcon={<CheckCircle2 className="w-3.5 h-3.5" />} onClick={(e) => { e.stopPropagation(); setCompleting(m); }}>
                  {t('Complete')}
                </Button>
              ) : null,
          } as Column<Maintenance>,
        ]
      : []),
  ];

  if (query.isError && !query.data) return <ErrorState message={t('Could not load maintenance records.')} onRetry={() => query.refetch()} />;

  return (
    <>
      <DataTable
        data={query.data?.items ?? []}
        columns={columns}
        isLoading={query.isLoading}
        serverSearch
        onSearch={tp.setSearch}
        searchPlaceholder={t('Search by asset, work or vendor...')}
        serverPagination
        totalCount={query.data?.meta.total ?? 0}
        page={tp.params.page}
        pageSize={tp.params.pageSize}
        onPageChange={tp.setPage}
        onPageSizeChange={tp.setPageSize}
        exportFileName="asset-maintenance"
        toolbar={
          <div className="flex flex-wrap items-center gap-2">
            <Select aria-label={t('Filter by status')} value={status} onChange={(e) => { setStatus(e.target.value); tp.setPage(1); }} placeholder={t('All statuses')} options={MAINT_STATUS_OPTIONS.map((o) => ({ value: o.value, label: t(o.label) }))} className="max-w-40" />
            {canManage && (
              <Button size="sm" variant="gradient" leftIcon={<Plus className="w-4 h-4" />} onClick={() => { setEditing(null); setFormOpen(true); }}>{t('Schedule maintenance')}</Button>
            )}
          </div>
        }
        actions={
          canManage
            ? [
                { label: t('Edit'), icon: 'edit', onClick: (m) => { setEditing(m); setFormOpen(true); } },
                { label: t('Delete'), icon: 'delete', variant: 'danger', onClick: setDeleting },
              ]
            : undefined
        }
        emptyTitle={t('No maintenance records')}
        emptyDescription={t('Schedule servicing or repairs for assets and track their cost.')}
        emptyAction={canManage ? <Button size="sm" variant="gradient" leftIcon={<Plus className="w-4 h-4" />} onClick={() => { setEditing(null); setFormOpen(true); }}>{t('Schedule maintenance')}</Button> : undefined}
      />

      <MaintenanceFormModal isOpen={formOpen} record={editing} onClose={() => { setFormOpen(false); setEditing(null); }} />
      <CompleteMaintenanceModal record={completing} onClose={() => setCompleting(null)} />
      <ConfirmModal
        isOpen={!!deleting}
        title={t('Delete maintenance record')}
        message={t('Delete this maintenance record? In-progress work must be completed or cancelled first.')}
        confirmLabel={t('Delete')}
        variant="danger"
        isLoading={del.isPending}
        onCancel={() => setDeleting(null)}
        onConfirm={() =>
          deleting &&
          del.mutate(deleting.id, {
            onSuccess: () => { toast.success(t('Maintenance record deleted')); setDeleting(null); },
            onError: (e) => toast.error(errMsg(e, t('Could not delete maintenance record'))),
          })
        }
      />
    </>
  );
};

const MaintenanceFormModal: React.FC<{ isOpen: boolean; record: Maintenance | null; onClose: () => void }> = ({ isOpen, record, onClose }) => {
  const t = useT();
  const assets = useAssets({ page: 1, pageSize: 100 });
  const [assetId, setAssetId] = useState('');
  const [date, setDate] = useState(todayKey());
  const [description, setDescription] = useState('');
  const [cost, setCost] = useState('');
  const [vendor, setVendor] = useState('');
  const [status, setStatus] = useState<MaintenanceStatus>('SCHEDULED');
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!isOpen) return;
    setErrors({});
    setAssetId(record?.assetId ?? '');
    setDate(record ? dateKey(record.date) : todayKey());
    setDescription(record?.description ?? '');
    setCost(record?.cost === null || record?.cost === undefined ? '' : String(Number(record.cost)));
    setVendor(record?.vendor ?? '');
    setStatus(record?.status ?? 'SCHEDULED');
  }, [isOpen, record]);

  const save = useInvMutation((body: Record<string, unknown>) => (record ? invApi.put(`/maintenance/${record.id}`, body) : invApi.post('/maintenance', body)));
  const closed = record && (record.status === 'COMPLETED' || record.status === 'CANCELLED');

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (!record && !assetId) next.assetId = t('Select an asset');
    if (!date) next.date = t('Date is required');
    if (!description.trim()) next.description = t('Description is required');
    if (cost && (isNaN(Number(cost)) || Number(cost) < 0)) next.cost = t('Enter a valid amount');
    setErrors(next);
    if (Object.keys(next).length) return;
    const body: Record<string, unknown> = {
      date,
      description: description.trim(),
      cost: cost === '' ? null : Number(cost),
      vendor: vendor.trim() || null,
    };
    if (!record) body.assetId = assetId;
    if (!closed) body.status = status;
    save.mutate(body, {
      onSuccess: () => { toast.success(record ? t('Maintenance updated') : t('Maintenance scheduled')); onClose(); },
      onError: (err) => toast.error(errMsg(err, t('Could not save maintenance'))),
    });
  };

  const assetOptions = (assets.data?.items ?? [])
    .filter((a) => record || (a.status !== 'RETIRED' && a.status !== 'LOST'))
    .map((a) => ({ value: a.id, label: `${a.code} — ${a.name}` }));
  const statusOptions = (record ? MAINT_STATUS_OPTIONS : MAINT_STATUS_OPTIONS.filter((o) => o.value === 'SCHEDULED' || o.value === 'IN_PROGRESS')).map((o) => ({ value: o.value, label: t(o.label) }));

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={record ? t('Edit maintenance') : t('Schedule maintenance')}
      size="md"
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose}>{t('Cancel')}</Button>
          <Button type="submit" form="maintenance-form" variant="gradient" isLoading={save.isPending}>{t('Save')}</Button>
        </>
      }
    >
      <form id="maintenance-form" onSubmit={submit} className="space-y-4" noValidate>
        {record ? (
          <p className="text-sm text-slate-600 dark:text-slate-300">{record.asset ? `${record.asset.code} — ${record.asset.name}` : ''}</p>
        ) : (
          <Select label={t('Asset')} required value={assetId} onChange={(e) => setAssetId(e.target.value)} error={errors.assetId} placeholder={assets.isLoading ? t('Loading…') : t('Select an asset')} options={assetOptions} helperText={(assets.data?.meta.total ?? 0) > 100 ? t('Showing the first 100 assets') : undefined} />
        )}
        <Textarea label={t('Work description')} required rows={2} value={description} onChange={(e) => setDescription(e.target.value)} error={errors.description} />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input label={t('Date')} type="date" required value={date} onChange={(e) => setDate(e.target.value)} error={errors.date} />
          <Input label={t('Cost (৳)')} type="number" min={0} step="0.01" value={cost} onChange={(e) => setCost(e.target.value)} error={errors.cost} />
          <Input label={t('Vendor')} value={vendor} onChange={(e) => setVendor(e.target.value)} />
          {!closed && (
            <Select label={t('Status')} value={status} onChange={(e) => setStatus(e.target.value as MaintenanceStatus)} options={statusOptions} helperText={t('In progress marks the asset as under maintenance')} />
          )}
        </div>
      </form>
    </Modal>
  );
};

const CompleteMaintenanceModal: React.FC<{ record: Maintenance | null; onClose: () => void }> = ({ record, onClose }) => {
  const t = useT();
  const [cost, setCost] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    if (record) { setCost(record.cost === null ? '' : String(Number(record.cost))); setError(''); }
  }, [record]);
  const complete = useInvMutation((body: Record<string, unknown>) => invApi.post(`/maintenance/${record!.id}/complete`, body));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (cost && (isNaN(Number(cost)) || Number(cost) < 0)) return setError(t('Enter a valid amount'));
    complete.mutate(
      { cost: cost === '' ? null : Number(cost) },
      {
        onSuccess: () => { toast.success(t('Maintenance completed')); onClose(); },
        onError: (err) => toast.error(errMsg(err, t('Could not complete maintenance'))),
      },
    );
  };

  return (
    <Modal
      isOpen={!!record}
      onClose={onClose}
      title={t('Complete maintenance')}
      description={record?.description}
      size="sm"
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose}>{t('Cancel')}</Button>
          <Button type="submit" form="complete-maint-form" variant="gradient" isLoading={complete.isPending}>{t('Mark completed')}</Button>
        </>
      }
    >
      <form id="complete-maint-form" onSubmit={submit} className="space-y-3">
        <Input label={t('Final cost (৳)')} type="number" min={0} step="0.01" value={cost} onChange={(e) => { setCost(e.target.value); setError(''); }} error={error} />
        <p className="text-xs text-slate-500 dark:text-slate-400">{t('The asset returns to Available (or Allocated, if it is still allocated).')}</p>
      </form>
    </Modal>
  );
};
