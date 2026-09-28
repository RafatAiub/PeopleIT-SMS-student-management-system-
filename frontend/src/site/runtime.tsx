/**
 * SiteRuntimeContext: everything a block needs to know about where it is
 * rendering. Both the editor (Engineer C wraps <Puck> in
 * <SiteRuntimeProvider mode="editor" …>) and the public renderer provide it.
 *
 *   <SiteRuntimeProvider siteId={site.id} lang={lang} mode="editor"
 *     institution={institution} settings={site.settings} theme={site.theme}>
 *     <Puck config={siteConfig} … />
 *   </SiteRuntimeProvider>
 */
import { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { NavItem, PublicInstitution, PublicPageRef, SiteLang, SiteNavigation, SiteSettings, SiteTheme } from './types';
import { DEFAULT_SETTINGS, DEFAULT_THEME } from './theme';
import { buildSiteTokens, fillTokens, tidyFilled, type TokenMap } from './tokens';
import { siteString } from './strings';
import { createSiteApi, siteApi, type SiteApi } from './api';

export type SiteRuntimeMode = 'public' | 'preview' | 'editor';

export interface SiteRuntime {
  /** Needed by live-data blocks; null = not connected (blocks show an empty state). */
  siteId: string | null;
  lang: SiteLang;
  setLang?: (lang: SiteLang) => void;
  mode: SiteRuntimeMode;
  institution: PublicInstitution | null;
  settings: SiteSettings;
  theme: SiteTheme;
  navigation?: SiteNavigation;
  pages?: PublicPageRef[];
  subdomain?: string;
  /** Live base URL (primary domain or subdomain) for canonical / hreflang tags. */
  canonicalUrl?: string;
  /** Prefix for internal links: `/s/<subdomain>` in path mode, '' on a site host. */
  basePath: string;
  /**
   * Preview token. Required for every public endpoint until the site is
   * published (sent as `X-Site-Preview`); the editor passes the one from
   * `GET /sites/me` (refresh with `POST /sites/me/preview-token`).
   */
  previewToken?: string | null;
  /** Public API client bound to `previewToken`. */
  api: SiteApi;
  tokens: TokenMap;
  liteMode: boolean;
}

const DEFAULT_RUNTIME: SiteRuntime = {
  siteId: null,
  lang: 'en',
  mode: 'public',
  institution: null,
  settings: DEFAULT_SETTINGS,
  theme: DEFAULT_THEME,
  basePath: '',
  tokens: buildSiteTokens({}),
  liteMode: false,
  api: siteApi,
};

export const SiteRuntimeContext = createContext<SiteRuntime>(DEFAULT_RUNTIME);

export interface SiteRuntimeProviderProps {
  siteId: string | null;
  lang?: SiteLang;
  setLang?: (lang: SiteLang) => void;
  mode?: SiteRuntimeMode;
  institution?: PublicInstitution | null;
  settings?: SiteSettings;
  theme?: SiteTheme;
  navigation?: SiteNavigation;
  pages?: PublicPageRef[];
  subdomain?: string;
  canonicalUrl?: string;
  basePath?: string;
  previewToken?: string | null;
  children: ReactNode;
}

export function SiteRuntimeProvider(props: SiteRuntimeProviderProps) {
  const {
    siteId, lang = 'en', setLang, mode = 'public', institution = null, settings = DEFAULT_SETTINGS,
    theme = DEFAULT_THEME, navigation, pages, subdomain, canonicalUrl, basePath = '', previewToken, children,
  } = props;
  const value = useMemo<SiteRuntime>(
    () => ({
      siteId, lang, setLang, mode, institution, settings, theme, navigation, pages, subdomain, canonicalUrl,
      basePath: basePath.replace(/\/$/, ''),
      previewToken,
      api: previewToken ? createSiteApi(previewToken) : siteApi,
      tokens: buildSiteTokens({ institution, settings, lang }),
      liteMode: settings.liteMode === true,
    }),
    [siteId, lang, setLang, mode, institution, settings, theme, navigation, pages, subdomain, canonicalUrl, basePath, previewToken],
  );
  return <SiteRuntimeContext.Provider value={value}>{children}</SiteRuntimeContext.Provider>;
}

export function useSiteRuntime(): SiteRuntime {
  return useContext(SiteRuntimeContext);
}

export function useIsEditing(): boolean {
  return useContext(SiteRuntimeContext).mode === 'editor';
}

/**
 * `tx(en, bn)`: picks the Bangla twin when the site language is Bangla and
 * the twin is filled, then fills template tokens. Tokens with no value (e.g. no address on file) render as empty text.
 */
export function useSiteText() {
  const rt = useContext(SiteRuntimeContext);
  // Missing token values render empty everywhere (editor included) — never literal braces.
  const keepMissing = false;
  const tx = useCallback(
    (en: unknown, bn?: unknown): string => {
      const pick = rt.lang === 'bn' && typeof bn === 'string' && bn.trim() ? bn : typeof en === 'string' ? en : '';
      if (pick.indexOf('{{') === -1) return pick;
      return tidyFilled(fillTokens(pick, rt.tokens, { keepMissing }));
    },
    [rt.lang, rt.tokens, keepMissing],
  );
  const s = useCallback((key: string, vars?: Record<string, string | number>) => siteString(rt.lang, key, vars), [rt.lang]);
  const navLabel = useCallback((item: NavItem) => tx(item.label, item.labelBn), [tx]);
  return { tx, s, navLabel, lang: rt.lang, tokens: rt.tokens, keepMissing };
}

/** Internal link → path under the site base (keeps preview token). External links untouched. */
export function useSiteHref() {
  const { basePath, previewToken } = useContext(SiteRuntimeContext);
  return useCallback(
    (href: string | undefined): string | undefined => {
      if (!href) return undefined;
      if (!href.startsWith('/') || href.startsWith('//')) return href;
      const path = `${basePath}${href === '/' ? '' : href}` || '/';
      if (!previewToken) return path || '/';
      const [p, hash = ''] = path.split('#');
      const sep = p.includes('?') ? '&' : '?';
      return `${p || '/'}${sep}preview=${encodeURIComponent(previewToken)}${hash ? `#${hash}` : ''}`;
    },
    [basePath, previewToken],
  );
}

/** The public API client for this runtime (carries the preview token). */
export function useSiteApi(): SiteApi {
  return useContext(SiteRuntimeContext).api;
}

/**
 * Live-data query for blocks. Disabled until a siteId exists; blocks check
 * `connected` and show a "not connected" state instead of fetching.
 */
export function useSiteData<T>(
  key: readonly unknown[],
  fetcher: (siteId: string, api: SiteApi) => Promise<T>,
  opts: { enabled?: boolean; staleTime?: number } = {},
): UseQueryResult<T> & { connected: boolean } {
  const { siteId, api, previewToken } = useContext(SiteRuntimeContext);
  const q = useQuery({
    queryKey: ['site-public', siteId, previewToken ? 'preview' : 'live', ...key],
    queryFn: () => fetcher(siteId as string, api),
    enabled: Boolean(siteId) && opts.enabled !== false,
    staleTime: opts.staleTime ?? 60_000,
    retry: (count, err) => count < 1 && !(err && typeof err === 'object' && 'status' in err && [400, 403, 404].includes((err as { status: number }).status)),
  });
  return Object.assign(q, { connected: Boolean(siteId) });
}
