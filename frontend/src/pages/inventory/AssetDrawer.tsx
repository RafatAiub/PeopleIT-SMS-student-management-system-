import React from 'react';
import { Pencil, UserPlus, Undo2, History, Wrench } from 'lucide-react';
import { Drawer, Button, Badge, DescriptionList, SkeletonText, ErrorState } from '../../components/ui';
import { EmptyState } from '../../components/common/EmptyState';
import { useT, formatCurrency, formatDate } from '../../i18n';
import {
  ASSET_STATUS_OPTIONS,
  ASSET_STATUS_VARIANT,
  MAINT_STATUS_OPTIONS,
  MAINT_STATUS_VARIANT,
  personName,
  useAllocations,
  useMaintenance,
  type Asset,
} from './inventory.api';

interface Props {
  asset: Asset | null;
  canManage: boolean;
  onClose: () => void;
  onEdit: (a: Asset) => void;
  onAllocate: (a: Asset) => void;
  onReturn: (a: Asset) => void;
}

/** Quick view: asset details, full allocation history and maintenance log. */
export const AssetDrawer: React.FC<Props> = ({ asset, canManage, onClose, onEdit, onAllocate, onReturn }) => {
  const t = useT();
  const allocations = useAllocations({ assetId: asset?.id, page: 1, pageSize: 50 }, !!asset);
  const maintenance = useMaintenance({ assetId: asset?.id, page: 1, pageSize: 50 }, !!asset);

  return (
    <Drawer
      isOpen={!!asset}
      onClose={onClose}
      title={asset?.name}
      description={asset ? `${asset.code}${asset.category ? ` · ${asset.category.name}` : ''}` : undefined}
      width="lg"
      footer={
        asset && canManage ? (
          <div className="flex flex-wrap gap-2 justify-end">
            <Button variant="secondary" leftIcon={<Pencil className="w-4 h-4" />} onClick={() => onEdit(asset)}>{t('Edit')}</Button>
            {asset.status === 'AVAILABLE' && (
              <Button variant="gradient" leftIcon={<UserPlus className="w-4 h-4" />} onClick={() => onAllocate(asset)}>{t('Allocate')}</Button>
            )}
            {asset.status === 'ALLOCATED' && (
              <Button variant="gradient" leftIcon={<Undo2 className="w-4 h-4" />} onClick={() => onReturn(asset)}>{t('Return')}</Button>
            )}
          </div>
        ) : undefined
      }
    >
      {asset && (
        <div className="space-y-6">
          <div>
            <Badge variant={ASSET_STATUS_VARIANT[asset.status]}>{t(ASSET_STATUS_OPTIONS.find((o) => o.value === asset.status)?.label || asset.status)}</Badge>
          </div>
          <DescriptionList
            items={[
              { label: t('Serial no.'), value: asset.serialNo || '—' },
              { label: t('Condition'), value: asset.condition ? t(asset.condition.charAt(0) + asset.condition.slice(1).toLowerCase()) : '—' },
              { label: t('Location'), value: asset.location || '—' },
              { label: t('Vendor'), value: asset.vendor || '—' },
              { label: t('Purchase date'), value: asset.purchaseDate ? formatDate(asset.purchaseDate) : '—' },
              { label: t('Purchase cost'), value: asset.purchaseCost === null ? '—' : formatCurrency(asset.purchaseCost) },
              ...(asset.notes ? [{ label: t('Notes'), value: asset.notes }] : []),
            ]}
          />

          <section>
            <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white mb-3">
              <History className="w-4 h-4" /> {t('Allocation history')}
            </h3>
            {allocations.isLoading ? (
              <SkeletonText lines={3} />
            ) : allocations.isError ? (
              <ErrorState message={t('Could not load allocation history.')} onRetry={() => allocations.refetch()} />
            ) : (allocations.data?.items.length ?? 0) === 0 ? (
              <EmptyState compact title={t('Never allocated')} description={t('Allocations to staff or locations will appear here.')} />
            ) : (
              <ol className="space-y-2">
                {allocations.data!.items.map((al) => (
                  <li key={al.id} className="rounded-lg border border-slate-200 dark:border-white/10 p-3 text-sm">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-medium text-slate-900 dark:text-white min-w-0 break-words">
                        {al.allocatedToUser ? personName(al.allocatedToUser) : al.allocatedToLocation}
                      </p>
                      <Badge variant={al.returnedAt ? 'neutral' : 'info'} className="shrink-0">{al.returnedAt ? t('Returned') : t('Current')}</Badge>
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                      {formatDate(al.allocatedAt)} → {al.returnedAt ? formatDate(al.returnedAt) : t('now')}
                    </p>
                    {al.note && <p className="text-xs text-slate-600 dark:text-slate-300 mt-1">{al.note}</p>}
                  </li>
                ))}
              </ol>
            )}
          </section>

          <section>
            <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white mb-3">
              <Wrench className="w-4 h-4" /> {t('Maintenance')}
            </h3>
            {maintenance.isLoading ? (
              <SkeletonText lines={3} />
            ) : maintenance.isError ? (
              <ErrorState message={t('Could not load maintenance records.')} onRetry={() => maintenance.refetch()} />
            ) : (maintenance.data?.items.length ?? 0) === 0 ? (
              <EmptyState compact title={t('No maintenance recorded')} description={t('Schedule maintenance from the Maintenance tab.')} />
            ) : (
              <ul className="space-y-2">
                {maintenance.data!.items.map((m) => (
                  <li key={m.id} className="rounded-lg border border-slate-200 dark:border-white/10 p-3 text-sm">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-medium text-slate-900 dark:text-white min-w-0 break-words">{m.description}</p>
                      <Badge variant={MAINT_STATUS_VARIANT[m.status]} className="shrink-0">{t(MAINT_STATUS_OPTIONS.find((o) => o.value === m.status)?.label || m.status)}</Badge>
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                      {formatDate(m.date)}
                      {m.cost !== null && ` · ${formatCurrency(m.cost)}`}
                      {m.vendor && ` · ${m.vendor}`}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </Drawer>
  );
};
