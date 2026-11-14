import React from 'react';
import { Search } from 'lucide-react';
import { Input, Select } from '@/components/ui';
import { useT } from '@/i18n';
import type { FilterOptions } from './dues.api';

// Shared class / section / search filters for the dues screens.

export interface ClassFilterValue {
  classId: string;
  sectionId: string;
  search: string;
}

export const ClassSectionSearch: React.FC<{
  options?: FilterOptions;
  value: ClassFilterValue;
  onChange: (v: ClassFilterValue) => void;
  idPrefix: string;
  hideSearch?: boolean;
}> = ({ options, value, onChange, idPrefix, hideSearch }) => {
  const t = useT();
  const sections = options?.classes.find((c) => c.id === value.classId)?.sections ?? [];
  return (
    <>
      <Select
        id={`${idPrefix}-class`}
        label={t('Class')}
        value={value.classId}
        onChange={(e) => onChange({ ...value, classId: e.target.value, sectionId: '' })}
        options={[{ value: '', label: t('All classes') }, ...(options?.classes ?? []).map((c) => ({ value: c.id, label: c.name }))]}
      />
      <Select
        id={`${idPrefix}-section`}
        label={t('Section')}
        value={value.sectionId}
        disabled={!value.classId}
        onChange={(e) => onChange({ ...value, sectionId: e.target.value })}
        options={[{ value: '', label: t('All sections') }, ...sections.map((s) => ({ value: s.id, label: s.name }))]}
      />
      {!hideSearch && (
        <Input
          id={`${idPrefix}-search`}
          label={t('Search')}
          leftIcon={<Search className="w-4 h-4" />}
          placeholder={t('Name, ID or roll')}
          value={value.search}
          onChange={(e) => onChange({ ...value, search: e.target.value })}
        />
      )}
    </>
  );
};

/** Debounces a value (search boxes). */
export function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = React.useState(value);
  React.useEffect(() => {
    const h = setTimeout(() => setV(value), ms);
    return () => clearTimeout(h);
  }, [value, ms]);
  return v;
}

export const Pager: React.FC<{ page: number; pageSize: number; total: number; onPage: (p: number) => void }> = ({ page, pageSize, total, onPage }) => {
  const t = useT();
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  return (
    <nav aria-label={t('Pagination')} className="flex items-center justify-between gap-2 text-sm">
      <button type="button" className="btn-secondary px-3 py-1.5 rounded-lg border border-slate-300 dark:border-white/15 disabled:opacity-50 min-h-[36px]" disabled={page <= 1} onClick={() => onPage(page - 1)}>
        {t('Previous')}
      </button>
      <span className="text-slate-600 dark:text-slate-300">{t('Page {p} of {n}', { p: page, n: pages })}</span>
      <button type="button" className="btn-secondary px-3 py-1.5 rounded-lg border border-slate-300 dark:border-white/15 disabled:opacity-50 min-h-[36px]" disabled={page >= pages} onClick={() => onPage(page + 1)}>
        {t('Next')}
      </button>
    </nav>
  );
};
