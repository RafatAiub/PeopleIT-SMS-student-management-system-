import React from 'react';
import { ReceiptText } from 'lucide-react';
import toast from 'react-hot-toast';
import { Card, CardHeader, Badge, Drawer, Select, Textarea, Button, Skeleton, ErrorState, DescriptionList } from '@/components/ui';
import type { BadgeVariant } from '@/components/ui';
import { DataTable, type Column } from '@/components/DataTable/DataTable';
import { useT, formatCurrency, formatDate } from '@/i18n';
import { useTableParams } from '@/hooks/useTableParams';
import { useOrders, useOrder, useUpdateOrder, apiError, PAYMENT_METHOD_LABEL } from '../../sites.queries';
import type { SiteOrder, SiteOrderStatus } from '../../sites.types';

const STATUS_VARIANT: Record<SiteOrderStatus, BadgeVariant> = {
  PENDING: 'warning',
  PAID: 'info',
  FULFILLED: 'success',
  CANCELLED: 'neutral',
  REFUNDED: 'danger',
};

const STATUS_LABEL: Record<SiteOrderStatus, string> = {
  PENDING: 'Pending',
  PAID: 'Paid',
  FULFILLED: 'Fulfilled',
  CANCELLED: 'Cancelled',
  REFUNDED: 'Refunded',
};

export const OrderStatusBadge: React.FC<{ status: SiteOrderStatus }> = ({ status }) => {
  const t = useT();
  return <Badge variant={STATUS_VARIANT[status]} dot>{t(STATUS_LABEL[status])}</Badge>;
};

const OrderDetailDrawer: React.FC<{ orderId: string | null; onClose: () => void }> = ({ orderId, onClose }) => {
  const t = useT();
  const q = useOrder(orderId ?? undefined);
  const update = useUpdateOrder();
  const [status, setStatus] = React.useState<SiteOrderStatus | ''>('');
  const [adminNote, setAdminNote] = React.useState('');
  const loaded = React.useRef<string | null>(null);

  React.useEffect(() => {
    const o = q.data;
    if (!o || loaded.current === o.id) return;
    loaded.current = o.id;
    setStatus(o.status);
    setAdminNote(o.adminNote ?? '');
  }, [q.data]);

  React.useEffect(() => { if (!orderId) loaded.current = null; }, [orderId]);

  const order = q.data;
  const dirty = !!order && (status !== order.status || adminNote !== (order.adminNote ?? ''));

  return (
    <Drawer isOpen={!!orderId} onClose={onClose} title={order ? t('Order {no}', { no: order.orderNo }) : t('Order')} width="lg">
      {q.isLoading ? (
        <div className="space-y-3"><Skeleton className="h-10" /><Skeleton className="h-32" /><Skeleton className="h-24" /></div>
      ) : q.isError || !order ? (
        <ErrorState compact message={apiError(q.error, t('Could not load this order.'))} onRetry={() => q.refetch()} />
      ) : (
        <div className="space-y-5">
          <div className="flex items-center gap-2 flex-wrap">
            <OrderStatusBadge status={order.status} />
            {order.isDemo && <Badge variant="warning">{t('Demo payment')}</Badge>}
            <span className="text-xs text-slate-500 dark:text-slate-400 ml-auto">{formatDate(order.createdAt, true)}</span>
          </div>

          <DescriptionList
            columns={2}
            items={[
              { label: t('Customer'), value: order.customerName },
              { label: t('Email'), value: order.email },
              { label: t('Phone'), value: order.phone },
              { label: t('Payment method'), value: t(PAYMENT_METHOD_LABEL[order.paymentMethod]) },
              ...(order.address
                ? [{ label: t('Address'), value: [order.address.line1, order.address.area, order.address.city, order.address.postcode].filter(Boolean).join(', ') }]
                : []),
              ...(order.paidAt ? [{ label: t('Paid at'), value: formatDate(order.paidAt, true) }] : []),
            ]}
          />

          <div>
            <p className="field-label">{t('Items')}</p>
            <ul className="divide-y divide-slate-100 dark:divide-white/6 rounded-lg border border-slate-200 dark:border-white/10">
              {order.items.map((it, i) => (
                <li key={`${it.refId}-${i}`} className="px-3 py-2 flex items-center gap-2 text-sm">
                  <Badge variant={it.kind === 'COURSE' ? 'primary' : 'neutral'}>{it.kind === 'COURSE' ? t('Course') : t('Product')}</Badge>
                  <span className="flex-1 min-w-0 truncate">{it.name}</span>
                  <span className="text-slate-500 dark:text-slate-400">× {it.qty}</span>
                  <span className="font-medium tabular-nums">{formatCurrency(it.unitPrice * it.qty)}</span>
                </li>
              ))}
            </ul>
            <div className="flex justify-end mt-2">
              <dl className="text-sm space-y-1 text-right">
                <div className="flex justify-between gap-6"><dt className="text-slate-500">{t('Subtotal')}</dt><dd className="tabular-nums">{formatCurrency(order.subtotal)}</dd></div>
                <div className="flex justify-between gap-6"><dt className="text-slate-500">{t('Shipping')}</dt><dd className="tabular-nums">{formatCurrency(order.shipping)}</dd></div>
                <div className="flex justify-between gap-6 font-semibold text-slate-900 dark:text-slate-100"><dt>{t('Total')}</dt><dd className="tabular-nums">{formatCurrency(order.total)}</dd></div>
              </dl>
            </div>
          </div>

          {order.note && (
            <div>
              <p className="field-label">{t('Note from the customer')}</p>
              <p className="text-sm text-slate-700 dark:text-slate-200 whitespace-pre-wrap">{order.note}</p>
            </div>
          )}

          <Select
            id="site-order-status"
            label={t('Status')}
            value={status}
            onChange={(e) => setStatus(e.target.value as SiteOrderStatus)}
            options={(Object.keys(STATUS_LABEL) as SiteOrderStatus[]).map((s) => ({ value: s, label: t(STATUS_LABEL[s]) }))}
            helperText={t('Cancelling or refunding restocks physical items and revokes any course access from this order.')}
          />
          <Textarea id="site-order-admin-note" label={t('Internal note')} rows={3} value={adminNote} onChange={(e) => setAdminNote(e.target.value)} helperText={t('Only staff see this note.')} />

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-white/6">
            <Button variant="secondary" onClick={onClose} disabled={update.isPending}>{t('Close')}</Button>
            <Button
              isLoading={update.isPending}
              disabled={!dirty}
              onClick={() =>
                update.mutate(
                  { id: order.id, data: { status: status || undefined, adminNote: adminNote.trim() } },
                  { onSuccess: () => toast.success(t('Order updated.')) }
                )
              }
            >
              {t('Save changes')}
            </Button>
          </div>
        </div>
      )}
    </Drawer>
  );
};

export const OrdersView: React.FC = () => {
  const t = useT();
  const { params, debouncedSearch, setPage, setPageSize, setSearch, setFilter } = useTableParams(20);
  const q = useOrders({ page: params.page, pageSize: params.pageSize, q: debouncedSearch, status: (params.filters.status || '') as SiteOrderStatus | '' });
  const [openId, setOpenId] = React.useState<string | null>(null);

  const columns: Column<SiteOrder>[] = [
    { key: 'orderNo', header: t('Order'), primary: true, accessor: 'orderNo', render: (o) => <span className="font-mono text-sm">{o.orderNo}</span> },
    { key: 'customer', header: t('Customer'), render: (o) => <div className="min-w-0"><p className="truncate">{o.customerName}</p><p className="text-xs text-slate-500 truncate">{o.email}</p></div> },
    { key: 'total', header: t('Total'), align: 'right', render: (o) => formatCurrency(o.total), exportValue: (o) => o.total },
    { key: 'payment', header: t('Payment'), hideOnMobile: true, render: (o) => t(PAYMENT_METHOD_LABEL[o.paymentMethod]), exportValue: (o) => o.paymentMethod },
    { key: 'status', header: t('Status'), render: (o) => <OrderStatusBadge status={o.status} />, exportValue: (o) => o.status },
    { key: 'date', header: t('Date'), sortable: true, accessor: 'createdAt', render: (o) => formatDate(o.createdAt, true) },
  ];

  return (
    <Card>
      <CardHeader icon={<ReceiptText className="w-4 h-4" />} title={t('Orders')} description={t('Shop and course purchases from your website.')} />
      {q.isError ? (
        <ErrorState message={apiError(q.error, t('Could not load orders.'))} onRetry={() => q.refetch()} />
      ) : (
        <DataTable
          data={q.data?.items ?? []}
          columns={columns}
          isLoading={q.isLoading}
          onRowClick={(o) => setOpenId(o.id)}
          serverSearch
          onSearch={setSearch}
          searchPlaceholder={t('Search by order number, name or email')}
          serverPagination
          totalCount={q.data?.total ?? 0}
          page={params.page}
          pageSize={params.pageSize}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
          toolbar={
            <Select
              aria-label={t('Filter by status')}
              value={params.filters.status || ''}
              onChange={(e) => setFilter('status', e.target.value)}
              className="w-auto min-w-36"
              placeholder={t('All statuses')}
              options={(Object.keys(STATUS_LABEL) as SiteOrderStatus[]).map((s) => ({ value: s, label: t(STATUS_LABEL[s]) }))}
            />
          }
          actions={[{ label: t('View'), icon: 'view', onClick: (o) => setOpenId(o.id) }]}
          emptyTitle={t('No orders yet')}
          emptyDescription={t('Orders appear here as soon as a visitor checks out on your shop or courses.')}
          exportFileName="website-orders"
        />
      )}
      <OrderDetailDrawer orderId={openId} onClose={() => setOpenId(null)} />
    </Card>
  );
};
