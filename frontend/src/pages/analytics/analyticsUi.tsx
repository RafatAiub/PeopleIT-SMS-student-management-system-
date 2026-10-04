import React from 'react';
import { Card, ErrorState, Skeleton } from '@/components/ui';
import { EmptyState } from '@/components/common/EmptyState';
import { useT } from '@/i18n';

/** Titled chart/table panel with the three data states built in. */
export const ChartCard: React.FC<{
  title: string;
  description?: string;
  isLoading?: boolean;
  isError?: boolean;
  onRetry?: () => void;
  isEmpty?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  actions?: React.ReactNode;
  height?: number;
  className?: string;
  children: React.ReactNode;
}> = ({ title, description, isLoading, isError, onRetry, isEmpty, emptyTitle, emptyDescription, actions, height = 260, className, children }) => {
  const t = useT();
  return (
  <Card className={`min-w-0 break-inside-avoid ${className ?? ''}`}>
    <div className="flex items-start justify-between gap-3 mb-3">
      <div className="min-w-0">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-white">{title}</h3>
        {description && <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{description}</p>}
      </div>
      {actions && <div className="shrink-0 no-print">{actions}</div>}
    </div>
    {isError ? (
      <ErrorState compact onRetry={onRetry} />
    ) : isLoading ? (
      <Skeleton className="w-full" style={{ height }} />
    ) : isEmpty ? (
      <EmptyState compact title={emptyTitle ?? t('No data for these filters')} description={emptyDescription ?? t('Try a wider date range or fewer filters.')} />
    ) : (
      children
    )}
  </Card>
  );
};
