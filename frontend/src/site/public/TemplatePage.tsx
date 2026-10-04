/**
 * Public view of a collection template page (W5): `/<routeBase>/:slug` renders
 * the school's designed TEMPLATE page once, inside the data scope of that item.
 * Routing comes from `resolve.templateRoutes` (see routes.ts `matchTemplateRoute`);
 * with no template for a collection the built-in detail views stay in charge.
 */
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { SiteApiError } from '../api';
import { decorateItem } from '../blocks/collection-list';
import { SkeletonRows } from '../blocks/shared';
import { detectIncludes, publicCollections, type TemplateRoute } from '../collections';
import { SiteRender } from '../render';
import { useSiteData, useSiteRuntime, useSiteText } from '../runtime';
import { NotFoundWithSeo } from './Pages';
import { resolveTemplateSeo } from './templateSeo';
import { useSiteSeo } from './seo';

function Skeleton() {
  return (
    <div className="site-container site-pad-md">
      <div className="site-skeleton mb-6 h-56 w-full" />
      <SkeletonRows rows={3} className="h-24" />
    </div>
  );
}

export function TemplatePageView({ route, itemSlug }: { route: TemplateRoute; itemSlug: string }) {
  const { siteId, api, lang, previewToken, settings, institution, canonicalUrl, tokens } = useSiteRuntime();
  const { s } = useSiteText();
  const mode = previewToken ? 'preview' : 'live';
  const retry = (n: number, e: unknown) => n < 1 && !(e instanceof SiteApiError && e.status === 404);

  const pageQ = useQuery({
    queryKey: ['site-page', siteId, route.pageSlug, mode],
    queryFn: () => api.page(siteId!, route.pageSlug),
    enabled: Boolean(siteId),
    staleTime: 60_000,
    retry,
  });
  const registryQ = useSiteData(['collections'], (id, a) => a.collections(id), { staleTime: 5 * 60_000 });
  const meta = useMemo(() => publicCollections(registryQ.data).find((c) => c.key === route.collection), [registryQ.data, route.collection]);
  // Fetch exactly the relations the template reads (teacher → classes, album → photos …).
  const include = useMemo(() => (pageQ.data && meta ? detectIncludes(pageQ.data.data.content, meta.relations.map((r) => r.key)) : []), [pageQ.data, meta]);
  const registryReady = registryQ.isSuccess || registryQ.isError;
  const itemQ = useQuery({
    queryKey: ['site-collection-item', siteId, route.collection, itemSlug, include.join(','), mode],
    queryFn: () => api.collectionItem(siteId!, route.collection, itemSlug, { include }),
    enabled: Boolean(siteId && pageQ.data && registryReady),
    staleTime: 60_000,
    retry,
  });

  const siteName = (lang === 'bn' && settings.siteNameBn) || settings.siteName || institution?.name || '';
  const record = useMemo(() => (itemQ.data ? decorateItem(itemQ.data.item, meta, 0) : null), [itemQ.data, meta]);
  const seo = useMemo(
    () => (itemQ.data && pageQ.data && record
      ? resolveTemplateSeo({ pageSeo: pageQ.data.seo, itemSeo: itemQ.data.seo, item: record, titleField: meta?.titleField ?? 'title', siteName, siteTokens: tokens, lang })
      : null),
    [itemQ.data, pageQ.data, record, meta, siteName, tokens, lang],
  );
  const canonical = canonicalUrl ? `${canonicalUrl.replace(/\/$/, '')}/${route.base.replace(/^\/+|\/+$/g, '')}/${encodeURIComponent(itemSlug)}` : undefined;
  useSiteSeo(seo ? { ...seo, noindex: seo.noindex || Boolean(previewToken), canonical, lang, favicon: settings.faviconUrl, siteName } : null);

  const notFound = [pageQ.error, itemQ.error].some((e) => e instanceof SiteApiError && e.status === 404);
  if (notFound) return <NotFoundWithSeo />;
  if (pageQ.isError || itemQ.isError) {
    return (
      <section className="site-pad-lg">
        <div className="site-container site-w-narrow flex flex-col items-center gap-4 text-center" role="alert">
          <h1 className="site-h2">{s('Something went wrong')}</h1>
          <button type="button" className="site-btn site-btn-primary" onClick={() => { void pageQ.refetch(); void itemQ.refetch(); }}>{s('Try again')}</button>
        </div>
      </section>
    );
  }
  if (pageQ.isLoading || itemQ.isLoading || !pageQ.data || !record) return <Skeleton />;
  return <SiteRender data={pageQ.data.data} record={record} />;
}
