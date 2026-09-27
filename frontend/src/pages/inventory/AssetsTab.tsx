import React, { useState } from 'react';
import { Plus, Download, Tags, UserPlus, Undo2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { Button, Badge, Select, ErrorState } from '../../components/ui';
import { DataTable, type Column } from '../../components/DataTable/DataTable';
import { ConfirmModal } from '../../components/common/ConfirmModal';
import { useT, formatCurrency } from '../../i18n';
import { useTableParams } from '../../hooks/useTableParams';
import {
  ASSET_STATUS_OPTIONS,
  ASSET_STATUS_VARIANT,
  downloadAssetRegister,
  errMsg,
  invApi,
  personName,
  useAssets,
  useCategories,
  useInvMutation,
  type Asset,
} from './inventory.api';
import { AssetFormModal } from './AssetFormModal';
import { AllocateAssetModal, ReturnAssetModal } from './AllocateAssetModal';
import { AssetDrawer } from './AssetDrawer';
import { CategoriesModal } from './CategoriesModal';

const holderOf = (a: Asset) => {
  const open = a.allocations?.[0];
  if (!open) return '';
  return open.allocatedToUser ? personName(open.allocatedToUser) : open.allocatedToLocation || '';
};

export const AssetsTab: React.FC<{ canManage: boolean }> = ({ canManage }) => {
  const t = useT();
  const tp = useTableParams(10);
  const [status, setStatus] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const query = useAssets({ page: tp.params.page, pageSize: tp.params.pageSize, search: tp.debouncedSearch, status, categoryId });
  const categories = useCategories();

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Asset | null>(null);
  const [viewing, setViewing] = useState<Asset | null>(null);
  const [allocating, setAllocating] = useState<Asset | null>(null);
  const [returning, setReturning] = useState<Asset | null>(null);
  const [deleting, setDeleting] = useState<Asset | null>(null);
  const [catsOpen, setCatsOpen] = useState(false);
  const [exporting, setExporting] = useState(false);

  const del = useInvMutation((id: string) => invApi.del(`/assets/${id}`));

  const handleExport = async () => {
    setExporting(true);
    try {
      await downloadAssetRegister({ search: tp.debouncedSearch, status, categoryId });
    } catch (e) {
      toast.error(errMsg(e, t('Could not export the asset register')));
    } finally {
      setExporting(false);
    }
  };

  const columns: Column<Asset>[] = [
    { key: 'code', header: t('Code'), accessor: 'code', render: (a) => <span className="font-mono text-xs">{a.code}</span> },
    { key: 'name', header: t('Asset'), accessor: 'name', primary: true },
    { key: 'category', header: t('Category'), render: (a) => a.category?.name || '—', exportValue: (a) => a.category?.name || '', hideOnMobile: true },
    {
      key: 'status',
      header: t('Status'),
      sortable: false,
      exportValue: (a) => a.status,
      render: (a) => <Badge variant={ASSET_STATUS_VARIANT[a.status]}>{t(ASSET_STATUS_OPTIONS.find((o) => o.value === a.status)?.label || a.status)}</Badge>,
    },
    { key: 'holder', header: t('Allocated to'), render: (a) => holderOf(a) || '—', exportValue: holderOf, hideOnMobile: true },
    { key: 'location', header: t('Location'), render: (a) => a.location || '—', hideOnMobile: true, defaultHidden: true },
    { key: 'condition', header: t('Condition'), render: (a) => (a.condition ? t(a.condition.charAt(0) + a.condition.slice(1).toLowerCase()) : '—'), hideOnMobile: true, defaultHidden: true },
    {
      key: 'cost',
      header: t('Cost'),
      align: 'right',
      exportValue: (a) => (a.purchaseCost === null ? '' : Number(a.purchaseCost)),
      render: (a) => (a.purchaseCost === null ? '—' : <span className="tabular-nums">{formatCurrency(a.purchaseCost)}</span>),
    },
    ...(canManage
      ? [
          {
            key: 'quick',
            header: t('Allocation'),
            sortable: false,
            exportValue: () => null,
            render: (a: Asset) =>
              a.status === 'AVAILABLE' ? (
                <Button size="xs" variant="outline" leftIcon={<UserPlus className="w-3.5 h-3.5" />} onClick={(e) => { e.stopPropagation(); setAllocating(a); }}>
                  {t('Allocate')}
                </Button>
              ) : a.status === 'ALLOCATED' ? (
                <Button size="xs" variant="ghost" leftIcon={<Undo2 className="w-3.5 h-3.5" />} onClick={(e) => { e.stopPropagation(); setReturning(a); }}>
                  {t('Return')}
                </Button>
              ) : null,
          } as Column<Asset>,
        ]
      : []),
  ];

  if (query.isError && !query.data) {
    return <ErrorState message={t('Could not load assets.')} onRetry={() => query.refetch()} />;
  }

  return (
    <>
      <DataTable
        data={query.data?.items ?? []}
        columns={columns}
        isLoading={query.isLoading}
        serverSearch
        onSearch={tp.setSearch}
        searchPlaceholder={t('Search by name, code, serial or location...')}
        serverPagination
        totalCount={query.data?.meta.total ?? 0}
        page={tp.params.page}
        pageSize={tp.params.pageSize}
        onPageChange={tp.setPage}
        onPageSizeChange={tp.setPageSize}
        exportFileName="assets"
        onRowClick={setViewing}
        toolbar={
          <div className="flex flex-wrap items-center gap-2">
            <Select
              aria-label={t('Filter by status')}
              value={status}
              onChange={(e) => { setStatus(e.target.value); tp.setPage(1); }}
              placeholder={t('All statuses')}
              options={ASSET_STATUS_OPTIONS.map((o) => ({ value: o.value, label: t(o.label) }))}
              className="max-w-40"
            />
            <Select
              aria-label={t('Filter by category')}
              value={categoryId}
              onChange={(e) => { setCategoryId(e.target.value); tp.setPage(1); }}
              placeholder={t('All categories')}
              options={(categories.data?.items ?? []).map((c) => ({ value: c.id, label: c.name }))}
              className="max-w-44"
            />
            <Button size="sm" variant="outline" leftIcon={<Download className="w-4 h-4" />} isLoading={exporting} onClick={handleExport}>
              {t('Asset register')}
            </Button>
            {canManage && (
              <>
                <Button size="sm" variant="ghost" leftIcon={<Tags className="w-4 h-4" />} onClick={() => setCatsOpen(true)}>
                  {t('Categories')}
                </Button>
                <Button size="sm" variant="gradient" leftIcon={<Plus className="w-4 h-4" />} onClick={() => { setEditing(null); setFormOpen(true); }}>
                  {t('Add asset')}
                </Button>
              </>
            )}
          </div>
        }
        actions={[
          { label: t('View'), icon: 'view', onClick: setViewing },
          ...(canManage
            ? [
                { label: t('Edit'), icon: 'edit' as const, onClick: (a: Asset) => { setEditing(a); setFormOpen(true); } },
                { label: t('Delete'), icon: 'delete' as const, variant: 'danger' as const, onClick: setDeleting },
              ]
            : []),
        ]}
        emptyTitle={t('No assets yet')}
        emptyDescription={canManage ? t('Add furniture, devices, lab equipment and other fixed assets to track them here.') : t('No assets have been recorded yet.')}
        emptyAction={canManage ? <Button size="sm" variant="gradient" leftIcon={<Plus className="w-4 h-4" />} onClick={() => { setEditing(null); setFormOpen(true); }}>{t('Add asset')}</Button> : undefined}
      />

      <AssetFormModal isOpen={formOpen} asset={editing} categories={categories.data?.items ?? []} onClose={() => { setFormOpen(false); setEditing(null); }} />
      <AllocateAssetModal asset={allocating} onClose={() => setAllocating(null)} />
      <ReturnAssetModal asset={returning} onClose={() => setReturning(null)} />
      <AssetDrawer
        asset={viewing}
        canManage={canManage}
        onClose={() => setViewing(null)}
        onEdit={(a) => { setViewing(null); setEditing(a); setFormOpen(true); }}
        onAllocate={(a) => { setViewing(null); setAllocating(a); }}
        onReturn={(a) => { setViewing(null); setReturning(a); }}
      />
      {canManage && <CategoriesModal isOpen={catsOpen} onClose={() => setCatsOpen(false)} />}
      <ConfirmModal
        isOpen={!!deleting}
        title={t('Delete asset')}
        message={t('Delete "{name}"? Assets with allocation or maintenance history cannot be deleted — mark them Retired instead.', { name: deleting?.name ?? '' })}
        confirmLabel={t('Delete')}
        variant="danger"
        isLoading={del.isPending}
        onCancel={() => setDeleting(null)}
        onConfirm={() =>
          deleting &&
          del.mutate(deleting.id, {
            onSuccess: () => { toast.success(t('Asset deleted')); setDeleting(null); },
            onError: (e) => toast.error(errMsg(e, t('Could not delete asset'))),
          })
        }
      />
    </>
  );
};
