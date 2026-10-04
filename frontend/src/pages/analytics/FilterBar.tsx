import React, { useMemo } from 'react';
import { RotateCcw } from 'lucide-react';
import { Button, Input, Select } from '@/components/ui';
import { useT } from '@/i18n';
import type { FilterOptions, RangePreset, ReportFilters, ReportKey } from './analytics.types';
import { defaultFilters } from './analyticsRange';

const PRESETS: { value: RangePreset; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: 'last7', label: 'Last 7 days' },
  { value: 'last30', label: 'Last 30 days' },
  { value: 'last90', label: 'Last 90 days' },
  { value: 'thisMonth', label: 'This month' },
  { value: 'lastMonth', label: 'Last month' },
  { value: 'thisYear', label: 'This year' },
  { value: 'custom', label: 'Custom range' },
];


interface Props {
  tab: ReportKey;
  filters: ReportFilters;
  onChange: (next: ReportFilters) => void;
  options?: FilterOptions;
  optionsLoading?: boolean;
}

/** Shared filters: branch, session, class, section, date range + per-tab extras. */
export const FilterBar: React.FC<Props> = ({ tab, filters, onChange, options, optionsLoading }) => {
  const t = useT();
  const set = (patch: Partial<ReportFilters>) => onChange({ ...filters, ...patch });

  const classes = useMemo(
    () => (options?.classes ?? []).filter((c) => !filters.branchId || c.branchId === filters.branchId),
    [options, filters.branchId],
  );
  const sections = useMemo(() => classes.find((c) => c.id === filters.classId)?.sections ?? [], [classes, filters.classId]);
  const studentFilters = tab !== 'admissions';

  return (
    <div className="glass-card p-3 sm:p-4 no-print">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {studentFilters && (options?.branches.length ?? 0) > 1 && (
          <Select
            id="analytics-branch"
            label={t('Branch')}
            value={filters.branchId ?? ''}
            disabled={optionsLoading}
            onChange={(e) => set({ branchId: e.target.value || undefined, classId: undefined, sectionId: undefined })}
            options={[{ value: '', label: t('All branches') }, ...(options?.branches ?? []).map((b) => ({ value: b.id, label: b.name }))]}
          />
        )}
        {studentFilters && (
          <Select
            id="analytics-session"
            label={t('Session')}
            value={filters.academicYearId ?? ''}
            disabled={optionsLoading}
            onChange={(e) => set({ academicYearId: e.target.value || undefined })}
            options={[
              { value: '', label: t('All sessions') },
              ...(options?.academicYears ?? []).map((y) => ({ value: y.id, label: y.isCurrent ? `${y.label} (${t('current')})` : y.label })),
            ]}
          />
        )}
        {studentFilters && (
          <Select
            id="analytics-class"
            label={t('Class')}
            value={filters.classId ?? ''}
            disabled={optionsLoading}
            onChange={(e) => set({ classId: e.target.value || undefined, sectionId: undefined })}
            options={[
              { value: '', label: options?.teacherScoped ? t('All my classes') : t('All classes') },
              ...classes.map((c) => ({ value: c.id, label: c.name })),
            ]}
          />
        )}
        {studentFilters && (
          <Select
            id="analytics-section"
            label={t('Section')}
            value={filters.sectionId ?? ''}
            disabled={!filters.classId}
            onChange={(e) => set({ sectionId: e.target.value || undefined })}
            options={[{ value: '', label: t('All sections') }, ...sections.map((s) => ({ value: s.id, label: s.name }))]}
          />
        )}
        {tab === 'academic' && (
          <Select
            id="analytics-exam"
            label={t('Exam')}
            value={filters.examId ?? ''}
            onChange={(e) => set({ examId: e.target.value || undefined })}
            options={[{ value: '', label: t('Latest exam') }, ...(options?.exams ?? []).map((x) => ({ value: x.id, label: x.name }))]}
          />
        )}
        <Select
          id="analytics-range"
          label={tab === 'academic' ? t('Exams starting in') : t('Date range')}
          value={filters.preset ?? (filters.from || filters.to ? 'custom' : '')}
          onChange={(e) => {
            const v = e.target.value as RangePreset | '';
            set({ preset: v || undefined, ...(v !== 'custom' ? { from: undefined, to: undefined } : {}) });
          }}
          options={[
            { value: '', label: tab === 'academic' || tab === 'admissions' ? t('Any time') : t('Default (last 30 days)') },
            ...PRESETS.map((p) => ({ value: p.value, label: t(p.label) })),
          ]}
        />
        {filters.preset === 'custom' && (
          <>
            <Input id="analytics-from" type="date" label={t('From')} value={filters.from ?? ''} max={filters.to} onChange={(e) => set({ from: e.target.value || undefined })} />
            <Input id="analytics-to" type="date" label={t('To')} value={filters.to ?? ''} min={filters.from} onChange={(e) => set({ to: e.target.value || undefined })} />
          </>
        )}
        {tab === 'finance' && (
          <Select
            id="analytics-granularity"
            label={t('Group collections by')}
            value={filters.granularity ?? ''}
            onChange={(e) => set({ granularity: (e.target.value || undefined) as ReportFilters['granularity'] })}
            options={[
              { value: '', label: t('Automatic') },
              { value: 'day', label: t('Day') },
              { value: 'month', label: t('Month') },
            ]}
          />
        )}
        {tab === 'attendance' && (
          <Input
            id="analytics-threshold"
            type="number"
            min={1}
            max={100}
            label={t('Chronic absence threshold (%)')}
            value={filters.threshold ?? 20}
            onChange={(e) => {
              const n = Number(e.target.value);
              set({ threshold: Number.isFinite(n) && n >= 1 && n <= 100 ? n : undefined });
            }}
          />
        )}
      </div>
      <div className="mt-3 flex justify-end">
        <Button type="button" variant="ghost" size="sm" leftIcon={<RotateCcw className="w-4 h-4" />} onClick={() => onChange(defaultFilters(tab))}>
          {t('Reset filters')}
        </Button>
      </div>
    </div>
  );
};
