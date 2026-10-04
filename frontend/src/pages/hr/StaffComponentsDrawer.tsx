import React, { useEffect, useMemo, useState } from 'react';
import { Drawer, Button, Checkbox, ErrorState, Skeleton, Alert } from '@/components/ui';
import { EmptyState } from '@/components/common/EmptyState';
import { formatCurrency, useT } from '@/i18n';
import { useAssignStaffComponents, useSalaryComponents, useStaffComponents } from './hr.queries';
import type { SalaryComponent, StaffProfile } from './hr.types';
import { describeValue } from './salaryComponents.utils';

type Selection = Record<string, { checked: boolean; override: string }>;

function amountFor(base: number, c: SalaryComponent, override: string) {
  const v = override.trim() === '' ? c.value : Number(override);
  if (!Number.isFinite(v) || v < 0) return 0;
  return Math.round((c.calcType === 'PERCENT_OF_BASE' ? (base * v) / 100 : v) * 100) / 100;
}

/** Assign salary components to one staff member, with optional per-staff override values. */
export default function StaffComponentsDrawer({
  staff,
  canWrite,
  onClose,
}: {
  staff: StaffProfile | null;
  canWrite: boolean;
  onClose: () => void;
}) {
  const t = useT();
  const catalogue = useSalaryComponents();
  const current = useStaffComponents(staff?.id ?? null);
  const assign = useAssignStaffComponents();
  const [sel, setSel] = useState<Selection>({});

  useEffect(() => {
    if (!current.data) return;
    const next: Selection = {};
    current.data.assignments.forEach((a) => {
      next[a.componentId] = { checked: true, override: a.overrideValue === null ? '' : String(a.overrideValue) };
    });
    setSel(next);
  }, [current.data]);

  const base = current.data?.baseSalary ?? staff?.baseSalary ?? 0;
  const components = useMemo(() => catalogue.data ?? [], [catalogue.data]);

  const preview = useMemo(() => {
    let allowances = 0;
    let deductions = 0;
    components.forEach((c) => {
      const s = sel[c.id];
      if (!s?.checked || !c.isActive) return;
      const amt = amountFor(base, c, s.override);
      if (c.type === 'ALLOWANCE') allowances += amt;
      else deductions += amt;
    });
    return { allowances, deductions, net: base + allowances - deductions };
  }, [components, sel, base]);

  const save = async () => {
    if (!staff) return;
    const rows = Object.entries(sel)
      .filter(([, s]) => s.checked)
      .map(([componentId, s]) => ({ componentId, overrideValue: s.override.trim() === '' ? null : Number(s.override) }));
    await assign.mutateAsync({ staffId: staff.id, components: rows });
    onClose();
  };

  const loading = catalogue.isLoading || current.isLoading;
  const error = catalogue.isError || current.isError;

  return (
    <Drawer
      isOpen={!!staff}
      onClose={onClose}
      title={t('Salary components')}
      description={staff ? `${staff.name} · ${t('Base')} ${formatCurrency(base)}` : undefined}
      width="md"
      footer={
        canWrite ? (
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={onClose}>{t('Cancel')}</Button>
            <Button onClick={save} isLoading={assign.isPending} disabled={loading || error}>{t('Save')}</Button>
          </div>
        ) : undefined
      }
    >
      {loading ? (
        <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-14" />)}</div>
      ) : error ? (
        <ErrorState compact message={t('Could not load salary components.')} onRetry={() => { catalogue.refetch(); current.refetch(); }} />
      ) : components.length === 0 ? (
        <EmptyState compact title={t('No salary components defined')} description={t('Create them in the Salary Components tab first.')} />
      ) : (
        <div className="space-y-4">
          <ul className="space-y-2">
            {components.map((c) => {
              const s = sel[c.id] ?? { checked: false, override: '' };
              return (
                <li key={c.id} className="rounded-xl border border-slate-200 dark:border-white/10 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <Checkbox
                      label={c.name}
                      description={`${c.type === 'ALLOWANCE' ? t('Allowance') : t('Deduction')} · ${describeValue(c)}${c.isActive ? '' : ` · ${t('Inactive')}`}`}
                      checked={s.checked}
                      disabled={!canWrite}
                      onChange={(e) => setSel((p) => ({ ...p, [c.id]: { ...s, checked: e.target.checked } }))}
                    />
                    {s.checked && (
                      <span className={c.type === 'ALLOWANCE' ? 'text-emerald-700 dark:text-emerald-400 text-sm font-semibold' : 'text-rose-700 dark:text-rose-400 text-sm font-semibold'}>
                        {c.type === 'ALLOWANCE' ? '+' : '−'}{formatCurrency(c.isActive ? amountFor(base, c, s.override) : 0)}
                      </span>
                    )}
                  </div>
                  {s.checked && canWrite && (
                    <div className="mt-2 flex items-center gap-2">
                      <label htmlFor={`override-${c.id}`} className="text-xs text-slate-600 dark:text-slate-400 shrink-0">
                        {c.calcType === 'PERCENT_OF_BASE' ? t('Override %') : t('Override ৳')}
                      </label>
                      <input
                        id={`override-${c.id}`}
                        type="number"
                        min={0}
                        max={c.calcType === 'PERCENT_OF_BASE' ? 100 : undefined}
                        step="0.01"
                        value={s.override}
                        placeholder={String(c.value)}
                        onChange={(e) => setSel((p) => ({ ...p, [c.id]: { ...s, override: e.target.value } }))}
                        className="input-field py-1.5 text-sm w-32"
                      />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
          <Alert tone="info" title={t('Monthly preview')}>
            <div className="text-sm space-y-0.5">
              <p>{t('Allowances')}: +{formatCurrency(preview.allowances)}</p>
              <p>{t('Deductions')}: −{formatCurrency(preview.deductions)}</p>
              <p className="font-semibold">{t('Net')}: {formatCurrency(preview.net)}</p>
            </div>
          </Alert>
        </div>
      )}
    </Drawer>
  );
}
