/** Public-site routes' content: Puck page, blog list, blog post. */
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { SiteApiError, normalisePageData } from '../api';
import { RichHtml, SiteImage, SiteLink, SkeletonRows } from '../blocks/shared';
import { SiteRender } from '../render';
import { useSiteRuntime, useSiteText } from '../runtime';
import { formatSiteDate } from '../strings';
import type { PublicPageRef } from '../types';
import { SiteNotFound } from './Chrome';
import { useSiteSeo } from './seo';

function useCanonical(path: string) {
  const { site } = useSiteMeta();
  return site.canonicalUrl ? `${site.canonicalUrl.replace(/\/$/, '')}${path === '/' ? '/' : path}` : undefined;
}

/** A few site-level values the pages need (from the runtime). */
function useSiteMeta() {
  const rt = useSiteRuntime();
  return {
    site: { canonicalUrl: rt.canonicalUrl },
    siteName: (rt.lang === 'bn' && rt.settings.siteNameBn) || rt.settings.siteName || rt.institution?.name || '',
    favicon: rt.settings.faviconUrl,
  };
}

function alternates(canonical: string | undefined, languages: string[]) {
  if (!canonical || languages.length < 2) return undefined;
  const sep = canonical.includes('?') ? '&' : '?';
  return { en: `${canonical}${sep}lang=en`, bn: `${canonical}${sep}lang=bn` };
}

function PageSkeleton() {
  return (
    <div className="site-container site-pad-md">
      <div className="site-skeleton mb-6 h-56 w-full" />
      <SkeletonRows rows={3} className="h-24" />
    </div>
  );
}

function PageError({ onRetry }: { onRetry: () => void }) {
  const { s } = useSiteText();
  return (
    <section className="site-pad-lg">
      <div className="site-container site-w-narrow flex flex-col items-center gap-4 text-center" role="alert">
        <h1 className="site-h2">{s('Something went wrong')}</h1>
        <button type="button" className="site-btn site-btn-primary" onClick={onRetry}>{s('Try again')}</button>
      </div>
    </section>
  );
}

export function SitePageView({ slug, pages }: { slug: string; pages: PublicPageRef[] }) {
  const { siteId, api, lang, settings, previewToken } = useSiteRuntime();
  const { tx } = useSiteText();
  const meta = useSiteMeta();
  const q = useQuery({
    queryKey: ['site-page', siteId, slug, previewToken ? 'preview' : 'live'],
    queryFn: () => api.page(siteId!, slug),
    enabled: Boolean(siteId),
    staleTime: 60_000,
    retry: (n, e) => n < 1 && !(e instanceof SiteApiError && e.status === 404),
  });
  const ref = pages.find((p) => p.slug === slug);
  const canonical = useCanonical(slug ? `/${slug}` : '/');
  const title = q.data ? tx(q.data.title, q.data.titleBn) : ref ? tx(ref.title, ref.titleBn) : '';
  const seo = q.data?.seo ?? {};
  useSiteSeo(q.data ? {
    title: tx(seo.title) || (slug ? `${title} | ${meta.siteName}` : meta.siteName || title),
    description: tx(seo.description) || undefined,
    ogImage: seo.ogImage,
    noindex: seo.noindex || ref?.noindex || Boolean(previewToken),
    canonical,
    lang,
    alternates: alternates(canonical, settings.languages),
    favicon: meta.favicon,
    siteName: meta.siteName,
  } : null);

  if (q.isLoading) return <PageSkeleton />;
  if (q.isError) return q.error instanceof SiteApiError && q.error.status === 404 ? <NotFoundWithSeo /> : <PageError onRetry={() => void q.refetch()} />;
  if (!q.data) return <NotFoundWithSeo />;
  // Unknown block types are skipped by the renderer rather than failing the page.
  return <SiteRender data={q.data.data} />;
}

export function NotFoundWithSeo() {
  const { lang } = useSiteRuntime();
  const { s } = useSiteText();
  const meta = useSiteMeta();
  useSiteSeo({ title: `${s('Page not found')} | ${meta.siteName}`, noindex: true, lang, favicon: meta.favicon });
  return <SiteNotFound />;
}

const PAGE_SIZE = 9;

export function BlogListView() {
  const { siteId, api, lang, settings, previewToken } = useSiteRuntime();
  const { s } = useSiteText();
  const meta = useSiteMeta();
  const [params, setParams] = useSearchParams();
  const page = Math.max(1, Number(params.get('page')) || 1);
  const tag = params.get('tag') || undefined;
  const q = useQuery({
    queryKey: ['site-posts', siteId, page, tag, previewToken ? 'preview' : 'live'],
    queryFn: () => api.posts(siteId!, { page, pageSize: PAGE_SIZE, tag }),
    enabled: Boolean(siteId),
    staleTime: 60_000,
  });
  const canonical = useCanonical('/blog');
  useSiteSeo({ title: `${s('News & updates')} | ${meta.siteName}`, lang, canonical, alternates: alternates(canonical, settings.languages), favicon: meta.favicon, siteName: meta.siteName, noindex: Boolean(previewToken) });
  const pages = q.data ? Math.max(1, Math.ceil(q.data.total / PAGE_SIZE)) : 1;
  const go = (n: number) => { const next = new URLSearchParams(params); next.set('page', String(n)); setParams(next); window.scrollTo({ top: 0 }); };

  return (
    <section className="site-pad-md">
      <div className="site-container">
        <h1 className="site-h1 mb-2">{s('News & updates')}</h1>
        {tag && <p className="site-muted mb-6">#{tag} · <SiteLink href="/blog">{s('View all')}</SiteLink></p>}
        <div className="mt-8">
          {q.isLoading ? <SkeletonRows rows={3} className="h-40" /> : q.isError ? <PageError onRetry={() => void q.refetch()} /> : !q.data?.items.length ? (
            <div className="site-empty"><p className="site-empty-title">{s('No posts yet')}</p><p className="text-sm">{s('News and updates will appear here once they’re published.')}</p></div>
          ) : (
            <ul className="m-0 grid list-none grid-cols-1 gap-6 p-0 sm:grid-cols-2 lg:grid-cols-3">
              {q.data.items.map((p) => (
                <li key={p.slug} className="site-card flex flex-col">
                  {p.coverUrl && <SiteImage src={p.coverUrl} alt="" width={800} className="aspect-video w-full object-cover" />}
                  <div className="site-card-pad flex flex-1 flex-col gap-2">
                    {p.publishedAt && <time className="site-muted text-sm" dateTime={p.publishedAt}>{formatSiteDate(p.publishedAt, lang)}</time>}
                    <h2 className="site-h4"><SiteLink href={`/blog/${p.slug}`} className="hover:underline">{p.title}</SiteLink></h2>
                    {p.excerpt && <p className="site-muted line-clamp-3 text-sm">{p.excerpt}</p>}
                    {p.tags.length > 0 && (
                      <ul className="m-0 mt-auto flex list-none flex-wrap gap-2 p-0 pt-2">
                        {p.tags.slice(0, 3).map((t) => <li key={t}><SiteLink href={`/blog?tag=${encodeURIComponent(t)}`} className="site-badge no-underline">#{t}</SiteLink></li>)}
                      </ul>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
        {pages > 1 && (
          <nav className="mt-8 flex items-center justify-center gap-3" aria-label="Pagination">
            <button type="button" className="site-btn site-btn-outline site-btn-sm" disabled={page <= 1} onClick={() => go(page - 1)}>{s('Previous')}</button>
            <span className="site-muted text-sm">{s('Page {page} of {pages}', { page, pages })}</span>
            <button type="button" className="site-btn site-btn-outline site-btn-sm" disabled={page >= pages} onClick={() => go(page + 1)}>{s('Next')}</button>
          </nav>
        )}
      </div>
    </section>
  );
}

export function BlogPostView({ slug }: { slug: string }) {
  const { siteId, api, lang, settings, previewToken } = useSiteRuntime();
  const { s } = useSiteText();
  const meta = useSiteMeta();
  const q = useQuery({
    queryKey: ['site-post', siteId, slug, previewToken ? 'preview' : 'live'],
    queryFn: () => api.post(siteId!, slug),
    enabled: Boolean(siteId),
    staleTime: 60_000,
    retry: (n, e) => n < 1 && !(e instanceof SiteApiError && e.status === 404),
  });
  const canonical = useCanonical(`/blog/${slug}`);
  useSiteSeo(q.data ? {
    title: `${q.data.title} | ${meta.siteName}`, description: q.data.excerpt, ogImage: q.data.coverUrl, lang, canonical,
    alternates: alternates(canonical, settings.languages), favicon: meta.favicon, siteName: meta.siteName, noindex: Boolean(previewToken),
  } : null);

  if (q.isLoading) return <PageSkeleton />;
  if (q.isError) return q.error instanceof SiteApiError && q.error.status === 404 ? <NotFoundWithSeo /> : <PageError onRetry={() => void q.refetch()} />;
  const post = q.data!;
  // Post bodies are Puck data (usually one RichText block); legacy HTML strings are also handled.
  const body = post.body;
  const isPuck = body && typeof body === 'object' && Array.isArray((body as { content?: unknown }).content);
  return (
    <article>
      <header className="site-tone-soft site-pad-md">
        <div className="site-container site-w-narrow flex flex-col gap-3">
          <SiteLink href="/blog" className="text-sm font-semibold">← {s('Back to news')}</SiteLink>
          <h1 className="site-h1">{post.title}</h1>
          {post.publishedAt && <time className="site-muted" dateTime={post.publishedAt}>{formatSiteDate(post.publishedAt, lang, { day: 'numeric', month: 'long', year: 'numeric' })}</time>}
        </div>
      </header>
      {post.coverUrl && (
        <div className="site-container site-w-narrow -mb-4 mt-8">
          <SiteImage src={post.coverUrl} alt="" eager className="w-full object-cover" style={{ borderRadius: 'var(--site-radius-lg)' }} />
        </div>
      )}
      {isPuck ? <SiteRender data={normalisePageData(body)} /> : typeof body === 'string' ? (
        <div className="site-container site-w-narrow site-pad-md"><RichHtml value={body} /></div>
      ) : null}
      {post.tags.length > 0 && (
        <div className="site-container site-w-narrow pb-12">
          <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
            {post.tags.map((t) => <li key={t}><SiteLink href={`/blog?tag=${encodeURIComponent(t)}`} className="site-badge no-underline">#{t}</SiteLink></li>)}
          </ul>
        </div>
      )}
    </article>
  );
}
