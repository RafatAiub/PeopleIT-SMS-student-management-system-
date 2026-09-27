import React from 'react';
import { Languages } from 'lucide-react';
import { useLocaleStore } from '@/i18n';

/**
 * EN / বাংলা toggle for the standalone public pages (apply / admission /
 * demo request), which don't sit inside AuthShell. Same behaviour as
 * AuthShell's switcher: flips the persisted locale preference, no new API
 * contract involved.
 */
export function LanguageToggle() {
  const { lang, setLang } = useLocaleStore();
  const next = lang === 'en' ? 'bn' : 'en';
  return (
    <button
      type="button"
      onClick={() => setLang(next)}
      className="absolute top-4 right-4 sm:top-6 sm:right-6 z-20 inline-flex items-center gap-1.5 rounded-full border border-slate-200 dark:border-white/10 bg-white/90 dark:bg-surface-900/80 backdrop-blur px-3 py-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300 shadow-sm hover:border-slate-300 dark:hover:border-white/20 transition-colors"
      aria-label={`Language: ${lang === 'en' ? 'English' : 'বাংলা'}`}
      title="Change language"
    >
      <Languages className="w-3.5 h-3.5" />
      {lang === 'en' ? 'বাংলা' : 'EN'}
    </button>
  );
}
