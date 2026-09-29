import React, { useState } from 'react';
import { Plus, Tag, Search, Users, Layers, CircleAlert, Check, RefreshCw } from 'lucide-react';
import { type BillingCycle, type Plan } from '@/api/billing.api';
import { Button } from '@/components/ui/Button';
import { StatChip, perMonth, entryPrice, subscriberCount } from './shared';
import { PlanCard } from './PlanCard';
import { PlanFormModal, ArchiveConfirmModal, DeletePlanModal, SetPriceModal } from './PlanModals';

// ── Tab: Plans ────────────────────────────────────────────────────────────

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
            aria-label="Search plans by name or slug"
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
            No {filter === 'ALL' ? '' : filter.toLowerCase() + ' '}plans match "{query.trim()}".
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

export default PlansTab;
