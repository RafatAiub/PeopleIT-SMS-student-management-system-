import React from 'react';
import { Globe2 } from 'lucide-react';
import { Select, Alert } from '@/components/ui';
import { useLocaleStore, type Lang, type Numerals, type DateFormat } from '@/i18n';

// A short, curated list — this product's primary market is Bangladesh, with
// a couple of neighbouring/common zones for institutions with overseas staff.
const TIME_ZONES = [
  { value: 'Asia/Dhaka', label: 'Dhaka (GMT+6)' },
  { value: 'Asia/Kolkata', label: 'Kolkata (GMT+5:30)' },
  { value: 'Asia/Kathmandu', label: 'Kathmandu (GMT+5:45)' },
  { value: 'Asia/Yangon', label: 'Yangon (GMT+6:30)' },
  { value: 'Asia/Dubai', label: 'Dubai (GMT+4)' },
  { value: 'UTC', label: 'UTC' },
];

const DATE_FORMATS: { value: DateFormat; label: string }[] = [
  { value: 'D MMM YYYY', label: '5 Jan 2026' },
  { value: 'DD/MM/YYYY', label: '05/01/2026' },
  { value: 'MM/DD/YYYY', label: '01/05/2026' },
  { value: 'YYYY-MM-DD', label: '2026-01-05' },
];

const LanguageRegionTab: React.FC = () => {
  const { lang, numerals, timeZone, dateFormat, setLang, setNumerals, setTimeZone, setDateFormat } = useLocaleStore();

  return (
    <div className="space-y-6">
      <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
        <Globe2 className="w-5 h-5 text-blue-500 dark:text-blue-400" />
        Language &amp; Region
      </h3>

      <Alert tone="info">
        Saved on this device. Institution-wide defaults need a backend setting (planned).
      </Alert>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Select
          id="locale-lang"
          label="Language"
          value={lang}
          onChange={(e) => setLang(e.target.value as Lang)}
          options={[
            { value: 'en', label: 'English' },
            { value: 'bn', label: 'বাংলা (Bangla)' },
          ]}
        />

        <Select
          id="locale-numerals"
          label="Numerals"
          value={numerals}
          onChange={(e) => setNumerals(e.target.value as Numerals)}
          options={[
            { value: 'latn', label: '1, 2, 3 (Latin)' },
            { value: 'beng', label: '১, ২, ৩ (Bangla)' },
          ]}
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
          options={TIME_ZONES}
        />
      </div>
    </div>
  );
};

export default LanguageRegionTab;
