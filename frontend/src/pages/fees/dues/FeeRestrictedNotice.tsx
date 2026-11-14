import React from 'react';
import { Link } from 'react-router-dom';
import { Lock, Phone, Mail } from 'lucide-react';
import { Button, Modal } from '@/components/ui';
import { useT } from '@/i18n';
import { FEE_RESTRICTED_EVENT } from '@/api/client';
import { useAuthStore } from '@/store/authStore';

// =============================================================================
// P4: the friendly "Fees due — contact the school office" screen. Opens on
// any 403 FEE_RESTRICTED (results, report card, ID card, …). Mounted once in
// the app layout. Staff never see it (the server never restricts staff).
// =============================================================================

interface Detail {
  message?: string;
  errors?: { feature?: string; contact?: { school?: string; phone?: string | null; email?: string | null; note?: string | null } };
}

const FEATURE_LABEL: Record<string, string> = {
  RESULTS: 'Results and report cards',
  ADMIT_CARD: 'Admit card',
  ID_CARD: 'ID card',
  ONLINE_EXAM: 'Online exam',
  PORTAL_LOGIN: 'Portal sign-in',
};

export const FeesDueScreen: React.FC<{ feature?: string; contact?: NonNullable<Detail['errors']>['contact']; onClose?: () => void }> = ({ feature, contact, onClose }) => {
  const t = useT();
  const role = useAuthStore((s) => s.user?.role);
  return (
    <div className="text-center space-y-3 py-2">
      <div className="mx-auto w-14 h-14 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-200 flex items-center justify-center">
        <Lock className="w-7 h-7" aria-hidden />
      </div>
      <h2 className="text-lg font-bold text-slate-900 dark:text-white">{t('Fees due — contact the school office')}</h2>
      <p className="text-sm text-slate-700 dark:text-slate-200">
        {feature ? t('{feature} is not available until the school fees are paid.', { feature: t(FEATURE_LABEL[feature] ?? feature) }) : t('This is not available until the school fees are paid.')}
      </p>
      {contact?.note && <p className="text-sm text-slate-600 dark:text-slate-300">{contact.note}</p>}
      {(contact?.phone || contact?.email) && (
        <div className="flex flex-col sm:flex-row justify-center gap-2 text-sm">
          {contact.phone && <a className="inline-flex items-center justify-center gap-1.5 underline text-primary-700 dark:text-primary-300 min-h-[40px]" href={`tel:${contact.phone}`}><Phone className="w-4 h-4" aria-hidden />{contact.phone}</a>}
          {contact.email && <a className="inline-flex items-center justify-center gap-1.5 underline text-primary-700 dark:text-primary-300 min-h-[40px]" href={`mailto:${contact.email}`}><Mail className="w-4 h-4" aria-hidden />{contact.email}</a>}
        </div>
      )}
      <div className="flex flex-col sm:flex-row justify-center gap-2 pt-1">
        {(role === 'GUARDIAN' || role === 'STUDENT') && (
          <Link to="/fees" onClick={onClose} className="inline-flex items-center justify-center rounded-lg bg-[#c2550a] hover:bg-[#a84909] text-white font-semibold px-4 min-h-[40px]">{t('See my fees')}</Link>
        )}
        {onClose && <Button variant="secondary" onClick={onClose}>{t('Close')}</Button>}
      </div>
    </div>
  );
};

export const FeeRestrictedNotice: React.FC = () => {
  const [detail, setDetail] = React.useState<Detail | null>(null);
  const [open, setOpen] = React.useState(false);
  React.useEffect(() => {
    const on = (e: Event) => {
      setDetail(((e as CustomEvent).detail as Detail) ?? {});
      setOpen(true);
    };
    window.addEventListener(FEE_RESTRICTED_EVENT, on);
    return () => window.removeEventListener(FEE_RESTRICTED_EVENT, on);
  }, []);
  if (!open) return null;
  return (
    <Modal isOpen onClose={() => setOpen(false)} size="sm" hideCloseButton>
      <FeesDueScreen feature={detail?.errors?.feature} contact={detail?.errors?.contact} onClose={() => setOpen(false)} />
    </Modal>
  );
};

export default FeeRestrictedNotice;
