/**
 * Client-side SEO tags for the public site: title, description, OG tags,
 * canonical, hreflang, robots, favicon. Everything added is tagged
 * `data-site-seo` and removed on unmount so path-mode previews inside the
 * app don't leave tags behind.
 *
 * Server-side rendering (so crawlers that don't run JS see these tags) is a
 * later deployment step: on Vercel, an edge function/middleware can call
 * GET /public/sites/resolve + /pages/:slug and inject the same tags into
 * index.html before serving it.
 */
import { useEffect } from 'react';
import type { SiteLang } from '../types';

export interface SeoInput {
  title: string;
  description?: string;
  ogImage?: string;
  noindex?: boolean;
  canonical?: string;
  lang: SiteLang;
  /** Other language versions: `{ en: url, bn: url }`. */
  alternates?: Partial<Record<SiteLang, string>>;
  favicon?: string;
  siteName?: string;
}

const ATTR = 'data-site-seo';

function upsertMeta(doc: Document, key: 'name' | 'property', name: string, content: string | undefined) {
  let el = doc.head.querySelector<HTMLMetaElement>(`meta[${key}="${name}"][${ATTR}]`);
  if (!content) { el?.remove(); return; }
  if (!el) {
    el = doc.createElement('meta');
    el.setAttribute(key, name);
    el.setAttribute(ATTR, '');
    doc.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

function addLink(doc: Document, rel: string, href: string, extra: Record<string, string> = {}) {
  const el = doc.createElement('link');
  el.rel = rel;
  el.href = href;
  for (const [k, v] of Object.entries(extra)) el.setAttribute(k, v);
  el.setAttribute(ATTR, '');
  doc.head.appendChild(el);
}

export function useSiteSeo(seo: SeoInput | null) {
  const key = seo ? JSON.stringify(seo) : '';
  useEffect(() => {
    if (!seo || typeof document === 'undefined') return;
    const doc = document;
    const prevTitle = doc.title;
    const prevLang = doc.documentElement.lang;
    // The app's own description/OG tags describe the dashboard; hide them while a site renders.
    const appMeta = Array.from(doc.head.querySelectorAll<HTMLMetaElement>(`meta[name="description"]:not([${ATTR}]), meta[property^="og:"]:not([${ATTR}])`));
    appMeta.forEach((m) => m.setAttribute('data-site-hidden', m.getAttribute('content') ?? ''));
    appMeta.forEach((m) => m.removeAttribute('content'));
    const appIcons = Array.from(doc.head.querySelectorAll<HTMLLinkElement>(`link[rel~="icon"]:not([${ATTR}])`));
    if (seo.favicon) appIcons.forEach((l) => { l.dataset.siteHref = l.href; l.removeAttribute('href'); });

    doc.title = seo.title;
    doc.documentElement.lang = seo.lang;
    upsertMeta(doc, 'name', 'description', seo.description);
    upsertMeta(doc, 'name', 'robots', seo.noindex ? 'noindex, nofollow' : undefined);
    upsertMeta(doc, 'property', 'og:title', seo.title);
    upsertMeta(doc, 'property', 'og:description', seo.description);
    upsertMeta(doc, 'property', 'og:image', seo.ogImage);
    upsertMeta(doc, 'property', 'og:type', 'website');
    upsertMeta(doc, 'property', 'og:site_name', seo.siteName);
    upsertMeta(doc, 'property', 'og:locale', seo.lang === 'bn' ? 'bn_BD' : 'en_GB');
    upsertMeta(doc, 'property', 'og:url', seo.canonical);
    upsertMeta(doc, 'name', 'twitter:card', seo.ogImage ? 'summary_large_image' : 'summary');
    doc.head.querySelectorAll(`link[${ATTR}]`).forEach((l) => l.remove());
    if (seo.canonical) addLink(doc, 'canonical', seo.canonical);
    for (const [lang, href] of Object.entries(seo.alternates ?? {})) if (href) addLink(doc, 'alternate', href, { hreflang: lang });
    if (seo.alternates?.en) addLink(doc, 'alternate', seo.alternates.en, { hreflang: 'x-default' });
    if (seo.favicon) addLink(doc, 'icon', seo.favicon);

    return () => {
      doc.title = prevTitle;
      doc.documentElement.lang = prevLang;
      doc.head.querySelectorAll(`[${ATTR}]`).forEach((el) => el.remove());
      appMeta.forEach((m) => { m.setAttribute('content', m.getAttribute('data-site-hidden') ?? ''); m.removeAttribute('data-site-hidden'); });
      appIcons.forEach((l) => { if (l.dataset.siteHref) l.href = l.dataset.siteHref; delete l.dataset.siteHref; });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}

/** Loads GA4 once for a published site (`settings.analyticsId` like `G-XXXXXXX`). */
export function useAnalytics(id: string | undefined, enabled: boolean) {
  useEffect(() => {
    if (!enabled || !id || !/^G-[A-Z0-9]{4,20}$/i.test(id) || typeof document === 'undefined') return;
    if (document.getElementById('site-ga')) return;
    const s = document.createElement('script');
    s.id = 'site-ga';
    s.async = true;
    s.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`;
    document.head.appendChild(s);
    const w = window as unknown as { dataLayer: unknown[]; gtag?: (...a: unknown[]) => void };
    w.dataLayer = w.dataLayer || [];
    w.gtag = function gtag(...args: unknown[]) { w.dataLayer.push(args); };
    w.gtag('js', new Date());
    w.gtag('config', id, { anonymize_ip: true });
  }, [id, enabled]);
}
