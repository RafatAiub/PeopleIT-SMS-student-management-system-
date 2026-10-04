import React from 'react';
import { RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui';
import { SiteRuntimeProvider } from '@/site/runtime';
import { SiteRoot } from '@/site/SiteRoot';
import { normaliseSettings, normaliseTheme } from '@/site/theme';
import { ModuleRenderer } from '@/site/modules/CustomModule';
import { defaultValues, fieldLabel, optionList, type ModuleDef, type ModuleField, type Rec } from '@/site/modules/types';
import type { PublicInstitution, SiteLang } from '@/site/types';
import type { SiteMeResponse } from '../sites.types';
import { useInstitutionInfo, usePreviewToken } from '../sites.queries';
import { useMT } from './modules.i18n';

// =============================================================================
// Module editor live preview (W16): the draft definition rendered by the real
// renderer (ModuleRenderer) inside the site's theme, with sample values and
// REAL collection data (public API + preview token).
// =============================================================================

const inputCls = 'w-full rounded-md border border-slate-300 dark:border-white/15 bg-white dark:bg-slate-900 px-2 py-1 text-sm text-slate-900 dark:text-slate-100';

/** Simple form for scalar sample values (repeaters and collections use their defaults / real data). */
function SampleForm({ fields, values, onChange, lang }: { fields: ModuleField[]; values: Rec; onChange: (v: Rec) => void; lang: SiteLang }) {
  const set = (k: string, v: unknown) => onChange({ ...values, [k]: v });
  const rows = fields.filter((f) => f.type !== 'repeater' && f.type !== 'collection');
  if (!rows.length) return null;
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {rows.map((f) => {
        const key = f.bn && lang === 'bn' && ['text', 'textarea', 'richtext'].includes(f.type) ? `${f.key}Bn` : f.key;
        const v = values[key];
        const label = `${fieldLabel(f)}${key.endsWith('Bn') && key !== f.key ? ' (বাংলা)' : ''}`;
        let input: React.ReactNode;
        if (f.type === 'boolean') input = <input type="checkbox" checked={v === true} onChange={(e) => set(key, e.target.checked)} />;
        else if (f.type === 'number') input = <input className={inputCls} type="number" value={typeof v === 'number' ? v : ''} onChange={(e) => set(key, e.target.value === '' ? null : Number(e.target.value))} />;
        else if (f.type === 'select') input = (
          <select className={inputCls} value={typeof v === 'string' ? v : ''} onChange={(e) => set(key, e.target.value)}>
            {optionList(f).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        );
        else if (f.type === 'textarea' || f.type === 'richtext') input = <textarea className={inputCls} rows={2} value={typeof v === 'string' ? v : ''} onChange={(e) => set(key, e.target.value)} />;
        else input = <input className={inputCls} type={f.type === 'date' ? 'date' : f.type === 'color' ? 'color' : 'text'} value={typeof v === 'string' ? v : ''} onChange={(e) => set(key, e.target.value)} />;
        return (
          <label key={f.key} className="flex flex-col gap-1 text-xs font-medium text-slate-600 dark:text-slate-300">
            {label}
            {input}
          </label>
        );
      })}
    </div>
  );
}

export function ModulePreview({ def, me }: { def: ModuleDef; me: SiteMeResponse }) {
  const mt = useMT();
  const [lang, setLang] = React.useState<SiteLang>('en');
  const [overrides, setOverrides] = React.useState<Rec>({});
  const tokenQ = usePreviewToken(true);
  const instQ = useInstitutionInfo();
  const settings = React.useMemo(() => normaliseSettings(me.site.settings), [me.site.settings]);
  const theme = React.useMemo(() => normaliseTheme(me.site.theme), [me.site.theme]);
  const institution: PublicInstitution | null = instQ.data
    ? { name: instQ.data.name ?? '', logo: instQ.data.logoUrl ?? undefined, contact: { email: instQ.data.contactEmail ?? undefined, phone: instQ.data.contactPhone ?? undefined, address: instQ.data.address ?? undefined } }
    : null;
  const values = React.useMemo(() => ({ ...defaultValues(def.fields), ...overrides }), [def.fields, overrides]);
  const previewToken = tokenQ.data?.token ?? me.previewToken ?? null;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-slate-500 dark:text-slate-400">{mt('Preview uses real school data from your site.')}</p>
        <div className="flex items-center gap-1.5">
          <div className="inline-flex overflow-hidden rounded-lg border border-slate-300 dark:border-white/15" role="group" aria-label={mt('Preview language')}>
            {(['en', 'bn'] as SiteLang[]).map((l) => (
              <button key={l} type="button" aria-pressed={lang === l} onClick={() => setLang(l)}
                className={`h-8 px-2.5 text-xs font-semibold ${lang === l ? 'bg-primary-600 text-white' : 'bg-white dark:bg-transparent text-slate-700 dark:text-slate-200'}`}>
                {l === 'en' ? 'EN' : 'বাং'}
              </button>
            ))}
          </div>
          <Button size="icon-sm" variant="ghost" aria-label="Reset sample values" title="Reset sample values" onClick={() => setOverrides({})}><RotateCcw className="w-4 h-4" /></Button>
        </div>
      </div>
      {def.js.trim() && <p className="text-xs text-slate-500">{mt('This module has JavaScript, so it runs in a safe sandbox frame.')}</p>}
      <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-white/10">
        <SiteRuntimeProvider
          siteId={me.site.id}
          lang={lang}
          mode="editor"
          institution={institution}
          settings={settings}
          theme={theme}
          subdomain={me.site.subdomain}
          basePath={`/s/${me.site.subdomain}`}
          previewToken={previewToken}
        >
          <SiteRoot className="min-h-[160px]">
            <ModuleRenderer def={def} values={values} instanceId={`preview-${def.key || 'module'}`} wrap pad="sm" showErrors />
          </SiteRoot>
        </SiteRuntimeProvider>
      </div>
      <details className="rounded-lg border border-slate-200 dark:border-white/10 p-2">
        <summary className="cursor-pointer text-xs font-semibold text-slate-700 dark:text-slate-200">{mt('Sample values')}</summary>
        <div className="pt-2"><SampleForm fields={def.fields} values={values} onChange={setOverrides} lang={lang} /></div>
      </details>
    </div>
  );
}
