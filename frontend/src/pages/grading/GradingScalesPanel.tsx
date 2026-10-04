import React, { useState } from 'react';
import { Plus, Star, Pencil, Trash2, Sparkles, Scale } from 'lucide-react';
import toast from 'react-hot-toast';
import { Alert, Badge, Button, Card, ErrorState, Skeleton } from '../../components/ui';
import { EmptyState } from '../../components/common/EmptyState';
import { ConfirmModal } from '../../components/common/ConfirmModal';
import { useT, formatDate, formatNumber } from '../../i18n';
import {
  useDeleteScale,
  useEffectiveScale,
  useGradingScales,
  useSeedBangladesh,
  useSetDefaultScale,
  type GradeBand,
  type GradingScale,
} from './grading.queries';
import { GradingScaleFormModal } from './GradingScaleFormModal';

export const BandsTable: React.FC<{ bands: GradeBand[] }> = ({ bands }) => {
  const t = useT();
  const sorted = [...bands].sort((a, b) => b.minPercent - a.minPercent);
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-slate-500 dark:text-slate-400">
            <th className="py-1.5 pr-3 font-medium">{t('Grade')}</th>
            <th className="py-1.5 pr-3 font-medium">{t('Range')}</th>
            <th className="py-1.5 pr-3 font-medium text-right">{t('Point')}</th>
            <th className="py-1.5 font-medium">{t('Remark')}</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((b) => (
            <tr key={b.grade} className="border-t border-slate-100 dark:border-white/5">
              <td className="py-1.5 pr-3 font-semibold text-slate-900 dark:text-white">{b.grade}</td>
              <td className="py-1.5 pr-3 tabular-nums">
                {formatNumber(b.minPercent)}–{formatNumber(b.maxPercent)}%
              </td>
              <td className="py-1.5 pr-3 text-right tabular-nums">{formatNumber(b.gradePoint, { minimumFractionDigits: 2 })}</td>
              <td className="py-1.5 text-slate-600 dark:text-slate-400">{b.remark || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

/** Grading-scale management (SUPER_ADMIN / ADMIN — backend requireRole SA, A). */
export const GradingScalesPanel: React.FC = () => {
  const t = useT();
  const scales = useGradingScales(1, 100);
  const effective = useEffectiveScale();
  const seed = useSeedBangladesh();
  const setDefault = useSetDefaultScale();
  const del = useDeleteScale();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<GradingScale | null>(null);
  const [deleting, setDeleting] = useState<GradingScale | null>(null);

  const handleSeed = async () => {
    try {
      await seed.mutateAsync(true);
      toast.success(t('Bangladesh standard scale created and set as default'));
    } catch (err: any) {
      toast.error(err.response?.data?.message || t('Failed to create scale'));
    }
  };

  const handleSetDefault = async (s: GradingScale) => {
    try {
      await setDefault.mutateAsync(s.id);
      toast.success(t('"{name}" is now the default scale', { name: s.name }));
    } catch (err: any) {
      toast.error(err.response?.data?.message || t('Failed to set default scale'));
    }
  };

  const handleDelete = async () => {
    if (!deleting) return;
    try {
      await del.mutateAsync(deleting.id);
      toast.success(t('Grading scale deleted'));
      setDeleting(null);
    } catch (err: any) {
      toast.error(err.response?.data?.message || t('Failed to delete grading scale'));
    }
  };

  const items = scales.data?.items ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold text-slate-900 dark:text-white">{t('Grading scales')}</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {t('Marks entry, marksheets, report cards, merit lists and transcripts use the default scale.')}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" leftIcon={<Sparkles className="w-4 h-4" />} onClick={handleSeed} isLoading={seed.isPending}>
            {t('Create from Bangladesh standard (A+ … F)')}
          </Button>
          <Button size="sm" leftIcon={<Plus className="w-4 h-4" />} onClick={() => { setEditing(null); setFormOpen(true); }}>
            {t('New scale')}
          </Button>
        </div>
      </div>

      {effective.data?.isFallback && (
        <Alert tone="info" title={t('Using the built-in scale')}>
          {t('No default scale is configured, so results are graded with the built-in Bangladesh standard (A+ 80%, A 70%, A- 60%, B 50%, C 40%, D 33%, F below 33%).')}
        </Alert>
      )}
      <Alert tone="warning">
        {t('Changing the default scale regrades marksheets, report cards, merit lists and transcripts when they are next viewed. Grades saved with marks are updated the next time those marks are saved.')}
      </Alert>

      {scales.isLoading ? (
        <div className="grid gap-4 md:grid-cols-2">
          <Skeleton className="h-56" />
          <Skeleton className="h-56" />
        </div>
      ) : scales.isError ? (
        <ErrorState onRetry={() => scales.refetch()} />
      ) : items.length === 0 ? (
        <EmptyState
          icon={<Scale className="w-6 h-6" />}
          title={t('No grading scales yet')}
          description={t('Create one from the Bangladesh standard, or build your own bands.')}
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {items.map((s) => (
            <Card key={s.id} className="p-4 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="font-semibold text-slate-900 dark:text-white truncate">{s.name}</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {t('{n} bands', { n: s.bands.length })} · {t('Updated {date}', { date: formatDate(s.updatedAt) })}
                  </p>
                </div>
                {s.isDefault && <Badge variant="success" dot>{t('Default')}</Badge>}
              </div>
              <BandsTable bands={s.bands} />
              <div className="flex flex-wrap gap-2 pt-1">
                {!s.isDefault && (
                  <Button variant="secondary" size="xs" leftIcon={<Star className="w-3.5 h-3.5" />} onClick={() => handleSetDefault(s)} isLoading={setDefault.isPending && setDefault.variables === s.id}>
                    {t('Set as default')}
                  </Button>
                )}
                <Button variant="ghost" size="xs" leftIcon={<Pencil className="w-3.5 h-3.5" />} onClick={() => { setEditing(s); setFormOpen(true); }}>
                  {t('Edit')}
                </Button>
                <Button variant="danger-soft" size="xs" leftIcon={<Trash2 className="w-3.5 h-3.5" />} onClick={() => setDeleting(s)}>
                  {t('Delete')}
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <GradingScaleFormModal isOpen={formOpen} onClose={() => setFormOpen(false)} scale={editing} />
      <ConfirmModal
        isOpen={!!deleting}
        title={t('Delete grading scale?')}
        message={
          deleting?.isDefault
            ? t('This is the default scale. After deleting it, results fall back to the built-in Bangladesh standard scale.')
            : t('This scale will be removed permanently.')
        }
        confirmLabel={t('Delete')}
        onConfirm={handleDelete}
        onCancel={() => setDeleting(null)}
        isLoading={del.isPending}
      />
    </div>
  );
};
