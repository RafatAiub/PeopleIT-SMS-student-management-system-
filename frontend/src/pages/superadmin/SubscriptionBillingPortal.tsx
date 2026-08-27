import React, { useEffect, useState } from 'react';
import {
  CreditCard, Plus, Archive, Pencil, Tag, Search, ChevronLeft, ChevronRight,
  AlertTriangle, ShieldAlert, Receipt,
} from 'lucide-react';
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
  type ManualOverrideAction,
} from '@/api/billing.api';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';

const CYCLES: BillingCycle[] = ['MONTHLY', 'QUARTERLY', 'HALF_YEARLY', 'YEARLY'];

const STATUS_BADGE: Record<SubscriptionStatus, { label: string; variant: 'success' | 'warning' | 'danger' | 'info' | 'neutral' }> = {
  TRIALING: { label: 'Trialing', variant: 'info' },
  ACTIVE: { label: 'Active', variant: 'success' },
  GRACE: { label: 'Grace Period', variant: 'warning' },
  EXPIRED: { label: 'Expired', variant: 'danger' },
  CANCELLED: { label: 'Cancelled', variant: 'danger' },
};

type Tab = 'plans' | 'subscriptions';

// =============================================================================
// SubscriptionBillingPortal — Super-admin platform billing control center.
// =============================================================================

const SubscriptionBillingPortal: React.FC = () => {
  const [tab, setTab] = useState<Tab>('plans');
  const [plans, setPlans] = useState<Plan[]>([]);
  const [plansLoading, setPlansLoading] = useState(true);

  const fetchPlans = async () => {
    try {
      setPlansLoading(true);
      const data = await billingApi.listAllPlans();
      setPlans(data);
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
    <div className="space-y-8 max-w-7xl mx-auto animate-fadeIn pb-12">
      {/* Page Header */}
      <div className="glass-card p-6 bg-white/50 dark:bg-slate-900/50 border border-slate-200 dark:border-white/10 rounded-3xl relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-600 via-primary-500 to-accent-400" />
        <div className="flex items-center gap-4">
          <div className="p-3 bg-blue-500/10 text-blue-600 dark:text-blue-400 rounded-2xl">
            <CreditCard className="w-8 h-8" />
          </div>
          <div>
            <h2 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">Subscription Billing Portal</h2>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
              Manage subscription plans, pricing, and institution billing status across the platform.
            </p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="inline-flex items-center bg-slate-100 dark:bg-slate-800 rounded-2xl p-1">
        <button
          type="button"
          onClick={() => setTab('plans')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
            tab === 'plans' ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-sm' : 'text-slate-500 dark:text-slate-400'
          }`}
        >
          Plans
        </button>
        <button
          type="button"
          onClick={() => setTab('subscriptions')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
            tab === 'subscriptions' ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-sm' : 'text-slate-500 dark:text-slate-400'
          }`}
        >
          Subscriptions
        </button>
      </div>

      {tab === 'plans' ? (
        <PlansTab plans={plans} loading={plansLoading} onRefresh={fetchPlans} />
      ) : (
        <SubscriptionsTab plans={plans} />
      )}
    </div>
  );
};

// ── Tab A: Plans ────────────────────────────────────────────────────────

const PlansTab: React.FC<{ plans: Plan[]; loading: boolean; onRefresh: () => void }> = ({ plans, loading, onRefresh }) => {
  const [createOpen, setCreateOpen] = useState(false);
  const [editPlan, setEditPlan] = useState<Plan | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<Plan | null>(null);
  const [priceTarget, setPriceTarget] = useState<{ plan: Plan; cycle: BillingCycle } | null>(null);

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <Button variant="gradient" onClick={() => setCreateOpen(true)}>
          <Plus className="w-4 h-4" /> Create Plan
        </Button>
      </div>

      {loading ? (
        <div className="p-16 text-center text-slate-500">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500 mx-auto" />
        </div>
      ) : plans.length === 0 ? (
        <div className="glass-card p-10 text-center text-sm text-slate-500 rounded-3xl border border-slate-200 dark:border-white/10">
          No plans have been created yet.
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {plans.map((plan) => (
            <div
              key={plan.id}
              className={`glass-card p-6 rounded-3xl border shadow-xl bg-white dark:bg-slate-900 space-y-4 ${
                plan.isArchived ? 'opacity-60 border-slate-200 dark:border-white/10' : 'border-slate-200 dark:border-white/10'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h4 className="text-lg font-black text-slate-900 dark:text-white">{plan.name}</h4>
                    {plan.isArchived && <Badge variant="neutral">Archived</Badge>}
                  </div>
                  <p className="text-xs font-mono text-blue-600 dark:text-blue-400">{plan.slug}</p>
                  {plan.description && <p className="text-xs text-slate-500 mt-1">{plan.description}</p>}
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setEditPlan(plan)}
                    title="Edit Plan"
                    className="p-2 rounded-lg bg-blue-50 hover:bg-blue-100 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 transition-all"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  {!plan.isArchived && (
                    <button
                      onClick={() => setArchiveTarget(plan)}
                      title="Archive Plan"
                      className="p-2 rounded-lg bg-red-50 hover:bg-red-100 dark:bg-red-500/10 text-red-600 dark:text-red-400 transition-all"
                    >
                      <Archive className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap gap-3 text-xs text-slate-600 dark:text-slate-400">
                <span className="px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800 font-bold">
                  {plan.studentCap ? `${plan.studentCap} student cap` : 'Unlimited students'}
                </span>
                <span className="px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800 font-bold">
                  Display order: {plan.displayOrder}
                </span>
              </div>

              {/* Prices per cycle */}
              <div className="pt-3 border-t border-slate-100 dark:border-white/5 space-y-2">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Pricing</span>
                <div className="grid grid-cols-2 gap-2">
                  {CYCLES.map((cycle) => {
                    const price = plan.prices.find((p) => p.billingCycle === cycle);
                    return (
                      <button
                        key={cycle}
                        onClick={() => setPriceTarget({ plan, cycle })}
                        className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-white/5 hover:border-blue-300 dark:hover:border-blue-500/40 transition-colors text-left"
                      >
                        <span className="text-[11px] text-slate-500">{BILLING_CYCLE_LABELS[cycle]}</span>
                        <span className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1">
                          {price ? formatCurrency(price.amount, price.currency) : <Tag className="w-3.5 h-3.5 text-slate-400" />}
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
        <PlanFormModal
          mode="create"
          onClose={() => setCreateOpen(false)}
          onSuccess={() => {
            setCreateOpen(false);
            onRefresh();
          }}
        />
      )}

      {editPlan && (
        <PlanFormModal
          mode="edit"
          plan={editPlan}
          onClose={() => setEditPlan(null)}
          onSuccess={() => {
            setEditPlan(null);
            onRefresh();
          }}
        />
      )}

      {archiveTarget && (
        <ArchiveConfirmModal
          plan={archiveTarget}
          onClose={() => setArchiveTarget(null)}
          onSuccess={() => {
            setArchiveTarget(null);
            onRefresh();
          }}
        />
      )}

      {priceTarget && (
        <SetPriceModal
          plan={priceTarget.plan}
          cycle={priceTarget.cycle}
          onClose={() => setPriceTarget(null)}
          onSuccess={() => {
            setPriceTarget(null);
            onRefresh();
          }}
        />
      )}
    </div>
  );
};

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
    if (name.trim().length < 2) {
      toast.error('Plan name must be at least 2 characters');
      return;
    }
    if (mode === 'create' && !/^[a-z0-9-]+$/.test(slug.trim())) {
      toast.error('Slug must be lowercase alphanumeric with hyphens only');
      return;
    }
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
        toast.success('Plan created successfully');
      } else if (plan) {
        await billingApi.updatePlan(plan.id, payload);
        toast.success('Plan updated successfully');
      }
      onSuccess();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to save plan');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal isOpen onClose={onClose} className="max-w-lg space-y-6">
      <h3 className="text-lg font-bold text-slate-900 dark:text-white">{mode === 'create' ? 'Create Plan' : 'Edit Plan'}</h3>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Plan Name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} className="input-field text-xs" required />
        </div>

        {mode === 'create' && (
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
              Slug <span className="text-slate-400 font-normal">(immutable once created)</span>
            </label>
            <input
              value={slug}
              onChange={(e) => setSlug(e.target.value.toLowerCase())}
              placeholder="e.g. standard"
              className="input-field text-xs font-mono"
              required
            />
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Student Cap</label>
            <input
              value={studentCap}
              onChange={(e) => setStudentCap(e.target.value)}
              type="number"
              min={1}
              placeholder="Leave blank = unlimited"
              className="input-field text-xs"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Display Order</label>
            <input
              value={displayOrder}
              onChange={(e) => setDisplayOrder(e.target.value)}
              type="number"
              className="input-field text-xs"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className="input-field text-xs"
          />
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" isLoading={submitting}>
            {mode === 'create' ? 'Create Plan' : 'Save Changes'}
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
      toast.success(`"${plan.name}" archived successfully`);
      onSuccess();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to archive plan');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal isOpen onClose={onClose} className="max-w-md space-y-4">
      <div className="flex items-start gap-3">
        <div className="p-2.5 bg-red-100 dark:bg-red-500/10 text-red-600 rounded-xl">
          <AlertTriangle className="w-6 h-6" />
        </div>
        <div>
          <h3 className="text-lg font-bold text-slate-900 dark:text-white">Archive Plan</h3>
          <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
            Archiving <strong className="text-slate-900 dark:text-white">{plan.name}</strong> will hide it from new checkouts. This action cannot easily be undone via this portal.
          </p>
        </div>
      </div>
      <div className="flex justify-end gap-3 pt-2 border-t border-slate-200 dark:border-white/5">
        <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
        <Button type="button" variant="danger" isLoading={submitting} onClick={handleArchive}>Archive Plan</Button>
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
    if (!value || value <= 0) {
      toast.error('Amount must be greater than zero');
      return;
    }
    setSubmitting(true);
    try {
      await billingApi.setPlanPrice(plan.id, { billingCycle: cycle, amount: value });
      toast.success('Price updated successfully');
      onSuccess();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to update price');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal isOpen onClose={onClose} className="max-w-sm space-y-6">
      <div>
        <h3 className="text-lg font-bold text-slate-900 dark:text-white">Set Price</h3>
        <p className="text-xs text-slate-500 mt-0.5">{plan.name} — {BILLING_CYCLE_LABELS[cycle]}</p>
      </div>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Amount (BDT)</label>
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            type="number"
            min={0}
            step="0.01"
            className="input-field text-xs"
            autoFocus
            required
          />
        </div>
        <div className="flex justify-end gap-3">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" isLoading={submitting}>Save Price</Button>
        </div>
      </form>
    </Modal>
  );
};

// ── Tab B: Subscriptions ───────────────────────────────────────────────

const SubscriptionsTab: React.FC<{ plans: Plan[] }> = ({ plans }) => {
  const [subscriptions, setSubscriptions] = useState<SubscriptionListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(10);
  const [statusFilter, setStatusFilter] = useState<SubscriptionStatus | 'ALL'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [meta, setMeta] = useState({ total: 0, totalPages: 1 });
  const [detailInstitutionId, setDetailInstitutionId] = useState<string | null>(null);

  const fetchSubscriptions = async () => {
    try {
      setLoading(true);
      const res = await billingApi.listSubscriptions({
        page,
        pageSize,
        status: statusFilter === 'ALL' ? undefined : statusFilter,
        q: debouncedSearchQuery || undefined,
      });
      setSubscriptions(res.data);
      setMeta({ total: res.meta.total, totalPages: res.meta.totalPages });
    } catch (err) {
      console.error('Failed to fetch subscriptions', err);
      toast.error('Failed to load subscriptions');
    } finally {
      setLoading(false);
    }
  };

  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');

  // Debounce the raw search input into debouncedSearchQuery — this effect
  // never fetches itself, only the effect below (keyed on the debounced
  // value) does, so each filter/page change triggers exactly one request.
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearchQuery(searchQuery.trim()), 400);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Reset to page 1 whenever the filters change (but not on every page click).
  useEffect(() => {
    setPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, debouncedSearchQuery]);

  useEffect(() => {
    fetchSubscriptions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, statusFilter, debouncedSearchQuery]);

  return (
    <div className="space-y-6">
      <div className="glass-card p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-3xl shadow-xl space-y-6">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="relative w-full sm:w-80">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search institution name or slug..."
              className="input-field pl-10 text-xs py-2"
            />
          </div>

          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value as SubscriptionStatus | 'ALL');
              setPage(1);
            }}
            className="input-field text-xs py-2 w-full sm:w-48"
          >
            <option value="ALL">All Statuses</option>
            <option value="TRIALING">Trialing</option>
            <option value="ACTIVE">Active</option>
            <option value="GRACE">Grace Period</option>
            <option value="EXPIRED">Expired</option>
            <option value="CANCELLED">Cancelled</option>
          </select>
        </div>

        <div className="overflow-x-auto border border-slate-200 dark:border-white/10 rounded-2xl">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-950 text-slate-500 dark:text-slate-400 text-[11px] font-bold uppercase tracking-wider border-b border-slate-200 dark:border-white/5">
                <th className="p-4 pl-6">Institution</th>
                <th className="p-4">Plan</th>
                <th className="p-4">Cycle</th>
                <th className="p-4">Status</th>
                <th className="p-4">Period End / Grace Ends</th>
                <th className="p-4 pr-6 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-white/5 text-xs text-slate-700 dark:text-slate-300">
              {loading ? (
                <tr>
                  <td colSpan={6} className="p-12 text-center text-slate-500">
                    <div className="flex items-center justify-center gap-2">
                      <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-blue-500" />
                      <span>Loading subscriptions...</span>
                    </div>
                  </td>
                </tr>
              ) : subscriptions.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-12 text-center text-slate-500 italic">No subscriptions found matching criteria.</td>
                </tr>
              ) : (
                subscriptions.map((sub) => {
                  const badge = STATUS_BADGE[sub.status];
                  const dateValue = sub.status === 'GRACE' ? sub.graceEndsAt : sub.currentPeriodEnd;
                  return (
                    <tr key={sub.id} className="hover:bg-slate-50/50 dark:hover:bg-white/5 transition-colors">
                      <td className="p-4 pl-6 font-bold text-slate-900 dark:text-white">
                        <div>
                          <p>{sub.institution.name}</p>
                          <p className="text-[10px] font-mono text-slate-400">{sub.institution.slug}</p>
                        </div>
                      </td>
                      <td className="p-4">{sub.plan.name}</td>
                      <td className="p-4">{BILLING_CYCLE_LABELS[sub.billingCycle]}</td>
                      <td className="p-4">
                        <Badge variant={badge.variant}>{badge.label}</Badge>
                      </td>
                      <td className="p-4 text-slate-500">{dateValue ? new Date(dateValue).toLocaleDateString() : '—'}</td>
                      <td className="p-4 pr-6 text-right">
                        <button
                          onClick={() => setDetailInstitutionId(sub.institutionId)}
                          className="px-2.5 py-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 dark:bg-blue-500/10 dark:hover:bg-blue-500/20 text-blue-600 dark:text-blue-400 font-bold transition-all text-[11px]"
                        >
                          View / Override
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-2 text-xs">
          <span className="text-slate-500">Page {page} of {meta.totalPages} ({meta.total} Total Subscriptions)</span>
          <div className="flex items-center gap-2">
            <button
              disabled={page <= 1}
              onClick={() => setPage(page - 1)}
              className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-white/10 disabled:opacity-40 font-bold flex items-center gap-1"
            >
              <ChevronLeft className="w-4 h-4" /> Prev
            </button>
            <button
              disabled={page >= meta.totalPages}
              onClick={() => setPage(page + 1)}
              className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-white/10 disabled:opacity-40 font-bold flex items-center gap-1"
            >
              Next <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {detailInstitutionId && (
        <SubscriptionDetailModal
          institutionId={detailInstitutionId}
          plans={plans}
          onClose={() => setDetailInstitutionId(null)}
          onOverrideSuccess={() => {
            setDetailInstitutionId(null);
            fetchSubscriptions();
          }}
        />
      )}
    </div>
  );
};

const SubscriptionDetailModal: React.FC<{
  institutionId: string;
  plans: Plan[];
  onClose: () => void;
  onOverrideSuccess: () => void;
}> = ({ institutionId, plans, onClose, onOverrideSuccess }) => {
  const [detail, setDetail] = useState<SubscriptionDetail | null>(null);
  const [loading, setLoading] = useState(true);

  // Override form state
  const [action, setAction] = useState<ManualOverrideAction>('EXTEND');
  const [extendDays, setExtendDays] = useState('30');
  const [overridePlanId, setOverridePlanId] = useState('');
  const [overrideCycle, setOverrideCycle] = useState<BillingCycle>('MONTHLY');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const fetchDetail = async () => {
    try {
      setLoading(true);
      const data = await billingApi.getSubscriptionDetail(institutionId);
      setDetail(data);
    } catch (err) {
      console.error('Failed to fetch subscription detail', err);
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
    if (reason.trim().length < 5) {
      toast.error('Reason must be at least 5 characters');
      return;
    }
    if (action === 'MARK_PAID' && !overridePlanId) {
      toast.error('Select a plan for Mark Paid');
      return;
    }
    setSubmitting(true);
    try {
      await billingApi.manualOverride(institutionId, {
        action,
        reason: reason.trim(),
        ...(action === 'EXTEND' || action === 'FORCE_REACTIVATE' ? { extendDays: Number(extendDays) || 30 } : {}),
        ...(action === 'MARK_PAID' ? { planId: overridePlanId, billingCycle: overrideCycle } : {}),
      });
      toast.success('Subscription override applied successfully');
      onOverrideSuccess();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to apply override');
    } finally {
      setSubmitting(false);
    }
  };

  const badge = detail ? STATUS_BADGE[detail.subscription.status] : null;

  return (
    <Modal isOpen onClose={onClose} className="max-w-2xl space-y-6 max-h-[85vh] overflow-y-auto">
      <h3 className="text-lg font-bold text-slate-900 dark:text-white pr-8">Subscription Details</h3>

      {loading || !detail ? (
        <div className="py-12 text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500 mx-auto" />
        </div>
      ) : (
        <>
          <div className="p-4 bg-slate-50 dark:bg-slate-950 rounded-2xl border border-slate-200 dark:border-white/5 grid grid-cols-2 gap-3 text-xs">
            <div>
              <span className="text-slate-400 font-bold block">Plan</span>
              <span className="font-bold text-slate-900 dark:text-white">{detail.subscription.plan?.name}</span>
            </div>
            <div>
              <span className="text-slate-400 font-bold block">Status</span>
              {badge && <Badge variant={badge.variant}>{badge.label}</Badge>}
            </div>
            <div>
              <span className="text-slate-400 font-bold block">Billing Cycle</span>
              <span className="font-bold text-slate-900 dark:text-white">{BILLING_CYCLE_LABELS[detail.subscription.billingCycle]}</span>
            </div>
            <div>
              <span className="text-slate-400 font-bold block">Current Period End</span>
              <span className="font-bold text-slate-900 dark:text-white">
                {detail.subscription.currentPeriodEnd ? new Date(detail.subscription.currentPeriodEnd).toLocaleDateString() : '—'}
              </span>
            </div>
          </div>

          {/* Payment history */}
          <div className="space-y-2">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <Receipt className="w-3.5 h-3.5" /> Payment History
            </span>
            <div className="overflow-x-auto border border-slate-200 dark:border-white/10 rounded-2xl max-h-56 overflow-y-auto">
              <table className="w-full text-left text-[11px]">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-950 text-slate-500 font-bold uppercase border-b border-slate-200 dark:border-white/5">
                    <th className="p-3">Transaction</th>
                    <th className="p-3">Amount</th>
                    <th className="p-3">Status</th>
                    <th className="p-3">Gateway</th>
                    <th className="p-3">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                  {detail.payments.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="p-6 text-center text-slate-400 italic">No payment records yet.</td>
                    </tr>
                  ) : (
                    detail.payments.map((payment) => (
                      <tr key={payment.id}>
                        <td className="p-3 font-mono text-slate-700 dark:text-slate-300">
                          {payment.gatewayTransactionId || payment.id.slice(0, 10)}
                        </td>
                        <td className="p-3 font-bold text-slate-900 dark:text-white">{formatCurrency(payment.amount, payment.currency)}</td>
                        <td className="p-3">{payment.status}</td>
                        <td className="p-3">
                          {payment.isManualOverride ? (
                            <span title={payment.overrideReason || undefined} className="text-amber-600 dark:text-amber-400 font-bold">
                              Manual Override
                            </span>
                          ) : (
                            payment.gateway
                          )}
                        </td>
                        <td className="p-3 text-slate-500">{new Date(payment.createdAt).toLocaleDateString()}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Manual override form */}
          <div className="p-4 bg-amber-50 dark:bg-amber-500/5 border border-amber-200 dark:border-amber-500/20 rounded-2xl space-y-4">
            <div className="flex items-center gap-2 text-amber-800 dark:text-amber-300 text-xs font-bold">
              <ShieldAlert className="w-4 h-4" />
              Manual override — bypasses payment, will be audit-logged.
            </div>

            <form onSubmit={handleOverride} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Action</label>
                <select
                  value={action}
                  onChange={(e) => setAction(e.target.value as ManualOverrideAction)}
                  className="input-field text-xs"
                >
                  <option value="EXTEND">Extend</option>
                  <option value="MARK_PAID">Mark Paid</option>
                  <option value="FORCE_SUSPEND">Force Suspend</option>
                  <option value="FORCE_REACTIVATE">Force Reactivate</option>
                </select>
              </div>

              {(action === 'EXTEND' || action === 'FORCE_REACTIVATE') && (
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Extend Days</label>
                  <input
                    value={extendDays}
                    onChange={(e) => setExtendDays(e.target.value)}
                    type="number"
                    min={1}
                    className="input-field text-xs"
                  />
                </div>
              )}

              {action === 'MARK_PAID' && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Plan</label>
                    <select
                      value={overridePlanId}
                      onChange={(e) => setOverridePlanId(e.target.value)}
                      className="input-field text-xs"
                    >
                      <option value="">Select plan...</option>
                      {plans.map((p) => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Billing Cycle</label>
                    <select
                      value={overrideCycle}
                      onChange={(e) => setOverrideCycle(e.target.value as BillingCycle)}
                      className="input-field text-xs"
                    >
                      {CYCLES.map((c) => (
                        <option key={c} value={c}>{BILLING_CYCLE_LABELS[c]}</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Reason <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  rows={2}
                  placeholder="Required — explain why this manual override is being applied"
                  className="input-field text-xs"
                  required
                  minLength={5}
                />
              </div>

              <div className="flex justify-end">
                <Button type="submit" variant="danger" isLoading={submitting}>Apply Override</Button>
              </div>
            </form>
          </div>
        </>
      )}
    </Modal>
  );
};

export default SubscriptionBillingPortal;
