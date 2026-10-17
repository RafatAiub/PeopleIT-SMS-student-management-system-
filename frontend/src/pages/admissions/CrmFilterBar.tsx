import React from 'react';
import { Search, X } from 'lucide-react';
import { Button, Select } from '@/components/ui';
import { cn } from '@/lib/cn';
import { useLocale, useT } from '@/i18n';
import { useFilterOptions, useStages, type CrmFilters } from './crm.api';
import { useEnquiryAssignees } from './enquiries.queries';
import { stageLabel } from './crm.logic';
import { PRIORITY_OPTIONS, SOURCE_OPTIONS } from './enquiries.types';

interface Props {
  value: CrmFilters;
  onChange: (next: CrmFilters) => void;
  /** The board shows every stage as a column, so it hides the stage filter. */
  showStage?: boolean;
}

/** Quick filters: Mine / Overdue / Due today chips, then stage, source, class, owner and priority. */
export default function CrmFilterBar({ value, onChange, showStage = true }: Props) {
  const t = useT();
  const { lang } = useLocale();
  const { data: options } = useFilterOptions();
  const { data: stages = [] } = useStages();
  const { data: assignees = [] } = useEnquiryAssignees();
  const set = (patch: Partial<CrmFilters>) => onChange({ ...value, ...patch });
  const active = Object.entries(value).some(([, v]) => !!v);

  const sources = [...new Set([...SOURCE_OPTIONS.map((s) => s.value), ...(options?.sources ?? [])])];
  const sourceLabel = (s: string) => t(SOURCE_OPTIONS.find((o) => o.value === s)?.label ?? s);

  const chip = (on: boolean, label: string, onClick: () => void) => (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cn(
        'min-h-8 px-3 rounded-full text-xs font-semibold border transition-colors',
        on
          ? 'bg-primary-600 border-primary-600 text-white'
          : 'bg-white dark:bg-white/6 border-slate-300 dark:border-white/12 text-slate-700 dark:text-slate-200 hover:bg-slate-50',
      )}
    >
      {label}
    </button>
  );

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-48 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" aria-hidden />
          <input
            type="search"
            aria-label={t('Search enquiries')}
            placeholder={t('Search by name, guardian, phone...')}
            value={value.search ?? ''}
            onChange={(e) => set({ search: e.target.value })}
            className="input-field pl-9"
          />
        </div>
        <div className="flex flex-wrap gap-2" role="group" aria-label={t('Quick filters')}>
          {chip(!!value.mine, t('Mine'), () => set({ mine: !value.mine, assignedToUserId: '' }))}
          {chip(value.due === 'overdue', t('Overdue'), () => set({ due: value.due === 'overdue' ? '' : 'overdue' }))}
          {chip(value.due === 'today', t('Due today'), () => set({ due: value.due === 'today' ? '' : 'today' }))}
        </div>
        {active && (
          <Button size="sm" variant="ghost" leftIcon={<X className="w-3.5 h-3.5" />} onClick={() => onChange({})}>
            {t('Clear filters')}
          </Button>
        )}
      </div>
      <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-2">
        {showStage && (
          <Select
            aria-label={t('Filter by stage')}
            value={value.stageId ?? ''}
            onChange={(e) => set({ stageId: e.target.value })}
            className="sm:w-auto sm:min-w-36"
            placeholder={t('All stages')}
            options={stages.map((s) => ({ value: s.id, label: stageLabel(s, lang) }))}
          />
        )}
        <Select
          aria-label={t('Filter by source')}
          value={value.source ?? ''}
          onChange={(e) => set({ source: e.target.value })}
          className="sm:w-auto sm:min-w-32"
          placeholder={t('All sources')}
          options={sources.map((s) => ({ value: s, label: sourceLabel(s) }))}
        />
        <Select
          aria-label={t('Filter by class')}
          value={value.classInterested ?? ''}
          onChange={(e) => set({ classInterested: e.target.value })}
          className="sm:w-auto sm:min-w-32"
          placeholder={t('All classes')}
          options={(options?.classes ?? []).map((c) => ({ value: c, label: c }))}
        />
        <Select
          aria-label={t('Filter by owner')}
          value={value.assignedToUserId ?? ''}
          onChange={(e) => set({ assignedToUserId: e.target.value, mine: false })}
          className="sm:w-auto sm:min-w-36"
          placeholder={t('All owners')}
          options={assignees.map((a) => ({ value: a.id, label: `${a.firstName} ${a.lastName}`.trim() }))}
        />
        <Select
          aria-label={t('Filter by priority')}
          value={value.priority ?? ''}
          onChange={(e) => set({ priority: e.target.value })}
          className="sm:w-auto sm:min-w-28"
          placeholder={t('Any priority')}
          options={PRIORITY_OPTIONS.map((p) => ({ value: p.value, label: t(p.label) }))}
        />
      </div>
    </div>
  );
}
