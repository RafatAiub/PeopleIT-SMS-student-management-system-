import React from 'react';
import { Phone, Clock, UserCircle2 } from 'lucide-react';
import { Badge } from '@/components/ui';
import { cn } from '@/lib/cn';
import { useT, formatDate } from '@/i18n';
import {
  PIPELINE,
  STATUS_LABELS,
  isFollowUpOverdue,
  type Enquiry,
  type EnquiryStatus,
} from './enquiries.types';

interface EnquiryCardProps {
  enquiry: Enquiry;
  onOpen: (enquiry: Enquiry) => void;
  onMove: (enquiry: Enquiry, status: EnquiryStatus) => void;
  onDragStart?: (enquiry: Enquiry) => void;
  onDragEnd?: () => void;
  draggable?: boolean;
  isMoving?: boolean;
}

/** One admissions-CRM card: used on the Kanban board and reachable entirely
 * by keyboard via the "Move to…" select (native HTML5 drag-and-drop is the
 * pointer/mouse path only). */
export default function EnquiryCard({ enquiry, onOpen, onMove, onDragStart, onDragEnd, draggable, isMoving }: EnquiryCardProps) {
  const t = useT();
  const overdue = isFollowUpOverdue(enquiry);

  return (
    <div
      draggable={draggable}
      onDragStart={() => onDragStart?.(enquiry)}
      onDragEnd={() => onDragEnd?.()}
      className={cn(
        'glass-card p-3 space-y-2 rounded-xl transition-opacity',
        draggable && 'cursor-grab active:cursor-grabbing',
        isMoving && 'opacity-50'
      )}
    >
      <button
        type="button"
        onClick={() => onOpen(enquiry)}
        className="block w-full text-left rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
      >
        <p className="text-sm font-semibold text-slate-900 dark:text-slate-50 truncate">{enquiry.studentName}</p>
        {enquiry.classInterested && (
          <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{enquiry.classInterested}</p>
        )}
        <div className="mt-1.5 flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
          <Phone className="w-3 h-3 shrink-0" aria-hidden />
          <span className="truncate">{enquiry.phone}</span>
        </div>
        {enquiry.assignedTo && (
          <div className="mt-1 flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
            <UserCircle2 className="w-3 h-3 shrink-0" aria-hidden />
            <span className="truncate">{enquiry.assignedTo.firstName} {enquiry.assignedTo.lastName}</span>
          </div>
        )}
        {enquiry.followUpAt && (
          <div className={cn('mt-1 flex items-center gap-1.5 text-xs', overdue ? 'text-red-600 dark:text-red-400 font-semibold' : 'text-slate-500 dark:text-slate-400')}>
            <Clock className="w-3 h-3 shrink-0" aria-hidden />
            <span>{formatDate(enquiry.followUpAt, true)}</span>
            {overdue && <Badge variant="danger">{t('Overdue')}</Badge>}
          </div>
        )}
      </button>

      <label className="sr-only" htmlFor={`move-${enquiry.id}`}>
        {t('Move to…')}
      </label>
      <select
        id={`move-${enquiry.id}`}
        value={enquiry.status}
        onChange={(e) => onMove(enquiry, e.target.value as EnquiryStatus)}
        disabled={isMoving}
        aria-label={t('Move {name} to…', { name: enquiry.studentName })}
        className="input-field h-8 py-1 text-xs w-full"
      >
        {PIPELINE.map((s) => (
          <option key={s} value={s}>{t(STATUS_LABELS[s])}</option>
        ))}
      </select>
    </div>
  );
}
