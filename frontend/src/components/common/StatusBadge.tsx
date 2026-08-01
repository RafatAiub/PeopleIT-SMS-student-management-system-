import React from 'react';
import { Badge } from '../ui/Badge';

type StatusKey =
  | 'ACTIVE' | 'INACTIVE' | 'TRANSFERRED' | 'GRADUATED'
  | 'PAID' | 'PARTIAL' | 'UNPAID' | 'OVERDUE' | 'SENT' | 'DRAFT' | 'CANCELLED'
  | 'PRESENT' | 'ABSENT' | 'LATE'
  | 'PENDING' | 'APPROVED' | 'REJECTED'
  | 'ISSUED' | 'RETURNED';

interface StatusBadgeProps {
  status: StatusKey | string;
  className?: string;
}

type BadgeVariant = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

const STATUS_MAP: Record<string, { label: string; variant: BadgeVariant }> = {
  ACTIVE:      { label: 'Active',      variant: 'success' },
  INACTIVE:    { label: 'Inactive',    variant: 'neutral' },
  TRANSFERRED: { label: 'Transferred', variant: 'warning' },
  GRADUATED:   { label: 'Graduated',   variant: 'info' },
  PAID:        { label: 'Paid',        variant: 'success' },
  PARTIAL:     { label: 'Partial',     variant: 'warning' },
  UNPAID:      { label: 'Unpaid',      variant: 'danger' },
  OVERDUE:     { label: 'Overdue',     variant: 'danger' },
  SENT:        { label: 'Sent',        variant: 'info' },
  DRAFT:       { label: 'Draft',       variant: 'neutral' },
  CANCELLED:   { label: 'Cancelled',   variant: 'neutral' },
  PRESENT:     { label: 'Present',     variant: 'success' },
  ABSENT:      { label: 'Absent',      variant: 'danger' },
  LATE:        { label: 'Late',        variant: 'warning' },
  PENDING:     { label: 'Pending',     variant: 'warning' },
  APPROVED:    { label: 'Approved',    variant: 'success' },
  REJECTED:    { label: 'Rejected',    variant: 'danger' },
  ISSUED:      { label: 'Issued',      variant: 'info' },
  RETURNED:    { label: 'Returned',    variant: 'success' },
};

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, className = '' }) => {
  const config = STATUS_MAP[status?.toUpperCase()] || {
    label: status,
    variant: 'neutral' as BadgeVariant,
  };

  return (
    <Badge variant={config.variant} motionKey={status} className={className}>
      {config.label}
    </Badge>
  );
};
