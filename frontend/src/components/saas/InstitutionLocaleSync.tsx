import React from 'react';
import { useAuthStore } from '@/store/authStore';
import { useLocaleStore } from '@/i18n';
import { useInstitutionSettings } from './saas.api';

/**
 * Invisible. Mounted once in the app header: loads the institution's locale
 * defaults and applies them to useLocaleStore — useLocaleStore itself skips
 * language/numerals/date/time zone when the user has an explicit choice, so
 * a personal preference is never overridden. Currency always follows the
 * institution. A bare SUPER_ADMIN (no institution) is skipped.
 */
export const InstitutionLocaleSync: React.FC = () => {
  const institutionId = useAuthStore((s) => s.user?.institutionId);
  const { data } = useInstitutionSettings(Boolean(institutionId));
  const apply = useLocaleStore((s) => s.applyInstitutionDefaults);

  React.useEffect(() => {
    if (!data) return;
    apply({
      lang: data.defaultLanguage === 'bn' ? 'bn' : 'en',
      numerals: data.numeralSystem === 'beng' ? 'beng' : 'latn',
      timeZone: data.timezone || 'Asia/Dhaka',
      dateFormat: data.dateFormat || 'D MMM YYYY',
      currency: data.currency || 'BDT',
    });
  }, [data, apply]);

  return null;
};

export default InstitutionLocaleSync;
