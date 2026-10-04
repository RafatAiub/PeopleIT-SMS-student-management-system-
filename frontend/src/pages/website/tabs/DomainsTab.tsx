import React from 'react';
import { CheckCircle2, Copy, ExternalLink, Globe, RefreshCw, Star, Trash2, Plus, ShieldAlert } from 'lucide-react';
import toast from 'react-hot-toast';
import { Card, CardHeader, Button, Input, Badge, Alert, Skeleton, ErrorState } from '@/components/ui';
import type { BadgeVariant } from '@/components/ui';
import { EmptyState } from '@/components/common/EmptyState';
import { ConfirmModal } from '@/components/common/ConfirmModal';
import { useT, formatDate } from '@/i18n';
import { useUpdateSite, useDomains, useAddDomain, useVerifyDomain, useSetPrimaryDomain, useDeleteDomain, apiError } from '../sites.queries';
import { copyText, normaliseHostname, validateHostname } from '../siteUtils';
import type { DnsRecord, DomainStatus, SiteDomain, SiteMeResponse } from '../sites.types';

const STATUS: Record<DomainStatus, { variant: BadgeVariant; label: string }> = {
  PENDING_DNS: { variant: 'warning', label: 'Waiting for DNS' },
  VERIFYING: { variant: 'info', label: 'Checking' },
  ACTIVE: { variant: 'success', label: 'Active' },
  FAILED: { variant: 'danger', label: 'Failed' },
};

export const DomainStatusBadge: React.FC<{ status: DomainStatus }> = ({ status }) => {
  const t = useT();
  const s = STATUS[status] ?? { variant: 'neutral' as BadgeVariant, label: status };
  return <Badge variant={s.variant} dot>{t(s.label)}</Badge>;
};

/** Records from the API; when it returns none, derive the documented pair (CNAME + TXT token). */
function recordsFor(d: SiteDomain, platformDomain: string | null): DnsRecord[] {
  if (d.records && d.records.length) return d.records;
  const out: DnsRecord[] = [];
  if (platformDomain) out.push({ type: 'CNAME', name: d.hostname, value: platformDomain, purpose: 'routing' });
  if (d.verificationToken) out.push({ type: 'TXT', name: `_peoplenit-verify.${d.hostname}`, value: `peoplenit-verify=${d.verificationToken}`, purpose: 'verification' });
  return out;
}

const PURPOSE: Record<string, string> = {
  routing: 'Sends visitors of this domain to your school website.',
  verification: 'Proves that you own the domain.',
  provider: 'Required by the hosting provider to issue the SSL certificate.',
};

const CopyCell: React.FC<{ value: string; label: string }> = ({ value, label }) => {
  const t = useT();
  return (
    <div className="flex items-center gap-1.5 min-w-0">
      <code className="text-xs font-mono break-all rounded bg-slate-100 dark:bg-white/8 px-1.5 py-1 text-slate-800 dark:text-slate-100 min-w-0">{value}</code>
      <Button size="icon-sm" variant="ghost" aria-label={t('Copy {what}', { what: label })} title={t('Copy')} onClick={() => copyText(value, t('Copied'))} className="shrink-0">
        <Copy className="w-3.5 h-3.5" />
      </Button>
    </div>
  );
};

const DomainCard: React.FC<{ domain: SiteDomain; platformDomain: string | null }> = ({ domain, platformDomain }) => {
  const t = useT();
  const verify = useVerifyDomain();
  const primary = useSetPrimaryDomain();
  const del = useDeleteDomain();
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const [lastDemo, setLastDemo] = React.useState(false);
  const records = recordsFor(domain, platformDomain);
  const isApex = domain.hostname.split('.').length === 2;
  const manualSsl = domain.isDemo || domain.provider === 'manual' || lastDemo;
  const active = domain.status === 'ACTIVE';

  const onVerify = () =>
    verify.mutate(domain.id, {
      onSuccess: (r) => {
        setLastDemo(r.demo);
        if (r.domain.status === 'ACTIVE') toast.success(t('Domain verified.'));
        else toast(r.message || t('DNS records not found yet. It can take a while for changes to spread.'));
      },
    });

  return (
    <Card>
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-50 break-all">{domain.hostname}</h3>
            <DomainStatusBadge status={domain.status} />
            {domain.isPrimary && <Badge variant="primary"><Star className="w-3 h-3" aria-hidden /> {t('Primary')}</Badge>}
            {domain.isDemo && <Badge variant="warning">{t('Demo mode')}</Badge>}
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            {t('Provider')}: {domain.provider}
            {domain.lastCheckedAt && ` · ${t('Last checked {when}', { when: formatDate(domain.lastCheckedAt, true) })}`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 shrink-0">
          {active && (
            <a href={`https://${domain.hostname}`} target="_blank" rel="noreferrer" className="btn-secondary inline-flex items-center gap-1.5 h-8 px-3 text-xs rounded-lg">
              <ExternalLink className="w-3.5 h-3.5" aria-hidden /> {t('Open')}
            </a>
          )}
          {active && !domain.isPrimary && (
            <Button size="sm" variant="secondary" isLoading={primary.isPending} leftIcon={<Star className="w-3.5 h-3.5" />} onClick={() => primary.mutate(domain.id)}>
              {t('Make primary')}
            </Button>
          )}
          <Button size="sm" variant={active ? 'secondary' : 'primary'} isLoading={verify.isPending} leftIcon={<RefreshCw className="w-3.5 h-3.5" />} onClick={onVerify}>
            {active ? t('Re-check') : t('Verify now')}
          </Button>
          <Button size="sm" variant="danger-soft" leftIcon={<Trash2 className="w-3.5 h-3.5" />} onClick={() => setConfirmDelete(true)}>
            {t('Remove')}
          </Button>
        </div>
      </div>

      {domain.error && domain.status !== 'ACTIVE' && (
        <Alert tone="danger" title={t('Last check failed')} className="mb-4">{domain.error}</Alert>
      )}

      {active ? (
        <Alert tone="success" title={t('Your domain is connected')}>
          {t('Visitors to {host} now see your published website.', { host: domain.hostname })}
        </Alert>
      ) : (
        <ol className="space-y-4">
          <li className="flex gap-3">
            <StepNo n={1} />
            <div className="min-w-0 text-sm">
              <p className="font-medium text-slate-900 dark:text-slate-100">{t('Open your domain’s DNS settings')}</p>
              <p className="text-slate-600 dark:text-slate-400 mt-0.5">
                {t('Sign in where you bought the domain (for example your registrar, Cloudflare or cPanel) and find “DNS”, “Zone editor” or “Manage records”.')}
              </p>
            </div>
          </li>
          <li className="flex gap-3">
            <StepNo n={2} />
            <div className="min-w-0 flex-1 text-sm">
              <p className="font-medium text-slate-900 dark:text-slate-100">{t('Add these records')}</p>
              {records.length === 0 ? (
                <p className="text-slate-600 dark:text-slate-400 mt-1">{t('The server did not return DNS records for this domain. Click “Verify now” to refresh them.')}</p>
              ) : (
                <div className="mt-2 space-y-2">
                  {records.map((r, i) => (
                    <div key={`${r.type}-${r.name}-${i}`} className="rounded-lg border border-slate-200 dark:border-white/10 p-3 grid gap-2 sm:grid-cols-[5rem_1fr_1fr] sm:items-center">
                      <div>
                        <span className="sm:hidden text-[11px] uppercase tracking-wide text-slate-500 mr-1">{t('Type')}</span>
                        <Badge variant="info">{r.type}</Badge>
                        {r.optional && <span className="block text-[11px] text-slate-500 mt-1">{t('Optional')}</span>}
                      </div>
                      <div className="min-w-0">
                        <p className="text-[11px] uppercase tracking-wide text-slate-500 mb-0.5">{t('Name / Host')}</p>
                        <CopyCell value={r.name} label={t('name')} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-[11px] uppercase tracking-wide text-slate-500 mb-0.5">{t('Value / Target')}</p>
                        <CopyCell value={r.value} label={t('value')} />
                      </div>
                      {(r.purpose || r.note || r.ttl) && (
                        <p className="sm:col-span-3 text-xs text-slate-500 dark:text-slate-400">
                          {[r.purpose ? t(PURPOSE[r.purpose] ?? r.purpose) : null, r.note ? t(r.note) : null, r.ttl ? `TTL ${r.ttl}` : null].filter(Boolean).join(' ')}
                        </p>
                      )}
                    </div>
                  ))}
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {t('Some DNS panels add your domain automatically — if so, enter only the first part of the name (for example “www” or “_peoplenit-verify.www”).')}
                  </p>
                  {isApex && !records.some((r) => r.type === 'A' || r.note) && (
                    <Alert tone="info">
                      {t('{host} is a root domain. Many DNS providers do not allow a CNAME on the root — use an ALIAS/ANAME record if offered, or connect www.{host} instead and redirect the root to it.', { host: domain.hostname })}
                    </Alert>
                  )}
                </div>
              )}
            </div>
          </li>
          <li className="flex gap-3">
            <StepNo n={3} />
            <div className="min-w-0 text-sm">
              <p className="font-medium text-slate-900 dark:text-slate-100">{t('Wait, then verify')}</p>
              <p className="text-slate-600 dark:text-slate-400 mt-0.5">
                {t('DNS changes usually appear within minutes but can take up to 48 hours. We re-check pending domains every 10 minutes, or click “Verify now”.')}
              </p>
            </div>
          </li>
        </ol>
      )}

      {manualSsl && (
        <Alert tone="warning" title={domain.isDemo || lastDemo ? t('Demo mode — SSL is manual') : t('SSL is set up manually')} className="mt-4">
          {domain.sslNotice
            ? t(domain.sslNotice)
            : t('No hosting provider (Vercel, Cloudflare or Caddy) is connected to this server, so the domain is checked with a DNS lookup only. The HTTPS certificate for this domain must be set up by the platform operator before visitors can open it securely.')}
        </Alert>
      )}

      <ConfirmModal
        isOpen={confirmDelete}
        title={t('Remove {host}?', { host: domain.hostname })}
        message={t('The website stops answering on this domain. You can add it again later; you will need to verify it again.')}
        confirmLabel={t('Remove')}
        isLoading={del.isPending}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => del.mutate(domain.id, { onSuccess: () => setConfirmDelete(false) })}
      />
    </Card>
  );
};

const StepNo: React.FC<{ n: number }> = ({ n }) => (
  <span aria-hidden className="w-6 h-6 rounded-full bg-primary-50 dark:bg-primary-500/15 text-primary-700 dark:text-primary-300 text-xs font-semibold flex items-center justify-center shrink-0">
    {n}
  </span>
);

const RESERVED_SUBDOMAINS = ['www', 'app', 'api', 'admin', 'mail', 'smtp', 'ftp', 'cpanel', 'webmail', 'ns1', 'ns2', 'static', 'cdn', 'assets', 'dashboard', 'status', 'help', 'support', 'docs', 'blog', 'dev', 'staging', 'test'];

const SubdomainForm: React.FC<{ current: string; suffix: string | null }> = ({ current, suffix }) => {
  const t = useT();
  const save = useUpdateSite();
  const [value, setValue] = React.useState(current);
  const [error, setError] = React.useState<string | undefined>();
  React.useEffect(() => setValue(current), [current]);
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const v = value.trim().toLowerCase();
    let err: string | undefined;
    if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(v)) err = t('Use 1–63 lowercase letters, digits or hyphens.');
    else if (RESERVED_SUBDOMAINS.includes(v)) err = t('This name is reserved. Choose another.');
    setError(err);
    if (err || v === current) return;
    save.mutate({ subdomain: v }, { onSuccess: () => toast.success(t('Address changed. Old links to the previous address stop working.')) });
  };
  return (
    <form onSubmit={submit} className="mt-4 flex flex-col sm:flex-row gap-2 sm:items-start" noValidate>
      <Input
        id="site-subdomain"
        label={t('Change the free address')}
        value={value}
        onChange={(e) => setValue(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
        error={error}
        rightSlot={suffix ? <span className="text-xs text-slate-500 pr-1">.{suffix}</span> : undefined}
        className={suffix ? 'pr-32' : undefined}
        containerClassName="flex-1 max-w-md"
      />
      <Button type="submit" variant="secondary" className="sm:mt-6" isLoading={save.isPending} disabled={value === current}>{t('Save address')}</Button>
    </form>
  );
};

export const DomainsTab: React.FC<{ me: SiteMeResponse }> = ({ me }) => {
  const t = useT();
  const q = useDomains();
  const add = useAddDomain();
  const [host, setHost] = React.useState('');
  const [error, setError] = React.useState<string | undefined>();
  const [demoNotice, setDemoNotice] = React.useState(false);
  const platformDomain = me.platformDomain || null;
  const freeHost = platformDomain ? `${me.site.subdomain}.${platformDomain}` : null;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const err = validateHostname(host, platformDomain);
    setError(err ?? undefined);
    if (err) return;
    add.mutate(normaliseHostname(host), {
      onSuccess: (r) => {
        setHost('');
        setDemoNotice(r.demo);
        toast.success(t('Domain added. Now add the DNS records below.'));
      },
    });
  };

  const domains = q.data ?? me.domains;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader icon={<Globe className="w-4 h-4" />} title={t('Free address')} description={t('Always available, even without your own domain.')} />
        {freeHost ? (
          <div className="flex flex-wrap items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" aria-hidden />
            <CopyCell value={freeHost} label={t('address')} />
            <a href={`https://${freeHost}`} target="_blank" rel="noreferrer" className="text-sm font-medium text-primary-700 dark:text-primary-300 hover:underline inline-flex items-center gap-1">
              {t('Open')} <ExternalLink className="w-3.5 h-3.5" aria-hidden />
            </a>
          </div>
        ) : (
          <p className="text-sm text-slate-600 dark:text-slate-400">
            {t('Free subdomains are not enabled on this server (PLATFORM_SITE_DOMAIN is not set). Your published site is reachable at /s/{sub} on this app.', { sub: me.site.subdomain })}
          </p>
        )}
        <SubdomainForm current={me.site.subdomain} suffix={platformDomain} />
      </Card>

      <Card>
        <CardHeader icon={<Plus className="w-4 h-4" />} title={t('Connect your own domain')} description={t('For example www.myschool.edu.bd. You need access to the domain’s DNS settings.')} />
        <form onSubmit={submit} className="flex flex-col sm:flex-row gap-2 sm:items-start" noValidate>
          <Input
            id="site-domain-hostname"
            aria-label={t('Domain name')}
            placeholder="www.myschool.edu.bd"
            value={host}
            onChange={(e) => {
              setHost(e.target.value);
              if (error) setError(undefined);
            }}
            error={error}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            containerClassName="flex-1"
          />
          <Button type="submit" isLoading={add.isPending} leftIcon={<Plus className="w-4 h-4" />}>{t('Add domain')}</Button>
        </form>
        {demoNotice && (
          <Alert tone="warning" title={t('Demo mode')} className="mt-4">
            {t('No domain provider key is configured, so this domain is verified by DNS lookup only and SSL must be set up by the operator.')}
          </Alert>
        )}
      </Card>

      {q.isLoading ? (
        <Skeleton className="h-64 rounded-2xl" />
      ) : q.isError ? (
        <ErrorState message={apiError(q.error, t('Could not load your domains.'))} onRetry={() => q.refetch()} />
      ) : domains.length === 0 ? (
        <Card>
          <EmptyState icon={<ShieldAlert />} title={t('No custom domains yet')} description={t('Add a domain above and we will show you exactly which DNS records to set.')} />
        </Card>
      ) : (
        domains.map((d) => <DomainCard key={d.id} domain={d} platformDomain={platformDomain} />)
      )}
    </div>
  );
};
