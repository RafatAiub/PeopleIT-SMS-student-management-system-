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
import { isCodePage, readCodePageProps } from './code/codePage';
import { SandboxFrame } from './code/SandboxFrame';
import { SiteCustomCode } from './code/SiteCustomCode';
import { PreviewBar, SiteFooter, SiteHeader, SitePageFrame } from './public/Chrome';
import { BlogListView, BlogPostView, SitePageView } from './public/Pages';
import { AdmissionDetailView, AlbumDetailView, NoticeDetailView } from './public/PortalDetail';
import { AccountView } from './public/Account';
import { TemplatePageView } from './public/TemplatePage';
import { UrlScope } from './scopeContext';
import { matchTemplateRoute } from './collections';
import { CartView } from './public/Cart';
import { CheckoutView, OrderLookupView, OrderStatusView } from './public/Checkout';
import { CourseDetailView, CoursesListView } from './public/Courses';
import { LearnIndexView, LearnPlayerView } from './public/Learn';
import { ShopListView, ShopProductView } from './public/Shop';
import { useAnalytics, useSiteSeo } from './public/seo';
import { parseSitePath } from './routes';
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

  const clean = path.replace(/^\/+|\/+$/g, '');
  const route = parseSitePath(clean);
  // A school's template page for a collection (`/teachers/:slug`) wins over the built-in detail views.
  const tpl = matchTemplateRoute(clean, q.data?.templateRoutes);
  const isPlainPage = route.kind === 'page' && !tpl;
  // Query-string values for `{{url.q}}` / `src: url` rules — never the preview token.
  const urlParams = useMemo(() => {
    const out: Record<string, string> = {};
    params.forEach((v, k) => { if (k !== 'preview') out[k] = v; });
    return out;
  }, [params]);

  // A code-mode page (`root.props.mode === 'code'`) renders full-width and may hide the
  // header/footer (`chrome: 'none'`); pre-fetch it here so that decision can be made before
  // the header/footer wrapper is chosen. `SitePageView` re-reads the same query (deduped).
  const pageQ = useQuery({
    queryKey: ['site-page', siteId, clean, previewToken ? 'preview' : 'live'],
    queryFn: () => api.page(siteId, clean),
    enabled: Boolean(siteId) && isPlainPage,
    staleTime: 60_000,
    retry: (n, e) => n < 1 && !(e instanceof SiteApiError && e.status === 404),
  });
  const codeProps = isPlainPage && pageQ.data && isCodePage(pageQ.data.data) ? readCodePageProps(pageQ.data.data) : null;
  const siteName = (lang === 'bn' && settings?.siteNameBn) || settings?.siteName || q.data?.institution.name || '';
  useSiteSeo(
    codeProps && pageQ.data
      ? {
          title: pageQ.data.seo?.title || (clean ? `${(lang === 'bn' && pageQ.data.titleBn) || pageQ.data.title} | ${siteName}` : siteName),
          description: pageQ.data.seo?.description,
          ogImage: pageQ.data.seo?.ogImage,
          noindex: pageQ.data.seo?.noindex || Boolean(previewToken),
          lang,
          favicon: settings?.faviconUrl,
          siteName,
        }
      : null,
  );

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
  const suppressChrome = Boolean(codeProps) && codeProps!.chrome === 'none';
  let content;
  if (codeProps) {
    const frame = (
      <SandboxFrame
        html={codeProps.code.html}
        css={codeProps.code.css}
        js={codeProps.code.js}
        height="auto"
        minHeight={suppressChrome && typeof window !== 'undefined' ? window.innerHeight : 300}
        title={pageQ.data?.title || 'Page'}
      />
    );
    content = suppressChrome ? frame : <div className="site-container site-pad-md">{frame}</div>;
  } else if (tpl) {
    content = <TemplatePageView key={`${tpl.route.collection}:${tpl.slug}`} route={tpl.route} itemSlug={tpl.slug} />;
  } else {
    switch (route.kind) {
      case 'blog-list': content = <BlogListView />; break;
      case 'blog-post': content = <BlogPostView slug={route.slug} />; break;
      case 'shop-list': content = <ShopListView />; break;
      case 'shop-product': content = <ShopProductView slug={route.slug} />; break;
      case 'cart': content = <CartView />; break;
      case 'checkout': content = <CheckoutView />; break;
      case 'order-lookup': content = <OrderLookupView />; break;
      case 'order-status': content = <OrderStatusView orderNo={route.orderNo} />; break;
      case 'courses-list': content = <CoursesListView />; break;
      case 'course-detail': content = <CourseDetailView slug={route.slug} />; break;
      case 'learn-index': content = <LearnIndexView />; break;
      case 'learn-player': content = <LearnPlayerView courseSlug={route.courseSlug} lessonId={route.lessonId} />; break;
      case 'account': content = <AccountView sub={route.sub} />; break;
      case 'notice-detail': content = <NoticeDetailView id={route.id} />; break;
      case 'album-detail': content = <AlbumDetailView id={route.id} />; break;
      case 'admission-detail': content = <AdmissionDetailView id={route.id} />; break;
      default: content = <SitePageView slug={clean} pages={pages} />;
    }
  }

  // Only in host mode (real custom domain / platform subdomain): path-mode preview and the editor skip headHtml/bodyEndHtml.
  const hostMode = basePath === '';

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
      poweredBy={site.poweredBy !== false}
    >
      <UrlScope params={urlParams}>
      <SiteCustomCode hostMode={hostMode} />
      {suppressChrome ? (
        <SiteRoot className="min-h-screen">{content}</SiteRoot>
      ) : (
        <SiteRoot className="flex min-h-screen flex-col">
          <SitePageFrame>
            <SkipLink />
            {isPreview && <PreviewBar />}
            <SiteHeader />
            <main id="site-main" className="flex-1" tabIndex={-1}>{content}</main>
            <SiteFooter />
          </SitePageFrame>
        </SiteRoot>
      )}
      </UrlScope>
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
