import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Bell, Download, FileSpreadsheet, Printer } from 'lucide-react';
import { platformBillingApi, type InvoiceListQuery, type PlatformInvoice } from '@/api/platformBilling.api';
import { Badge, Button, Drawer, Input, Select, Skeleton } from '@/components/ui';
import { DataTable, type Column } from '@/components/DataTable/DataTable';
import { formatCurrency, formatDate, useT } from '@/i18n';
import { invoiceStatusVariant, periodLabel } from '@/pages/billing/platform/platformBilling.logic';
import { EditLinesModal, invalidatePlatformAdmin, ManualPaymentModal, ReasonModal } from './PlatformBillingModals';

const UNPAID = ['DUE', 'PARTIAL', 'OVERDUE'];

/** Invoice detail + every owner action on it. Shared by the Invoices and Collections tabs. */
export const InvoiceDrawer: React.FC<{ invoiceId: string | null; onClose: () => void }> = ({ invoiceId, onClose }) => {
  const t = useT();
  const qc = useQueryClient();
  const { data: inv, isLoading } = useQuery({
    queryKey: ['platform-invoice', invoiceId],
    queryFn: () => platformBillingApi.invoice(invoiceId!),
    enabled: !!invoiceId,
  });
  const [payFor, setPayFor] = useState<PlatformInvoice | null>(null);
  const [editFor, setEditFor] = useState<PlatformInvoice | null>(null);
  const [reasonAction, setReasonAction] = useState<'waive' | 'cancel' | null>(null);
  const [reminding, setReminding] = useState(false);
  const unpaid = !!inv && UNPAID.includes(inv.status) && inv.amountDue > 0;

  const remind = async () => {
    if (!inv) return;
    setReminding(true);
    try {
      const r = await platformBillingApi.remindNow(inv.id);
      toast.success(t('Reminder: {sent} sent, {skipped} skipped, {failed} failed', { sent: r.sent, skipped: r.skipped + r.duplicates, failed: r.failed }));
      invalidatePlatformAdmin(qc);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || t('Could not send the reminder'));
    } finally {
      setReminding(false);
    }
  };

  return (
    <>
      <Drawer isOpen={!!invoiceId} onClose={onClose} width="lg" title={inv ? `${inv.invoiceNumber}` : t('Invoice')} description={inv?.institution?.name}>
        {isLoading || !inv ? (
          <Skeleton className="h-64" />
        ) : (
          <div className="space-y-5">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant={invoiceStatusVariant(inv.status)}>{t(inv.status)}</Badge>
              <span className="text-sm text-slate-600 dark:text-slate-300">{periodLabel(inv.period)}</span>
              {inv.daysOverdue > 0 && <Badge variant="danger">{t('{n} days overdue', { n: inv.daysOverdue })}</Badge>}
            </div>
            <dl className="grid grid-cols-2 gap-2 text-sm">
              <dt className="text-slate-500">{t('Total')}</dt>
              <dd className="text-right font-semibold tabular-nums">{formatCurrency(inv.total)}</dd>
              <dt className="text-slate-500">{t('Paid')}</dt>
              <dd className="text-right tabular-nums">{formatCurrency(inv.paidAmount)}</dd>
              {inv.waivedAmount > 0 && (
                <>
                  <dt className="text-slate-500">{t('Waived')}</dt>
                  <dd className="text-right tabular-nums">{formatCurrency(inv.waivedAmount)}</dd>
                </>
              )}
              <dt className="text-slate-500">{t('Amount due')}</dt>
              <dd className="text-right font-bold tabular-nums">{formatCurrency(inv.amountDue)}</dd>
              <dt className="text-slate-500">{t('Due date')}</dt>
              <dd className="text-right">{formatDate(inv.dueDate)}</dd>
              {inv.studentCount !== null && (
                <>
                  <dt className="text-slate-500">{t('Students on the 1st')}</dt>
                  <dd className="text-right tabular-nums">{inv.studentCount}</dd>
                </>
              )}
            </dl>
            {inv.statusReason && <p className="text-sm text-slate-600 dark:text-slate-300">{t('Reason')}: {inv.statusReason}</p>}

            <div>
              <h3 className="text-sm font-bold mb-2">{t('Lines')}</h3>
              <ul className="text-sm divide-y divide-slate-100 dark:divide-slate-800">
                {inv.lines.map((l, i) => (
                  <li key={i} className="py-1.5 flex justify-between gap-3">
                    <span className="min-w-0">{l.description}{l.quantity !== 1 ? ` (${l.quantity} × ${formatCurrency(l.unitPrice)})` : ''}</span>
                    <span className="tabular-nums">{formatCurrency(l.amount)}</span>
                  </li>
                ))}
              </ul>
            </div>

            {inv.payments.length > 0 && (
              <div>
                <h3 className="text-sm font-bold mb-2">{t('Payments')}</h3>
                <ul className="text-sm divide-y divide-slate-100 dark:divide-slate-800">
                  {inv.payments.map((p) => (
                    <li key={p.id} className="py-1.5 flex items-center justify-between gap-3">
                      <span className="min-w-0">
                        <span className="font-mono">{p.receiptNumber}</span> · {p.method.replace(/_/g, ' ')}
                        {p.reference ? ` · ${p.reference}` : ''} {p.isDemo ? `· ${t('demo')}` : ''}
                        <span className="block text-xs text-slate-500">{p.paidAt ? formatDate(p.paidAt) : ''}</span>
                      </span>
                      <span className="tabular-nums">{formatCurrency(p.amount)}</span>
                      <Button variant="ghost" size="sm" aria-label={t('Download receipt {n}', { n: p.receiptNumber ?? '' })} onClick={() => platformBillingApi.downloadReceiptPdf(p.id, p.receiptNumber)}>
                        <Download className="w-4 h-4" aria-hidden="true" />
                      </Button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              {unpaid && <Button size="sm" onClick={() => setPayFor(inv)}>{t('Record payment')}</Button>}
              {unpaid && inv.paidAmount === 0 && <Button size="sm" variant="secondary" onClick={() => setEditFor(inv)}>{t('Edit lines')}</Button>}
              {unpaid && <Button size="sm" variant="secondary" leftIcon={<Bell className="w-4 h-4" />} isLoading={reminding} onClick={remind}>{t('Send reminder now')}</Button>}
              <Button size="sm" variant="secondary" leftIcon={<Download className="w-4 h-4" />} onClick={() => platformBillingApi.downloadInvoicePdf(inv.id, inv.invoiceNumber)}>PDF</Button>
              <Link to={`/super-admin/billing/invoices/${inv.id}/print`} className="inline-flex items-center gap-1.5 min-h-8 px-3 text-xs rounded-lg border border-slate-300 dark:border-slate-700 font-semibold hover:bg-slate-100 dark:hover:bg-slate-800">
                <Printer className="w-4 h-4" aria-hidden="true" /> {t('Print')}
              </Link>
              {unpaid && <Button size="sm" variant="ghost" onClick={() => setReasonAction('waive')}>{t('Waive')}</Button>}
              {unpaid && inv.paidAmount === 0 && <Button size="sm" variant="ghost" className="text-red-700" onClick={() => setReasonAction('cancel')}>{t('Cancel invoice')}</Button>}
            </div>
          </div>
        )}
      </Drawer>
      <ManualPaymentModal invoice={payFor} onClose={() => setPayFor(null)} />
      <EditLinesModal invoice={editFor} onClose={() => setEditFor(null)} />
      <ReasonModal action={reasonAction} invoice={reasonAction ? inv ?? null : null} onClose={() => setReasonAction(null)} />
    </>
  );
};

const PAGE_SIZE = 25;

const PlatformInvoicesTab: React.FC = () => {
  const t = useT();
  const [filters, setFilters] = useState<InvoiceListQuery>({ page: 1, pageSize: PAGE_SIZE });
  const [openId, setOpenId] = useState<string | null>(null);
  const { data, isLoading } = useQuery({ queryKey: ['platform-invoices', filters], queryFn: () => platformBillingApi.invoices(filters) });
  const set = (patch: Partial<InvoiceListQuery>) => setFilters((f) => ({ ...f, page: 1, ...patch }));

  const exportAs = (format: 'csv' | 'xlsx') => platformBillingApi.exportInvoices(filters, format).catch(() => toast.error(t('Export failed')));

  const columns: Column<PlatformInvoice>[] = [
    {
      key: 'school',
      header: t('School'),
      primary: true,
      render: (r) => (
        <div>
          <p className="font-semibold text-slate-900 dark:text-white">{r.institution?.name}</p>
          <p className="text-xs text-slate-500 font-mono">{r.invoiceNumber}</p>
        </div>
      ),
    },
    { key: 'period', header: t('Month'), render: (r) => periodLabel(r.period) },
    { key: 'total', header: t('Total'), align: 'right', render: (r) => formatCurrency(r.total) },
    { key: 'due', header: t('Due'), align: 'right', render: (r) => <span className={r.amountDue > 0 ? 'font-semibold' : ''}>{formatCurrency(r.amountDue)}</span> },
    { key: 'dueDate', header: t('Due date'), hideOnMobile: true, render: (r) => formatDate(r.dueDate) },
    {
      key: 'status',
      header: t('Status'),
      render: (r) => (
        <span className="inline-flex items-center gap-1.5 flex-wrap">
          <Badge variant={invoiceStatusVariant(r.status)}>{t(r.status)}</Badge>
          {r.daysOverdue > 0 && <span className="text-xs text-rose-700 dark:text-rose-300">{t('{n}d', { n: r.daysOverdue })}</span>}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 items-end">
        <Input label={t('Search')} placeholder={t('School or invoice number')} value={filters.q ?? ''} onChange={(e) => set({ q: e.target.value || undefined })} />
        <Select
          label={t('Status')}
          value={filters.status ?? ''}
          onChange={(e) => set({ status: e.target.value || undefined })}
          options={[
            { value: '', label: t('All statuses') },
            { value: 'DUE,PARTIAL,OVERDUE', label: t('Unpaid') },
            { value: 'OVERDUE', label: t('OVERDUE') },
            { value: 'PAID', label: t('PAID') },
            { value: 'WAIVED', label: t('WAIVED') },
            { value: 'CANCELLED', label: t('CANCELLED') },
          ]}
        />
        <Input label={t('Month')} type="month" value={filters.period ?? ''} onChange={(e) => set({ period: e.target.value || undefined })} />
        <label className="flex items-center gap-2 text-sm font-medium min-h-10 cursor-pointer">
          <input type="checkbox" className="w-4 h-4" checked={filters.overdueOnly === 'true'} onChange={(e) => set({ overdueOnly: e.target.checked ? 'true' : undefined })} />
          {t('Overdue only')}
        </label>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" leftIcon={<FileSpreadsheet className="w-4 h-4" />} onClick={() => exportAs('xlsx')}>Excel</Button>
          <Button variant="secondary" size="sm" leftIcon={<Download className="w-4 h-4" />} onClick={() => exportAs('csv')}>CSV</Button>
        </div>
      </div>

      <DataTable
        data={data?.data ?? []}
        columns={columns}
        isLoading={isLoading}
        serverPagination
        totalCount={data?.meta.total ?? 0}
        page={filters.page ?? 1}
        pageSize={PAGE_SIZE}
        onPageChange={(page) => setFilters((f) => ({ ...f, page }))}
        onRowClick={(r) => setOpenId(r.id)}
        actions={[{ label: t('Open'), icon: 'view', onClick: (r) => setOpenId(r.id) }]}
        emptyTitle={t('No invoices')}
        emptyDescription={t('Invoices appear here after the monthly run (the 1st) or "Generate now".')}
        caption={t('Platform invoices')}
      />

      <InvoiceDrawer invoiceId={openId} onClose={() => setOpenId(null)} />
    </div>
  );
};

export default PlatformInvoicesTab;
