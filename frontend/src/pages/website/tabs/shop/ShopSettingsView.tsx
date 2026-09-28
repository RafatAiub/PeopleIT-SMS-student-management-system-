import React from 'react';
import { Save, Settings as SettingsIcon, Truck, CreditCard } from 'lucide-react';
import toast from 'react-hot-toast';
import { Card, CardHeader, Button, Input, Checkbox, Badge, Alert, Skeleton } from '@/components/ui';
import { useT } from '@/i18n';
import { useUpdateSite, useCommerceSummary } from '../../sites.queries';
import type { ShopSettings, SiteMeResponse } from '../../sites.types';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function initial(s: SiteMeResponse['site']['settings']): ShopSettings {
  const shop = s?.shop;
  return {
    enabled: Boolean(shop?.enabled),
    currency: 'BDT',
    shippingFee: shop?.shippingFee ?? 0,
    freeShippingOver: shop?.freeShippingOver ?? null,
    codEnabled: shop?.codEnabled ?? true,
    notifyEmails: shop?.notifyEmails ?? [],
    termsUrl: shop?.termsUrl ?? '',
  };
}

export const ShopSettingsView: React.FC<{ me: SiteMeResponse }> = ({ me }) => {
  const t = useT();
  const update = useUpdateSite();
  const summary = useCommerceSummary();
  const [form, setForm] = React.useState<ShopSettings>(() => initial(me.site.settings));
  const [emailsText, setEmailsText] = React.useState(() => initial(me.site.settings).notifyEmails.join(', '));
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  React.useEffect(() => {
    const init = initial(me.site.settings);
    setForm(init);
    setEmailsText(init.notifyEmails.join(', '));
  }, [me.site.settings]);

  const set = <K extends keyof ShopSettings>(k: K, v: ShopSettings[K]) => setForm((f) => ({ ...f, [k]: v }));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (form.shippingFee < 0) errs.shippingFee = t('Enter a valid amount.');
    if (form.freeShippingOver != null && form.freeShippingOver < 0) errs.freeShippingOver = t('Enter a valid amount.');
    const emails = emailsText.split(/[,\s]+/).map((s) => s.trim()).filter(Boolean);
    const bad = emails.find((m) => !EMAIL_RE.test(m));
    if (bad) errs.notifyEmails = t('“{email}” is not a valid email address.', { email: bad });
    if (form.termsUrl && !/^https?:\/\/\S+$/i.test(form.termsUrl)) errs.termsUrl = t('Enter a full https:// address.');
    setErrors(errs);
    if (Object.keys(errs).length) return;

    update.mutate(
      // Spread the site's existing settings first — `PUT /me` replaces the whole settings object.
      { settings: { ...me.site.settings, shop: { ...form, notifyEmails: emails, termsUrl: form.termsUrl?.trim() || undefined } } },
      { onSuccess: () => toast.success(t('Shop settings saved. Publish the site to make them public.')) }
    );
  };

  const gateways = summary.data?.gateways ?? [];

  return (
    <form onSubmit={submit} className="space-y-4">
      <Card>
        <CardHeader icon={<SettingsIcon className="w-4 h-4" />} title={t('Shop')} description={t('Turn the online shop on for your website (/shop).')} />
        <Checkbox label={t('Enable the shop')} description={t('When off, /shop is hidden and no products can be bought.')} checked={form.enabled} onChange={(e) => set('enabled', e.target.checked)} />
      </Card>

      <Card>
        <CardHeader icon={<Truck className="w-4 h-4" />} title={t('Shipping')} description={t('Applies only to orders with at least one physical product.')} />
        <div className="grid gap-3 sm:grid-cols-2">
          <Input id="shop-shipping-fee" label={t('Shipping fee')} inputMode="decimal" value={String(form.shippingFee)} error={errors.shippingFee} onChange={(e) => set('shippingFee', Number(e.target.value.replace(/[^0-9.]/g, '')) || 0)} />
          <Input
            id="shop-free-shipping"
            label={t('Free shipping over')}
            inputMode="decimal"
            value={form.freeShippingOver != null ? String(form.freeShippingOver) : ''}
            error={errors.freeShippingOver}
            helperText={t('Leave blank to never waive shipping.')}
            onChange={(e) => { const v = e.target.value.replace(/[^0-9.]/g, ''); set('freeShippingOver', v ? Number(v) : null); }}
          />
        </div>
        <Checkbox label={t('Allow cash on delivery (COD)')} description={t('Not available for orders that include a course.')} checked={form.codEnabled} onChange={(e) => set('codEnabled', e.target.checked)} className="mt-4" />
      </Card>

      <Card>
        <CardHeader icon={<CreditCard className="w-4 h-4" />} title={t('Payment gateways')} description={t('Configured on the server. Contact your platform operator to add a live gateway.')} />
        {summary.isLoading ? (
          <Skeleton className="h-16" />
        ) : gateways.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">{t('No gateways reported yet.')}</p>
        ) : (
          <ul className="space-y-2">
            {gateways.map((g) => (
              <li key={g.gateway} className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 dark:border-white/10 px-3 py-2">
                <span className="font-medium text-sm text-slate-800 dark:text-slate-100">{g.label}</span>
                <span className="flex items-center gap-1.5">
                  {g.live && <Badge variant="success">{t('Live')}</Badge>}
                  {g.demo && <Badge variant="warning">{t('Demo')}</Badge>}
                  {!g.available && <Badge variant="neutral">{t('Unavailable')}</Badge>}
                </span>
              </li>
            ))}
          </ul>
        )}
        {gateways.some((g) => g.demo) && (
          <Alert tone="warning" className="mt-3">{t('Demo gateways simulate payment without moving real money — useful for testing checkout.')}</Alert>
        )}
      </Card>

      <Card>
        <CardHeader title={t('Notifications')} description={t('Get an email whenever a new order comes in.')} />
        <Input
          id="shop-notify-emails"
          label={t('Notify these emails')}
          placeholder="office@school.edu.bd, principal@school.edu.bd"
          value={emailsText}
          error={errors.notifyEmails}
          helperText={t('Separate several addresses with commas.')}
          onChange={(e) => setEmailsText(e.target.value)}
        />
        <Input id="shop-terms-url" label={t('Terms & refund policy link')} className="mt-3" value={form.termsUrl ?? ''} error={errors.termsUrl} onChange={(e) => set('termsUrl', e.target.value)} helperText={t('Optional. Shown at checkout.')} />
      </Card>

      <div className="flex justify-end">
        <Button type="submit" isLoading={update.isPending} leftIcon={<Save className="w-4 h-4" />}>{t('Save shop settings')}</Button>
      </div>
    </form>
  );
};
