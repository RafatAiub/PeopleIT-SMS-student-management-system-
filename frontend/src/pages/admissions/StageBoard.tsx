import React, { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { DndContext, DragOverlay, PointerSensor, TouchSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent, type DragStartEvent } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { Clock, Inbox, ListTodo, Phone, UserCircle2 } from 'lucide-react';
import { Badge, Button, ErrorState, Input, Modal, Skeleton } from '@/components/ui';
import { EmptyState } from '@/components/common/EmptyState';
import { cn } from '@/lib/cn';
import { formatDate, formatNumber, useLocale, useT } from '@/i18n';
import { boardKey, useCrmBoard, useMoveStage, type CrmFilters } from './crm.api';
import { dueStateOf, moveCardToStage, stageLabel, type BoardColumnData } from './crm.logic';
import type { Enquiry, StageRef } from './enquiries.types';

interface StageBoardProps {
  filters: CrmFilters;
  onOpen: (enquiry: Enquiry) => void;
}

/** T4 pipeline board: one column per configured stage. Drag a card (mouse or
 * touch, via @dnd-kit) or use its "Move to…" select (keyboard / small screens). */
export default function StageBoard({ filters, onOpen }: StageBoardProps) {
  const t = useT();
  const { lang } = useLocale();
  const qc = useQueryClient();
  const { data, isLoading, isError, refetch } = useCrmBoard(filters);
  const move = useMoveStage();
  const [dragging, setDragging] = useState<Enquiry | null>(null);
  const [lostPrompt, setLostPrompt] = useState<{ enquiry: Enquiry; stage: StageRef } | null>(null);
  const [lostReason, setLostReason] = useState('');

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }),
  );

  const doMove = (enquiry: Enquiry, stage: StageRef, reason?: string) => {
    const key = boardKey(filters);
    const previous = qc.getQueryData(key);
    qc.setQueryData(key, (old: { columns: BoardColumnData[]; unstaged: number } | undefined) =>
      old ? { ...old, columns: moveCardToStage(old.columns, enquiry.id, stage.id) } : old,
    );
    move.mutate(
      { id: enquiry.id, stageId: stage.id, lostReason: stage.isLost ? reason || null : undefined },
      { onError: () => qc.setQueryData(key, previous) },
    );
  };

  const requestMove = (enquiry: Enquiry, stageId: string) => {
    const stage = data?.columns.find((c) => c.stage.id === stageId)?.stage;
    if (!stage || stage.id === enquiry.stageId) return;
    if (stage.isLost) {
      setLostReason(enquiry.lostReason ?? '');
      setLostPrompt({ enquiry, stage });
      return;
    }
    doMove(enquiry, stage);
  };

  const onDragStart = (e: DragStartEvent) => setDragging((e.active.data.current?.enquiry as Enquiry) ?? null);
  const onDragEnd = (e: DragEndEvent) => {
    setDragging(null);
    const enquiry = e.active.data.current?.enquiry as Enquiry | undefined;
    const stageId = e.over?.id ? String(e.over.id) : null;
    if (enquiry && stageId) requestMove(enquiry, stageId);
  };

  if (isError) return <ErrorState message={t('Could not load the board.')} onRetry={() => refetch()} />;
  if (isLoading) {
    return (
      <div className="flex flex-col md:flex-row gap-4 md:overflow-x-auto pb-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="md:w-72 md:shrink-0 space-y-3">
            <Skeleton className="h-6 w-32" />
            <Skeleton className="h-24 w-full rounded-xl" />
          </div>
        ))}
      </div>
    );
  }

  const columns = data?.columns ?? [];
  if (columns.reduce((s, c) => s + c.total, 0) === 0) {
    return (
      <EmptyState
        icon={<Inbox />}
        title={t('No enquiries match')}
        description={t('New admission enquiries appear here as cards you can drag between stages.')}
      />
    );
  }

  return (
    <>
      <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setDragging(null)}>
        <div className="flex flex-col md:flex-row gap-4 md:overflow-x-auto pb-2" role="list" aria-label={t('Admission enquiry pipeline')}>
          {columns.map((col) => (
            <StageColumn key={col.stage.id} column={col} lang={lang} stages={columns.map((c) => c.stage)} onOpen={onOpen} onMove={requestMove} movingId={move.isPending ? move.variables?.id : undefined} />
          ))}
        </div>
        <DragOverlay>{dragging ? <CardBody enquiry={dragging} overlay /> : null}</DragOverlay>
      </DndContext>

      <Modal
        isOpen={!!lostPrompt}
        onClose={() => setLostPrompt(null)}
        title={t('Mark as lost')}
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={() => setLostPrompt(null)}>
              {t('Cancel')}
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                if (lostPrompt) doMove(lostPrompt.enquiry, lostPrompt.stage, lostReason.trim());
                setLostPrompt(null);
              }}
            >
              {t('Move to {stage}', { stage: lostPrompt ? stageLabel(lostPrompt.stage, lang) : '' })}
            </Button>
          </>
        }
      >
        <Input
          label={t('Why was it lost? (optional)')}
          value={lostReason}
          maxLength={300}
          data-autofocus
          onChange={(e) => setLostReason(e.target.value)}
          placeholder={t('e.g. chose another school, fees, distance')}
        />
      </Modal>
    </>
  );
}

function StageColumn({
  column,
  stages,
  lang,
  onOpen,
  onMove,
  movingId,
}: {
  column: BoardColumnData;
  stages: StageRef[];
  lang: 'en' | 'bn';
  onOpen: (e: Enquiry) => void;
  onMove: (e: Enquiry, stageId: string) => void;
  movingId?: string;
}) {
  const t = useT();
  const { setNodeRef, isOver } = useDroppable({ id: column.stage.id });
  return (
    <div
      ref={setNodeRef}
      role="listitem"
      className={cn(
        'md:w-72 md:shrink-0 rounded-xl border border-slate-200 dark:border-white/8 bg-slate-50/60 dark:bg-white/2 p-3 flex flex-col gap-3 border-t-4',
        isOver && 'ring-2 ring-primary-400',
      )}
      style={{ borderTopColor: column.stage.color }}
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">{stageLabel(column.stage, lang)}</h3>
        <span className="text-xs font-semibold tabular-nums text-slate-600 dark:text-slate-300 bg-white dark:bg-white/10 rounded-full px-2 py-0.5">{formatNumber(column.total)}</span>
      </div>
      {column.total > column.items.length && (
        <p className="text-[11px] text-slate-500 dark:text-slate-400">
          {t('Showing {shown} of {total}', { shown: formatNumber(column.items.length), total: formatNumber(column.total) })}
        </p>
      )}
      <div className="flex flex-col gap-2 min-h-16">
        {column.items.length === 0 ? (
          <p className="text-xs text-slate-400 dark:text-slate-500 italic py-2 text-center">{t('Drop cards here')}</p>
        ) : (
          column.items.map((e) => <DraggableCard key={e.id} enquiry={e} stages={stages} lang={lang} onOpen={onOpen} onMove={onMove} isMoving={movingId === e.id} />)
        )}
      </div>
    </div>
  );
}

function DraggableCard({
  enquiry,
  stages,
  lang,
  onOpen,
  onMove,
  isMoving,
}: {
  enquiry: Enquiry;
  stages: StageRef[];
  lang: 'en' | 'bn';
  onOpen: (e: Enquiry) => void;
  onMove: (e: Enquiry, stageId: string) => void;
  isMoving: boolean;
}) {
  const t = useT();
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: enquiry.id, data: { enquiry } });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform) }}
      className={cn('glass-card rounded-xl p-3 space-y-2 touch-manipulation', (isDragging || isMoving) && 'opacity-40')}
    >
      <div {...listeners} {...attributes} className="cursor-grab active:cursor-grabbing" aria-roledescription={t('draggable card')}>
        <button
          type="button"
          onClick={() => onOpen(enquiry)}
          className="block w-full text-left rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
        >
          <CardBody enquiry={enquiry} />
        </button>
      </div>
      <label className="sr-only" htmlFor={`stage-move-${enquiry.id}`}>
        {t('Move to…')}
      </label>
      <select
        id={`stage-move-${enquiry.id}`}
        value={enquiry.stageId ?? ''}
        onChange={(e) => onMove(enquiry, e.target.value)}
        disabled={isMoving}
        aria-label={t('Move {name} to…', { name: enquiry.studentName })}
        className="input-field h-8 py-1 text-xs w-full"
      >
        {stages.map((s) => (
          <option key={s.id} value={s.id}>
            {stageLabel(s, lang)}
          </option>
        ))}
      </select>
    </div>
  );
}

function CardBody({ enquiry, overlay }: { enquiry: Enquiry; overlay?: boolean }) {
  const t = useT();
  const due = enquiry.stage?.isWon || enquiry.stage?.isLost ? 'none' : dueStateOf(enquiry.followUpAt);
  return (
    <div className={cn(overlay && 'glass-card rounded-xl p-3 shadow-lg w-64')}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-semibold text-slate-900 dark:text-slate-50 truncate">{enquiry.studentName}</p>
        {enquiry.priority === 'HIGH' && <Badge variant="danger">{t('High')}</Badge>}
      </div>
      {enquiry.classInterested && <p className="text-xs text-slate-600 dark:text-slate-400 truncate">{enquiry.classInterested}</p>}
      <div className="mt-1.5 flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
        <Phone className="w-3 h-3 shrink-0" aria-hidden />
        <span className="truncate">{enquiry.phone}</span>
      </div>
      {enquiry.assignedTo && (
        <div className="mt-1 flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400">
          <UserCircle2 className="w-3 h-3 shrink-0" aria-hidden />
          <span className="truncate">
            {enquiry.assignedTo.firstName} {enquiry.assignedTo.lastName}
          </span>
        </div>
      )}
      {enquiry.nextStep && <p className="mt-1 text-xs text-slate-700 dark:text-slate-200 line-clamp-2">→ {enquiry.nextStep}</p>}
      {enquiry.followUpAt && (
        <div className={cn('mt-1 flex flex-wrap items-center gap-1.5 text-xs', due === 'overdue' ? 'text-red-700 dark:text-red-400 font-semibold' : 'text-slate-600 dark:text-slate-400')}>
          <Clock className="w-3 h-3 shrink-0" aria-hidden />
          <span>{formatDate(enquiry.followUpAt, true)}</span>
          {due === 'overdue' && <Badge variant="danger">{t('Overdue')}</Badge>}
          {due === 'today' && <Badge variant="warning">{t('Today')}</Badge>}
        </div>
      )}
      {!!enquiry._count?.tasks && (
        <div className="mt-1 flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400">
          <ListTodo className="w-3 h-3 shrink-0" aria-hidden />
          <span>{t('{n} open tasks', { n: formatNumber(enquiry._count.tasks) })}</span>
        </div>
      )}
      {enquiry.stage?.isLost && enquiry.lostReason && <p className="mt-1 text-xs italic text-slate-600 dark:text-slate-400 line-clamp-2">{enquiry.lostReason}</p>}
    </div>
  );
}
