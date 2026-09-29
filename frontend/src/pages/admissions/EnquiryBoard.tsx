import React, { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Skeleton, ErrorState } from '@/components/ui';
import { EmptyState } from '@/components/common/EmptyState';
import { Inbox } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useT, formatNumber } from '@/i18n';
import EnquiryCard from './EnquiryCard';
import { useEnquiryBoard, useUpdateEnquiryStatus, ENQUIRY_BOARD_KEY, type EnquiryBoardParams } from './enquiries.queries';
import { STATUS_LABELS, type BoardColumn, type Enquiry, type EnquiryStatus } from './enquiries.types';

interface EnquiryBoardProps {
  search: string;
  assignedToUserId: string;
  onOpen: (enquiry: Enquiry) => void;
}

const BOARD_LIMIT = 50;

/** Moves `enquiry` between columns in the cached board response so drag-and-
 * drop (and the keyboard "Move to…" select) feel instant; rolled back by the
 * caller if the PATCH fails. */
function moveCard(
  data: { columns: BoardColumn[] } | undefined,
  enquiry: Enquiry,
  nextStatus: EnquiryStatus,
): { columns: BoardColumn[] } | undefined {
  if (!data) return data;
  const columns = data.columns.map((col) => {
    if (col.status === enquiry.status) {
      return { ...col, total: Math.max(0, col.total - 1), items: col.items.filter((i) => i.id !== enquiry.id) };
    }
    if (col.status === nextStatus) {
      return { ...col, total: col.total + 1, items: [{ ...enquiry, status: nextStatus }, ...col.items] };
    }
    return col;
  });
  return { columns };
}

export default function EnquiryBoard({ search, assignedToUserId, onOpen }: EnquiryBoardProps) {
  const t = useT();
  const queryClient = useQueryClient();
  const params: EnquiryBoardParams = { search: search || undefined, assignedToUserId: assignedToUserId || undefined, limit: BOARD_LIMIT };
  const { data, isLoading, isError, refetch } = useEnquiryBoard(params);
  const statusMutation = useUpdateEnquiryStatus();
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [movingId, setMovingId] = useState<string | null>(null);
  const [dragOverStatus, setDragOverStatus] = useState<EnquiryStatus | null>(null);

  const boardQueryKey = [ENQUIRY_BOARD_KEY, params];

  const handleMove = (enquiry: Enquiry, nextStatus: EnquiryStatus) => {
    if (enquiry.status === nextStatus) return;
    const previous = queryClient.getQueryData(boardQueryKey);
    queryClient.setQueryData(boardQueryKey, (old: any) => moveCard(old, enquiry, nextStatus));
    setMovingId(enquiry.id);
    statusMutation.mutate(
      { id: enquiry.id, status: nextStatus },
      {
        onError: () => queryClient.setQueryData(boardQueryKey, previous),
        onSettled: () => setMovingId(null),
      },
    );
  };

  if (isError) {
    return <ErrorState message={t('Could not load the board.')} onRetry={() => refetch()} />;
  }

  if (isLoading) {
    return (
      <div className="flex flex-col md:flex-row gap-4 md:overflow-x-auto pb-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="md:w-72 md:shrink-0 space-y-3">
            <Skeleton className="h-6 w-32" />
            <Skeleton className="h-24 w-full rounded-xl" />
            <Skeleton className="h-24 w-full rounded-xl" />
          </div>
        ))}
      </div>
    );
  }

  const columns = data?.columns ?? [];
  const totalAcrossBoard = columns.reduce((sum, c) => sum + c.total, 0);

  if (totalAcrossBoard === 0) {
    return (
      <EmptyState
        icon={<Inbox />}
        title={t('No enquiries yet')}
        description={t('New admission enquiries will appear here as cards you can move through the pipeline.')}
      />
    );
  }

  return (
    <div className="flex flex-col md:flex-row gap-4 md:overflow-x-auto pb-2" role="list" aria-label={t('Admission enquiry pipeline')}>
      {columns.map((col) => (
        <div
          key={col.status}
          role="listitem"
          onDragOver={(e) => { e.preventDefault(); setDragOverStatus(col.status); }}
          onDragLeave={() => setDragOverStatus((s) => (s === col.status ? null : s))}
          onDrop={(e) => {
            e.preventDefault();
            setDragOverStatus(null);
            const enquiry = col.items.find((i) => i.id === draggedId) ?? findAcrossColumns(columns, draggedId);
            if (enquiry) handleMove(enquiry, col.status);
          }}
          className={cn(
            'md:w-72 md:shrink-0 rounded-xl border border-slate-200 dark:border-white/8 bg-slate-50/60 dark:bg-white/2 p-3 flex flex-col gap-3',
            dragOverStatus === col.status && 'ring-2 ring-primary-400'
          )}
        >
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">{t(STATUS_LABELS[col.status])}</h3>
            <span className="text-xs font-semibold tabular-nums text-slate-500 dark:text-slate-400 bg-white dark:bg-white/10 rounded-full px-2 py-0.5">
              {formatNumber(col.total)}
            </span>
          </div>

          {col.total > col.items.length && (
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              {t('Showing {shown} of {total}', { shown: formatNumber(col.items.length), total: formatNumber(col.total) })}
            </p>
          )}

          <div className="flex flex-col gap-2 min-h-16">
            {col.items.length === 0 ? (
              <p className="text-xs text-slate-400 dark:text-slate-500 italic py-2 text-center">{t('No enquiries')}</p>
            ) : (
              col.items.map((enquiry) => (
                <EnquiryCard
                  key={enquiry.id}
                  enquiry={enquiry}
                  draggable
                  onDragStart={() => setDraggedId(enquiry.id)}
                  onDragEnd={() => setDraggedId(null)}
                  onOpen={onOpen}
                  onMove={handleMove}
                  isMoving={movingId === enquiry.id}
                />
              ))
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function findAcrossColumns(columns: BoardColumn[], id: string | null): Enquiry | undefined {
  if (!id) return undefined;
  for (const col of columns) {
    const found = col.items.find((i) => i.id === id);
    if (found) return found;
  }
  return undefined;
}
