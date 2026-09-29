import React from 'react';
import { Save, Settings as SettingsIcon, Share2, Languages, BarChart3, ShieldCheck, Clock, Phone, Link2, Wrench, Award } from 'lucide-react';
import toast from 'react-hot-toast';
import { Card, CardHeader, Button, Input, Textarea, Checkbox, Select, Alert } from '@/components/ui';
import { useT } from '@/i18n';
import { useEntitlements } from '@/components/saas';
import { useUpdateSite } from '../sites.queries';
import type { SiteMeResponse, SiteSettings, SiteSocialLinks, SiteTopBarSettings } from '../sites.types';
import { MediaField } from '../media/MediaPicker';
import { HotlinesEditor, LinkListEditor } from './PortalSettingsFields';

const SOCIAL: { key: keyof SiteSocialLinks & string; label: string; placeholder: string }[] = [
  { key: 'facebook', label: 'Facebook', placeholder: 'https://facebook.com/yourschool' },
  { key: 'youtube', label: 'YouTube', placeholder: 'https://youtube.com/@yourschool' },
  { key: 'instagram', label: 'Instagram', placeholder: 'https://instagram.com/yourschool' },
  { key: 'linkedin', label: 'LinkedIn', placeholder: 'https://linkedin.com/school/yourschool' },
  { key: 'x', label: 'X (Twitter)', placeholder: 'https://x.com/yourschool' },
  { key: 'whatsapp', label: 'WhatsApp', placeholder: 'https://wa.me/8801XXXXXXXXX' },
];

const str = (v: unknown): string => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '');

function initial(s: SiteMeResponse['site']['settings']): SiteSettings {
  return {
    ...(s ?? {}),
    siteName: s?.siteName ?? '',
    logoUrl: s?.logoUrl ?? '',
    faviconUrl: s?.faviconUrl ?? '',
    social: { ...(s?.social ?? {}) },
    analyticsId: s?.analyticsId ?? '',
    defaultLanguage: s?.defaultLanguage ?? 'en',
    languages: s?.languages?.length ? s.languages : ['en'],
    liteMode: Boolean(s?.liteMode),
    publicResults: Boolean(s?.publicResults),
    showToppers: Boolean(s?.showToppers),
    topBar: {
      showDate: Boolean(s?.topBar?.showDate),
      showContact: s?.topBar?.showContact !== false,
      showSocial: s?.topBar?.showSocial !== false,
      loginLinks: s?.topBar?.loginLinks ?? [],
    },
    hotlines: s?.hotlines ?? [],
    importantLinks: s?.importantLinks ?? [],
    eServices: s?.eServices ?? [],
    publicResultSummary: Boolean(s?.publicResultSummary),
    publicFeeChart: Boolean(s?.publicFeeChart),
    publicLibrary: Boolean(s?.publicLibrary),
    publicTransport: Boolean(s?.publicTransport),
    hidePoweredBy: Boolean(s?.hidePoweredBy),
  };
}

export const SettingsTab: React.FC<{ me: SiteMeResponse }> = ({ me }) => {
  const t = useT();
  const update = useUpdateSite();
  const { isEnabled } = useEntitlements();
  const [form, setForm] = React.useState<SiteSettings>(() => initial(me.site.settings));
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const set = <K extends keyof SiteSettings>(k: K, v: SiteSettings[K]) => setForm((f) => ({ ...f, [k]: v }));
  const setTopBar = (patch: Partial<SiteTopBarSettings>) => setForm((f) => ({ ...f, topBar: { ...f.topBar, ...patch } }));
  const canRemoveBranding = isEnabled('website_remove_branding');

  React.useEffect(() => setForm(initial(me.site.settings)), [me.site.settings]);

  const toggleLang = (lang: string, on: boolean) => {
    const langs = on ? Array.from(new Set([...form.languages, lang])) : form.languages.filter((l) => l !== lang);
    setForm((f) => ({ ...f, languages: langs, defaultLanguage: langs.includes(f.defaultLanguage) ? f.defaultLanguage : langs[0] ?? 'en' }));
  };

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!form.siteName.trim()) errs.siteName = t('Enter the site name.');
    if (form.languages.length === 0) errs.languages = t('Choose at least one language.');
    for (const s of SOCIAL) {
      const v = form.social[s.key]?.trim();
      if (v && !/^https?:\/\/\S+$/i.test(v)) errs[`social.${s.key}`] = t('Enter a full link starting with https://');
    }
    if (form.analyticsId && !/^[A-Z0-9-]{3,40}$/i.test(form.analyticsId.trim())) errs.analyticsId = t('Use a measurement ID like G-XXXXXXXXXX.');
    const year = str(form.establishedYear);
    if (year && (Number(year) < 1800 || Number(year) > new Date().getFullYear())) errs.establishedYear = t('Enter a year between 1800 and this year.');
    setErrors(errs);
    if (Object.keys(errs).length) return;

    const social = Object.fromEntries(Object.entries(form.social).map(([k, v]) => [k, (v ?? '').trim()]).filter(([, v]) => v));
    update.mutate(
      {
        settings: {
          ...form,
          siteName: form.siteName.trim(),
          logoUrl: form.logoUrl?.trim() || '',
          faviconUrl: form.faviconUrl?.trim() || '',
          analyticsId: form.analyticsId?.trim() || '',
          siteNameBn: str(form.siteNameBn).trim(),
          tagline: str(form.tagline).trim(),
          taglineBn: str(form.taglineBn).trim(),
          footerText: str(form.footerText).trim(),
          footerTextBn: str(form.footerTextBn).trim(),
          establishedYear: year ? Number(year) : null,
          social,
          topBar: { ...form.topBar, loginLinks: (form.topBar?.loginLinks ?? []).filter((l) => l.label.trim() && l.href.trim()) },
          hotlines: (form.hotlines ?? []).filter((h) => h.label.trim() && h.phone.trim()),
          importantLinks: (form.importantLinks ?? []).filter((l) => l.label.trim() && l.url.trim()),
          eServices: (form.eServices ?? []).filter((l) => l.label.trim() && l.url.trim()),
        },
      },
      { onSuccess: () => toast.success(t('Website settings saved. Publish the site to make them public.')) }
    );
  };

  return (
    <form onSubmit={save} className="space-y-4" noValidate>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader icon={<SettingsIcon className="w-4 h-4" />} title={t('Identity')} />
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Input id="site-settings-name" label={t('Site name')} required value={form.siteName} onChange={(e) => set('siteName', e.target.value)} error={errors.siteName} />
              <Input id="site-settings-nameBn" label={t('Site name (Bangla)')} lang="bn" value={str(form.siteNameBn)} onChange={(e) => set('siteNameBn', e.target.value)} />
              <Input id="site-settings-tagline" label={t('Tagline')} value={str(form.tagline)} onChange={(e) => set('tagline', e.target.value)} />
              <Input id="site-settings-taglineBn" label={t('Tagline (Bangla)')} lang="bn" value={str(form.taglineBn)} onChange={(e) => set('taglineBn', e.target.value)} />
              <Input
                id="site-settings-established"
                label={t('Year established')}
                inputMode="numeric"
                value={str(form.establishedYear)}
                onChange={(e) => set('establishedYear', e.target.value.replace(/\D/g, '').slice(0, 4))}
                error={errors.establishedYear}
                helperText={t('Used by the “years of excellence” stat.')}
              />
            </div>
            <MediaField id="site-settings-logo" label={t('Logo')} value={form.logoUrl} onChange={(v) => set('logoUrl', v)} helperText={t('A transparent PNG or SVG works best.')} />
            <MediaField id="site-settings-favicon" label={t('Favicon')} value={form.faviconUrl} onChange={(v) => set('faviconUrl', v)} helperText={t('Square image, at least 64×64 pixels.')} />
          </div>
        </Card>

        <Card>
          <CardHeader icon={<Share2 className="w-4 h-4" />} title={t('Social links')} description={t('Shown in the footer. Leave blank to hide.')} />
          <div className="space-y-3">
            {SOCIAL.map((s) => (
              <Input
                key={s.key}
                id={`site-settings-social-${s.key}`}
                label={s.label}
                type="url"
                placeholder={s.placeholder}
                value={form.social[s.key] ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, social: { ...f.social, [s.key]: e.target.value } }))}
                error={errors[`social.${s.key}`]}
              />
            ))}
          </div>
        </Card>

        <Card>
          <CardHeader icon={<Languages className="w-4 h-4" />} title={t('Languages')} description={t('Visitors can switch between the languages you enable.')} />
          <fieldset className="space-y-3">
            <legend className="sr-only">{t('Enabled languages')}</legend>
            <Checkbox label="English" checked={form.languages.includes('en')} onChange={(e) => toggleLang('en', e.target.checked)} />
            <Checkbox label="বাংলা (Bangla)" checked={form.languages.includes('bn')} onChange={(e) => toggleLang('bn', e.target.checked)} />
            {errors.languages && <p className="field-error" role="alert">{errors.languages}</p>}
            <Select
              id="site-settings-default-lang"
              label={t('Default language')}
              value={form.defaultLanguage}
              onChange={(e) => set('defaultLanguage', e.target.value)}
              options={form.languages.map((l) => ({ value: l, label: l === 'bn' ? 'বাংলা (Bangla)' : 'English' }))}
            />
          </fieldset>
        </Card>

        <Card>
          <CardHeader icon={<ShieldCheck className="w-4 h-4" />} title={t('Features and privacy')} />
          <div className="space-y-4">
            <Checkbox
              label={t('Lite mode')}
              description={t('For slow connections: no animations, lazy images, system fonts and minimal scripts.')}
              checked={form.liteMode}
              onChange={(e) => set('liteMode', e.target.checked)}
            />
            <Checkbox
              label={t('Public results lookup')}
              description={t('Lets a student or guardian look up one published marksheet with roll/ID and date of birth. Rate-limited.')}
              checked={Boolean(form.publicResults)}
              onChange={(e) => set('publicResults', e.target.checked)}
            />
            <Checkbox
              label={t('Show toppers')}
              description={t('Shows merit lists with first name, last initial, class and GPA only.')}
              checked={Boolean(form.showToppers)}
              onChange={(e) => set('showToppers', e.target.checked)}
            />
            {(form.publicResults || form.showToppers) && (
              <Alert tone="info">{t('Only published results are ever shown. Turn these off at any time to hide them immediately after publishing.')}</Alert>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader icon={<Wrench className="w-4 h-4" />} title={t('Public website data')} description={t('Turn on the data-bound blocks visitors can see. Everything else stays off by default.')} />
          <div className="space-y-4">
            <Checkbox
              label={t('Results summary by class')}
              description={t('Pass rate and GPA-5 count per class — counts only, never student names or marks.')}
              checked={Boolean(form.publicResultSummary)}
              onChange={(e) => set('publicResultSummary', e.target.checked)}
            />
            <Checkbox
              label={t('Fee chart')}
              description={t('The published fee categories and amounts per class.')}
              checked={Boolean(form.publicFeeChart)}
              onChange={(e) => set('publicFeeChart', e.target.checked)}
            />
            <Checkbox
              label={t('Library catalogue')}
              description={t('Book title, author and availability — searchable.')}
              checked={Boolean(form.publicLibrary)}
              onChange={(e) => set('publicLibrary', e.target.checked)}
            />
            <Checkbox
              label={t('Transport routes')}
              description={t('Route names, fares and stop times only — never vehicle or driver information.')}
              checked={Boolean(form.publicTransport)}
              onChange={(e) => set('publicTransport', e.target.checked)}
            />
          </div>
        </Card>

        <Card>
          <CardHeader icon={<Clock className="w-4 h-4" />} title={t('Top bar')} description={t('The thin strip above the header on portal and corporate styles.')} />
          <div className="space-y-4">
            <Checkbox label={t('Show today’s date')} checked={Boolean(form.topBar?.showDate)} onChange={(e) => setTopBar({ showDate: e.target.checked })} />
            <Checkbox label={t('Show contact details')} checked={form.topBar?.showContact !== false} onChange={(e) => setTopBar({ showContact: e.target.checked })} />
            <Checkbox label={t('Show social icons')} checked={form.topBar?.showSocial !== false} onChange={(e) => setTopBar({ showSocial: e.target.checked })} />
            <div>
              <span className="field-label">{t('Login links')}</span>
              <LinkListEditor
                idPrefix="topbar-login"
                items={form.topBar?.loginLinks ?? []}
                max={4}
                urlLabel={t('Link')}
                addLabel={t('Add login link')}
                onChange={(items) => setTopBar({ loginLinks: items.map((i) => ({ label: i.label, labelBn: i.labelBn, href: i.url })) })}
              />
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader icon={<Phone className="w-4 h-4" />} title={t('Hotlines')} description={t('Phone numbers shown in a quick-dial grid on the website.')} />
          <HotlinesEditor items={form.hotlines ?? []} onChange={(items) => set('hotlines', items)} />
        </Card>

        <Card>
          <CardHeader icon={<Link2 className="w-4 h-4" />} title={t('Important links')} description={t('Shortcuts shown on the homepage — DSHE, board results, education office, etc.')} />
          <LinkListEditor idPrefix="important-links" items={form.importantLinks ?? []} onChange={(items) => set('importantLinks', items)} />
        </Card>

        <Card>
          <CardHeader icon={<Link2 className="w-4 h-4" />} title={t('E-services')} description={t('Links to online services — admission, result, fee payment portals, etc.')} />
          <LinkListEditor idPrefix="eservices" items={form.eServices ?? []} onChange={(items) => set('eServices', items)} />
        </Card>

        <Card>
          <CardHeader icon={<Award className="w-4 h-4" />} title={t('Branding')} />
          <Checkbox
            label={t('Remove “Powered by PeopleNIT” footer credit')}
            description={
              canRemoveBranding
                ? t('Hides the footer credit on your public website.')
                : t('Available on paid plans. Ask your institution administrator to upgrade to remove this.')
            }
            checked={Boolean(form.hidePoweredBy)}
            disabled={!canRemoveBranding}
            onChange={(e) => set('hidePoweredBy', e.target.checked)}
          />
        </Card>

        <Card>
          <CardHeader icon={<SettingsIcon className="w-4 h-4" />} title={t('Footer text')} description={t('A short line shown at the bottom of every page.')} />
          <div className="space-y-3">
            <Textarea id="site-settings-footer" label={t('Footer text')} rows={2} value={str(form.footerText)} onChange={(e) => set('footerText', e.target.value)} />
            <Textarea id="site-settings-footerBn" label={t('Footer text (Bangla)')} lang="bn" rows={2} value={str(form.footerTextBn)} onChange={(e) => set('footerTextBn', e.target.value)} />
          </div>
        </Card>

        <Card>
          <CardHeader icon={<BarChart3 className="w-4 h-4" />} title={t('Analytics')} />
          <Input
            id="site-settings-analytics"
            label={t('Google Analytics measurement ID')}
            placeholder="G-XXXXXXXXXX"
            value={form.analyticsId ?? ''}
            onChange={(e) => set('analyticsId', e.target.value)}
            error={errors.analyticsId}
            helperText={t('Optional. Leave blank for no analytics.')}
            containerClassName="max-w-md"
          />
        </Card>
      </div>

      <div className="flex justify-end">
        <Button type="submit" isLoading={update.isPending} leftIcon={<Save className="w-4 h-4" />}>{t('Save settings')}</Button>
      </div>
    </form>
  );
};
