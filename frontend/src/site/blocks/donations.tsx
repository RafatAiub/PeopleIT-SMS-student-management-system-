/**
 * T1 donations blocks: Donate (online giving form) and CampaignProgress.
 * Both are bound to the `islamic.donations` module in config.tsx
 * (BLOCK_MODULES): hidden from the palette and render nothing publicly while
 * the school has the module off. Data: `GET /public/sites/:id/donations/options`.
 */
import { useId, useMemo, useState, type FormEvent } from 'react';
import { HandHeart, Target } from 'lucide-react';
import { SiteApiError } from '../api';
import { useIsEditing, useSiteData, useSiteHref, useSiteRuntime, useSiteText } from '../runtime';
import { formatSiteDate, formatSiteMoney } from '../strings';
import {
  FUND_TYPE_LABEL, parsePresetAmounts, pickCampaign, progressWidth, validateDonationAmount,
  type DonationGateway, type PublicDonationCampaign,
} from '../donations';
import {
  BlockSection, EmptyBlock, ErrorBlock, i18nField, introFields, NotConnected, radioField, sectionDefaults, sectionFields,
  SectionIntro, SiteImage, SkeletonRows, textField, type SectionProps, type SiteBlock,
} from './shared';

const introDefaults = { eyebrow: '', eyebrowBn: '', intro: '', introBn: '', align: 'left' };

function useDonationOptions() {
  return useSiteData(['donation-options'], (id, api) => api.donationOptions(id), { staleTime: 30_000 });
}

export function ProgressBar({ raised, goal, currency }: { raised: number; goal: number | null; currency: string }) {
  const { s, lang } = useSiteText();
  const width = progressWidth(raised, goal);
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
        <span><strong>{formatSiteMoney(raised, currency, lang)}</strong> <span className="site-muted">{s('raised')}</span></span>
        {goal != null && <span className="site-muted">{s('Goal')}: {formatSiteMoney(goal, currency, lang)}</span>}
      </div>
      {width != null && (
        <div
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={width}
          aria-label={s('Raised so far')}
          style={{ height: 10, borderRadius: 999, background: 'var(--site-border)', overflow: 'hidden' }}
        >
          <div style={{ width: `${width}%`, height: '100%', background: 'var(--site-primary)', borderRadius: 999, transition: 'width .4s' }} />
        </div>
      )}
    </div>
  );
}

/* ── Donate ─────────────────────────────────────────────────────────────── */

export const Donate: SiteBlock = {
  label: 'Donate (online giving)',
  fields: {
    ...introFields,
    presetAmounts: textField('Suggested amounts (comma separated)', '500, 1000, 2000, 5000'),
    minAmount: textField('Minimum amount', '10'),
    fundId: textField('Only this fund (fund id, optional)'),
    campaignId: textField('Only this campaign (campaign id, optional)'),
    showFundPicker: radioField('Let donors choose the fund', [[true, 'Yes'], [false, 'No']]),
    ...i18nField('buttonLabel', 'Button label'),
    ...sectionFields,
  },
  defaultProps: {
    ...introDefaults,
    heading: 'Support our madrasah',
    headingBn: 'আমাদের মাদ্রাসায় দান করুন',
    intro: 'Give Zakat, Sadaqah or a general donation securely with bKash, Nagad or card.',
    introBn: 'বিকাশ, নগদ বা কার্ডে নিরাপদে যাকাত, সদকা বা সাধারণ দান করুন।',
    presetAmounts: '500, 1000, 2000, 5000',
    minAmount: '10',
    fundId: '',
    campaignId: '',
    showFundPicker: true,
    buttonLabel: '',
    buttonLabelBn: '',
    ...sectionDefaults,
    width: 'narrow',
  },
  render: (p) => <DonateView {...p} />,
};

function DonateView(p: Record<string, any>) {
  const { s, tx, lang } = useSiteText();
  const { siteId, api, basePath } = useSiteRuntime();
  const editing = useIsEditing();
  const toHref = useSiteHref();
  const q = useDonationOptions();
  const uid = useId();

  const presets = useMemo(() => parsePresetAmounts(p.presetAmounts), [p.presetAmounts]);
  const min = Math.max(1, Number(p.minAmount) || 10);
  const [amount, setAmount] = useState<string>(String(presets[1] ?? presets[0] ?? ''));
  const [fundId, setFundId] = useState<string>('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [anonymous, setAnonymous] = useState(false);
  const [method, setMethod] = useState<DonationGateway['gateway'] | ''>('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!q.connected) return <BlockSection {...(p as SectionProps)}><SectionIntro {...p} /><NotConnected /></BlockSection>;
  if (q.isLoading) return <BlockSection {...(p as SectionProps)}><SkeletonRows rows={1} className="h-72" /></BlockSection>;
  if (q.isError || !q.data) return <BlockSection {...(p as SectionProps)}><ErrorBlock onRetry={() => void q.refetch()} /></BlockSection>;

  const opts = q.data;
  const campaign = p.campaignId ? opts.campaigns.find((c) => c.id === p.campaignId) ?? null : null;
  const funds = p.fundId ? opts.funds.filter((f) => f.id === p.fundId) : opts.funds;
  const chosenFund = campaign ? campaign.fund.id : fundId || funds[0]?.id || '';
  const gateway = method || opts.gateways[0]?.gateway || '';
  const anyDemo = opts.gateways.some((g) => g.demo);

  if ((!campaign && funds.length === 0) || opts.gateways.length === 0) {
    return (
      <BlockSection {...(p as SectionProps)}>
        <SectionIntro {...p} />
        <EmptyBlock icon={<HandHeart size={28} />} title={s('Online donations aren’t open yet')} hint={s('Please contact the school office to donate.')} />
      </BlockSection>
    );
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (editing || !siteId || busy) return;
    setError(null);
    const v = validateDonationAmount(amount, min);
    if (!v.ok) { setError(s(v.error, { min: formatSiteMoney(min, opts.currency, lang) })); return; }
    if (!gateway) { setError(s('Choose a payment method')); return; }
    if (!anonymous && !name.trim()) { setError(s('Enter your name, or choose to give anonymously')); return; }
    setBusy(true);
    try {
      const res = await api.createDonation(siteId, {
        ...(campaign ? { campaignId: campaign.id } : { fundId: chosenFund }),
        amount: v.amount,
        name: name.trim() || undefined,
        phone: phone.trim() || undefined,
        email: email.trim() || undefined,
        anonymous,
        paymentMethod: gateway,
        returnUrl: `${window.location.origin}${basePath}`,
      });
      if (res.paymentUrl) { window.location.href = res.paymentUrl; return; }
      window.location.assign(toHref(`/donation/${res.donation.reference}${res.demo ? '?demo=1' : ''}`) ?? '/');
    } catch (err) {
      setError(err instanceof SiteApiError ? err.message : s('Something went wrong'));
      setBusy(false);
    }
  };

  return (
    <BlockSection {...(p as SectionProps)}>
      <SectionIntro {...p} />
      {campaign && (
        <div className="site-card site-card-pad mb-4 flex flex-col gap-3">
          <strong>{tx(campaign.title, campaign.titleBn)}</strong>
          <ProgressBar raised={campaign.raised} goal={campaign.goalAmount} currency={opts.currency} />
        </div>
      )}
      <form className="site-card site-card-pad flex flex-col gap-5" onSubmit={submit} noValidate>
        {!campaign && p.showFundPicker !== false && funds.length > 1 && (
          <fieldset className="flex flex-col gap-2">
            <legend className="site-label">{s('Give to')}</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {funds.map((f) => (
                <label key={f.id} className="site-card flex cursor-pointer items-start gap-2 p-3" style={chosenFund === f.id ? { borderColor: 'var(--site-primary)' } : undefined}>
                  <input type="radio" name={`${uid}-fund`} value={f.id} checked={chosenFund === f.id} onChange={() => setFundId(f.id)} className="mt-1" />
                  <span className="flex flex-col">
                    <span className="font-semibold">{tx(f.name, f.nameBn)}</span>
                    <span className="site-muted text-xs">{lang === 'bn' ? FUND_TYPE_LABEL[f.type].bn : FUND_TYPE_LABEL[f.type].en}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        )}

        <fieldset className="flex flex-col gap-2">
          <legend className="site-label">{s('Amount')} ({opts.currency})</legend>
          <div className="flex flex-wrap gap-2">
            {presets.map((n) => (
              <button
                key={n}
                type="button"
                aria-pressed={Number(amount) === n}
                className={`site-btn site-btn-sm ${Number(amount) === n ? 'site-btn-primary' : 'site-btn-outline'}`}
                onClick={() => setAmount(String(n))}
              >
                {formatSiteMoney(n, opts.currency, lang)}
              </button>
            ))}
          </div>
          <label htmlFor={`${uid}-amount`} className="sr-only">{s('Other amount')}</label>
          <input id={`${uid}-amount`} className="site-input" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={s('Other amount')} />
        </fieldset>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor={`${uid}-name`} className="site-label">{s('Your name')}</label>
            <input id={`${uid}-name`} className="site-input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
          </div>
          <div>
            <label htmlFor={`${uid}-phone`} className="site-label">{s('Mobile number')}</label>
            <input id={`${uid}-phone`} className="site-input" value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" autoComplete="tel" />
          </div>
          <div className="sm:col-span-2">
            <label htmlFor={`${uid}-email`} className="site-label">{s('Email (for your receipt, optional)')}</label>
            <input id={`${uid}-email`} type="email" className="site-input" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={anonymous} onChange={(e) => setAnonymous(e.target.checked)} />
          {s('Give anonymously (your name won’t be shown publicly)')}
        </label>

        <fieldset className="flex flex-col gap-2">
          <legend className="site-label">{s('Pay with')}</legend>
          <div className="flex flex-wrap gap-2">
            {opts.gateways.map((g) => (
              <label key={g.gateway} className="site-card flex cursor-pointer items-center gap-2 px-3 py-2" style={gateway === g.gateway ? { borderColor: 'var(--site-primary)' } : undefined}>
                <input type="radio" name={`${uid}-method`} value={g.gateway} checked={gateway === g.gateway} onChange={() => setMethod(g.gateway)} />
                <span className="font-semibold">{g.label}</span>
                {g.demo && <span className="site-badge">{s('Demo mode')}</span>}
              </label>
            ))}
          </div>
        </fieldset>

        {anyDemo && <p className="site-alert site-alert-warning text-sm">{s('Demo mode')}: {s('Online payment is in test mode.')}</p>}
        {error && <p role="alert" className="site-alert site-alert-error text-sm">{error}</p>}
        <button type="submit" className="site-btn site-btn-primary" disabled={busy || editing}>
          <HandHeart size={18} className="mr-1 inline" aria-hidden />
          {busy ? s('Starting payment…') : tx(p.buttonLabel, p.buttonLabelBn) || s('Donate now')}
        </button>
      </form>
    </BlockSection>
  );
}

/* ── Campaign progress ──────────────────────────────────────────────────── */

export const CampaignProgress: SiteBlock = {
  label: 'Campaign progress (donations)',
  fields: {
    ...introFields,
    campaignId: textField('Campaign id (empty = the newest running campaign)'),
    showCover: radioField('Show cover image', [[true, 'Yes'], [false, 'No']]),
    donateHref: textField('"Donate" button link', '/donate'),
    ...i18nField('buttonLabel', 'Button label'),
    ...sectionFields,
  },
  defaultProps: {
    ...introDefaults,
    heading: '',
    headingBn: '',
    campaignId: '',
    showCover: true,
    donateHref: '/donate',
    buttonLabel: '',
    buttonLabelBn: '',
    ...sectionDefaults,
  },
  render: (p) => <CampaignProgressView {...p} />,
};

function CampaignCard({ c, currency, p }: { c: PublicDonationCampaign; currency: string; p: Record<string, any> }) {
  const { s, tx, lang } = useSiteText();
  const toHref = useSiteHref();
  const description = tx(c.description, undefined);
  return (
    <div className="site-card overflow-hidden">
      {p.showCover !== false && c.coverImageUrl && <SiteImage src={c.coverImageUrl} alt="" className="h-56 w-full object-cover" width={1200} />}
      <div className="site-card-pad flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h3 className="site-h3">{tx(c.title, c.titleBn)}</h3>
          <span className="site-muted text-sm">
            {tx(c.fund.name, c.fund.nameBn)}
            {c.endDate && ` · ${c.ended ? s('Ended') : s('Ends')} ${formatSiteDate(c.endDate, lang)}`}
          </span>
        </div>
        {description && <p className="site-muted whitespace-pre-line">{description}</p>}
        <ProgressBar raised={c.raised} goal={c.goalAmount} currency={currency} />
        {!c.ended && p.donateHref && (
          <a href={toHref(String(p.donateHref))} className="site-btn site-btn-primary self-start">
            <Target size={18} className="mr-1 inline" aria-hidden />{tx(p.buttonLabel, p.buttonLabelBn) || s('Donate now')}
          </a>
        )}
      </div>
    </div>
  );
}

function CampaignProgressView(p: Record<string, any>) {
  const { s } = useSiteText();
  const q = useDonationOptions();
  const campaign = q.data ? pickCampaign(q.data.campaigns, p.campaignId || undefined) : null;
  return (
    <BlockSection {...(p as SectionProps)}>
      <SectionIntro {...p} />
      {!q.connected ? <NotConnected /> : q.isLoading ? <SkeletonRows rows={1} className="h-48" /> : q.isError ? <ErrorBlock onRetry={() => void q.refetch()} /> : campaign ? (
        <CampaignCard c={campaign} currency={q.data!.currency} p={p} />
      ) : (
        <EmptyBlock icon={<Target size={28} />} title={s('No campaign to show yet')} hint={s('Public campaigns appear here once the school publishes one.')} />
      )}
    </BlockSection>
  );
}
