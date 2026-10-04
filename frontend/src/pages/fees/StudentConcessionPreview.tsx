import React from 'react';
import { BadgePercent, UserPlus } from 'lucide-react';
import { Checkbox, Skeleton, Button } from '../../components/ui';
import { useT, formatCurrency } from '../../i18n';
import { useStudentActiveConcessions } from './feeExtras.queries';
import { describeConcession, estimateConcession, type LineLike } from './concessionUtils';
import type { FeeCategory } from './types';

interface Props {
  studentId: string;
  categories: FeeCategory[];
  lines: LineLike[];
  apply: boolean;
  onApplyChange: (v: boolean) => void;
  onAssign?: () => void;
}

export const StudentConcessionPreview: React.FC<Props> = ({ studentId, categories, lines, apply, onApplyChange, onAssign }) => {
  const t = useT();
  const { data: rules = [], isLoading, isError } = useStudentActiveConcessions(studentId);

  if (isLoading) return <Skeleton className="h-12 mt-2" />;

  const catName = (id: string | null) => (id ? categories.find((c) => c.id === id)?.name ?? t('Fee category') : t('Whole invoice'));
  const estimate = rules.length > 0 ? estimateConcession(lines.filter((l) => l.feeCategoryId), rules) : 0;

  return (
    <div className="mt-2 rounded-lg border border-slate-200 dark:border-white/10 p-3 space-y-2 text-sm">
      {isError ? (
        <p className="text-amber-700 dark:text-amber-400">{t('Could not load this student\'s concessions — the server still applies them when the invoice is created.')}</p>
      ) : rules.length === 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-slate-500 dark:text-slate-400">{t('No active concessions for this student.')}</p>
          {onAssign && (
            <Button type="button" variant="link" size="xs" leftIcon={<UserPlus className="w-3.5 h-3.5" />} onClick={onAssign}>
              {t('Assign concession')}
            </Button>
          )}
        </div>
      ) : (
        <>
          <div className="flex items-start gap-2">
            <BadgePercent className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
            <ul className="space-y-0.5 min-w-0">
              {rules.map((r) => (
                <li key={r.id} className="text-slate-700 dark:text-slate-300">
                  <span className="font-medium">{r.name}</span> — {describeConcession(r)} · {catName(r.feeCategoryId)}
                </li>
              ))}
            </ul>
          </div>
          <Checkbox
            label={t('Apply concessions automatically')}
            description={apply && estimate > 0 ? t('Estimated discount: {amount} (final figure calculated on save)', { amount: formatCurrency(estimate) }) : undefined}
            checked={apply}
            onChange={(e) => onApplyChange(e.target.checked)}
          />
          {onAssign && (
            <Button type="button" variant="link" size="xs" leftIcon={<UserPlus className="w-3.5 h-3.5" />} onClick={onAssign}>
              {t('Assign another concession')}
            </Button>
          )}
        </>
      )}
    </div>
  );
};
