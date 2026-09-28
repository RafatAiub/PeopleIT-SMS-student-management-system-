import { useSearchParams } from 'react-router-dom';
import {
  LayoutDashboard, FileText, Palette, Menu as MenuIcon, Image as ImageIcon, Newspaper, ClipboardList, Globe, Settings as SettingsIcon,
} from 'lucide-react';
import { PageHeader, Tabs, TabPanel, Skeleton, SkeletonStatGrid, ErrorState, Badge } from '@/components/ui';
import type { TabItem } from '@/components/ui';
import { useT } from '@/i18n';
import { useSite, apiError } from './sites.queries';
import { useSiteRole } from './siteUtils';
import { OverviewTab } from './tabs/OverviewTab';
import { PagesTab } from './tabs/PagesTab';
import { DesignTab } from './tabs/DesignTab';
import { NavigationTab } from './tabs/NavigationTab';
import { MediaTab } from './tabs/MediaTab';
import { BlogTab } from './tabs/BlogTab';
import { FormsTab } from './tabs/FormsTab';
import { DomainsTab } from './tabs/DomainsTab';
import { SettingsTab } from './tabs/SettingsTab';

const ADMIN_TABS = ['overview', 'pages', 'design', 'navigation', 'media', 'blog', 'forms', 'domains', 'settings'] as const;
type TabId = (typeof ADMIN_TABS)[number];

/**
 * Website builder (Sites) — /website-builder.
 * Admins get every tab; teachers only get the Blog tab (the API lets them
 * create and edit posts, nothing else).
 */
export default function WebsiteBuilder() {
  const t = useT();
  const { canManage } = useSiteRole();
  const [params, setParams] = useSearchParams();
  const requested = params.get('tab') as TabId | null;
  const tab: TabId = canManage ? (requested && ADMIN_TABS.includes(requested) ? requested : 'overview') : 'blog';
  const setTab = (id: string) => {
    const next = new URLSearchParams(params);
    next.set('tab', id);
    setParams(next, { replace: true });
  };

  const siteQuery = useSite(canManage);

  if (!canManage) {
    return (
      <div className="space-y-6">
        <PageHeader
          title={t('School news')}
          description={t('Write news and blog posts for the school website. An administrator publishes the rest of the site.')}
        />
        <BlogTab />
      </div>
    );
  }

  const tabs: TabItem[] = [
    { id: 'overview', label: t('Overview'), icon: <LayoutDashboard /> },
    { id: 'pages', label: t('Pages'), icon: <FileText />, count: siteQuery.data?.pages.length },
    { id: 'design', label: t('Design'), icon: <Palette /> },
    { id: 'navigation', label: t('Navigation'), icon: <MenuIcon /> },
    { id: 'media', label: t('Media'), icon: <ImageIcon /> },
    { id: 'blog', label: t('Blog'), icon: <Newspaper /> },
    { id: 'forms', label: t('Forms'), icon: <ClipboardList /> },
    { id: 'domains', label: t('Domains'), icon: <Globe />, count: siteQuery.data?.domains.length },
    { id: 'settings', label: t('Settings'), icon: <SettingsIcon /> },
  ];

  const site = siteQuery.data;

  return (
    <div className="space-y-6 min-w-0">
      <PageHeader
        title={t('Website Builder')}
        description={t('Build and publish your school’s public website: pages, design, menus, news, forms and your own domain.')}
        actions={
          site ? (
            <Badge variant={site.site.status === 'PUBLISHED' ? 'success' : 'neutral'} dot>
              {site.site.status === 'PUBLISHED' ? t('Published') : t('Draft — not public yet')}
            </Badge>
          ) : undefined
        }
      />

      <Tabs tabs={tabs} value={tab} onChange={setTab} label={t('Website builder sections')} idPrefix="site-tab" />

      {siteQuery.isLoading ? (
        <div className="space-y-4" aria-busy="true">
          <SkeletonStatGrid />
          <Skeleton className="h-48 rounded-2xl" />
        </div>
      ) : siteQuery.isError || !site ? (
        <ErrorState
          title={t('Could not load your website')}
          message={apiError(siteQuery.error, t('The website service did not respond. Check your connection and try again.'))}
          onRetry={() => siteQuery.refetch()}
        />
      ) : (
        <>
          <TabPanel id="overview" value={tab} idPrefix="site-tab"><OverviewTab me={site} onNavigate={setTab} /></TabPanel>
          <TabPanel id="pages" value={tab} idPrefix="site-tab"><PagesTab me={site} /></TabPanel>
          <TabPanel id="design" value={tab} idPrefix="site-tab"><DesignTab me={site} /></TabPanel>
          <TabPanel id="navigation" value={tab} idPrefix="site-tab"><NavigationTab me={site} /></TabPanel>
          <TabPanel id="media" value={tab} idPrefix="site-tab"><MediaTab /></TabPanel>
          <TabPanel id="blog" value={tab} idPrefix="site-tab"><BlogTab /></TabPanel>
          <TabPanel id="forms" value={tab} idPrefix="site-tab"><FormsTab /></TabPanel>
          <TabPanel id="domains" value={tab} idPrefix="site-tab"><DomainsTab me={site} /></TabPanel>
          <TabPanel id="settings" value={tab} idPrefix="site-tab"><SettingsTab me={site} /></TabPanel>
        </>
      )}
    </div>
  );
}
