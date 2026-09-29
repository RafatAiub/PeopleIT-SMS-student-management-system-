import React from 'react';
import { AlertTriangle, CheckCircle2, Image as ImageIcon, LayoutPanelTop, LayoutTemplate, Palette, Save } from 'lucide-react';
import toast from 'react-hot-toast';
import { Card, CardHeader, Button, Badge, Modal, Select, Input, Alert } from '@/components/ui';
import { useT, useLocale } from '@/i18n';
import { cn } from '@/lib/cn';
import { SITE_TEMPLATES, TemplateThumbnail, templateApplyPayload, type SiteTemplate as Template } from '@/site/templates';
import {
  FOOTER_STYLES, HEADER_STYLES, LAYOUT_MODES, PAGE_BACKGROUNDS,
  SITE_FONTS, SITE_RADII, checkThemeContrast, normaliseTheme, readableTextOn,
} from '@/site/theme';
import type { SiteFooterStyle, SiteHeaderStyle, SiteTheme as BlockTheme } from '@/site/types';
import { ImportWebsiteButton } from '../import/ImportWizard';
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

/** Tiny abstract mockup of a header chrome variant — helps pick a style without leaving the page. */
const HeaderStylePreview: React.FC<{ style: SiteHeaderStyle; primary: string }> = ({ style, primary }) => {
  const dot = <span className="w-2 h-2 rounded-full bg-slate-300 dark:bg-white/25" />;
  const bar = (h: string, className = '') => <div className={cn('rounded-sm', className)} style={{ height: h }} />;
  const body = (() => {
    switch (style) {
      case 'portal':
        return (
          <div className="flex flex-col gap-1 w-full">
            {bar('4px', 'w-full bg-slate-300 dark:bg-white/20')}
            <div className="flex items-center justify-between px-1">
              <span className="w-6 h-3 rounded-sm" style={{ background: primary }} />
              <div className="flex gap-1">{dot}{dot}{dot}</div>
            </div>
          </div>
        );
      case 'corporate':
        return (
          <div className="w-full rounded-sm px-1.5 py-1.5 flex items-center justify-between" style={{ background: '#0b1a3a' }}>
            <span className="w-5 h-2.5 rounded-sm bg-white/80" />
            <div className="flex gap-1.5">{[0, 1, 2].map((i) => <span key={i} className="w-2 h-2 rounded-full bg-white/40" />)}</div>
          </div>
        );
      case 'banner':
        return (
          <div className="w-full h-9 rounded-sm flex items-center justify-center" style={{ background: `linear-gradient(135deg, ${primary}, #00000022)` }}>
            <span className="w-8 h-2.5 rounded-sm bg-white/85" />
          </div>
        );
      case 'centered':
        return (
          <div className="flex flex-col items-center gap-1 w-full">
            <span className="w-6 h-3 rounded-sm" style={{ background: primary }} />
            <div className="flex gap-1.5">{dot}{dot}{dot}</div>
          </div>
        );
      case 'minimal':
        return (
          <div className="flex items-center justify-between w-full px-0.5">
            <span className="w-5 h-2.5 rounded-sm" style={{ background: primary }} />
            <div className="flex gap-1">{dot}{dot}</div>
          </div>
        );
      default:
        return (
          <div className="flex items-center justify-between w-full px-1 py-1 rounded-md bg-white/70 dark:bg-white/10 backdrop-blur">
            <span className="w-6 h-3 rounded-sm" style={{ background: primary }} />
            <div className="flex gap-1">{dot}{dot}{dot}</div>
          </div>
        );
    }
  })();
  return <div className="h-11 flex items-center justify-center rounded-md border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 px-2 py-1.5">{body}</div>;
};

/** Tiny abstract mockup of a footer chrome variant. */
const FooterStylePreview: React.FC<{ style: SiteFooterStyle }> = ({ style }) => {
  const col = <div className="flex-1 space-y-1"><span className="block w-full h-1 rounded-full bg-slate-300 dark:bg-white/20" /><span className="block w-2/3 h-1 rounded-full bg-slate-200 dark:bg-white/10" /></div>;
  const dark = style === 'corporate';
  const cols = style === 'corporate' || style === 'columns' ? 4 : style === 'portal' ? 3 : style === 'minimal' ? 1 : 3;
  return (
    <div className={cn('h-11 flex items-center gap-2 rounded-md border px-2', dark ? 'border-slate-700' : 'border-slate-200 dark:border-white/10')} style={{ background: dark ? '#0b1a3a' : undefined }}>
      {Array.from({ length: cols }).map((_, i) => (
        <div key={i} className="flex-1 space-y-1">
          <span className={cn('block w-full h-1 rounded-full', dark ? 'bg-white/25' : 'bg-slate-300 dark:bg-white/20')} />
          {cols > 1 && <span className={cn('block w-2/3 h-1 rounded-full', dark ? 'bg-white/15' : 'bg-slate-200 dark:bg-white/10')} />}
        </div>
      ))}
      {cols === 1 && col}
    </div>
  );
};

/** Small pattern swatch reusing the public site's own CSS classes (`.site-bg-*`), so the preview matches the real background exactly. */
const BackgroundPreview: React.FC<{ value: string; primary: string; accent: string }> = ({ value, primary, accent }) => {
  const isImage = /^https:\/\//i.test(value);
  return (
    <div
      className={cn('h-11 rounded-md border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 overflow-hidden bg-cover bg-center', !isImage && value !== 'none' && `site-bg-${value}`)}
      style={{ '--site-primary': primary, '--site-accent': accent, backgroundImage: isImage ? `url(${value})` : undefined } as React.CSSProperties}
    />
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
        <CardHeader
          icon={<LayoutTemplate className="w-4 h-4" />}
          title={t('Templates')}
          description={t('Start from a ready-made design, or bring in a site built elsewhere. You can change every block afterwards.')}
          actions={<ImportWebsiteButton me={me} />}
        />
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

      <Card>
        <CardHeader
          icon={<LayoutPanelTop className="w-4 h-4" />}
          title={t('Header, footer & layout')}
          description={t('Portal-style chrome for Bangladeshi school sites, or keep the modern default.')}
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
        <div className="grid gap-6 md:grid-cols-2">
          <div className="space-y-1.5">
            <Select
              id="site-theme-headerStyle"
              label={t('Header style')}
              value={theme.headerStyle ?? 'modern'}
              onChange={(e) => set('headerStyle', e.target.value as BlockTheme['headerStyle'])}
              options={HEADER_STYLES.map(([k, label]) => ({ value: k, label: t(label) }))}
            />
            <HeaderStylePreview style={(theme.headerStyle ?? 'modern') as SiteHeaderStyle} primary={theme.primary} />
          </div>
          <div className="space-y-1.5">
            <Select
              id="site-theme-footerStyle"
              label={t('Footer style')}
              value={theme.footerStyle ?? 'modern'}
              onChange={(e) => set('footerStyle', e.target.value as BlockTheme['footerStyle'])}
              options={FOOTER_STYLES.map(([k, label]) => ({ value: k, label: t(label) }))}
            />
            <FooterStylePreview style={(theme.footerStyle ?? 'modern') as SiteFooterStyle} />
          </div>
          <Select
            id="site-theme-layout"
            label={t('Page layout')}
            value={theme.layout ?? 'full'}
            onChange={(e) => set('layout', e.target.value as BlockTheme['layout'])}
            options={LAYOUT_MODES.map(([k, label]) => ({ value: k, label: t(label) }))}
            helperText={t('Boxed pairs well with a page background pattern below.')}
          />
          <div className="space-y-1.5">
            <Select
              id="site-theme-pageBackground"
              label={t('Page background')}
              value={/^https:\/\//i.test(theme.pageBackground ?? '') ? '__image' : (theme.pageBackground ?? 'none')}
              onChange={(e) => set('pageBackground', e.target.value === '__image' ? 'https://' : e.target.value)}
              options={[...PAGE_BACKGROUNDS.map(([k, label]) => ({ value: k, label: t(label) })), { value: '__image', label: t('Custom image URL') }]}
            />
            {/^https:\/\//i.test(theme.pageBackground ?? '') && (
              <Input
                id="site-theme-pageBackground-url"
                aria-label={t('Background image URL')}
                leftIcon={<ImageIcon className="w-4 h-4" />}
                placeholder="https://"
                value={theme.pageBackground ?? ''}
                onChange={(e) => set('pageBackground', e.target.value)}
              />
            )}
            <BackgroundPreview value={theme.pageBackground ?? 'none'} primary={theme.primary} accent={theme.accent} />
          </div>
        </div>
      </Card>

      <ApplyTemplateModal tpl={applying} onClose={() => setApplying(null)} hasPages={me.pages.some((p) => (p.slug !== '' || p.publishedAt))} />
    </div>
  );
};
