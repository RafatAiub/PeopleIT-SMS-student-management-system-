import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  CreditCard,
  Plus,
  Archive,
  Pencil,
  Tag,
  AlertTriangle,
  ShieldAlert,
  Receipt,
  Link2,
  Copy,
  RotateCcw,
  RefreshCw,
  DollarSign,
  Wallet,
  UserMinus,
  CalendarClock,
  Settings2,
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import toast from 'react-hot-toast';
import {
  billingApi,
  BILLING_CYCLE_LABELS,
  formatCurrency,
  type BillingCycle,
  type Plan,
  type SubscriptionListItem,
  type SubscriptionDetail,
  type SubscriptionStatus,
  type SubscriptionPayment,
  type SubscriptionPaymentStatus,
  type ManualOverrideAction,
  type BillingAnalytics,
} from '@/api/billing.api';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { DataTable, type Column } from '@/components/DataTable/DataTable';

// =============================================================================
// SubscriptionBillingPortal — super-admin platform billing control center.
// Three tabs: Plans (catalogue + pricing), Subscriptions (per-institution
// status + overrides + refunds), Analytics (MRR / revenue / churn).
// =============================================================================

const CYCLES: BillingCycle[] = ['MONTHLY', 'QUARTERLY', 'HALF_YEARLY', 'YEARLY'];

type BadgeVariant = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

const STATUS_BADGE: Record<SubscriptionStatus, { label: string; variant: BadgeVariant }> = {
  TRIALING: { label: 'Trialing', variant: 'info' },
  ACTIVE: { label: 'Active', variant: 'success' },
  GRACE: { label: 'Grace period', variant: 'warning' },
  EXPIRED: { label: 'Expired', variant: 'danger' },
  CANCELLED: { label: 'Cancelled', variant: 'danger' },
};

const PAYMENT_STATUS_BADGE: Record<SubscriptionPaymentStatus, { label: string; variant: BadgeVariant }> = {
  INITIATED: { label: 'Initiated', variant: 'info' },
  PENDING: { label: 'Pending', variant: 'warning' },
  SUCCESS: { label: 'Paid', variant: 'success' },
  FAILED: { label: 'Failed', variant: 'danger' },
  CANCELLED: { label: 'Cancelled', variant: 'neutral' },
  REFUNDED: { label: 'Refunded', variant: 'info' },
};

const paymentMethodLabel = (p: SubscriptionPayment) =>
  p.isManualOverride ? 'Manual override' : p.generatedBySuperAdmin ? 'Payment link' : 'Online (SSLCommerz)';

type Tab = 'plans' | 'subscriptions' | 'analytics';

const TABS: { id: Tab; label: string }[] = [
  { id: 'plans', label: 'Plans' },
  { id: 'subscriptions', label: 'Subscriptions' },
  { id: 'analytics', label: 'Analytics' },
];

const SubscriptionBillingPortal: React.FC = () => {
  const [tab, setTab] = useState<Tab>('subscriptions');
  const [plans, setPlans] = useState<Plan[]>([]);
  const [plansLoading, setPlansLoading] = useState(true);

  const fetchPlans = async () => {
    try {
      setPlansLoading(true);
      setPlans(await billingApi.listAllPlans());
    } catch (err) {
      console.error('Failed to fetch plans', err);
      toast.error('Failed to load plans');
    } finally {
      setPlansLoading(false);
    }
  };

  useEffect(() => {
    fetchPlans();
  }, []);

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 animate-fadeIn">
        <div className="w-11 h-11 rounded-xl bg-primary-50 dark:bg-primary-500/15 text-primary-600 dark:text-primary-400 flex items-center justify-center flex-shrink-0">
          <CreditCard className="w-5 h-5" />
        </div>
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white">Subscription billing</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Plans, pricing, and every institution's billing status across the platform.
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="inline-flex items-center bg-slate-100 dark:bg-slate-800 rounded-xl p-1 animate-fadeIn" style={{ animationDelay: '60ms' }}>
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all min-h-[38px] ${
              tab === t.id
                ? 'bg-white dark:bg-slate-900 text-primary-600 dark:text-primary-400 shadow-sm'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="animate-fadeIn" style={{ animationDelay: '120ms' }}>
        {tab === 'plans' ? (
          <PlansTab plans={plans} loading={plansLoading} onRefresh={fetchPlans} />
        ) : tab === 'subscriptions' ? (
          <SubscriptionsTab plans={plans} />
        ) : (
          <AnalyticsTab />
        )}
      </div>
    </div>
  );
};

// ── Tab A: Plans ─────────────────────────────────────────────────────────

const PlansTab: React.FC<{ plans: Plan[]; loading: boolean; onRefresh: () => void }> = ({ plans, loading, onRefresh }) => {
  const [createOpen, setCreateOpen] = useState(false);
  const [editPlan, setEditPlan] = useState<Plan | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<Plan | null>(null);
  const [priceTarget, setPriceTarget] = useState<{ plan: Plan; cycle: BillingCycle } | null>(null);

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Plans shown to institutions at checkout. Click a cycle to set its price.
        </p>
        <Button variant="gradient" onClick={() => setCreateOpen(true)}>
          <Plus className="w-4 h-4" /> Create plan
        </Button>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {[0, 1].map((i) => (
            <div key={i} className="h-56 bg-slate-200 dark:bg-slate-800 rounded-2xl animate-pulse" />
          ))}
        </div>
      ) : plans.length === 0 ? (
        <div className="glass-card rounded-2xl border border-slate-200 dark:border-white/10 p-12 text-center">
          <Tag className="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
          <p className="text-sm text-slate-500 dark:text-slate-400">No plans yet. Create the first one to enable checkout.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {plans.map((plan) => (
            <div
              key={plan.id}
              className={`glass-card rounded-2xl border p-6 space-y-4 ${
                plan.isArchived
                  ? 'opacity-60 border-slate-200 dark:border-white/10'
                  : 'border-slate-200 dark:border-white/10'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-base font-bold text-slate-900 dark:text-white">{plan.name}</h3>
                    {plan.isArchived && <Badge variant="neutral">Archived</Badge>}
                  </div>
                  <p className="text-xs font-mono text-primary-600 dark:text-primary-400 mt-0.5">{plan.slug}</p>
                  {plan.description && (
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5 leading-relaxed">{plan.description}</p>
                  )}
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button
                    onClick={() => setEditPlan(plan)}
                    title="Edit plan"
                    aria-label="Edit plan"
                    className="p-2 rounded-lg text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/10 transition-colors"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  {!plan.isArchived && (
                    <button
                      onClick={() => setArchiveTarget(plan)}
                      title="Archive plan"
                      aria-label="Archive plan"
                      className="p-2 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-colors"
                    >
                      <Archive className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap gap-2 text-xs">
                <span className="px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-medium">
                  {plan.studentCap ? `${plan.studentCap} student cap` : 'Unlimited students'}
                </span>
                <span className="px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-medium">
                  Order {plan.displayOrder}
                </span>
              </div>

              <div className="pt-3 border-t border-slate-100 dark:border-white/5">
                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">Pricing</p>
                <div className="grid grid-cols-2 gap-2">
                  {CYCLES.map((cycle) => {
                    const price = plan.prices.find((p) => p.billingCycle === cycle);
                    return (
                      <button
                        key={cycle}
                        onClick={() => setPriceTarget({ plan, cycle })}
                        className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 dark:bg-slate-950/50 border border-slate-200 dark:border-white/5 hover:border-primary-300 dark:hover:border-primary-500/40 transition-colors text-left min-h-[44px]"
                      >
                        <span className="text-xs text-slate-500">{BILLING_CYCLE_LABELS[cycle]}</span>
                        <span className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-1">
                          {price ? (
                            formatCurrency(price.amount, price.currency)
                          ) : (
                            <span className="text-xs text-slate-400 inline-flex items-center gap-1">
                              <Tag className="w-3.5 h-3.5" /> set
                            </span>
                          )}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {createOpen && (
        <PlanFormModal mode="create" onClose={() => setCreateOpen(false)} onSuccess={() => { setCreateOpen(false); onRefresh(); }} />
      )}
      {editPlan && (
        <PlanFormModal mode="edit" plan={editPlan} onClose={() => setEditPlan(null)} onSuccess={() => { setEditPlan(null); onRefresh(); }} />
      )}
      {archiveTarget && (
        <ArchiveConfirmModal plan={archiveTarget} onClose={() => setArchiveTarget(null)} onSuccess={() => { setArchiveTarget(null); onRefresh(); }} />
      )}
      {priceTarget && (
        <SetPriceModal
          plan={priceTarget.plan}
          cycle={priceTarget.cycle}
          onClose={() => setPriceTarget(null)}
          onSuccess={() => { setPriceTarget(null); onRefresh(); }}
        />
      )}
    </div>
  );
};

// ── Field helpers for the modal forms ───────────────────────────────────

const Field: React.FC<{ label: string; hint?: string; children: React.ReactNode }> = ({ label, hint, children }) => (
  <div>
    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
      {label} {hint && <span className="text-slate-400 font-normal">{hint}</span>}
    </label>
    {children}
  </div>
);

const PlanFormModal: React.FC<{
  mode: 'create' | 'edit';
  plan?: Plan;
  onClose: () => void;
  onSuccess: () => void;
}> = ({ mode, plan, onClose, onSuccess }) => {
  const [name, setName] = useState(plan?.name || '');
  const [slug, setSlug] = useState(plan?.slug || '');
  const [studentCap, setStudentCap] = useState<string>(plan?.studentCap ? String(plan.studentCap) : '');
  const [description, setDescription] = useState(plan?.description || '');
  const [displayOrder, setDisplayOrder] = useState<string>(plan ? String(plan.displayOrder) : '0');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim().length < 2) return toast.error('Plan name must be at least 2 characters');
    if (mode === 'create' && !/^[a-z0-9-]+$/.test(slug.trim()))
      return toast.error('Slug must be lowercase letters, numbers and hyphens only');
    setSubmitting(true);
    try {
      const payload = {
        name: name.trim(),
        studentCap: studentCap.trim() ? Number(studentCap) : null,
        description: description.trim() || undefined,
        displayOrder: displayOrder.trim() ? Number(displayOrder) : undefined,
      };
      if (mode === 'create') {
        await billingApi.createPlan({ ...payload, slug: slug.trim().toLowerCase() });
        toast.success('Plan created');
      } else if (plan) {
        await billingApi.updatePlan(plan.id, payload);
        toast.success('Plan updated');
      }
      onSuccess();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to save plan');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal isOpen onClose={onClose} className="max-w-lg">
      <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-5">{mode === 'create' ? 'Create plan' : 'Edit plan'}</h3>
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="Plan name">
          <input value={name} onChange={(e) => setName(e.target.value)} className="input-field" required autoFocus />
        </Field>
        {mode === 'create' && (
          <Field label="Slug" hint="(cannot be changed later)">
            <input
              value={slug}
              onChange={(e) => setSlug(e.target.value.toLowerCase())}
              placeholder="e.g. standard"
              className="input-field font-mono"
              required
            />
          </Field>
        )}
        <div className="grid grid-cols-2 gap-4">
          <Field label="Student cap" hint="(blank = unlimited)">
            <input value={studentCap} onChange={(e) => setStudentCap(e.target.value)} type="number" min={1} className="input-field" />
          </Field>
          <Field label="Display order">
            <input value={displayOrder} onChange={(e) => setDisplayOrder(e.target.value)} type="number" className="input-field" />
          </Field>
        </div>
        <Field label="Description">
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} className="input-field resize-none" />
        </Field>
        <div className="flex justify-end gap-3 pt-2 border-t border-slate-100 dark:border-white/5">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="gradient" isLoading={submitting}>
            {mode === 'create' ? 'Create plan' : 'Save changes'}
          </Button>
        </div>
      </form>
    </Modal>
  );
};

const ArchiveConfirmModal: React.FC<{ plan: Plan; onClose: () => void; onSuccess: () => void }> = ({ plan, onClose, onSuccess }) => {
  const [submitting, setSubmitting] = useState(false);
  const handleArchive = async () => {
    setSubmitting(true);
    try {
      await billingApi.archivePlan(plan.id);
      toast.success(`"${plan.name}" archived`);
      onSuccess();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to archive plan');
    } finally {
      setSubmitting(false);
    }
  };
  return (
    <Modal isOpen onClose={onClose} className="max-w-md">
      <div className="flex items-start gap-3 mb-4">
        <div className="w-10 h-10 rounded-xl bg-rose-100 dark:bg-rose-500/15 text-rose-600 dark:text-rose-400 flex items-center justify-center flex-shrink-0">
          <AlertTriangle className="w-5 h-5" />
        </div>
        <div>
          <h3 className="text-lg font-bold text-slate-900 dark:text-white">Archive plan</h3>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1 leading-relaxed">
            <strong className="text-slate-900 dark:text-white">{plan.name}</strong> will be hidden from new checkouts. Existing
            subscriptions on it are unaffected.
          </p>
        </div>
      </div>
      <div className="flex justify-end gap-3 pt-3 border-t border-slate-100 dark:border-white/5">
        <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
        <Button type="button" variant="danger" isLoading={submitting} onClick={handleArchive}>Archive plan</Button>
      </div>
    </Modal>
  );
};

const SetPriceModal: React.FC<{ plan: Plan; cycle: BillingCycle; onClose: () => void; onSuccess: () => void }> = ({
  plan,
  cycle,
  onClose,
  onSuccess,
}) => {
  const existing = plan.prices.find((p) => p.billingCycle === cycle);
  const [amount, setAmount] = useState<string>(existing ? String(existing.amount) : '');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const value = Number(amount);
    if (!value || value <= 0) return toast.error('Amount must be greater than zero');
    setSubmitting(true);
    try {
      await billingApi.setPlanPrice(plan.id, { billingCycle: cycle, amount: value });
      toast.success('Price saved');
      onSuccess();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to save price');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal isOpen onClose={onClose} className="max-w-sm">
      <h3 className="text-lg font-bold text-slate-900 dark:text-white">Set price</h3>
      <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5 mb-5">
        {plan.name} — {BILLING_CYCLE_LABELS[cycle]}
      </p>
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="Amount (BDT)">
          <input value={amount} onChange={(e) => setAmount(e.target.value)} type="number" min={0} step="0.01" className="input-field" autoFocus required />
        </Field>
        <div className="flex justify-end gap-3">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="gradient" isLoading={submitting}>Save price</Button>
        </div>
      </form>
    </Modal>
  );
};

// ── Tab B: Subscriptions ────────────────────────────────────────────────

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

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const res = await billingApi.listSubscriptions({
          page,
          pageSize,
          status: statusFilter === 'ALL' ? undefined : statusFilter,
          q: debounced || undefined,
        });
        if (cancelled) return;
        setRows(res.data);
        setMeta({ total: res.meta.total, totalPages: res.meta.totalPages });
      } catch {
        if (!cancelled) toast.error('Failed to load subscriptions');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [page, statusFilter, debounced]);

  const reload = () => {
    // force the effect to re-run by toggling a nonce through debounced-independent state
    setLoading(true);
    billingApi
      .listSubscriptions({ page, pageSize, status: statusFilter === 'ALL' ? undefined : statusFilter, q: debounced || undefined })
      .then((res) => {
        setRows(res.data);
        setMeta({ total: res.meta.total, totalPages: res.meta.totalPages });
      })
      .catch(() => toast.error('Failed to reload subscriptions'))
      .finally(() => setLoading(false));
  };

  const columns: Column<SubscriptionListItem>[] = [
    {
      key: 'institution',
      header: 'Institution',
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
        return <span className="text-slate-500 dark:text-slate-400 text-xs">{v ? new Date(v).toLocaleDateString() : '—'}</span>;
      },
    },
    {
      key: 'action',
      header: '',
      render: (s) => (
        <button
          onClick={() => setDetailInstitutionId(s.institutionId)}
          className="inline-flex items-center gap-1 text-xs font-semibold text-primary-600 dark:text-primary-400 hover:underline"
        >
          <Settings2 className="w-3.5 h-3.5" /> Manage
        </button>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search institution name or slug…"
          className="input-field flex-1 sm:max-w-xs"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as SubscriptionStatus | 'ALL')}
          className="input-field w-full sm:w-52"
          aria-label="Filter by status"
        >
          <option value="ALL">All statuses</option>
          <option value="TRIALING">Trialing</option>
          <option value="ACTIVE">Active</option>
          <option value="GRACE">Grace period</option>
          <option value="EXPIRED">Expired</option>
          <option value="CANCELLED">Cancelled</option>
        </select>
      </div>

      <div className="glass-card rounded-2xl border border-slate-200 dark:border-white/10 overflow-hidden">
        <DataTable
          data={rows}
          columns={columns}
          isLoading={loading}
          serverPagination
          totalCount={meta.total}
          page={page}
          pageSize={pageSize}
          onPageChange={setPage}
          emptyTitle="No subscriptions found"
          emptyDescription="No institutions match the current search and filter."
        />
      </div>

      {detailInstitutionId && (
        <SubscriptionDetailModal
          institutionId={detailInstitutionId}
          plans={plans}
          onClose={() => setDetailInstitutionId(null)}
          onChanged={() => reload()}
        />
      )}
    </div>
  );
};

// ── Subscription detail: inspect + act ─────────────────────────────────

const SectionCard: React.FC<{
  icon: React.ReactNode;
  title: string;
  tone?: 'neutral' | 'blue' | 'amber';
  children: React.ReactNode;
}> = ({ icon, title, tone = 'neutral', children }) => {
  const toneCls =
    tone === 'blue'
      ? 'border-blue-200 dark:border-blue-500/20 bg-blue-50/50 dark:bg-blue-500/5'
      : tone === 'amber'
        ? 'border-amber-200 dark:border-amber-500/20 bg-amber-50/50 dark:bg-amber-500/5'
        : 'border-slate-200 dark:border-white/10 bg-slate-50/50 dark:bg-slate-950/40';
  return (
    <div className={`rounded-2xl border p-4 space-y-3 ${toneCls}`}>
      <div className="flex items-center gap-2 text-sm font-semibold text-slate-800 dark:text-slate-200">
        {icon}
        {title}
      </div>
      {children}
    </div>
  );
};

const SubscriptionDetailModal: React.FC<{
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
  const [submitting, setSubmitting] = useState(false);

  const [refundTarget, setRefundTarget] = useState<SubscriptionPayment | null>(null);
  const [checkingRefundId, setCheckingRefundId] = useState<string | null>(null);

  const fetchDetail = async () => {
    try {
      setLoading(true);
      setDetail(await billingApi.getSubscriptionDetail(institutionId));
    } catch {
      toast.error('Failed to load subscription details');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDetail();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [institutionId]);

  const handleOverride = async (e: React.FormEvent) => {
    e.preventDefault();
    if (reason.trim().length < 5) return toast.error('Reason must be at least 5 characters');
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
    <Modal isOpen onClose={onClose} className="max-w-3xl max-h-[88vh] overflow-y-auto">
      <h3 className="text-lg font-bold text-slate-900 dark:text-white pr-8 mb-5">Manage subscription</h3>

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
                {detail.subscription.currentPeriodEnd
                  ? new Date(detail.subscription.currentPeriodEnd).toLocaleDateString()
                  : '—'}
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
                                Refunded {new Date(p.refundedAt).toLocaleDateString()}
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-slate-500">{new Date(p.createdAt).toLocaleDateString()}</td>
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
                <Field label="Action">
                  <select value={action} onChange={(e) => setAction(e.target.value as ManualOverrideAction)} className="input-field">
                    <option value="EXTEND">Extend period</option>
                    <option value="MARK_PAID">Mark paid</option>
                    <option value="FORCE_SUSPEND">Force suspend</option>
                    <option value="FORCE_REACTIVATE">Force reactivate</option>
                  </select>
                </Field>
                {(action === 'EXTEND' || action === 'FORCE_REACTIVATE') && (
                  <Field label="Extend by (days)">
                    <input value={extendDays} onChange={(e) => setExtendDays(e.target.value)} type="number" min={1} className="input-field" />
                  </Field>
                )}
              </div>

              {action === 'MARK_PAID' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Field label="Plan">
                    <select value={overridePlanId} onChange={(e) => setOverridePlanId(e.target.value)} className="input-field">
                      <option value="">Select plan…</option>
                      {plans.map((p) => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Billing cycle">
                    <select value={overrideCycle} onChange={(e) => setOverrideCycle(e.target.value as BillingCycle)} className="input-field">
                      {CYCLES.map((c) => (
                        <option key={c} value={c}>{BILLING_CYCLE_LABELS[c]}</option>
                      ))}
                    </select>
                  </Field>
                </div>
              )}

              <Field label="Reason *">
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  rows={2}
                  placeholder="Required — why is this override being applied?"
                  className="input-field resize-none"
                  required
                  minLength={5}
                />
              </Field>

              <div className="flex justify-end">
                <Button type="submit" variant="danger" isLoading={submitting}>Apply override</Button>
              </div>
            </form>
          </SectionCard>
        </div>
      )}

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
    </Modal>
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
        <Field label="Plan">
          <select value={planId} onChange={(e) => setPlanId(e.target.value)} className="input-field">
            <option value="">Select plan…</option>
            {plans.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </Field>
        <Field label="Billing cycle">
          <select value={cycle} onChange={(e) => setCycle(e.target.value as BillingCycle)} className="input-field">
            {CYCLES.map((c) => (
              <option key={c} value={c}>{BILLING_CYCLE_LABELS[c]}</option>
            ))}
          </select>
        </Field>
      </div>
      <div className="flex justify-end">
        <Button type="button" variant="secondary" isLoading={generating} onClick={handleGenerate}>Generate link</Button>
      </div>
      {url && (
        <div className="flex items-center gap-2 pt-3 border-t border-blue-200 dark:border-blue-500/20">
          <input readOnly value={url} onFocus={(e) => e.target.select()} className="input-field font-mono text-xs flex-1" />
          <button
            type="button"
            onClick={() => {
              navigator.clipboard.writeText(url);
              toast.success('Copied');
            }}
            title="Copy link"
            aria-label="Copy link"
            className="p-2.5 rounded-xl text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-500/15 transition-colors flex-shrink-0"
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
  const [submitting, setSubmitting] = useState(false);

  const handleRefund = async () => {
    const value = Number(refundAmount);
    if (!value || value <= 0) return toast.error('Refund amount must be greater than zero');
    if (refundRemarks.trim().length < 5) return toast.error('Remarks must be at least 5 characters');
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
    <Modal isOpen onClose={onClose} className="max-w-md">
      <div className="flex items-start gap-3 mb-4">
        <div className="w-10 h-10 rounded-xl bg-rose-100 dark:bg-rose-500/15 text-rose-600 dark:text-rose-400 flex items-center justify-center flex-shrink-0">
          <AlertTriangle className="w-5 h-5" />
        </div>
        <div>
          <h3 className="text-lg font-bold text-slate-900 dark:text-white">Refund payment</h3>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1 leading-relaxed">
            Initiates a real refund via the gateway for{' '}
            <strong className="text-slate-900 dark:text-white">
              {payment.gatewayTransactionId || payment.id.slice(0, 10)}
            </strong>
            . This is audit-logged and hard to reverse.
          </p>
        </div>
      </div>
      <div className="space-y-3">
        <Field label="Refund amount">
          <input value={refundAmount} onChange={(e) => setRefundAmount(e.target.value)} type="number" min={0} step="0.01" className="input-field" />
        </Field>
        <Field label="Remarks *">
          <textarea
            value={refundRemarks}
            onChange={(e) => setRefundRemarks(e.target.value)}
            rows={2}
            placeholder="Required — why is this being refunded?"
            className="input-field resize-none"
            required
            minLength={5}
          />
        </Field>
      </div>
      <div className="flex justify-end gap-3 pt-3 border-t border-slate-100 dark:border-white/5 mt-4">
        <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
        <Button type="button" variant="danger" isLoading={submitting} onClick={handleRefund}>Initiate refund</Button>
      </div>
    </Modal>
  );
};

// ── Tab C: Analytics ────────────────────────────────────────────────────

const CHURN_WINDOW_OPTIONS = [30, 60, 90] as const;

const StatTile: React.FC<{
  icon: React.ReactNode;
  label: string;
  value: string;
  color: string;
  extra?: React.ReactNode;
}> = ({ icon, label, value, color, extra }) => (
  <div className="glass-card rounded-2xl border border-slate-200 dark:border-white/10 p-5">
    <div className="flex items-start gap-3">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${color}`}>{icon}</div>
      <div className="min-w-0">
        <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">{label}</p>
        <p className="text-xl font-bold text-slate-900 dark:text-white mt-1 truncate">{value}</p>
        {extra}
      </div>
    </div>
  </div>
);

const AnalyticsTab: React.FC = () => {
  const [analytics, setAnalytics] = useState<BillingAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [churnWindowDays, setChurnWindowDays] = useState<number>(30);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const data = await billingApi.getAnalytics({ churnWindowDays });
        if (!cancelled) setAnalytics(data);
      } catch {
        if (!cancelled) toast.error('Failed to load analytics');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [churnWindowDays]);

  const totalRevenue = useMemo(
    () => (analytics?.revenueByPlan ?? []).reduce((sum, i) => sum + Number(i.totalRevenue), 0),
    [analytics],
  );
  const chartData = useMemo(
    () => (analytics?.revenueByPlan ?? []).map((i) => ({ name: i.planName, revenue: Number(i.totalRevenue) })),
    [analytics],
  );

  if (loading && !analytics) {
    return (
      <div className="space-y-5 animate-pulse">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-24 bg-slate-200 dark:bg-slate-800 rounded-2xl" />
          ))}
        </div>
        <div className="h-80 bg-slate-200 dark:bg-slate-800 rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatTile
          icon={<DollarSign className="w-5 h-5" />}
          color="bg-primary-50 text-primary-600 dark:bg-primary-500/15 dark:text-primary-400"
          label="MRR"
          value={formatCurrency(analytics?.mrr ?? 0)}
        />
        <StatTile
          icon={<Wallet className="w-5 h-5" />}
          color="bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400"
          label="Total revenue"
          value={formatCurrency(totalRevenue)}
        />
        <StatTile
          icon={<UserMinus className="w-5 h-5" />}
          color="bg-rose-50 text-rose-600 dark:bg-rose-500/15 dark:text-rose-400"
          label="Churned"
          value={String(analytics?.churnCount ?? 0)}
          extra={
            <select
              value={churnWindowDays}
              onChange={(e) => setChurnWindowDays(Number(e.target.value))}
              aria-label="Churn window in days"
              className="mt-1.5 text-[11px] font-medium bg-transparent border border-slate-200 dark:border-white/10 rounded-lg px-1.5 py-0.5 text-slate-500 dark:text-slate-400"
            >
              {CHURN_WINDOW_OPTIONS.map((d) => (
                <option key={d} value={d}>Last {d} days</option>
              ))}
            </select>
          }
        />
        <StatTile
          icon={<CalendarClock className="w-5 h-5" />}
          color="bg-amber-50 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400"
          label="Upcoming renewals"
          value={String(analytics?.upcomingRenewals.count ?? 0)}
        />
      </div>

      <div className="glass-card rounded-2xl border border-slate-200 dark:border-white/10 p-6">
        <h3 className="text-base font-semibold text-slate-900 dark:text-white mb-4">Revenue by plan</h3>
        {chartData.length === 0 ? (
          <p className="text-sm text-slate-400 italic text-center py-12">No successful payments recorded yet.</p>
        ) : (
          <div
            className="h-72"
            role="img"
            aria-label={`Total revenue by plan: ${chartData.map((d) => `${d.name} ${formatCurrency(d.revenue)}`).join(', ')}`}
          >
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-slate-200 dark:stroke-white/10" />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} className="fill-slate-500 dark:fill-slate-400" />
                <YAxis tick={{ fontSize: 12 }} className="fill-slate-500 dark:fill-slate-400" />
                <Tooltip
                  formatter={(value: number) => [formatCurrency(value), 'Revenue']}
                  contentStyle={{ borderRadius: 12, fontSize: 12, border: '1px solid rgba(148,163,184,0.3)' }}
                />
                <Bar dataKey="revenue" fill="#4F46E5" radius={[6, 6, 0, 0]} name="Revenue" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
};

export default SubscriptionBillingPortal;
