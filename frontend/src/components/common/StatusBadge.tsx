import React from 'react';

type StatusKey =
  | 'ACTIVE' | 'INACTIVE' | 'TRANSFERRED' | 'GRADUATED'
  | 'PAID' | 'PARTIAL' | 'UNPAID' | 'OVERDUE' | 'SENT' | 'DRAFT' | 'CANCELLED'
  | 'PRESENT' | 'ABSENT' | 'LATE'
  | 'ABSENT_EXCUSED' | 'ABSENT_UNEXCUSED' | 'LEAVE' | 'NOT_REQUIRED'
  | 'NOT_OPENED' | 'IN_PROGRESS' | 'SUBMITTED' | 'LOCKED' | 'REOPENED'
  | 'PENDING' | 'APPROVED' | 'REJECTED' | 'WITHDRAWN'
  | 'ISSUED' | 'RETURNED';

interface StatusBadgeProps {
  status: StatusKey | string;
  className?: string;
}

const STATUS_MAP: Record<string, { label: string; className: string }> = {
  ACTIVE:      { label: 'Active',      className: 'badge-success' },
  INACTIVE:    { label: 'Inactive',    className: 'badge-neutral' },
  TRANSFERRED: { label: 'Transferred', className: 'badge-warning' },
  GRADUATED:   { label: 'Graduated',   className: 'badge-info' },
  PAID:        { label: 'Paid',        className: 'badge-success' },
  PARTIAL:     { label: 'Partial',     className: 'badge-warning' },
  UNPAID:      { label: 'Unpaid',      className: 'badge-danger' },
  OVERDUE:     { label: 'Overdue',     className: 'badge-danger' },
  SENT:        { label: 'Sent',        className: 'badge-info' },
  DRAFT:       { label: 'Draft',       className: 'badge-neutral' },
  CANCELLED:   { label: 'Cancelled',   className: 'badge-neutral' },
  PRESENT:     { label: 'Present',     className: 'badge-success' },
  ABSENT:      { label: 'Absent',      className: 'badge-danger' },
  LATE:        { label: 'Late',        className: 'badge-warning' },
  // New attendance mark set (register-based attendance, teacher workspace)
  ABSENT_EXCUSED:   { label: 'Absent (Excused)',   className: 'badge-info' },
  ABSENT_UNEXCUSED: { label: 'Absent (Unexcused)', className: 'badge-danger' },
  LEAVE:            { label: 'Leave',              className: 'badge-info' },
  NOT_REQUIRED:     { label: 'Not Required',       className: 'badge-neutral' },
  // Register lifecycle statuses
  NOT_OPENED:  { label: 'Not Opened',  className: 'badge-neutral' },
  IN_PROGRESS: { label: 'In Progress', className: 'badge-info' },
  SUBMITTED:   { label: 'Submitted',   className: 'badge-success' },
  LOCKED:      { label: 'Locked',      className: 'badge-neutral' },
  REOPENED:    { label: 'Reopened',    className: 'badge-warning' },
  PENDING:     { label: 'Pending',     className: 'badge-warning' },
  APPROVED:    { label: 'Approved',    className: 'badge-success' },
  REJECTED:    { label: 'Rejected',    className: 'badge-danger' },
  WITHDRAWN:   { label: 'Withdrawn',   className: 'badge-neutral' },
  ISSUED:      { label: 'Issued',      className: 'badge-info' },
  RETURNED:    { label: 'Returned',    className: 'badge-success' },
};

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, className = '' }) => {
  const config = STATUS_MAP[status?.toUpperCase()] || {
    label: status,
    className: 'badge-neutral',
  };

  return (
    <span className={`${config.className} ${className}`}>
      {config.label}
    </span>
  );
};
