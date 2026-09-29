/**
 * Detail routes for the DSHE portal data (Track B §7.3/§7.4 — these paths
 * are exactly what `GET /:siteId/sitemap.xml` links to):
 *  - `/notices/:id`   → `data/notices/:id`
 *  - `/gallery/:id`   → `data/albums/:id`
 *  - `/admissions/:id` → `data/admissions/:id`
 */
import { useQuery } from '@tanstack/react-query';
import { SiteApiError } from '../api';
import { RichHtml, SiteImage, SiteLink, SkeletonRows } from '../blocks/shared';
import { formatSiteDate, formatSiteMoney } from '../strings';
import { useSiteRuntime, useSiteText } from '../runtime';
import { NotFoundWithSeo } from './Pages';
import { useSiteSeo } from './seo';

function useSiteMeta() {
  const rt = useSiteRuntime();
  return {
    siteName: (rt.lang === 'bn' && rt.settings.siteNameBn) || rt.settings.siteName || rt.institution?.name || '',
    favicon: rt.settings.faviconUrl,
  };
}

function DetailSkeleton() {
  return (
    <div className="site-container site-pad-md">
      <div className="site-skeleton mb-6 h-56 w-full" />
      <SkeletonRows rows={3} className="h-24" />
    </div>
  );
}

function DetailError({ onRetry }: { onRetry: () => void }) {
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

/* ── Notice detail (/notices/:id) ────────────────────────────────────────── */

export function NoticeDetailView({ id }: { id: string }) {
  const { siteId, api, lang, previewToken } = useSiteRuntime();
  const { s, tx } = useSiteText();
  const meta = useSiteMeta();
  const q = useQuery({
    queryKey: ['site-notice', siteId, id, previewToken ? 'preview' : 'live'],
    queryFn: () => api.noticeDetail(siteId!, id),
    enabled: Boolean(siteId && id),
    staleTime: 60_000,
    retry: (n, e) => n < 1 && !(e instanceof SiteApiError && e.status === 404),
  });
  useSiteSeo(q.data ? {
    title: tx(q.data.seo.title) || `${q.data.notice.title} | ${meta.siteName}`,
    description: tx(q.data.seo.description) || undefined,
    ogImage: q.data.seo.image ?? undefined,
    lang, favicon: meta.favicon, siteName: meta.siteName, noindex: Boolean(previewToken),
  } : null);

  if (q.isLoading) return <DetailSkeleton />;
  if (q.isError) return q.error instanceof SiteApiError && q.error.status === 404 ? <NotFoundWithSeo /> : <DetailError onRetry={() => void q.refetch()} />;
  if (!q.data) return <NotFoundWithSeo />;
  const { notice } = q.data;
  return (
    <article>
      <header className="site-tone-soft site-pad-md">
        <div className="site-container site-w-narrow flex flex-col gap-3">
          <SiteLink href="/notices" className="text-sm font-semibold">← {s('Notices')}</SiteLink>
          <h1 className="site-h1">{notice.title}</h1>
          {notice.publishedAt && <time className="site-muted" dateTime={notice.publishedAt}>{formatSiteDate(notice.publishedAt, lang, { day: 'numeric', month: 'long', year: 'numeric' })}</time>}
        </div>
      </header>
      <div className="site-container site-w-narrow site-pad-md">
        {notice.content ? <RichHtml value={notice.content} /> : <p className="site-muted">{s('No notices right now')}</p>}
      </div>
    </article>
  );
}

/* ── Album detail (/gallery/:id) ─────────────────────────────────────────── */

export function AlbumDetailView({ id }: { id: string }) {
  const { siteId, api, lang, previewToken } = useSiteRuntime();
  const { s, tx } = useSiteText();
  const meta = useSiteMeta();
  const q = useQuery({
    queryKey: ['site-album', siteId, id, previewToken ? 'preview' : 'live'],
    queryFn: () => api.album(siteId!, id),
    enabled: Boolean(siteId && id),
    staleTime: 60_000,
    retry: (n, e) => n < 1 && !(e instanceof SiteApiError && e.status === 404),
  });
  useSiteSeo(q.data ? {
    title: tx(q.data.seo.title) || `${q.data.album.title} | ${meta.siteName}`,
    description: tx(q.data.seo.description) || undefined,
    ogImage: q.data.seo.image ?? q.data.album.coverUrl,
    lang, favicon: meta.favicon, siteName: meta.siteName, noindex: Boolean(previewToken),
  } : null);

  if (q.isLoading) return <DetailSkeleton />;
  if (q.isError) return q.error instanceof SiteApiError && q.error.status === 404 ? <NotFoundWithSeo /> : <DetailError onRetry={() => void q.refetch()} />;
  if (!q.data) return <NotFoundWithSeo />;
  const { album } = q.data;
  const title = tx(album.title, album.titleBn) || album.title;
  return (
    <article>
      <header className="site-tone-soft site-pad-md">
        <div className="site-container flex flex-col gap-3">
          <SiteLink href="/gallery" className="text-sm font-semibold">← {s('View all')}</SiteLink>
          <h1 className="site-h1">{title}</h1>
          {album.eventDate && <time className="site-muted" dateTime={album.eventDate}>{formatSiteDate(album.eventDate, lang, { day: 'numeric', month: 'long', year: 'numeric' })}</time>}
          {album.description && <p className="site-lead site-muted max-w-3xl whitespace-pre-line">{album.description}</p>}
        </div>
      </header>
      <div className="site-container site-pad-md">
        {!album.photos.length ? (
          <div className="site-empty"><p className="site-empty-title">{s('No photos yet')}</p></div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {album.photos.map((p, i) => (
              <figure key={i} className="m-0 flex flex-col gap-2">
                <SiteImage src={p.url} alt={p.caption ?? ''} width={800} className="aspect-square w-full object-cover" style={{ borderRadius: 'var(--site-radius)' }} />
                {p.caption && <figcaption className="site-muted text-xs">{p.caption}</figcaption>}
              </figure>
            ))}
          </div>
        )}
      </div>
    </article>
  );
}

/* ── Admission circular detail (/admissions/:id) ─────────────────────────── */

export function AdmissionDetailView({ id }: { id: string }) {
  const { siteId, api, lang, previewToken } = useSiteRuntime();
  const { s, tx } = useSiteText();
  const meta = useSiteMeta();
  const q = useQuery({
    queryKey: ['site-admission', siteId, id, previewToken ? 'preview' : 'live'],
    queryFn: () => api.admission(siteId!, id),
    enabled: Boolean(siteId && id),
    staleTime: 60_000,
    retry: (n, e) => n < 1 && !(e instanceof SiteApiError && e.status === 404),
  });
  useSiteSeo(q.data ? {
    title: tx(q.data.seo.title) || `${q.data.admission.title} | ${meta.siteName}`,
    description: tx(q.data.seo.description) || undefined,
    ogImage: q.data.seo.image ?? undefined,
    lang, favicon: meta.favicon, siteName: meta.siteName, noindex: Boolean(previewToken),
  } : null);

  if (q.isLoading) return <DetailSkeleton />;
  if (q.isError) return q.error instanceof SiteApiError && q.error.status === 404 ? <NotFoundWithSeo /> : <DetailError onRetry={() => void q.refetch()} />;
  if (!q.data) return <NotFoundWithSeo />;
  const { admission } = q.data;
  const title = tx(admission.title, admission.titleBn) || admission.title;
  return (
    <article>
      <header className="site-tone-soft site-pad-md">
        <div className="site-container site-w-narrow flex flex-col gap-3">
          <SiteLink href="/admissions" className="text-sm font-semibold">← {s('View all')}</SiteLink>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="site-h1 m-0">{title}</h1>
            <span className={`site-badge ${admission.closed ? '' : 'site-badge-accent'}`}>{admission.closed ? s('Closed') : s('Open')}</span>
          </div>
          <p className="site-muted flex flex-wrap gap-x-4 gap-y-1 text-sm">
            {admission.session && <span>{s('Session')}: {admission.session}</span>}
            {admission.classNames.length > 0 && <span>{s('Class')}: {admission.classNames.join(', ')}</span>}
            {admission.fee != null && <span>{s('Fee')}: {formatSiteMoney(admission.fee, 'BDT', lang)}</span>}
          </p>
          {(admission.startDate || admission.endDate) && (
            <p className="site-muted text-sm">
              {admission.startDate && formatSiteDate(admission.startDate, lang, { day: 'numeric', month: 'long', year: 'numeric' })}
              {admission.startDate && admission.endDate ? ' – ' : ''}
              {admission.endDate && formatSiteDate(admission.endDate, lang, { day: 'numeric', month: 'long', year: 'numeric' })}
            </p>
          )}
        </div>
      </header>
      <div className="site-container site-w-narrow site-pad-md flex flex-col gap-6">
        {admission.body && <RichHtml value={admission.body} />}
        <div className="flex flex-wrap gap-3">
          {admission.pdfUrl && <SiteLink href={admission.pdfUrl} className="site-btn site-btn-outline">{s('Download')}</SiteLink>}
          {!admission.closed && admission.applyUrl && <SiteLink href={admission.applyUrl} className="site-btn site-btn-primary">{s('Continue')}</SiteLink>}
        </div>
      </div>
    </article>
  );
}
