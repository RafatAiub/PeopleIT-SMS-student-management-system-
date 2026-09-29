import React from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, CircleDashed, ClipboardCheck } from 'lucide-react';
import { Card, CardHeader, ErrorState, Skeleton } from '@/components/ui';
import { useT, useLocale, formatNumber } from '@/i18n';
import { cn } from '@/lib/cn';
import { useCompliance, apiError } from '../sites.queries';
import type { ComplianceItem, ComplianceStatus } from '../sites.types';

/** Where each DSHE checklist item's "Fix" link goes. Internal items jump to a Website Builder sub-tab; the rest leave the builder for the module that owns the data. */
const FIX_TARGETS: Record<string, { tab: 'profile' | 'content'; view: string } | { path: string }> = {
  profile: { tab: 'profile', view: 'info' },
  recognition: { tab: 'profile', view: 'info' },
  mpo: { tab: 'profile', view: 'info' },
  information_officer: { tab: 'profile', view: 'info' },
  complaints_officer: { tab: 'profile', view: 'info' },
  people: { tab: 'profile', view: 'staff' },
  committee: { tab: 'content', view: 'committee' },
  class_gender_counts: { path: '/students' },
  sections: { path: '/academics/sections' },
  teaching_info: { path: '/timetables' },
  contact: { path: '/settings' },
};

const STATUS_STYLE: Record<ComplianceStatus, { icon: React.ReactNode; text: string }> = {
  filled: { icon: <CheckCircle2 className="w-4.5 h-4.5 text-emerald-600 dark:text-emerald-400" aria-hidden />, text: 'text-slate-700 dark:text-slate-300' },
  partial: { icon: <AlertTriangle className="w-4.5 h-4.5 text-amber-600 dark:text-amber-400" aria-hidden />, text: 'text-slate-700 dark:text-slate-300' },
  missing: { icon: <CircleDashed className="w-4.5 h-4.5 text-slate-300 dark:text-slate-600" aria-hidden />, text: 'text-slate-500 dark:text-slate-400' },
};

const Row: React.FC<{ item: ComplianceItem; labelBn: boolean; onFix: () => void }> = ({ item, labelBn, onFix }) => {
  const t = useT();
  const s = STATUS_STYLE[item.status];
  const statusLabel = item.status === 'filled' ? t('Filled') : item.status === 'partial' ? t('Partial') : t('Missing');
  return (
    <li className="flex items-center gap-3 py-2.5">
      {s.icon}
      <div className="flex-1 min-w-0">
        <p className={cn('text-sm font-medium truncate', s.text)}>{labelBn ? item.labelBn : item.label}</p>
        <p className="text-xs text-slate-500 dark:text-slate-400">{statusLabel}</p>
      </div>
      {item.status !== 'filled' && (
        <button type="button" onClick={onFix} className="text-xs font-semibold text-primary-700 dark:text-primary-300 hover:underline shrink-0">
          {t('Fix')}
        </button>
      )}
    </li>
  );
};

/**
 * Overview tab widget: DSHE 11-item compliance checklist from
 * `GET /sites/me/compliance` (WEBSITE_V3_PLAN.md §7.5), with a progress bar
 * and a "Fix" link per unfinished item.
 */
export const ComplianceChecklist: React.FC<{ onNavigate: (tab: string, params?: Record<string, string>) => void }> = ({ onNavigate }) => {
  const t = useT();
  const { lang } = useLocale();
  const navigate = useNavigate();
  const q = useCompliance();

  if (q.isLoading) {
    return (
      <Card>
        <Skeleton className="h-5 w-48 mb-3" />
        <Skeleton className="h-2 w-full rounded-full mb-4" />
        <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 rounded-lg" />)}</div>
      </Card>
    );
  }
  if (q.isError || !q.data) {
    return (
      <Card>
        <ErrorState compact title={t('Could not load the compliance checklist')} message={apiError(q.error, '')} onRetry={() => q.refetch()} />
      </Card>
    );
  }

  const { items, filled, total } = q.data;
  const percent = total > 0 ? Math.round((filled / total) * 100) : 0;

  const fix = (item: ComplianceItem) => {
    const target = FIX_TARGETS[item.key];
    if (!target) return;
    if ('path' in target) navigate(target.path);
    else onNavigate(target.tab, { [`${target.tab}View`]: target.view });
  };

  return (
    <Card aria-labelledby="compliance-checklist-title">
      <CardHeader
        icon={<ClipboardCheck className="w-4 h-4" />}
        title={<span id="compliance-checklist-title">{t('DSHE website checklist')}</span>}
        description={t('The 11 items every Bangladeshi school and college website is required to show.')}
      />
      <div
        className="h-2 w-full rounded-full bg-slate-100 dark:bg-white/8 overflow-hidden mb-4"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-label={t('Checklist progress')}
      >
        <div className="h-full rounded-full bg-primary-600 transition-all" style={{ width: `${percent}%` }} />
      </div>
      <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">
        {t('{done} of {total} complete ({percent}%)', { done: formatNumber(filled), total: formatNumber(total), percent })}
      </p>
      <ul className="divide-y divide-slate-100 dark:divide-white/6">
        {items.map((item) => (
          <Row key={item.key} item={item} labelBn={lang === 'bn'} onFix={() => fix(item)} />
        ))}
      </ul>
    </Card>
  );
};
