import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  CreditCard,
  Plus,
  Archive,
  ArchiveRestore,
  Pencil,
  Tag,
  AlertTriangle,
  ShieldAlert,
  Receipt,
  Link2,
  Copy,
  RotateCcw,
  RefreshCw,
  Settings2,
  Search,
  MoreVertical,
  Trash2,
  Users,
  Layers,
  CircleAlert,
  Ban,
  Check,
} from 'lucide-react';
import toast from 'react-hot-toast';
import {
  billingApi,
  BILLING_CYCLE_LABELS,
  formatCurrency,
  type BillingCycle,
  type Plan,
  type PlanPrice,
  type SubscriptionListItem,
  type SubscriptionDetail,
  type SubscriptionStatus,
  type SubscriptionPayment,
  type SubscriptionPaymentStatus,
  type ManualOverrideAction,
} from '@/api/billing.api';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { DataTable, type Column } from '@/components/DataTable/DataTable';

// Analytics is the only tab that pulls in `recharts` (~heavy). Lazy-load it so
// that dependency lands in its own async chunk, fetched only when the tab opens.
const AnalyticsTab = React.lazy(() => import('./billing/AnalyticsTab'));

// Matches AnalyticsTab's own loading skeleton — shown while its async chunk loads.
const AnalyticsTabFallback: React.FC = () => (
  <div className="space-y-5 animate-pulse">
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="h-24 bg-slate-200 dark:bg-slate-800 rounded-2xl" />
      ))}
    </div>
    <div className="h-80 bg-slate-200 dark:bg-slate-800 rounded-2xl" />
  </div>
);

// =============================================================================
// SubscriptionBillingPortal — super-admin platform billing control center.
// Three tabs: Plans (catalogue + pricing), Subscriptions (per-institution
// status + overrides + refunds), Analytics (MRR / revenue / churn).
// =============================================================================

const CYCLES: BillingCycle[] = ['MONTHLY', 'QUARTERLY', 'HALF_YEARLY', 'YEARLY'];

// Months billed per cycle — drives the per-month equivalent and the "save X%"
// comparison shown against the monthly price on each plan card.
const CYCLE_MONTHS: Record<BillingCycle, number> = {
  MONTHLY: 1,
  QUARTERLY: 3,
  HALF_YEARLY: 6,
  YEARLY: 12,
};

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
          <React.Suspense fallback={<AnalyticsTabFallback />}>
            <AnalyticsTab />
          </React.Suspense>
        )}
      </div>
    </div>
  );
};

// ── Tab A: Plans ─────────────────────────────────────────────────────────

// Amount for a cycle, as a number — plan.prices only carries the *active*
// price row per cycle, so at most one match.
const priceFor = (plan: Plan, cycle: BillingCycle): PlanPrice | undefined =>
  plan.prices.find((p) => p.billingCycle === cycle);

const amountOf = (price: PlanPrice) => (typeof price.amount === 'string' ? Number(price.amount) : price.amount);

/** Per-month equivalent, so cycles of different lengths are comparable. */
const perMonth = (price: PlanPrice) => amountOf(price) / CYCLE_MONTHS[price.billingCycle];

/**
 * Discount a longer cycle gives against 12× / 3× the monthly price. Returns
 * null when there's no monthly price to compare against, or no real saving.
 */
const savingVsMonthly = (plan: Plan, price: PlanPrice): number | null => {
  const monthly = priceFor(plan, 'MONTHLY');
  if (!monthly || price.billingCycle === 'MONTHLY') return null;
  const expected = amountOf(monthly) * CYCLE_MONTHS[price.billingCycle];
  if (expected <= 0) return null;
  const pct = Math.round((1 - amountOf(price) / expected) * 100);
  return pct > 0 ? pct : null;
};

/** Cheapest per-month equivalent across every priced cycle — the "from" price. */
const entryPrice = (plan: Plan): PlanPrice | null => {
  if (plan.prices.length === 0) return null;
  return plan.prices.reduce((best, p) => (perMonth(p) < perMonth(best) ? p : best));
};

const subscriberCount = (plan: Plan) => plan._count?.subscriptions ?? 0;

type PlanFilter = 'ACTIVE' | 'ARCHIVED' | 'ALL';
type PlanSort = 'order' | 'name' | 'price' | 'subscribers';

const PLAN_FILTERS: { id: PlanFilter; label: string }[] = [
  { id: 'ACTIVE', label: 'Active' },
  { id: 'ARCHIVED', label: 'Archived' },
  { id: 'ALL', label: 'All' },
];

const PlansTab: React.FC<{ plans: Plan[]; loading: boolean; onRefresh: () => void }> = ({ plans, loading, onRefresh }) => {
  const [createOpen, setCreateOpen] = useState(false);
  const [editPlan, setEditPlan] = useState<Plan | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<{ plan: Plan; mode: 'archive' | 'restore' } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Plan | null>(null);
  const [priceTarget, setPriceTarget] = useState<{ plan: Plan; cycle: BillingCycle } | null>(null);

  const [filter, setFilter] = useState<PlanFilter>('ACTIVE');
  const [sort, setSort] = useState<PlanSort>('order');
  const [query, setQuery] = useState('');

  // Platform-wide counters, always over the full set — a filtered view
  // shouldn't change what the summary strip reports.
  const stats = React.useMemo(() => {
    const active = plans.filter((p) => !p.isArchived);
    return {
      total: plans.length,
      active: active.length,
      archived: plans.length - active.length,
      subscribers: plans.reduce((sum, p) => sum + subscriberCount(p), 0),
      // Live plans a customer cannot actually buy — no active price on any cycle.
      unpriced: active.filter((p) => p.prices.length === 0).length,
    };
  }, [plans]);

  const visible = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows = plans.filter((p) => {
      if (filter === 'ACTIVE' && p.isArchived) return false;
      if (filter === 'ARCHIVED' && !p.isArchived) return false;
      if (!q) return true;
      return p.name.toLowerCase().includes(q) || p.slug.toLowerCase().includes(q);
    });
    const sorted = [...rows];
    sorted.sort((a, b) => {
      switch (sort) {
        case 'name':
          return a.name.localeCompare(b.name);
        case 'price': {
          // Unpriced plans sort last rather than as "free".
          const ap = entryPrice(a);
          const bp = entryPrice(b);
          if (!ap && !bp) return 0;
          if (!ap) return 1;
          if (!bp) return -1;
          return perMonth(ap) - perMonth(bp);
        }
        case 'subscribers':
          return subscriberCount(b) - subscriberCount(a);
        default:
          return a.displayOrder - b.displayOrder || a.name.localeCompare(b.name);
      }
    });
    return sorted;
  }, [plans, filter, sort, query]);

  return (
    <div className="space-y-5">
      {/* Summary strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatChip icon={<Layers className="w-4 h-4" />} label="Plans" value={stats.total} hint={`${stats.archived} archived`} />
        <StatChip icon={<Check className="w-4 h-4" />} label="Live at checkout" value={stats.active} tone="success" />
        <StatChip icon={<Users className="w-4 h-4" />} label="Institutions subscribed" value={stats.subscribers} tone="info" />
        <StatChip
          icon={<CircleAlert className="w-4 h-4" />}
          label="Missing pricing"
          value={stats.unpriced}
          tone={stats.unpriced > 0 ? 'warning' : 'neutral'}
          hint={stats.unpriced > 0 ? 'not purchasable' : 'all priced'}
        />
      </div>

      {/* Toolbar */}
      <div className="flex flex-col lg:flex-row lg:items-center gap-3">
        <div className="relative flex-1 lg:max-w-xs">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search plans by name or slug…"
            aria-label="Search plans"
            className="input-field w-full pl-9"
          />
        </div>

        <div className="inline-flex items-center bg-slate-100 dark:bg-slate-800 rounded-xl p-1 self-start" role="group" aria-label="Filter plans">
          {PLAN_FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              aria-pressed={filter === f.id}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all min-h-[34px] ${
                filter === f.id
                  ? 'bg-white dark:bg-slate-900 text-primary-600 dark:text-primary-400 shadow-sm'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as PlanSort)}
          aria-label="Sort plans"
          className="input-field w-full lg:w-48"
        >
          <option value="order">Sort: display order</option>
          <option value="name">Sort: name (A–Z)</option>
          <option value="price">Sort: price (low → high)</option>
          <option value="subscribers">Sort: most subscribers</option>
        </select>

        <div className="flex items-center gap-2 lg:ml-auto">
          <button
            type="button"
            onClick={onRefresh}
            title="Refresh plans"
            aria-label="Refresh plans"
            className="p-2.5 rounded-xl text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/10 transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <Button variant="gradient" onClick={() => setCreateOpen(true)}>
            <Plus className="w-4 h-4" /> Create plan
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
          {[0, 1].map((i) => (
            <div key={i} className="h-72 bg-slate-200 dark:bg-slate-800 rounded-2xl animate-pulse" />
          ))}
        </div>
      ) : plans.length === 0 ? (
        <div className="glass-card rounded-2xl border border-dashed border-slate-300 dark:border-white/10 p-12 text-center">
          <div className="w-12 h-12 rounded-2xl bg-primary-50 dark:bg-primary-500/10 text-primary-500 flex items-center justify-center mx-auto mb-4">
            <Tag className="w-6 h-6" />
          </div>
          <h3 className="text-base font-bold text-slate-900 dark:text-white">No plans yet</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-sm mx-auto">
            Institutions can't check out until at least one plan exists with a price on it.
          </p>
          <div className="mt-5">
            <Button variant="gradient" onClick={() => setCreateOpen(true)}>
              <Plus className="w-4 h-4" /> Create your first plan
            </Button>
          </div>
        </div>
      ) : visible.length === 0 ? (
        <div className="glass-card rounded-2xl border border-slate-200 dark:border-white/10 p-12 text-center">
          <Search className="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
          <p className="text-sm text-slate-500 dark:text-slate-400">
            No {filter === 'ALL' ? '' : filter.toLowerCase() + ' '}plans match “{query.trim()}”.
          </p>
          <button
            type="button"
            onClick={() => { setQuery(''); setFilter('ALL'); }}
            className="mt-3 text-xs font-semibold text-primary-600 dark:text-primary-400 hover:underline"
          >
            Clear filters
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
          {visible.map((plan, i) => (
            <PlanCard
              key={plan.id}
              plan={plan}
              index={i}
              onEdit={() => setEditPlan(plan)}
              onArchive={() => setArchiveTarget({ plan, mode: 'archive' })}
              onRestore={() => setArchiveTarget({ plan, mode: 'restore' })}
              onDelete={() => setDeleteTarget(plan)}
              onSetPrice={(cycle) => setPriceTarget({ plan, cycle })}
            />
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
        <ArchiveConfirmModal
          plan={archiveTarget.plan}
          mode={archiveTarget.mode}
          onClose={() => setArchiveTarget(null)}
          onSuccess={() => { setArchiveTarget(null); onRefresh(); }}
        />
      )}
      {deleteTarget && (
        <DeletePlanModal plan={deleteTarget} onClose={() => setDeleteTarget(null)} onSuccess={() => { setDeleteTarget(null); onRefresh(); }} />
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

// ── Plans tab building blocks ───────────────────────────────────────────

const CHIP_TONES = {
  neutral: 'text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800',
  success: 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10',
  info: 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-500/10',
  warning: 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10',
} as const;

const StatChip: React.FC<{
  icon: React.ReactNode;
  label: string;
  value: number;
  hint?: string;
  tone?: keyof typeof CHIP_TONES;
}> = ({ icon, label, value, hint, tone = 'neutral' }) => (
  <div className="glass-card rounded-2xl border border-slate-200 dark:border-white/10 p-3.5 flex items-center gap-3">
    <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${CHIP_TONES[tone]}`}>{icon}</div>
    <div className="min-w-0">
      <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide truncate">{label}</p>
      <p className="text-lg font-bold text-slate-900 dark:text-white leading-tight">
        {value}
        {hint && <span className="ml-1.5 text-[11px] font-medium text-slate-400">{hint}</span>}
      </p>
    </div>
  </div>
);

interface MenuItem {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
  /** Shown under the label when the item is disabled — explains why. */
  disabledReason?: string;
}

/** Kebab overflow menu — closes on outside click, Escape, or item activation. */
const CardMenu: React.FC<{ items: MenuItem[]; label: string }> = ({ items, label }) => {
  const [open, setOpen] = useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div className="relative flex-shrink-0" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        className="p-2 rounded-lg text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/10 transition-colors"
      >
        <MoreVertical className="w-4 h-4" />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full mt-1 w-60 z-20 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-surface-900 shadow-xl p-1"
        >
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              disabled={item.disabled}
              onClick={() => {
                setOpen(false);
                item.onClick();
              }}
              className={`w-full flex items-start gap-2.5 px-3 py-2 rounded-lg text-left text-sm transition-colors ${
                item.disabled
                  ? 'text-slate-400 dark:text-slate-600 cursor-not-allowed'
                  : item.danger
                    ? 'text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10'
                    : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/5'
              }`}
            >
              <span className="mt-0.5 flex-shrink-0">{item.disabled ? <Ban className="w-4 h-4" /> : item.icon}</span>
              <span className="min-w-0">
                <span className="block font-medium">{item.label}</span>
                {item.disabled && item.disabledReason && (
                  <span className="block text-[11px] leading-snug mt-0.5">{item.disabledReason}</span>
                )}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

const PlanCard: React.FC<{
  plan: Plan;
  index: number;
  onEdit: () => void;
  onArchive: () => void;
  onRestore: () => void;
  onDelete: () => void;
  onSetPrice: (cycle: BillingCycle) => void;
}> = ({ plan, index, onEdit, onArchive, onRestore, onDelete, onSetPrice }) => {
  const subscribers = subscriberCount(plan);
  const entry = entryPrice(plan);
  const pricedCount = plan.prices.length;
  // Anything referenced by a subscription must be archived, never deleted —
  // mirrors the backend guard so the menu explains it before the request.
  const deleteBlocked = subscribers > 0;

  return (
    <div
      className={`group relative glass-card rounded-2xl border overflow-hidden flex flex-col transition-all animate-fadeIn ${
        plan.isArchived
          ? 'border-slate-200 dark:border-white/10 bg-slate-50/60 dark:bg-slate-950/30'
          : 'border-slate-200 dark:border-white/10 hover:border-primary-300 dark:hover:border-primary-500/30 hover:shadow-lg hover:shadow-primary-500/5'
      }`}
      style={{ animationDelay: `${Math.min(index, 8) * 40}ms` }}
    >
      {/* Status rail — instant scan of live vs archived down a column of cards */}
      <div
        className={`absolute inset-y-0 left-0 w-1 ${
          plan.isArchived ? 'bg-slate-300 dark:bg-slate-700' : 'bg-gradient-to-b from-blue-500 to-primary-600'
        }`}
        aria-hidden
      />

      <div className={`p-5 sm:p-6 pl-6 sm:pl-7 flex flex-col gap-5 flex-1 ${plan.isArchived ? 'opacity-75' : ''}`}>
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white truncate">{plan.name}</h3>
              {plan.isArchived ? (
                <Badge variant="neutral">Archived</Badge>
              ) : pricedCount === 0 ? (
                <Badge variant="warning">Not purchasable</Badge>
              ) : (
                <Badge variant="success">Live</Badge>
              )}
            </div>
            <p className="text-xs font-mono text-slate-400 dark:text-slate-500 mt-1 truncate" title={plan.slug}>
              {plan.slug}
            </p>
            {plan.description && (
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 leading-relaxed line-clamp-2">{plan.description}</p>
            )}
          </div>

          <CardMenu
            label={`Actions for ${plan.name}`}
            items={[
              { label: 'Edit details', icon: <Pencil className="w-4 h-4" />, onClick: onEdit },
              plan.isArchived
                ? { label: 'Restore to checkout', icon: <ArchiveRestore className="w-4 h-4" />, onClick: onRestore }
                : { label: 'Archive plan', icon: <Archive className="w-4 h-4" />, onClick: onArchive },
              {
                label: 'Delete permanently',
                icon: <Trash2 className="w-4 h-4" />,
                onClick: onDelete,
                danger: true,
                disabled: deleteBlocked,
                disabledReason: deleteBlocked
                  ? `${subscribers} institution${subscribers === 1 ? '' : 's'} on this plan — archive instead`
                  : undefined,
              },
            ]}
          />
        </div>

        {/* Headline price */}
        <div className="flex items-end justify-between gap-3 flex-wrap">
          {entry ? (
            <div>
              <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">Starting from</p>
              <p className="flex items-baseline gap-1 mt-0.5">
                <span className="text-3xl font-bold text-slate-900 dark:text-white tabular-nums">
                  {formatCurrency(Math.round(perMonth(entry)), entry.currency)}
                </span>
                <span className="text-sm font-medium text-slate-400">/month</span>
              </p>
              {entry.billingCycle !== 'MONTHLY' && (
                <p className="text-[11px] text-slate-400 mt-0.5">
                  billed {BILLING_CYCLE_LABELS[entry.billingCycle].toLowerCase()} at {formatCurrency(entry.amount, entry.currency)}
                </p>
              )}
            </div>
          ) : (
            <div>
              <p className="text-[11px] font-semibold text-amber-500 uppercase tracking-wide">No price set</p>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-[24ch] leading-snug">
                Institutions can't subscribe to this plan yet.
              </p>
            </div>
          )}

          <div className="flex flex-wrap gap-2 text-xs">
            <span className="px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-medium">
              {plan.studentCap ? `Up to ${plan.studentCap.toLocaleString()} students` : 'Unlimited students'}
            </span>
            <span
              className={`px-2.5 py-1 rounded-full font-medium inline-flex items-center gap-1 ${
                subscribers > 0
                  ? 'bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
              }`}
            >
              <Users className="w-3 h-3" />
              {subscribers} subscribed
            </span>
          </div>
        </div>

        {/* Pricing grid */}
        <div className="pt-4 border-t border-slate-100 dark:border-white/5">
          <div className="flex items-center justify-between mb-2.5">
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Pricing per cycle</p>
            <span className={`text-[11px] font-semibold ${pricedCount === CYCLES.length ? 'text-emerald-500' : 'text-slate-400'}`}>
              {pricedCount} of {CYCLES.length} set
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {CYCLES.map((cycle) => {
              const price = priceFor(plan, cycle);
              const saving = price ? savingVsMonthly(plan, price) : null;
              return (
                <button
                  key={cycle}
                  type="button"
                  onClick={() => onSetPrice(cycle)}
                  title={price ? `Change the ${BILLING_CYCLE_LABELS[cycle]} price` : `Set the ${BILLING_CYCLE_LABELS[cycle]} price`}
                  className={`relative text-left p-3 rounded-xl border transition-all min-h-[68px] ${
                    price
                      ? 'bg-slate-50 dark:bg-slate-950/50 border-slate-200 dark:border-white/5 hover:border-primary-400 dark:hover:border-primary-500/50'
                      : 'bg-transparent border-dashed border-slate-300 dark:border-white/15 hover:border-primary-400 dark:hover:border-primary-500/50 hover:bg-primary-50/40 dark:hover:bg-primary-500/5'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                      {BILLING_CYCLE_LABELS[cycle]}
                    </span>
                    {saving !== null && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                        SAVE {saving}%
                      </span>
                    )}
                    <Pencil className="w-3 h-3 text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity ml-auto" />
                  </div>
                  {price ? (
                    <>
                      <p className="text-base font-bold text-slate-900 dark:text-white tabular-nums mt-1">
                        {formatCurrency(price.amount, price.currency)}
                      </p>
                      {cycle !== 'MONTHLY' && (
                        <p className="text-[11px] text-slate-400 tabular-nums">
                          {formatCurrency(Math.round(perMonth(price)), price.currency)}/mo
                        </p>
                      )}
                    </>
                  ) : (
                    <p className="text-sm font-medium text-slate-400 mt-1 inline-flex items-center gap-1">
                      <Plus className="w-3.5 h-3.5" /> Set price
                    </p>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Footer meta */}
      <div className="px-5 sm:px-6 pl-6 sm:pl-7 py-3 border-t border-slate-100 dark:border-white/5 bg-slate-50/60 dark:bg-slate-950/30 flex items-center justify-between gap-3 text-[11px] text-slate-400">
        <span>Display order {plan.displayOrder}</span>
        <button
          type="button"
          onClick={onEdit}
          className="font-semibold text-primary-600 dark:text-primary-400 hover:underline inline-flex items-center gap-1"
        >
          <Settings2 className="w-3 h-3" /> Edit plan
        </button>
      </div>
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

const ArchiveConfirmModal: React.FC<{
  plan: Plan;
  mode: 'archive' | 'restore';
  onClose: () => void;
  onSuccess: () => void;
}> = ({ plan, mode, onClose, onSuccess }) => {
  const [submitting, setSubmitting] = useState(false);
  const archiving = mode === 'archive';

  const handleConfirm = async () => {
    setSubmitting(true);
    try {
      if (archiving) {
        await billingApi.archivePlan(plan.id);
        toast.success(`"${plan.name}" archived`);
      } else {
        await billingApi.restorePlan(plan.id);
        toast.success(`"${plan.name}" is live at checkout again`);
      }
      onSuccess();
    } catch (err: any) {
      toast.error(err.response?.data?.message || `Failed to ${mode} plan`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal isOpen onClose={onClose} className="max-w-md">
      <div className="flex items-start gap-3 mb-4">
        <div
          className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
            archiving
              ? 'bg-amber-100 dark:bg-amber-500/15 text-amber-600 dark:text-amber-400'
              : 'bg-emerald-100 dark:bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
          }`}
        >
          {archiving ? <Archive className="w-5 h-5" /> : <ArchiveRestore className="w-5 h-5" />}
        </div>
        <div>
          <h3 className="text-lg font-bold text-slate-900 dark:text-white">{archiving ? 'Archive plan' : 'Restore plan'}</h3>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1 leading-relaxed">
            <strong className="text-slate-900 dark:text-white">{plan.name}</strong>{' '}
            {archiving
              ? 'will be hidden from new checkouts. Existing subscriptions on it are unaffected, and you can restore it at any time.'
              : 'will be shown to institutions at checkout again, with its current pricing.'}
          </p>
        </div>
      </div>
      <div className="flex justify-end gap-3 pt-3 border-t border-slate-100 dark:border-white/5">
        <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
        <Button
          type="button"
          variant={archiving ? 'secondary' : 'gradient'}
          isLoading={submitting}
          onClick={handleConfirm}
        >
          {archiving ? 'Archive plan' : 'Restore plan'}
        </Button>
      </div>
    </Modal>
  );
};

/**
 * Permanent delete, gated behind typing the plan's slug — the backend refuses
 * any plan with subscriptions or payments behind it, so this only ever removes
 * a plan that was never used.
 */
const DeletePlanModal: React.FC<{ plan: Plan; onClose: () => void; onSuccess: () => void }> = ({ plan, onClose, onSuccess }) => {
  const [confirmText, setConfirmText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const matches = confirmText.trim() === plan.slug;

  const handleDelete = async () => {
    if (!matches) return;
    setSubmitting(true);
    try {
      await billingApi.deletePlan(plan.id);
      toast.success(`"${plan.name}" deleted permanently`);
      onSuccess();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to delete plan');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal isOpen onClose={onClose} className="max-w-md">
      <div className="flex items-start gap-3 mb-4">
        <div className="w-10 h-10 rounded-xl bg-rose-100 dark:bg-rose-500/15 text-rose-600 dark:text-rose-400 flex items-center justify-center flex-shrink-0">
          <Trash2 className="w-5 h-5" />
        </div>
        <div>
          <h3 className="text-lg font-bold text-slate-900 dark:text-white">Delete plan permanently</h3>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1 leading-relaxed">
            <strong className="text-slate-900 dark:text-white">{plan.name}</strong> and its {plan.prices.length} price
            {plan.prices.length === 1 ? '' : 's'} will be erased. This cannot be undone.
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-amber-200 dark:border-amber-500/20 bg-amber-50/60 dark:bg-amber-500/5 p-3 mb-4 flex gap-2.5">
        <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
        <p className="text-xs text-amber-800 dark:text-amber-300 leading-relaxed">
          Prefer <strong>Archive</strong> if this plan was ever offered — archiving hides it from checkout while keeping billing
          history intact. Deleting is rejected outright if any institution or payment still references the plan.
        </p>
      </div>

      <Field label="Type the plan slug to confirm">
        <input
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          placeholder={plan.slug}
          className="input-field font-mono"
          autoFocus
          autoComplete="off"
          spellCheck={false}
          aria-label={`Type ${plan.slug} to confirm deletion`}
        />
      </Field>

      <div className="flex justify-end gap-3 pt-4 mt-4 border-t border-slate-100 dark:border-white/5">
        <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
        <Button type="button" variant="danger" isLoading={submitting} disabled={!matches} onClick={handleDelete}>
          <Trash2 className="w-4 h-4" /> Delete plan
        </Button>
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
// Moved to ./billing/AnalyticsTab and lazy-loaded (see top of file) so the
// recharts dependency ships in its own async chunk.

export default SubscriptionBillingPortal;
