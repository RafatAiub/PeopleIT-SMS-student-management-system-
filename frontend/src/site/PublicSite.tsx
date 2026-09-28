/**
 * Public school-website renderer.
 *
 *  - Path mode (always available):   <Route path="/s/:subdomain/*" element={<PublicSiteRoutes />} />
 *  - Host mode (custom domain / subdomain of VITE_PLATFORM_SITE_DOMAIN):
 *        if (isSiteHost(window.location.hostname)) return <SiteHostApp />;
 *
 * URL map (relative to the site root): `/` home · `/:slug` page · `/blog` ·
 * `/blog/:slug`. `?preview=<token>` shows drafts with a "Preview — not
 * published" bar; `?lang=bn|en` picks the language.
 *
 * Renders blocks from `siteConfig` via the light `SiteRender`; the Puck editor
 * is never imported here.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { createSiteApi, siteApi, SiteApiError } from './api';
import { resolveTarget, isSiteHost as isSiteHostImpl } from './host';
import { SiteRuntimeProvider, useSiteText } from './runtime';
import { SiteRoot } from './SiteRoot';
import { PreviewBar, SiteFooter, SiteHeader } from './public/Chrome';
import { BlogListView, BlogPostView, SitePageView } from './public/Pages';
import { useAnalytics } from './public/seo';
import { siteString } from './strings';
import type { SiteLang } from './types';

/** True when this hostname should render a public school site instead of the app. */
export function isSiteHost(hostname: string = typeof window !== 'undefined' ? window.location.hostname : ''): boolean {
  return isSiteHostImpl(hostname);
}

type Target = { slug: string } | { host: string };

const LANG_KEY = (siteId: string) => `site-lang:${siteId}`;

function readStoredLang(siteId: string): SiteLang | null {
  try {
    const v = localStorage.getItem(LANG_KEY(siteId));
    return v === 'en' || v === 'bn' ? v : null;
  } catch {
    return null;
  }
}

function storeLang(siteId: string, lang: SiteLang) {
  try { localStorage.setItem(LANG_KEY(siteId), lang); } catch { /* private mode */ }
}

/** Scroll to `#anchor` after navigation (react-router doesn't). */
function useHashScroll(ready: boolean) {
  const { hash, pathname } = useLocation();
  useEffect(() => {
    if (!ready) return;
    if (!hash) { window.scrollTo({ top: 0 }); return; }
    const id = decodeURIComponent(hash.slice(1));
    let tries = 0;
    const t = window.setInterval(() => {
      const el = document.getElementById(id);
      if (el || ++tries > 20) {
        window.clearInterval(t);
        el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 100);
    return () => window.clearInterval(t);
  }, [hash, pathname, ready]);
}

function FullPageMessage({ title, text, lang = 'en' }: { title: string; text?: string; lang?: SiteLang }) {
  return (
    <div className="site-root flex min-h-screen items-center justify-center p-6 text-center" lang={lang} style={{ background: '#f8fafc', color: '#0f172a' }}>
      <div className="flex max-w-md flex-col gap-3">
        <h1 className="text-2xl font-bold">{title}</h1>
        {text && <p style={{ color: '#475569' }}>{text}</p>}
      </div>
    </div>
  );
}

function SiteShell({ target, basePath, path }: { target: Target; basePath: string; path: string }) {
  const [params] = useSearchParams();
  const previewToken = params.get('preview');
  const api = useMemo(() => (previewToken ? createSiteApi(previewToken) : siteApi), [previewToken]);
  const key = 'slug' in target ? `slug:${target.slug}` : `host:${target.host}`;
  const q = useQuery({
    queryKey: ['site-resolve', key, previewToken ? 'preview' : 'live'],
    queryFn: () => api.resolve(target),
    staleTime: 5 * 60_000,
    retry: (n, e) => n < 1 && !(e instanceof SiteApiError && e.status === 404),
  });

  const siteId = q.data?.site.id ?? '';
  const settings = q.data?.site.settings;
  const urlLang = params.get('lang');
  const [chosen, setChosen] = useState<SiteLang | null>(null);
  const lang: SiteLang = useMemo(() => {
    const allowed = settings?.languages ?? ['en', 'bn'];
    const pick = (l: string | null | undefined): SiteLang | null => (l === 'en' || l === 'bn') && allowed.includes(l) ? l : null;
    return pick(chosen) ?? pick(urlLang) ?? (siteId ? pick(readStoredLang(siteId)) : null) ?? settings?.defaultLanguage ?? 'en';
  }, [chosen, urlLang, siteId, settings]);
  const setLang = useCallback((l: SiteLang) => { setChosen(l); if (siteId) storeLang(siteId, l); }, [siteId]);

  const isPreview = Boolean(previewToken) && (q.data?.preview ?? false);
  useAnalytics(settings?.analyticsId, Boolean(q.data) && !previewToken);
  useHashScroll(Boolean(q.data));

  if (q.isLoading) {
    return <div className="flex min-h-screen items-center justify-center" style={{ background: '#fff' }} aria-busy="true"><span className="sr-only">Loading…</span><div className="h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-slate-500" /></div>;
  }
  if (q.isError || !q.data) {
    const notFound = q.error instanceof SiteApiError && q.error.status === 404;
    return notFound
      ? <FullPageMessage title={`${siteString('en', 'This website isn’t available')} · ${siteString('bn', 'This website isn’t available')}`} text={siteString('en', 'It may not be published yet, or the address is wrong.')} />
      : <FullPageMessage title={siteString('en', 'Something went wrong')} text={q.error instanceof Error ? q.error.message : undefined} />;
  }

  const { site, institution, pages } = q.data;
  const clean = path.replace(/^\/+|\/+$/g, '');
  const [first, second, ...rest] = clean.split('/');
  let content;
  if (first === 'blog' && !second) content = <BlogListView />;
  else if (first === 'blog' && second && !rest.length) content = <BlogPostView slug={second} />;
  else content = <SitePageView slug={clean} pages={pages} />;

  return (
    <SiteRuntimeProvider
      siteId={site.id}
      lang={lang}
      setLang={setLang}
      mode={isPreview ? 'preview' : 'public'}
      institution={institution}
      settings={site.settings}
      theme={site.theme}
      navigation={site.navigation}
      pages={pages}
      subdomain={site.subdomain}
      canonicalUrl={site.canonicalUrl}
      basePath={basePath}
      previewToken={previewToken}
    >
      <SiteRoot className="flex min-h-screen flex-col">
        <SkipLink />
        {isPreview && <PreviewBar />}
        <SiteHeader />
        <main id="site-main" className="flex-1" tabIndex={-1}>{content}</main>
        <SiteFooter />
      </SiteRoot>
    </SiteRuntimeProvider>
  );
}

function SkipLink() {
  const { s } = useSiteText();
  return <a href="#site-main" className="site-skip">{s('Skip to content')}</a>;
}

/** Path-based preview: mount at `/s/:subdomain/*`. */
export function PublicSiteRoutes() {
  const { subdomain = '', '*': rest = '' } = useParams();
  const target = useMemo(() => ({ slug: subdomain.toLowerCase() }), [subdomain]);
  if (!subdomain) return <FullPageMessage title={siteString('en', 'This website isn’t available')} />;
  return <SiteShell target={target} basePath={`/s/${encodeURIComponent(subdomain)}`} path={rest} />;
}

/** Host-based mode: render the site for `window.location.hostname` at the root. */
export function SiteHostApp() {
  const { pathname } = useLocation();
  const target = useMemo<Target | null>(() => resolveTarget(window.location.hostname), []);
  if (!target) return <FullPageMessage title={siteString('en', 'This website isn’t available')} />;
  return <SiteShell target={target} basePath="" path={pathname} />;
}

export default PublicSiteRoutes;
