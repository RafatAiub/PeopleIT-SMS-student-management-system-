import React from 'react';

type StatusKey =
  | 'ACTIVE' | 'INACTIVE' | 'TRANSFERRED' | 'GRADUATED'
  | 'PAID' | 'PARTIAL' | 'OVERDUE' | 'SENT' | 'DRAFT' | 'CANCELLED'
  | 'PRESENT' | 'ABSENT' | 'LATE'
  | 'PENDING' | 'APPROVED' | 'REJECTED';

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
  OVERDUE:     { label: 'Overdue',     className: 'badge-danger' },
  SENT:        { label: 'Sent',        className: 'badge-info' },
  DRAFT:       { label: 'Draft',       className: 'badge-neutral' },
  CANCELLED:   { label: 'Cancelled',   className: 'badge-neutral' },
  PRESENT:     { label: 'Present',     className: 'badge-success' },
  ABSENT:      { label: 'Absent',      className: 'badge-danger' },
  LATE:        { label: 'Late',        className: 'badge-warning' },
  PENDING:     { label: 'Pending',     className: 'badge-warning' },
  APPROVED:    { label: 'Approved',    className: 'badge-success' },
  REJECTED:    { label: 'Rejected',    className: 'badge-danger' },
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
