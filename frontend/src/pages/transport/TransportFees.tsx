import React, { useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Eye, Receipt } from 'lucide-react';
import toast from 'react-hot-toast';
import { Card, CardHeader, Button, Input, Select, Alert, Badge } from '../../components/ui';
import { DataTable, type Column } from '../../components/DataTable/DataTable';
import { ConfirmModal } from '../../components/common/ConfirmModal';
import { useT, formatCurrency, formatNumber } from '../../i18n';
import apiClient from '../../api/client';
import { errMsg } from './transport.queries';

type Decision = 'BILL' | 'ALREADY_BILLED' | 'ZERO_FARE' | 'INACTIVE_STUDENT';
interface PreviewRow {
  studentId: string;
  studentCode: string;
  studentName: string;
  routeName: string;
  stopName: string | null;
  amount: number;
  description: string;
  decision: Decision;
}
interface Preview {
  period: string;
  feeCategory: { id: string | null; name: string };
  willCreateFeeCategory: boolean;
  totalAmount: number;
  counts: { bill: number; alreadyBilled: number; zeroFare: number; inactive: number };
  rows: PreviewRow[];
}
interface GenerateResult {
  createdCount: number;
  totalAmount: number;
  skipped: { alreadyBilled: number; zeroFare: number; inactive: number };
  failed: { studentId: string; error: string }[];
}

const DECISION: Record<Decision, { label: string; variant: 'success' | 'neutral' | 'warning' | 'info' }> = {
  BILL: { label: 'Will bill', variant: 'success' },
  ALREADY_BILLED: { label: 'Already billed', variant: 'info' },
  ZERO_FARE: { label: 'No fare set', variant: 'warning' },
  INACTIVE_STUDENT: { label: 'Inactive student', variant: 'neutral' },
};

const nextMonth = () => {
  const d = new Date();
  const n = new Date(d.getFullYear(), d.getMonth() + 1, 1);
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`;
};

/**
 * Monthly transport fee billing — SUPER_ADMIN / ADMIN only (creates invoices).
 * Idempotent per student + month on the server, so re-running is safe.
 */
export const TransportFees: React.FC<{ routes: { id: string; name: string }[] }> = ({ routes }) => {
  const t = useT();
  const [period, setPeriod] = useState(nextMonth());
  const [dueDate, setDueDate] = useState(`${nextMonth()}-10`);
  const [routeId, setRouteId] = useState('');
  const [feeCategoryId, setFeeCategoryId] = useState('');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [result, setResult] = useState<GenerateResult | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const categories = useQuery({
    queryKey: ['fees', 'categories', 'active'],
    queryFn: async (): Promise<{ id: string; name: string; isActive: boolean }[]> => {
      const res = await apiClient.get('/fees/categories');
      return res.data.data?.categories ?? res.data.data ?? [];
    },
    retry: false,
  });

  const body = useMemo(() => ({ period, dueDate, routeId: routeId || null, feeCategoryId: feeCategoryId || null }), [period, dueDate, routeId, feeCategoryId]);

  const validate = () => {
    const next: Record<string, string> = {};
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) next.period = t('Choose a month');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) next.dueDate = t('Choose a due date');
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const previewM = useMutation({
    mutationFn: async (): Promise<Preview> => (await apiClient.post('/transport/fees/preview', body)).data.data,
    onSuccess: (d) => { setPreview(d); setResult(null); },
    onError: (e) => toast.error(errMsg(e, t('Could not build the preview'))),
  });
  const generateM = useMutation({
    mutationFn: async (): Promise<GenerateResult> => (await apiClient.post('/transport/fees/generate', body)).data.data,
    onSuccess: (d) => {
      setResult(d);
      setConfirmOpen(false);
      toast.success(t('{n} invoice(s) created', { n: d.createdCount }));
      previewM.mutate();
    },
    onError: (e) => { setConfirmOpen(false); toast.error(errMsg(e, t('Could not generate invoices'))); },
  });

  const cols: Column<PreviewRow & { id: string }>[] = [
    { key: 'student', header: t('Student'), primary: true, render: (r) => r.studentName, exportValue: (r) => r.studentName },
    { key: 'code', header: t('Student ID'), render: (r) => r.studentCode || '—', hideOnMobile: true },
    { key: 'route', header: t('Route'), render: (r) => r.routeName, exportValue: (r) => r.routeName },
    { key: 'stop', header: t('Stop'), render: (r) => r.stopName || '—', hideOnMobile: true },
    { key: 'amount', header: t('Amount'), align: 'right', exportValue: (r) => r.amount, render: (r) => <span className="tabular-nums">{formatCurrency(r.amount)}</span> },
    { key: 'decision', header: t('Status'), sortable: false, exportValue: (r) => r.decision, render: (r) => <Badge variant={DECISION[r.decision].variant}>{t(DECISION[r.decision].label)}</Badge> },
  ];

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader title={t('Generate transport fees')} description={t('Creates one invoice per assigned student using the route’s monthly fare. Students already billed for the month are skipped.')} icon={<Receipt className="w-4 h-4" />} />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Input label={t('Billing month')} type="month" required value={period} onChange={(e) => { setPeriod(e.target.value); setPreview(null); }} error={errors.period} />
          <Input label={t('Due date')} type="date" required value={dueDate} onChange={(e) => { setDueDate(e.target.value); setPreview(null); }} error={errors.dueDate} />
          <Select label={t('Route')} value={routeId} onChange={(e) => { setRouteId(e.target.value); setPreview(null); }} placeholder={t('All routes')} options={routes.map((r) => ({ value: r.id, label: r.name }))} />
          <Select
            label={t('Fee category')}
            value={feeCategoryId}
            onChange={(e) => { setFeeCategoryId(e.target.value); setPreview(null); }}
            placeholder={t('Auto: “Transport…” category')}
            options={(categories.data ?? []).filter((c) => c.isActive !== false).map((c) => ({ value: c.id, label: c.name }))}
            helperText={categories.isError ? t('Could not load fee categories — the automatic category will be used') : undefined}
          />
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="outline" leftIcon={<Eye className="w-4 h-4" />} isLoading={previewM.isPending} onClick={() => validate() && previewM.mutate()}>{t('Preview')}</Button>
          <Button variant="gradient" leftIcon={<Receipt className="w-4 h-4" />} disabled={!preview || preview.counts.bill === 0} onClick={() => setConfirmOpen(true)}>
            {preview ? t('Create {n} invoice(s)', { n: preview.counts.bill }) : t('Create invoices')}
          </Button>
        </div>
      </Card>

      {result && (
        <Alert tone={result.failed.length ? 'warning' : 'success'} title={t('{n} invoice(s) created · {amt}', { n: result.createdCount, amt: formatCurrency(result.totalAmount) })}>
          {t('Skipped: {a} already billed, {z} without a fare, {i} inactive.', { a: result.skipped.alreadyBilled, z: result.skipped.zeroFare, i: result.skipped.inactive })}
          {result.failed.length > 0 && (
            <ul className="mt-1 list-disc pl-5">
              {result.failed.slice(0, 5).map((f) => <li key={f.studentId}>{f.error}</li>)}
            </ul>
          )}
        </Alert>
      )}

      {preview && (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Badge variant="success">{t('{n} to bill', { n: formatNumber(preview.counts.bill) })}</Badge>
            <Badge variant="info">{t('{n} already billed', { n: formatNumber(preview.counts.alreadyBilled) })}</Badge>
            {preview.counts.zeroFare > 0 && <Badge variant="warning">{t('{n} without a fare', { n: formatNumber(preview.counts.zeroFare) })}</Badge>}
            {preview.counts.inactive > 0 && <Badge variant="neutral">{t('{n} inactive', { n: formatNumber(preview.counts.inactive) })}</Badge>}
            <span className="font-semibold text-slate-900 dark:text-white ml-auto">{t('Total {amt}', { amt: formatCurrency(preview.totalAmount) })}</span>
          </div>
          {preview.willCreateFeeCategory && (
            <Alert tone="info">{t('No “Transport…” fee category exists — a “Transport Fee” category will be created automatically.')}</Alert>
          )}
          <p className="text-xs text-slate-500 dark:text-slate-400">{t('Active student concessions are applied automatically, as with any invoice.')}</p>
          <DataTable
            data={preview.rows.map((r) => ({ ...r, id: r.studentId }))}
            columns={cols}
            exportFileName={`transport-fees-${preview.period}`}
            emptyTitle={t('No students assigned')}
            emptyDescription={t('Assign students to routes to bill transport fees.')}
          />
        </div>
      )}

      <ConfirmModal
        isOpen={confirmOpen}
        title={t('Create transport invoices')}
        message={t('Create {n} invoice(s) for {p} totalling {amt}? Students already billed for this month are skipped.', {
          n: preview?.counts.bill ?? 0,
          p: preview?.period ?? period,
          amt: formatCurrency(preview?.totalAmount ?? 0),
        })}
        confirmLabel={t('Create invoices')}
        variant="warning"
        isLoading={generateM.isPending}
        onConfirm={() => generateM.mutate()}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  );
};
