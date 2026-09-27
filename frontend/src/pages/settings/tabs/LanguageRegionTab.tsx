import React from 'react';
import { Globe2, RotateCcw } from 'lucide-react';
import toast from 'react-hot-toast';
import { Select, Alert, Button } from '@/components/ui';
import { useAuthStore } from '@/store/authStore';
import { isExplicitChoice, useLocaleStore, useT, type Lang, type Numerals, type DateFormat } from '@/i18n';
import { DATE_FORMATS, LANGUAGE_OPTIONS, NUMERAL_OPTIONS, TIME_ZONES } from './localeOptions';
import { InstitutionDefaultsCard } from './InstitutionDefaultsCard';

const LanguageRegionTab: React.FC = () => {
  const t = useT();
  const locale = useLocaleStore();
  const { lang, numerals, timeZone, dateFormat, setLang, setNumerals, setTimeZone, setDateFormat } = locale;
  const user = useAuthStore((s) => s.user);
  const isAdmin = (user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN') && Boolean(user?.institutionId);
  const followsInstitution = !isExplicitChoice(locale);

  return (
    <div className="space-y-6">
      <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
        <Globe2 className="w-5 h-5 text-blue-500 dark:text-blue-400" />
        Language &amp; Region
      </h3>

      <Alert
        tone="info"
        action={
          !followsInstitution && locale.institutionDefaults ? (
            <Button
              size="sm"
              variant="outline"
              leftIcon={<RotateCcw className="w-4 h-4" />}
              onClick={() => {
                locale.resetToInstitutionDefaults();
                toast.success(t('Now following your institution’s defaults'));
              }}
            >
              {t('Use institution defaults')}
            </Button>
          ) : undefined
        }
      >
        {followsInstitution
          ? t('Your preferences follow your institution’s defaults. Changing anything below saves a personal preference on this device.')
          : t('Your personal preference is saved on this device and overrides your institution’s defaults.')}
      </Alert>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Select
          id="locale-lang"
          label="Language"
          value={lang}
          onChange={(e) => setLang(e.target.value as Lang)}
          options={LANGUAGE_OPTIONS}
        />

        <Select
          id="locale-numerals"
          label="Numerals"
          value={numerals}
          onChange={(e) => setNumerals(e.target.value as Numerals)}
          options={NUMERAL_OPTIONS}
        />

        <Select
          id="locale-dateFormat"
          label="Date format"
          value={dateFormat}
          onChange={(e) => setDateFormat(e.target.value as DateFormat)}
          options={DATE_FORMATS}
        />

        <Select
          id="locale-timeZone"
          label="Time zone"
          value={timeZone}
          onChange={(e) => setTimeZone(e.target.value)}
          options={TIME_ZONES.some((z) => z.value === timeZone) ? TIME_ZONES : [...TIME_ZONES, { value: timeZone, label: timeZone }]}
        />
      </div>

      {isAdmin && <InstitutionDefaultsCard />}
    </div>
  );
};

export default LanguageRegionTab;
