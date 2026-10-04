import React from 'react';
import { Drawer, Badge, SkeletonText, ErrorState } from '../../components/ui';
import { EmptyState } from '../../components/common/EmptyState';
import { useT, formatCurrency, formatDate, formatNumber } from '../../i18n';
import { personName, useMovements, type StockItem } from './inventory.api';

const TYPE_VARIANT = { IN: 'success', OUT: 'warning', ADJUST: 'info' } as const;

export const StockHistoryDrawer: React.FC<{ item: StockItem | null; onClose: () => void; action?: React.ReactNode; icon?: React.ReactNode }> = ({ item, onClose, action }) => {
  const t = useT();
  const movements = useMovements({ stockItemId: item?.id, page: 1, pageSize: 100 }, !!item);

  return (
    <Drawer
      isOpen={!!item}
      onClose={onClose}
      title={item?.name}
      description={item ? t('{n} {unit} in stock · reorder at {r}', { n: formatNumber(item.quantity), unit: item.unit, r: formatNumber(item.reorderLevel) }) : undefined}
      width="lg"
      footer={action ? <div className="flex justify-end">{action}</div> : undefined}
    >
      {movements.isLoading ? (
        <SkeletonText lines={6} />
      ) : movements.isError ? (
        <ErrorState message={t('Could not load stock movements.')} onRetry={() => movements.refetch()} />
      ) : (movements.data?.items.length ?? 0) === 0 ? (
        <EmptyState compact title={t('No movements yet')} description={t('Stock in, stock out and adjustments will be listed here.')} />
      ) : (
        <ol className="space-y-2">
          {movements.data!.items.map((m) => {
            const signed = m.type === 'OUT' ? -m.quantity : m.quantity;
            return (
              <li key={m.id} className="rounded-lg border border-slate-200 dark:border-white/10 p-3 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <Badge variant={TYPE_VARIANT[m.type]}>{m.type}</Badge>
                  <span className={`tabular-nums font-semibold ${signed < 0 ? 'text-red-600 dark:text-red-400' : 'text-emerald-700 dark:text-emerald-400'}`}>
                    {signed > 0 ? '+' : ''}{formatNumber(signed)} {item?.unit}
                  </span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  {formatDate(m.createdAt, true)}
                  {m.createdBy && ` · ${personName(m.createdBy)}`}
                  {m.unitCost !== null && ` · ${t('{c} each', { c: formatCurrency(m.unitCost) })}`}
                </p>
                {(m.reference || m.note) && (
                  <p className="text-xs text-slate-600 dark:text-slate-300 mt-1 break-words">{[m.reference, m.note].filter(Boolean).join(' — ')}</p>
                )}
              </li>
            );
          })}
        </ol>
      )}
      {(movements.data?.meta.total ?? 0) > 100 && (
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-3">{t('Showing the latest 100 movements.')}</p>
      )}
    </Drawer>
  );
};
