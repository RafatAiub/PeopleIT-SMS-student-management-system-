import React from 'react';
import { AlertTriangle, CheckCircle2, LayoutTemplate, Palette, Save } from 'lucide-react';
import toast from 'react-hot-toast';
import { Card, CardHeader, Button, Badge, Modal, Select, Alert } from '@/components/ui';
import { useT, useLocale } from '@/i18n';
import { cn } from '@/lib/cn';
import { SITE_TEMPLATES, TemplateThumbnail, templateApplyPayload, type SiteTemplate as Template } from '@/site/templates';
import { SITE_FONTS, SITE_RADII, checkThemeContrast, normaliseTheme, readableTextOn } from '@/site/theme';
import type { SiteTheme as BlockTheme } from '@/site/types';
import { useApplyTemplate, useUpdateSite } from '../sites.queries';
import { isHexColor } from '../siteUtils';
import type { ApplyMode, SiteMeResponse } from '../sites.types';

const ApplyTemplateModal: React.FC<{ tpl: Template | null; onClose: () => void; hasPages: boolean }> = ({ tpl, onClose, hasPages }) => {
  const t = useT();
  const apply = useApplyTemplate();
  const [mode, setMode] = React.useState<ApplyMode>('merge');
  React.useEffect(() => setMode(hasPages ? 'merge' : 'replace'), [tpl, hasPages]);
  if (!tpl) return null;
  const pages = tpl.pages;

  const onApply = () =>
    apply.mutate(
      // Theme and menus are sent too; the backend only applies them in replace mode.
      { ...templateApplyPayload(tpl, mode), theme: tpl.theme, navigation: tpl.navigation },
      {
        onSuccess: () => {
          toast.success(t('Template applied. Pages were saved as drafts.'));
          onClose();
        },
      }
    );

  return (
    <Modal
      isOpen
      onClose={apply.isPending ? () => {} : onClose}
      title={t('Apply “{name}”?', { name: tpl.name })}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={apply.isPending}>{t('Cancel')}</Button>
          <Button variant={mode === 'replace' ? 'danger' : 'primary'} onClick={onApply} isLoading={apply.isPending}>
            {mode === 'replace' ? t('Replace my pages') : t('Add template pages')}
          </Button>
        </>
      }
    >
      <div className="space-y-4 text-sm">
        <p className="text-slate-600 dark:text-slate-300">
          {t('This template has {n} pages: {list}.', { n: pages.length, list: pages.map((p) => p.title).join(', ') })}
        </p>
        <fieldset className="space-y-3">
          <legend className="field-label">{t('How should it be applied?')}</legend>
          <label className={cn('flex items-start gap-3 rounded-lg border p-3 cursor-pointer', mode === 'merge' ? 'border-primary-500 bg-primary-50/50 dark:bg-primary-500/10' : 'border-slate-200 dark:border-white/10')}>
            <input type="radio" name="tpl-mode" className="mt-1 accent-primary-600" checked={mode === 'merge'} onChange={() => setMode('merge')} />
            <span>
              <span className="font-semibold block">{t('Merge — keep what I have')}</span>
              <span className="text-slate-600 dark:text-slate-400">{t('Adds only the pages whose address you don’t already use. Your existing pages, design colours and menus stay as they are.')}</span>
            </span>
          </label>
          <label className={cn('flex items-start gap-3 rounded-lg border p-3 cursor-pointer', mode === 'replace' ? 'border-red-500 bg-red-50/50 dark:bg-red-500/10' : 'border-slate-200 dark:border-white/10')}>
            <input type="radio" name="tpl-mode" className="mt-1 accent-red-600" checked={mode === 'replace'} onChange={() => setMode('replace')} />
            <span>
              <span className="font-semibold block">{t('Replace — start fresh')}</span>
              <span className="text-slate-600 dark:text-slate-400">{t('Overwrites the drafts of pages with the same address, deletes your other pages (the home page is always kept), and switches to the template’s colours and menus. A version of every overwritten page is saved first.')}</span>
            </span>
          </label>
        </fieldset>
        <Alert tone="info">{t('Only drafts change. Your public site stays the same until you publish. Template text is sample text — replace it with your own.')}</Alert>
      </div>
    </Modal>
  );
};

const ContrastRow: React.FC<{ label: string; ratio: number }> = ({ label, ratio }) => {
  const ok = ratio >= 4.5;
  return (
    <li className="flex items-center gap-2 text-sm">
      {ok ? <CheckCircle2 className="w-4 h-4 text-emerald-600" aria-hidden /> : <AlertTriangle className="w-4 h-4 text-amber-600" aria-hidden />}
      <span className="flex-1">{label}</span>
      <span className={cn('tabular-nums font-medium', ok ? 'text-emerald-700 dark:text-emerald-300' : 'text-amber-700 dark:text-amber-300')}>{ratio.toFixed(2)}:1</span>
    </li>
  );
};

const ColorInput: React.FC<{ id: string; label: string; value: string; onChange: (v: string) => void }> = ({ id, label, value, onChange }) => {
  const [text, setText] = React.useState(value);
  React.useEffect(() => setText(value), [value]);
  return (
    <div className="flex flex-col">
      <label htmlFor={id} className="field-label">{label}</label>
      <div className="flex items-center gap-2">
        <input type="color" aria-label={label} value={isHexColor(value) && value.length === 7 ? value : '#000000'} onChange={(e) => onChange(e.target.value)} className="h-9 w-12 rounded-md border border-slate-300 dark:border-white/15 bg-transparent cursor-pointer p-0.5" />
        <input
          id={id}
          className="input-field font-mono uppercase w-32"
          value={text}
          maxLength={7}
          onChange={(e) => {
            const v = e.target.value.startsWith('#') ? e.target.value : `#${e.target.value}`;
            setText(v);
            if (isHexColor(v)) onChange(v.toLowerCase());
          }}
        />
      </div>
    </div>
  );
};

export const DesignTab: React.FC<{ me: SiteMeResponse }> = ({ me }) => {
  const t = useT();
  const { lang } = useLocale();
  const save = useUpdateSite();
  const initial = React.useCallback(() => normaliseTheme(me.site.theme), [me.site.theme]);
  const [theme, setTheme] = React.useState<BlockTheme>(initial);
  const [dirty, setDirty] = React.useState(false);
  const [applying, setApplying] = React.useState<Template | null>(null);
  React.useEffect(() => {
    setTheme(initial());
    setDirty(false);
  }, [initial]);

  const set = <K extends keyof BlockTheme>(k: K, v: BlockTheme[K]) => {
    setTheme((th) => ({ ...th, [k]: v }));
    setDirty(true);
  };
  const report = checkThemeContrast(theme);
  const onPrimaryText = readableTextOn(theme.primary);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader icon={<LayoutTemplate className="w-4 h-4" />} title={t('Templates')} description={t('Start from a ready-made design. You can change every block afterwards.')} />
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {SITE_TEMPLATES.map((tpl) => {
            const current = me.site.templateKey === tpl.key;
            const bn = lang === 'bn';
            const name = bn && tpl.nameBn ? tpl.nameBn : tpl.name;
            const description = bn && tpl.descriptionBn ? tpl.descriptionBn : tpl.description;
            return (
              <li key={tpl.key} className={cn('rounded-xl border overflow-hidden flex flex-col bg-white dark:bg-white/3', current ? 'border-primary-500 ring-1 ring-primary-500' : 'border-slate-200 dark:border-white/10')}>
                <div className="aspect-[16/10] bg-slate-100 dark:bg-white/5 overflow-hidden">
                  <TemplateThumbnail template={tpl} className="w-full h-full" />
                </div>
                <div className="p-4 flex-1 flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-slate-900 dark:text-slate-50">{name}</h3>
                    {current && <Badge variant="primary">{t('Current')}</Badge>}
                  </div>
                  <p className="text-sm text-slate-600 dark:text-slate-400 flex-1">{description}</p>
                  <p className="text-xs text-slate-500">{t('{n} pages', { n: tpl.pages.length })}</p>
                  <Button variant={current ? 'secondary' : 'outline'} size="sm" onClick={() => setApplying(tpl)}>
                    {current ? t('Re-apply') : t('Use this template')}
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      </Card>

      <Card>
        <CardHeader
          icon={<Palette className="w-4 h-4" />}
          title={t('Theme')}
          description={t('Colours, font and corner style for the whole site.')}
          actions={
            <Button
              leftIcon={<Save className="w-4 h-4" />}
              disabled={!dirty}
              isLoading={save.isPending}
              onClick={() => save.mutate({ theme: theme as never }, { onSuccess: () => { setDirty(false); toast.success(t('Theme saved. Publish the site to make it public.')); } })}
            >
              {t('Save theme')}
            </Button>
          }
        />
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-4">
            <div className="flex flex-wrap gap-4">
              <ColorInput id="site-theme-primary" label={t('Primary colour')} value={theme.primary} onChange={(v) => set('primary', v)} />
              <ColorInput id="site-theme-accent" label={t('Accent colour')} value={theme.accent} onChange={(v) => set('accent', v)} />
            </div>
            <Select id="site-theme-font" label={t('Font')} value={theme.font} onChange={(e) => set('font', e.target.value as BlockTheme['font'])} options={SITE_FONTS.map((f) => ({ value: f.key, label: f.label }))} />
            <Select
              id="site-theme-radius"
              label={t('Corners')}
              value={theme.radius}
              onChange={(e) => set('radius', e.target.value as BlockTheme['radius'])}
              options={Object.keys(SITE_RADII).map((r) => ({ value: r, label: t({ none: 'Square', sm: 'Slightly rounded', md: 'Rounded', lg: 'More rounded', xl: 'Very rounded' }[r] ?? r) }))}
            />
            <Select
              id="site-theme-mode"
              label={t('Colour mode')}
              value={theme.mode}
              onChange={(e) => set('mode', e.target.value as BlockTheme['mode'])}
              options={[{ value: 'light', label: t('Light') }, { value: 'dark', label: t('Dark') }]}
            />
          </div>
          <div className="space-y-4">
            <div
              className="rounded-xl border border-slate-200 dark:border-white/10 p-5 space-y-3"
              style={{ background: theme.mode === 'dark' ? '#0b1220' : '#ffffff', borderRadius: SITE_RADII[theme.radius] }}
              aria-label={t('Theme preview')}
            >
              <p className="text-lg font-semibold" style={{ color: theme.mode === 'dark' ? '#f8fafc' : '#0f172a' }}>{t('Sample heading')}</p>
              <p className="text-sm" style={{ color: theme.primary }}>{t('A link in your primary colour')}</p>
              <div className="flex gap-2 flex-wrap">
                <span className="px-4 py-2 text-sm font-semibold" style={{ background: theme.primary, color: onPrimaryText, borderRadius: SITE_RADII[theme.radius] }}>{t('Apply now')}</span>
                <span className="px-4 py-2 text-sm font-semibold" style={{ background: theme.accent, color: readableTextOn(theme.accent), borderRadius: SITE_RADII[theme.radius] }}>{t('Accent')}</span>
              </div>
            </div>
            <div>
              <p className="field-label">{t('Contrast check (WCAG AA needs 4.5:1)')}</p>
              <ul className="space-y-1.5">
                <ContrastRow label={t('Button text on primary')} ratio={report.onPrimary} />
                <ContrastRow label={t('Primary as link text on the page')} ratio={report.primaryOnBg} />
                <ContrastRow label={t('Text on accent')} ratio={report.onAccent} />
              </ul>
            </div>
            {!report.passes && (
              <Alert tone="warning" title={t('Some colours are hard to read')}>
                <ul className="list-disc ml-4 space-y-0.5">{report.warnings.map((w) => <li key={w}>{t(w)}</li>)}</ul>
              </Alert>
            )}
          </div>
        </div>
      </Card>

      <ApplyTemplateModal tpl={applying} onClose={() => setApplying(null)} hasPages={me.pages.some((p) => (p.slug !== '' || p.publishedAt))} />
    </div>
  );
};
