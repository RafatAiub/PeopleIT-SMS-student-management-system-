import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  ShieldAlert,
  Receipt,
  Link2,
  Copy,
  RotateCcw,
  RefreshCw,
} from 'lucide-react';
import toast from 'react-hot-toast';
import {
  billingApi,
  formatCurrency,
  type Plan,
  type SubscriptionListItem,
  type SubscriptionDetail,
  type SubscriptionStatus,
  type SubscriptionPayment,
  type ManualOverrideAction,
  type BillingCycle,
} from '@/api/billing.api';
import { Drawer } from '@/components/ui/Drawer';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Input, Select, Textarea } from '@/components/ui/Input';
import { DataTable, type Column } from '@/components/DataTable/DataTable';
import { formatDate } from '@/i18n';
import { CYCLES, BILLING_CYCLE_LABELS, STATUS_BADGE, PAYMENT_STATUS_BADGE, paymentMethodLabel, SectionCard } from './shared';

const SubscriptionsTab: React.FC<{ plans: Plan[] }> = ({ plans }) => {
  const [rows, setRows] = useState<SubscriptionListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const pageSize = 10;
  const [statusFilter, setStatusFilter] = useState<SubscriptionStatus | 'ALL'>('ALL');
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [meta, setMeta] = useState({ total: 0, totalPages: 1 });
  const [detailInstitutionId, setDetailInstitutionId] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 400);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [statusFilter, debounced]);

  const load = React.useCallback(() => {
    let cancelled = false;
    setLoading(true);
    billingApi
      .listSubscriptions({
        page,
        pageSize,
        status: statusFilter === 'ALL' ? undefined : statusFilter,
        q: debounced || undefined,
      })
      .then((res) => {
        if (cancelled) return;
        setRows(res.data);
        setMeta({ total: res.meta.total, totalPages: res.meta.totalPages });
      })
      .catch(() => {
        if (!cancelled) toast.error('Failed to load subscriptions');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [page, statusFilter, debounced]);

  useEffect(() => load(), [load]);

  const columns: Column<SubscriptionListItem>[] = [
    {
      key: 'institution',
      header: 'Institution',
      primary: true,
      render: (s) => (
        <div>
          <p className="font-medium text-slate-900 dark:text-white">{s.institution.name}</p>
          <p className="text-[11px] font-mono text-slate-400">{s.institution.slug}</p>
        </div>
      ),
    },
    { key: 'plan', header: 'Plan', render: (s) => <span className="text-slate-600 dark:text-slate-300">{s.plan.name}</span> },
    {
      key: 'cycle',
      header: 'Cycle',
      render: (s) => <span className="text-slate-500 dark:text-slate-400 text-xs">{BILLING_CYCLE_LABELS[s.billingCycle]}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      render: (s) => {
        const b = STATUS_BADGE[s.status];
        return <Badge variant={b.variant}>{b.label}</Badge>;
      },
    },
    {
      key: 'end',
      header: 'Period / grace ends',
      render: (s) => {
        const v = s.status === 'GRACE' ? s.graceEndsAt : s.currentPeriodEnd;
        return <span className="text-slate-500 dark:text-slate-400 text-xs">{v ? formatDate(v) : '—'}</span>;
      },
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
        <Input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search institution name or slug…"
          aria-label="Search institution name or slug"
          containerClassName="flex-1 sm:max-w-xs"
        />
        <Select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as SubscriptionStatus | 'ALL')}
          containerClassName="w-full sm:w-52"
          aria-label="Filter by status"
          options={[
            { value: 'ALL', label: 'All statuses' },
            { value: 'TRIALING', label: 'Trialing' },
            { value: 'ACTIVE', label: 'Active' },
            { value: 'GRACE', label: 'Grace period' },
            { value: 'EXPIRED', label: 'Expired' },
            { value: 'CANCELLED', label: 'Cancelled' },
          ]}
        />
      </div>

      <DataTable
        data={rows}
        columns={columns}
        isLoading={loading}
        serverPagination
        totalCount={meta.total}
        page={page}
        pageSize={pageSize}
        onPageChange={setPage}
        onRowClick={(s) => setDetailInstitutionId(s.institutionId)}
        emptyTitle="No subscriptions found"
        emptyDescription="No institutions match the current search and filter."
        actions={[
          { label: 'Manage', icon: 'edit', onClick: (s) => setDetailInstitutionId(s.institutionId) },
        ]}
      />

      {detailInstitutionId && (
        <SubscriptionDetailDrawer
          institutionId={detailInstitutionId}
          plans={plans}
          onClose={() => setDetailInstitutionId(null)}
          onChanged={() => load()}
        />
      )}
    </div>
  );
};

export default SubscriptionsTab;

// ── Subscription detail: inspect + act ─────────────────────────────────

const SubscriptionDetailDrawer: React.FC<{
  institutionId: string;
  plans: Plan[];
  onClose: () => void;
  onChanged: () => void;
}> = ({ institutionId, plans, onClose, onChanged }) => {
  const [detail, setDetail] = useState<SubscriptionDetail | null>(null);
  const [loading, setLoading] = useState(true);

  const [action, setAction] = useState<ManualOverrideAction>('EXTEND');
  const [extendDays, setExtendDays] = useState('30');
  const [overridePlanId, setOverridePlanId] = useState('');
  const [overrideCycle, setOverrideCycle] = useState<BillingCycle>('MONTHLY');
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState<string>();
  const [submitting, setSubmitting] = useState(false);

  const [refundTarget, setRefundTarget] = useState<SubscriptionPayment | null>(null);
  const [checkingRefundId, setCheckingRefundId] = useState<string | null>(null);

  const fetchDetail = React.useCallback(async () => {
    try {
      setLoading(true);
      setDetail(await billingApi.getSubscriptionDetail(institutionId));
    } catch {
      toast.error('Failed to load subscription details');
    } finally {
      setLoading(false);
    }
  }, [institutionId]);

  useEffect(() => {
    fetchDetail();
  }, [fetchDetail]);

  const handleOverride = async (e: React.FormEvent) => {
    e.preventDefault();
    if (reason.trim().length < 5) {
      setReasonError('Reason must be at least 5 characters');
      return;
    }
    if (action === 'MARK_PAID' && !overridePlanId) return toast.error('Select a plan for "Mark paid"');
    setSubmitting(true);
    try {
      await billingApi.manualOverride(institutionId, {
        action,
        reason: reason.trim(),
        ...(action === 'EXTEND' || action === 'FORCE_REACTIVATE' ? { extendDays: Number(extendDays) || 30 } : {}),
        ...(action === 'MARK_PAID' ? { planId: overridePlanId, billingCycle: overrideCycle } : {}),
      });
      toast.success('Override applied');
      onChanged();
      onClose();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to apply override');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCheckRefund = async (paymentId: string) => {
    setCheckingRefundId(paymentId);
    try {
      const r = await billingApi.queryRefundStatus(paymentId);
      toast.success(`Refund status: ${r.liveStatus ?? 'unknown'}${r.persisted ? ' — confirmed' : ''}`);
      fetchDetail();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to check refund status');
    } finally {
      setCheckingRefundId(null);
    }
  };

  const badge = detail ? STATUS_BADGE[detail.subscription.status] : null;

  return (
    <>
      <Drawer isOpen onClose={onClose} title="Manage subscription" width="xl">
        {loading || !detail ? (
          <div className="space-y-4 animate-pulse">
            <div className="h-24 bg-slate-200 dark:bg-slate-800 rounded-2xl" />
            <div className="h-40 bg-slate-200 dark:bg-slate-800 rounded-2xl" />
            <div className="h-40 bg-slate-200 dark:bg-slate-800 rounded-2xl" />
          </div>
        ) : (
          <div className="space-y-5">
            {/* Summary */}
            <div className="rounded-2xl border border-slate-200 dark:border-white/10 bg-slate-50/50 dark:bg-slate-950/40 p-4 grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
              <div>
                <p className="text-xs text-slate-400 font-medium">Plan</p>
                <p className="font-semibold text-slate-900 dark:text-white mt-0.5">{detail.subscription.plan?.name ?? '—'}</p>
              </div>
              <div>
                <p className="text-xs text-slate-400 font-medium">Status</p>
                <div className="mt-1">{badge && <Badge variant={badge.variant}>{badge.label}</Badge>}</div>
              </div>
              <div>
                <p className="text-xs text-slate-400 font-medium">Cycle</p>
                <p className="font-semibold text-slate-900 dark:text-white mt-0.5">{BILLING_CYCLE_LABELS[detail.subscription.billingCycle]}</p>
              </div>
              <div>
                <p className="text-xs text-slate-400 font-medium">Period ends</p>
                <p className="font-semibold text-slate-900 dark:text-white mt-0.5">
                  {detail.subscription.currentPeriodEnd ? formatDate(detail.subscription.currentPeriodEnd) : '—'}
                </p>
              </div>
            </div>

            {/* Payment history */}
            <SectionCard icon={<Receipt className="w-4 h-4 text-slate-400" />} title="Payment history">
              {detail.payments.length === 0 ? (
                <p className="text-xs text-slate-400 italic py-2">No payments recorded yet.</p>
              ) : (
                <div className="rounded-xl border border-slate-200 dark:border-white/10 overflow-hidden max-h-56 overflow-y-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-white dark:bg-slate-900 sticky top-0">
                      <tr className="text-slate-400 uppercase tracking-wider text-[10px] border-b border-slate-200 dark:border-white/5">
                        <th className="px-3 py-2 font-semibold">Amount</th>
                        <th className="px-3 py-2 font-semibold">Method</th>
                        <th className="px-3 py-2 font-semibold">Status</th>
                        <th className="px-3 py-2 font-semibold">Date</th>
                        <th className="px-3 py-2 font-semibold text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                      {detail.payments.map((p) => {
                        const pb = PAYMENT_STATUS_BADGE[p.status];
                        return (
                          <tr key={p.id}>
                            <td className="px-3 py-2 font-semibold text-slate-900 dark:text-white">
                              {formatCurrency(p.amount, p.currency)}
                            </td>
                            <td className="px-3 py-2 text-slate-500">{paymentMethodLabel(p)}</td>
                            <td className="px-3 py-2">
                              <Badge variant={pb.variant}>{pb.label}</Badge>
                              {p.refundedAt && (
                                <span className="block text-[10px] text-amber-600 dark:text-amber-400 mt-0.5">
                                  Refunded {formatDate(p.refundedAt)}
                                </span>
                              )}
                            </td>
                            <td className="px-3 py-2 text-slate-500">{formatDate(p.createdAt)}</td>
                            <td className="px-3 py-2">
                              <div className="flex items-center justify-end gap-1">
                                <Link
                                  to={`/super-admin/billing/receipt/${p.id}`}
                                  title="View receipt"
                                  aria-label="View receipt"
                                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/10 transition-colors"
                                >
                                  <Receipt className="w-3.5 h-3.5" />
                                </Link>
                                {p.status === 'SUCCESS' && !p.refundedAt && (
                                  <button
                                    type="button"
                                    onClick={() => setRefundTarget(p)}
                                    title="Refund this payment"
                                    aria-label="Refund this payment"
                                    className="p-1.5 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-colors"
                                  >
                                    <RotateCcw className="w-3.5 h-3.5" />
                                  </button>
                                )}
                                {p.refundRefId && !p.refundedAt && (
                                  <button
                                    type="button"
                                    onClick={() => handleCheckRefund(p.id)}
                                    disabled={checkingRefundId === p.id}
                                    title="Check refund status"
                                    aria-label="Check refund status"
                                    className="p-1.5 rounded-lg text-slate-400 hover:text-primary-500 hover:bg-primary-50 dark:hover:bg-primary-500/10 transition-colors disabled:opacity-50"
                                  >
                                    <RefreshCw className={`w-3.5 h-3.5 ${checkingRefundId === p.id ? 'animate-spin' : ''}`} />
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </SectionCard>

            {/* Generate a real payment link */}
            <GeneratePaymentLinkSection institutionId={institutionId} plans={plans} />

            {/* Manual override */}
            <SectionCard
              icon={<ShieldAlert className="w-4 h-4 text-amber-500" />}
              title="Manual override — bypasses payment, audit-logged"
              tone="amber"
            >
              <form onSubmit={handleOverride} className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Select
                    label="Action"
                    value={action}
                    onChange={(e) => setAction(e.target.value as ManualOverrideAction)}
                    options={[
                      { value: 'EXTEND', label: 'Extend period' },
                      { value: 'MARK_PAID', label: 'Mark paid' },
                      { value: 'FORCE_SUSPEND', label: 'Force suspend' },
                      { value: 'FORCE_REACTIVATE', label: 'Force reactivate' },
                    ]}
                  />
                  {(action === 'EXTEND' || action === 'FORCE_REACTIVATE') && (
                    <Input
                      label="Extend by (days)"
                      value={extendDays}
                      onChange={(e) => setExtendDays(e.target.value)}
                      type="number"
                      min={1}
                    />
                  )}
                </div>

                {action === 'MARK_PAID' && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Select
                      label="Plan"
                      value={overridePlanId}
                      onChange={(e) => setOverridePlanId(e.target.value)}
                      placeholder="Select plan…"
                      options={plans.map((p) => ({ value: p.id, label: p.name }))}
                    />
                    <Select
                      label="Billing cycle"
                      value={overrideCycle}
                      onChange={(e) => setOverrideCycle(e.target.value as BillingCycle)}
                      options={CYCLES.map((c) => ({ value: c, label: BILLING_CYCLE_LABELS[c] }))}
                    />
                  </div>
                )}

                <Textarea
                  label="Reason"
                  required
                  value={reason}
                  onChange={(e) => { setReason(e.target.value); setReasonError(undefined); }}
                  error={reasonError}
                  rows={2}
                  placeholder="Required — why is this override being applied?"
                  minLength={5}
                />

                <div className="flex justify-end">
                  <Button type="submit" variant="danger" isLoading={submitting}>Apply override</Button>
                </div>
              </form>
            </SectionCard>
          </div>
        )}
      </Drawer>

      {refundTarget && (
        <RefundConfirmModal
          payment={refundTarget}
          onClose={() => setRefundTarget(null)}
          onSuccess={() => {
            setRefundTarget(null);
            fetchDetail();
            onChanged();
          }}
        />
      )}
    </>
  );
};

const GeneratePaymentLinkSection: React.FC<{ institutionId: string; plans: Plan[] }> = ({ institutionId, plans }) => {
  const [planId, setPlanId] = useState('');
  const [cycle, setCycle] = useState<BillingCycle>('MONTHLY');
  const [generating, setGenerating] = useState(false);
  const [url, setUrl] = useState<string | null>(null);

  const handleGenerate = async () => {
    if (!planId) return toast.error('Select a plan first');
    setGenerating(true);
    try {
      const r = await billingApi.generatePaymentLink(institutionId, { planId, billingCycle: cycle });
      setUrl(r.paymentUrl);
      toast.success('Payment link ready — share it with the institution admin');
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to generate payment link');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <SectionCard icon={<Link2 className="w-4 h-4 text-blue-500" />} title="Generate a real payment link" tone="blue">
      <p className="text-xs text-slate-500 dark:text-slate-400 -mt-1">
        Creates a genuine SSLCommerz checkout the institution admin pays through — not a bypass.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Select
          label="Plan"
          value={planId}
          onChange={(e) => setPlanId(e.target.value)}
          placeholder="Select plan…"
          options={plans.map((p) => ({ value: p.id, label: p.name }))}
        />
        <Select
          label="Billing cycle"
          value={cycle}
          onChange={(e) => setCycle(e.target.value as BillingCycle)}
          options={CYCLES.map((c) => ({ value: c, label: BILLING_CYCLE_LABELS[c] }))}
        />
      </div>
      <div className="flex justify-end">
        <Button type="button" variant="secondary" isLoading={generating} onClick={handleGenerate}>Generate link</Button>
      </div>
      {url && (
        <div className="flex items-center gap-2 pt-3 border-t border-blue-200 dark:border-blue-500/20">
          <Input
            readOnly
            value={url}
            aria-label="Generated payment link"
            onFocus={(e) => e.target.select()}
            className="font-mono text-xs"
            containerClassName="flex-1"
          />
          <button
            type="button"
            onClick={() => {
              navigator.clipboard.writeText(url);
              toast.success('Copied');
            }}
            title="Copy link"
            aria-label="Copy link"
            className="p-2.5 rounded-xl text-primary-600 dark:text-primary-400 hover:bg-primary-100 dark:hover:bg-primary-500/15 transition-colors flex-shrink-0"
          >
            <Copy className="w-4 h-4" />
          </button>
        </div>
      )}
    </SectionCard>
  );
};

const RefundConfirmModal: React.FC<{ payment: SubscriptionPayment; onClose: () => void; onSuccess: () => void }> = ({
  payment,
  onClose,
  onSuccess,
}) => {
  const [refundAmount, setRefundAmount] = useState<string>(String(payment.amount));
  const [refundRemarks, setRefundRemarks] = useState('');
  const [amountError, setAmountError] = useState<string>();
  const [remarksError, setRemarksError] = useState<string>();
  const [submitting, setSubmitting] = useState(false);

  const handleRefund = async () => {
    const value = Number(refundAmount);
    let ok = true;
    if (!value || value <= 0) { setAmountError('Refund amount must be greater than zero'); ok = false; }
    if (refundRemarks.trim().length < 5) { setRemarksError('Remarks must be at least 5 characters'); ok = false; }
    if (!ok) return;
    setSubmitting(true);
    try {
      await billingApi.initiateRefund(payment.id, { refundAmount: value, refundRemarks: refundRemarks.trim() });
      toast.success('Refund initiated');
      onSuccess();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to initiate refund');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal isOpen onClose={onClose} title="Refund payment" size="md">
      <div className="flex items-start gap-3 mb-4">
        <div className="w-10 h-10 rounded-xl bg-rose-100 dark:bg-rose-500/15 text-rose-600 dark:text-rose-400 flex items-center justify-center flex-shrink-0">
          <AlertTriangle className="w-5 h-5" />
        </div>
        <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
          Initiates a real refund via the gateway for{' '}
          <strong className="text-slate-900 dark:text-white">
            {payment.gatewayTransactionId || payment.id.slice(0, 10)}
          </strong>
          . This is audit-logged and hard to reverse.
        </p>
      </div>
      <div className="space-y-3">
        <Input
          label="Refund amount"
          value={refundAmount}
          onChange={(e) => { setRefundAmount(e.target.value); setAmountError(undefined); }}
          error={amountError}
          type="number"
          min={0}
          step="0.01"
        />
        <Textarea
          label="Remarks"
          required
          value={refundRemarks}
          onChange={(e) => { setRefundRemarks(e.target.value); setRemarksError(undefined); }}
          error={remarksError}
          rows={2}
          placeholder="Required — why is this being refunded?"
          minLength={5}
        />
      </div>
      <div className="flex justify-end gap-3 pt-3 border-t border-slate-100 dark:border-white/5 mt-4">
        <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
        <Button type="button" variant="danger" isLoading={submitting} onClick={handleRefund}>Initiate refund</Button>
      </div>
    </Modal>
  );
};
