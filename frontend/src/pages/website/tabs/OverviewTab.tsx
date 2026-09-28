import React from 'react';
import { ExternalLink, FileText, Globe, Newspaper, Inbox, Send, Sparkles, Eye, EyeOff, Copy, ShoppingBag, GraduationCap, ReceiptText, TrendingUp } from 'lucide-react';
import toast from 'react-hot-toast';
import { Card, CardHeader, Button, Badge, StatCard, Alert, DescriptionList } from '@/components/ui';
import { ConfirmModal } from '@/components/common/ConfirmModal';
import { useT, formatDate, formatNumber, formatCurrency } from '@/i18n';
import { usePublishSite, useUnpublishSite, usePosts, useForms, useCommerceSummary } from '../sites.queries';
import { copyText, pageState } from '../siteUtils';
import type { SiteMeResponse } from '../sites.types';
import { GenerateAiModal } from '../GenerateAiModal';

const LinkRow: React.FC<{ label: string; url: string | null; hint?: string }> = ({ label, url, hint }) => {
  const t = useT();
  if (!url) return <span className="text-slate-500 dark:text-slate-400">{hint ?? '—'}</span>;
  return (
    <span className="flex flex-wrap items-center gap-2 min-w-0">
      <a href={url} target="_blank" rel="noreferrer" className="text-primary-700 dark:text-primary-300 hover:underline break-all inline-flex items-center gap-1">
        {url.split('?')[0]} <ExternalLink className="w-3.5 h-3.5 shrink-0" aria-hidden />
      </a>
      <Button size="icon-sm" variant="ghost" aria-label={t('Copy {what}', { what: label })} onClick={() => copyText(url, t('Link copied'))}>
        <Copy className="w-3.5 h-3.5" />
      </Button>
    </span>
  );
};

export const OverviewTab: React.FC<{ me: SiteMeResponse; onNavigate: (tab: string) => void }> = ({ me, onNavigate }) => {
  const t = useT();
  const publish = usePublishSite();
  const posts = usePosts();
  const forms = useForms();
  const commerce = useCommerceSummary();
  const [confirm, setConfirm] = React.useState(false);
  const [aiOpen, setAiOpen] = React.useState(false);
  const [confirmOff, setConfirmOff] = React.useState(false);
  const unpublish = useUnpublishSite();

  const { site, pages, domains } = me;
  const published = site.status === 'PUBLISHED';
  const livePages = pages.filter((p) => pageState(p) === 'live').length;
  const changed = pages.filter((p) => pageState(p) !== 'live').length;
  const activeDomains = domains.filter((d) => d.status === 'ACTIVE').length;
  const unread = (forms.data ?? []).reduce((n, f) => n + (f.unreadCount ?? 0), 0);

  return (
    <div className="space-y-4">
      {me.domainProvider?.demo && domains.length > 0 && (
        <Alert tone="warning" title={t('Demo mode')}>
          {t('No domain provider is connected, so custom domains are verified by DNS only and SSL must be set up by the operator.')}
        </Alert>
      )}

      <Card>
        <CardHeader
          icon={<Globe className="w-4 h-4" />}
          title={site.settings?.siteName || t('Your website')}
          description={
            published
              ? t('Published {when}', { when: formatDate(site.publishedAt, true) })
              : t('Not published yet — only you can see the preview.')
          }
          actions={<Badge variant={published ? 'success' : 'neutral'} dot>{published ? t('Live') : t('Draft')}</Badge>}
        />
        <DescriptionList
          columns={1}
          items={[
            { label: t('Live address'), value: <LinkRow label={t('live link')} url={published ? me.liveUrl : null} hint={t('Available after you publish.')} /> },
            { label: t('Preview (drafts included)'), value: <LinkRow label={t('preview link')} url={me.previewUrl} /> },
          ]}
        />
        {changed > 0 && published && (
          <Alert tone="info" className="mt-4">{t('{n} page(s) have changes that are not public yet.', { n: formatNumber(changed) })}</Alert>
        )}
        <div className="flex flex-wrap gap-2 mt-5">
          <Button leftIcon={<Send className="w-4 h-4" />} onClick={() => setConfirm(true)} isLoading={publish.isPending}>
            {published ? t('Publish all changes') : t('Publish website')}
          </Button>
          {me.previewUrl && (
            <a href={me.previewUrl} target="_blank" rel="noreferrer" className="btn-secondary inline-flex items-center gap-2 min-h-9 px-4 text-sm rounded-lg font-semibold">
              <Eye className="w-4 h-4" aria-hidden /> {t('Preview')}
            </a>
          )}
          <Button variant="outline" leftIcon={<Sparkles className="w-4 h-4" />} onClick={() => setAiOpen(true)}>{t('Generate with AI')}</Button>
          {published && (
            <Button variant="danger-soft" leftIcon={<EyeOff className="w-4 h-4" />} onClick={() => setConfirmOff(true)}>{t('Take offline')}</Button>
          )}
        </div>
      </Card>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label={t('Pages')} value={formatNumber(pages.length)} hint={t('{n} published', { n: formatNumber(livePages) })} icon={<FileText />} onClick={() => onNavigate('pages')} />
        <StatCard label={t('Custom domains')} value={formatNumber(domains.length)} hint={t('{n} active', { n: formatNumber(activeDomains) })} icon={<Globe />} tone="info" onClick={() => onNavigate('domains')} />
        <StatCard
          label={t('News posts')}
          value={posts.isLoading ? '…' : posts.isError ? '—' : formatNumber(posts.data?.length ?? 0)}
          hint={posts.data ? t('{n} published', { n: formatNumber(posts.data.filter((p) => p.status === 'PUBLISHED').length) }) : undefined}
          icon={<Newspaper />}
          tone="accent"
          onClick={() => onNavigate('blog')}
        />
        <StatCard
          label={t('Unread form submissions')}
          value={forms.isLoading ? '…' : forms.isError ? '—' : formatNumber(unread)}
          icon={<Inbox />}
          tone={unread > 0 ? 'warning' : 'neutral'}
          onClick={() => onNavigate('forms')}
        />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          label={t('Products')}
          value={commerce.isLoading ? '…' : commerce.isError ? '—' : formatNumber(commerce.data?.products ?? 0)}
          hint={commerce.data ? t('{n} published', { n: formatNumber(commerce.data.publishedProducts) }) : undefined}
          icon={<ShoppingBag />}
          tone="primary"
          onClick={() => onNavigate('shop')}
        />
        <StatCard
          label={t('Courses')}
          value={commerce.isLoading ? '…' : commerce.isError ? '—' : formatNumber(commerce.data?.courses ?? 0)}
          hint={commerce.data ? t('{n} published · {e} enrolled', { n: formatNumber(commerce.data.publishedCourses), e: formatNumber(commerce.data.enrollments) }) : undefined}
          icon={<GraduationCap />}
          tone="accent"
          onClick={() => onNavigate('courses')}
        />
        <StatCard
          label={t('Orders awaiting action')}
          value={commerce.isLoading ? '…' : commerce.isError ? '—' : formatNumber(commerce.data?.ordersPending ?? 0)}
          icon={<ReceiptText />}
          tone={(commerce.data?.ordersPending ?? 0) > 0 ? 'warning' : 'neutral'}
          onClick={() => onNavigate('shop')}
        />
        <StatCard
          label={t('Revenue (30 days)')}
          value={commerce.isLoading ? '…' : commerce.isError ? '—' : formatCurrency(commerce.data?.revenue30d ?? 0)}
          hint={commerce.data ? t('{n} paid orders', { n: formatNumber(commerce.data.ordersPaid30d) }) : undefined}
          icon={<TrendingUp />}
          tone="success"
          onClick={() => onNavigate('shop')}
        />
      </div>

      {pages.every((p) => !p.publishedAt) && pages.length <= 1 && (
        <Card>
          <CardHeader title={t('Get started')} description={t('Three quick ways to build your site.')} />
          <ol className="grid gap-3 sm:grid-cols-3 text-sm">
            <li><Button variant="secondary" fullWidth onClick={() => onNavigate('design')}>{t('1. Pick a template')}</Button></li>
            <li><Button variant="secondary" fullWidth onClick={() => setAiOpen(true)}>{t('2. Or generate with AI')}</Button></li>
            <li><Button variant="secondary" fullWidth onClick={() => onNavigate('settings')}>{t('3. Add your logo and links')}</Button></li>
          </ol>
        </Card>
      )}

      <ConfirmModal
        isOpen={confirm}
        variant="warning"
        title={published ? t('Publish all changes?') : t('Publish your website?')}
        message={t('Every page’s current draft, your menus, design and settings become public. Previous versions stay in each page’s history.')}
        confirmLabel={t('Publish')}
        isLoading={publish.isPending}
        onCancel={() => setConfirm(false)}
        onConfirm={() =>
          publish.mutate(undefined, {
            onSuccess: () => {
              setConfirm(false);
              toast.success(t('Your website is live.'));
            },
          })
        }
      />
      <ConfirmModal
        isOpen={confirmOff}
        title={t('Take the website offline?')}
        message={t('Visitors will no longer see your site on its free address or custom domains. Your pages, drafts and settings are kept; publish again at any time.')}
        confirmLabel={t('Take offline')}
        isLoading={unpublish.isPending}
        onCancel={() => setConfirmOff(false)}
        onConfirm={() => unpublish.mutate(undefined, { onSuccess: () => { setConfirmOff(false); toast.success(t('Your website is offline.')); } })}
      />
      <GenerateAiModal isOpen={aiOpen} onClose={() => setAiOpen(false)} currentTemplate={site.templateKey} />
    </div>
  );
};
