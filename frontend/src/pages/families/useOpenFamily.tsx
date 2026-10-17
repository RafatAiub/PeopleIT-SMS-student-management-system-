import React from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Users } from 'lucide-react';
import { Button } from '@/components/ui';
import { useT } from '@/i18n';
import { apiErrorMessage, fetchFamilyIdForGuardian, fetchFamilyIdForStudent } from './families.api';

// =============================================================================
// T3 entry points (kept tiny so list pages don't pull in the profile view):
//   useOpenFamily()({ studentId } | { guardianId }) → navigates to /families/:id
//   <OpenFamilyButton studentId=… /> — a "Family" button for detail pages.
// =============================================================================

export function useOpenFamily() {
  const t = useT();
  const navigate = useNavigate();
  return React.useCallback(
    async (who: { studentId?: string; guardianId?: string }) => {
      try {
        const r = who.studentId ? await fetchFamilyIdForStudent(who.studentId) : await fetchFamilyIdForGuardian(who.guardianId as string);
        if (r.familyId) navigate(`/families/${r.familyId}`);
        else toast(t('No family yet — link a guardian first.'));
      } catch (err) {
        toast.error(apiErrorMessage(err, t('Could not open the family')));
      }
    },
    [navigate, t],
  );
}

export const OpenFamilyButton: React.FC<{ studentId?: string; guardianId?: string; size?: 'sm' | 'md'; variant?: 'secondary' | 'ghost' | 'outline' }> = ({
  studentId,
  guardianId,
  size = 'sm',
  variant = 'secondary',
}) => {
  const t = useT();
  const openFamily = useOpenFamily();
  const [busy, setBusy] = React.useState(false);
  const open = async () => {
    setBusy(true);
    await openFamily({ studentId, guardianId });
    setBusy(false);
  };
  return <Button size={size} variant={variant} leftIcon={<Users className="w-4 h-4" />} onClick={open} isLoading={busy}>{t('Family')}</Button>;
};
