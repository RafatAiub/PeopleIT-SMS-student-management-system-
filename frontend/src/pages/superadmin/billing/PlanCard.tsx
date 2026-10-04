import React from 'react';
import { Plus, Archive, ArchiveRestore, Pencil, Trash2, Users, Settings2 } from 'lucide-react';
import { formatCurrency, type BillingCycle, type Plan } from '@/api/billing.api';
import { Badge } from '@/components/ui/Badge';
import {
  CYCLES,
  BILLING_CYCLE_LABELS,
  CardMenu,
  perMonth,
  priceFor,
  savingVsMonthly,
  entryPrice,
  subscriberCount,
} from './shared';

export const PlanCard: React.FC<{
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
          : 'border-slate-200 dark:border-white/10 hover:border-primary-300 dark:hover:border-primary-500/30 hover:shadow-sm'
      }`}
      style={{ animationDelay: `${Math.min(index, 8) * 40}ms` }}
    >
      {/* Status rail — instant scan of live vs archived down a column of cards */}
      <div
        className={`absolute inset-y-0 left-0 w-1 ${
          plan.isArchived ? 'bg-slate-300 dark:bg-slate-700' : 'bg-primary-600'
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

export default PlanCard;
