import React from 'react';
import { Plus, Sparkles, Trash2 } from 'lucide-react';
import { Button, Input } from '@/components/ui';
import { useT } from '@/i18n';
import type { SiteHotline, SiteLinkItem, SiteTopBarLink } from '../sites.types';

/** Generic repeatable {label, labelBn?, url} list — used for important links, e-services and the top-bar login links. */
export const LinkListEditor: React.FC<{
  idPrefix: string;
  items: (SiteLinkItem | SiteTopBarLink)[];
  onChange: (items: SiteLinkItem[]) => void;
  max?: number;
  urlLabel?: string;
  addLabel?: string;
}> = ({ idPrefix, items, onChange, max, urlLabel, addLabel }) => {
  const t = useT();
  const normalised: SiteLinkItem[] = items.map((i) => ('url' in i ? i : { label: i.label, labelBn: i.labelBn, url: i.href }));
  const set = (i: number, patch: Partial<SiteLinkItem>) => onChange(normalised.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  const remove = (i: number) => onChange(normalised.filter((_, idx) => idx !== i));
  const add = () => onChange([...normalised, { label: '', url: '' }]);
  const atMax = typeof max === 'number' && normalised.length >= max;

  return (
    <div className="space-y-3">
      {normalised.map((item, i) => (
        <div key={i} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto] items-start rounded-lg border border-slate-200 dark:border-white/10 p-3">
          <Input id={`${idPrefix}-${i}-label`} label={t('Label')} value={item.label} onChange={(e) => set(i, { label: e.target.value })} />
          <Input id={`${idPrefix}-${i}-url`} label={urlLabel ?? t('Link')} placeholder="https:// or /page" value={item.url} onChange={(e) => set(i, { url: e.target.value })} />
          <Button type="button" variant="ghost" size="icon-sm" className="mt-6 text-red-600 dark:text-red-400" aria-label={t('Remove')} onClick={() => remove(i)}>
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" leftIcon={<Plus className="w-4 h-4" />} onClick={add} disabled={atMax}>
        {addLabel ?? t('Add link')}
      </Button>
      {atMax && <p className="field-hint">{t('Up to {n} links.', { n: max })}</p>}
    </div>
  );
};

/** BD preset: national emergency plus two blanks the school fills in (head teacher, office). */
const BD_HOTLINE_PRESET: SiteHotline[] = [
  { label: 'National emergency service', labelBn: 'জাতীয় জরুরি সেবা', phone: '999' },
  { label: 'Head teacher', labelBn: 'প্রধান শিক্ষক', phone: '' },
  { label: 'School office', labelBn: 'অফিস', phone: '' },
];

export const HotlinesEditor: React.FC<{ items: SiteHotline[]; onChange: (items: SiteHotline[]) => void }> = ({ items, onChange }) => {
  const t = useT();
  const set = (i: number, patch: Partial<SiteHotline>) => onChange(items.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  const remove = (i: number) => onChange(items.filter((_, idx) => idx !== i));
  const add = () => onChange([...items, { label: '', phone: '' }]);

  return (
    <div className="space-y-3">
      {items.map((item, i) => (
        <div key={i} className="grid gap-2 sm:grid-cols-[1fr_1fr_1fr_auto] items-start rounded-lg border border-slate-200 dark:border-white/10 p-3">
          <Input id={`hotline-${i}-label`} label={t('Label')} value={item.label} onChange={(e) => set(i, { label: e.target.value })} />
          <Input id={`hotline-${i}-labelBn`} label={t('Label (Bangla)')} lang="bn" value={item.labelBn ?? ''} onChange={(e) => set(i, { labelBn: e.target.value })} />
          <Input id={`hotline-${i}-phone`} label={t('Phone')} type="tel" value={item.phone} onChange={(e) => set(i, { phone: e.target.value })} />
          <Button type="button" variant="ghost" size="icon-sm" className="mt-6 text-red-600 dark:text-red-400" aria-label={t('Remove')} onClick={() => remove(i)}>
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      ))}
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" leftIcon={<Plus className="w-4 h-4" />} onClick={add}>{t('Add hotline')}</Button>
        {items.length === 0 && (
          <Button type="button" variant="ghost" size="sm" leftIcon={<Sparkles className="w-4 h-4" />} onClick={() => onChange(BD_HOTLINE_PRESET)}>
            {t('Use Bangladesh preset')}
          </Button>
        )}
      </div>
    </div>
  );
};
