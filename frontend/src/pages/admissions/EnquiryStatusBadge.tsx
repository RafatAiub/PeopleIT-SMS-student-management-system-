import React from 'react';
import { Badge } from '@/components/ui';
import { useT } from '@/i18n';
import { STATUS_BADGE_VARIANT, STATUS_LABELS, type EnquiryStatus } from './enquiries.types';

/**
 * The shared `StatusBadge` (components/common/StatusBadge.tsx) has no entries
 * for the enquiry pipeline statuses, so it would fall back to an untranslated,
 * uncoloured badge. This is the same idea, scoped to this module's statuses.
 */
export function EnquiryStatusBadge({ status }: { status: EnquiryStatus }) {
  const t = useT();
  return (
    <Badge variant={STATUS_BADGE_VARIANT[status]} motionKey={status}>
      {t(STATUS_LABELS[status])}
    </Badge>
  );
}
