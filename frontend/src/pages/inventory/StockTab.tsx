import React, { useState } from 'react';
import { Plus, ArrowDownUp, AlertTriangle, History } from 'lucide-react';
import toast from 'react-hot-toast';
import { Button, Badge, Select, ErrorState, Alert, Checkbox } from '../../components/ui';
import { DataTable, type Column } from '../../components/DataTable/DataTable';
import { ConfirmModal } from '../../components/common/ConfirmModal';
import { useT, formatNumber } from '../../i18n';
import { useTableParams } from '../../hooks/useTableParams';
import { errMsg, invApi, useCategories, useInvMutation, useLowStock, useStockItems, type StockItem } from './inventory.api';
import { StockItemModal } from './StockItemModal';
import { StockMovementModal } from './StockMovementModal';
import { StockHistoryDrawer } from './StockHistoryDrawer';

export const StockTab: React.FC<{ canManage: boolean }> = ({ canManage }) => {
  const t = useT();
  const tp = useTableParams(10);
  const [categoryId, setCategoryId] = useState('');
  const [lowOnly, setLowOnly] = useState(false);
  const query = useStockItems({ page: tp.params.page, pageSize: tp.params.pageSize, search: tp.debouncedSearch, categoryId, lowOnly: lowOnly ? 'true' : undefined });
  const low = useLowStock();
  const categories = useCategories();

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<StockItem | null>(null);
  const [moving, setMoving] = useState<StockItem | null>(null);
  const [history, setHistory] = useState<StockItem | null>(null);
  const [deleting, setDeleting] = useState<StockItem | null>(null);
  const del = useInvMutation((id: string) => invApi.del(`/stock/${id}`));

  const lowCount = low.data?.meta.total ?? 0;

  const columns: Column<StockItem>[] = [
    { key: 'name', header: t('Item'), accessor: 'name', primary: true },
    { key: 'sku', header: t('SKU'), render: (i) => i.sku || '—', hideOnMobile: true },
    { key: 'category', header: t('Category'), render: (i) => i.category?.name || '—', exportValue: (i) => i.category?.name || '', hideOnMobile: true },
    {
      key: 'quantity',
      header: t('In stock'),
      align: 'right',
      exportValue: (i) => i.quantity,
      render: (i) => (
        <span className={`tabular-nums font-semibold ${i.isLow ? 'text-red-600 dark:text-red-400' : 'text-slate-900 dark:text-white'}`}>
          {formatNumber(i.quantity)} <span className="font-normal text-slate-500 dark:text-slate-400">{i.unit}</span>
        </span>
      ),
    },
    { key: 'reorderLevel', header: t('Reorder at'), align: 'right', exportValue: (i) => i.reorderLevel, render: (i) => <span className="tabular-nums">{formatNumber(i.reorderLevel)}</span>, hideOnMobile: true },
    {
      key: 'state',
      header: t('Status'),
      sortable: false,
      exportValue: (i) => (i.isLow ? 'LOW' : 'OK'),
      render: (i) => (i.isLow ? <Badge variant="danger" dot>{t('Low stock')}</Badge> : <Badge variant="success">{t('OK')}</Badge>),
    },
    ...(canManage
      ? [
          {
            key: 'move',
            header: t('Movement'),
            sortable: false,
            exportValue: () => null,
            render: (i: StockItem) => (
              <Button size="xs" variant="outline" leftIcon={<ArrowDownUp className="w-3.5 h-3.5" />} onClick={(e) => { e.stopPropagation(); setMoving(i); }}>
                {t('In / out')}
              </Button>
            ),
          } as Column<StockItem>,
        ]
      : []),
  ];

  if (query.isError && !query.data) return <ErrorState message={t('Could not load stock items.')} onRetry={() => query.refetch()} />;

  return (
    <div className="space-y-4">
      {lowCount > 0 && (
        <Alert
          tone="warning"
          title={t('{n} item(s) at or below reorder level', { n: lowCount })}
          action={
            !lowOnly ? (
              <Button size="xs" variant="outline" leftIcon={<AlertTriangle className="w-3.5 h-3.5" />} onClick={() => { setLowOnly(true); tp.setPage(1); }}>
                {t('Show low stock')}
              </Button>
            ) : undefined
          }
        >
          {(low.data?.items ?? []).slice(0, 5).map((i) => `${i.name} (${formatNumber(i.quantity)} ${i.unit})`).join(', ')}
          {lowCount > 5 ? '…' : ''}
        </Alert>
      )}

      <DataTable
        data={query.data?.items ?? []}
        columns={columns}
        isLoading={query.isLoading}
        serverSearch
        onSearch={tp.setSearch}
        searchPlaceholder={t('Search by item name or SKU...')}
        serverPagination
        totalCount={query.data?.meta.total ?? 0}
        page={tp.params.page}
        pageSize={tp.params.pageSize}
        onPageChange={tp.setPage}
        onPageSizeChange={tp.setPageSize}
        exportFileName="stock-items"
        onRowClick={setHistory}
        toolbar={
          <div className="flex flex-wrap items-center gap-3">
            <Select
              aria-label={t('Filter by category')}
              value={categoryId}
              onChange={(e) => { setCategoryId(e.target.value); tp.setPage(1); }}
              placeholder={t('All categories')}
              options={(categories.data?.items ?? []).map((c) => ({ value: c.id, label: c.name }))}
              className="max-w-44"
            />
            <Checkbox label={t('Low stock only')} checked={lowOnly} onChange={(e) => { setLowOnly(e.target.checked); tp.setPage(1); }} />
            {canManage && (
              <Button size="sm" variant="gradient" leftIcon={<Plus className="w-4 h-4" />} onClick={() => { setEditing(null); setFormOpen(true); }}>
                {t('Add item')}
              </Button>
            )}
          </div>
        }
        actions={[
          { label: t('History'), icon: 'view', onClick: setHistory },
          ...(canManage
            ? [
                { label: t('Edit'), icon: 'edit' as const, onClick: (i: StockItem) => { setEditing(i); setFormOpen(true); } },
                { label: t('Delete'), icon: 'delete' as const, variant: 'danger' as const, onClick: setDeleting },
              ]
            : []),
        ]}
        emptyTitle={lowOnly ? t('Nothing is low on stock') : t('No stock items yet')}
        emptyDescription={lowOnly ? t('Every item is above its reorder level.') : t('Add consumables such as chalk, paper or cleaning supplies to track quantities.')}
        emptyAction={
          canManage && !lowOnly ? (
            <Button size="sm" variant="gradient" leftIcon={<Plus className="w-4 h-4" />} onClick={() => { setEditing(null); setFormOpen(true); }}>{t('Add item')}</Button>
          ) : undefined
        }
      />

      <StockItemModal isOpen={formOpen} item={editing} categories={categories.data?.items ?? []} onClose={() => { setFormOpen(false); setEditing(null); }} />
      <StockMovementModal item={moving} onClose={() => setMoving(null)} />
      <StockHistoryDrawer
        item={history}
        onClose={() => setHistory(null)}
        action={
          canManage && history ? (
            <Button variant="gradient" leftIcon={<ArrowDownUp className="w-4 h-4" />} onClick={() => { setMoving(history); setHistory(null); }}>{t('Record movement')}</Button>
          ) : undefined
        }
        icon={<History className="w-4 h-4" />}
      />
      <ConfirmModal
        isOpen={!!deleting}
        title={t('Delete stock item')}
        message={t('Delete "{name}"? Items with movement history cannot be deleted.', { name: deleting?.name ?? '' })}
        confirmLabel={t('Delete')}
        variant="danger"
        isLoading={del.isPending}
        onCancel={() => setDeleting(null)}
        onConfirm={() =>
          deleting &&
          del.mutate(deleting.id, {
            onSuccess: () => { toast.success(t('Stock item deleted')); setDeleting(null); },
            onError: (e) => toast.error(errMsg(e, t('Could not delete stock item'))),
          })
        }
      />
    </div>
  );
};
