import React, { useState } from 'react';
import { Plus } from 'lucide-react';
import toast from 'react-hot-toast';
import { Button, Badge, Input, ErrorState, Drawer, DescriptionList } from '../../components/ui';
import { DataTable, type Column } from '../../components/DataTable/DataTable';
import { ConfirmModal } from '../../components/common/ConfirmModal';
import { useT, formatCurrency, formatDate, formatNumber } from '../../i18n';
import { useTableParams } from '../../hooks/useTableParams';
import { errMsg, invApi, personName, useInvMutation, usePurchases, type Purchase } from './inventory.api';
import { PurchaseFormModal } from './PurchaseFormModal';

const linesOf = (p: Purchase) => (Array.isArray(p.items) ? p.items : []);
const addedStock = (p: Purchase) => linesOf(p).some((l) => l.movementId);

export const PurchasesTab: React.FC<{ canManage: boolean }> = ({ canManage }) => {
  const t = useT();
  const tp = useTableParams(10);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const query = usePurchases({ page: tp.params.page, pageSize: tp.params.pageSize, search: tp.debouncedSearch, from, to });
  const [formOpen, setFormOpen] = useState(false);
  const [viewing, setViewing] = useState<Purchase | null>(null);
  const [deleting, setDeleting] = useState<Purchase | null>(null);
  const del = useInvMutation((id: string) => invApi.del(`/purchases/${id}`));

  const columns: Column<Purchase>[] = [
    { key: 'date', header: t('Date'), render: (p) => formatDate(p.date), exportValue: (p) => p.date.slice(0, 10) },
    { key: 'vendor', header: t('Vendor'), accessor: 'vendor', primary: true },
    { key: 'invoiceNo', header: t('Invoice no.'), render: (p) => p.invoiceNo || '—', hideOnMobile: true },
    { key: 'items', header: t('Items'), align: 'right', render: (p) => formatNumber(linesOf(p).length), exportValue: (p) => linesOf(p).length, hideOnMobile: true },
    {
      key: 'stock',
      header: t('Stock'),
      sortable: false,
      exportValue: (p) => (addedStock(p) ? 'Added' : ''),
      render: (p) => (addedStock(p) ? <Badge variant="success">{t('Added to stock')}</Badge> : <span className="text-slate-400">—</span>),
      hideOnMobile: true,
    },
    { key: 'total', header: t('Total'), align: 'right', exportValue: (p) => Number(p.totalAmount), render: (p) => <span className="tabular-nums font-semibold">{formatCurrency(p.totalAmount)}</span> },
  ];

  if (query.isError && !query.data) return <ErrorState message={t('Could not load purchases.')} onRetry={() => query.refetch()} />;

  return (
    <>
      <DataTable
        data={query.data?.items ?? []}
        columns={columns}
        isLoading={query.isLoading}
        serverSearch
        onSearch={tp.setSearch}
        searchPlaceholder={t('Search by vendor or invoice no...')}
        serverPagination
        totalCount={query.data?.meta.total ?? 0}
        page={tp.params.page}
        pageSize={tp.params.pageSize}
        onPageChange={tp.setPage}
        onPageSizeChange={tp.setPageSize}
        exportFileName="purchases"
        onRowClick={setViewing}
        toolbar={
          <div className="flex flex-wrap items-end gap-2">
            <Input type="date" aria-label={t('From date')} value={from} onChange={(e) => { setFrom(e.target.value); tp.setPage(1); }} containerClassName="w-38" />
            <Input type="date" aria-label={t('To date')} value={to} onChange={(e) => { setTo(e.target.value); tp.setPage(1); }} containerClassName="w-38" />
            {canManage && (
              <Button size="sm" variant="gradient" leftIcon={<Plus className="w-4 h-4" />} onClick={() => setFormOpen(true)}>{t('Record purchase')}</Button>
            )}
          </div>
        }
        actions={[
          { label: t('View'), icon: 'view', onClick: setViewing },
          ...(canManage ? [{ label: t('Delete'), icon: 'delete' as const, variant: 'danger' as const, onClick: setDeleting }] : []),
        ]}
        emptyTitle={t('No purchases recorded')}
        emptyDescription={t('Record vendor purchases, optionally adding the items straight into stock.')}
        emptyAction={canManage ? <Button size="sm" variant="gradient" leftIcon={<Plus className="w-4 h-4" />} onClick={() => setFormOpen(true)}>{t('Record purchase')}</Button> : undefined}
      />

      <PurchaseFormModal isOpen={formOpen} onClose={() => setFormOpen(false)} />

      <Drawer isOpen={!!viewing} onClose={() => setViewing(null)} title={viewing?.vendor} description={viewing ? formatDate(viewing.date) : undefined} width="lg">
        {viewing && (
          <div className="space-y-5">
            <DescriptionList
              items={[
                { label: t('Invoice no.'), value: viewing.invoiceNo || '—' },
                { label: t('Total'), value: formatCurrency(viewing.totalAmount) },
                { label: t('Recorded by'), value: personName(viewing.createdBy) || '—' },
                { label: t('Recorded on'), value: formatDate(viewing.createdAt, true) },
                ...(viewing.note ? [{ label: t('Note'), value: viewing.note }] : []),
              ]}
            />
            <div className="overflow-x-auto -mx-1">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-slate-500 dark:text-slate-400">
                    <th className="px-1 py-2 font-medium">{t('Item')}</th>
                    <th className="px-1 py-2 font-medium text-right">{t('Qty')}</th>
                    <th className="px-1 py-2 font-medium text-right">{t('Unit cost')}</th>
                    <th className="px-1 py-2 font-medium text-right">{t('Line total')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-white/10">
                  {linesOf(viewing).map((l, i) => (
                    <tr key={i}>
                      <td className="px-1 py-2">
                        {l.name}
                        {l.movementId && <Badge variant="success" className="ml-2">{t('In stock')}</Badge>}
                      </td>
                      <td className="px-1 py-2 text-right tabular-nums">{formatNumber(l.quantity)}</td>
                      <td className="px-1 py-2 text-right tabular-nums">{formatCurrency(l.unitCost)}</td>
                      <td className="px-1 py-2 text-right tabular-nums">{formatCurrency(l.lineTotal ?? l.unitCost * l.quantity)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Drawer>

      <ConfirmModal
        isOpen={!!deleting}
        title={t('Delete purchase')}
        message={
          deleting && addedStock(deleting)
            ? t('This purchase already added stock and cannot be deleted. Record an OUT or adjustment movement instead.')
            : t('Delete the purchase from "{vendor}"? This cannot be undone.', { vendor: deleting?.vendor ?? '' })
        }
        confirmLabel={t('Delete')}
        variant="danger"
        isLoading={del.isPending}
        onCancel={() => setDeleting(null)}
        onConfirm={() =>
          deleting &&
          (addedStock(deleting)
            ? setDeleting(null)
            : del.mutate(deleting.id, {
                onSuccess: () => { toast.success(t('Purchase deleted')); setDeleting(null); },
                onError: (e) => toast.error(errMsg(e, t('Could not delete purchase'))),
              }))
        }
      />
    </>
  );
};
