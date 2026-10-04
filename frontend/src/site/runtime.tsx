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
import type { NavItem, PublicInstitution, PublicPageRef, PublicProfile, SiteLang, SiteNavigation, SiteSettings, SiteTheme } from './types';
import { DEFAULT_SETTINGS, DEFAULT_THEME } from './theme';
import { buildSiteTokens, fillTokens, tidyFilled, type TokenMap } from './tokens';
import { scopeTokens } from './binding';
import { ScopeContext } from './scopeContext';
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
  /**
   * Server-computed "Powered by PeopleNIT" gate (`resolve`'s `site.poweredBy`
   * — see docs/redesign/WEBSITE_V3_PLAN.md §7.6). Never derive this from
   * `settings` on the client; defaults to `true` (show the credit).
   */
  poweredBy: boolean;
  /** `GET /data/profile` (Track B §7.3), fetched lazily so tokens like `{{institution.eiin}}` can fill in once it loads; `null` until fetched or on a design preview with no siteId. */
  profile?: PublicProfile | null;
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
  poweredBy: true,
  profile: null,
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
  /** Server-computed footer-credit gate (`resolve`'s `site.poweredBy`); defaults to `true`. */
  poweredBy?: boolean;
  children: ReactNode;
}

export function SiteRuntimeProvider(props: SiteRuntimeProviderProps) {
  const {
    siteId, lang = 'en', setLang, mode = 'public', institution = null, settings = DEFAULT_SETTINGS,
    theme = DEFAULT_THEME, navigation, pages, subdomain, canonicalUrl, basePath = '', previewToken, poweredBy = true, children,
  } = props;
  const api = useMemo(() => (previewToken ? createSiteApi(previewToken) : siteApi), [previewToken]);
  // Fetched lazily (not part of `resolve`) so the profile-only tokens
  // ({{institution.eiin}}, {{head.name}}…) fill in once it loads; every other
  // token still renders immediately from `institution`/`settings`.
  const profileQ = useQuery({
    queryKey: ['site-public', siteId, previewToken ? 'preview' : 'live', 'profile'],
    queryFn: () => api.profile(siteId as string),
    enabled: Boolean(siteId),
    staleTime: 10 * 60_000,
    retry: false,
  });
  const value = useMemo<SiteRuntime>(
    () => ({
      siteId, lang, setLang, mode, institution, settings, theme, navigation, pages, subdomain, canonicalUrl,
      basePath: basePath.replace(/\/$/, ''),
      previewToken,
      api,
      tokens: buildSiteTokens({ institution, settings, lang, profile: profileQ.data }),
      liteMode: settings.liteMode === true,
      poweredBy,
      profile: profileQ.data ?? null,
    }),
    [siteId, lang, setLang, mode, institution, settings, theme, navigation, pages, subdomain, canonicalUrl, basePath, previewToken, api, poweredBy, profileQ.data],
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
  const scope = useContext(ScopeContext);
  // Site tokens + data-scope tokens ({{item.x}}, {{parent.x}}, {{page.x}}, {{url.q}}).
  const tokens = useMemo<TokenMap>(() => ({ ...rt.tokens, ...scopeTokens(scope) }), [rt.tokens, scope]);
  // Missing token values render empty everywhere (editor included) — never literal braces.
  const keepMissing = false;
  const tx = useCallback(
    (en: unknown, bn?: unknown): string => {
      const pick = rt.lang === 'bn' && typeof bn === 'string' && bn.trim() ? bn : typeof en === 'string' ? en : '';
      if (pick.indexOf('{{') === -1) return pick;
      return tidyFilled(fillTokens(pick, tokens, { keepMissing, lang: rt.lang }));
    },
    [rt.lang, tokens, keepMissing],
  );
  const s = useCallback((key: string, vars?: Record<string, string | number>) => siteString(rt.lang, key, vars), [rt.lang]);
  const navLabel = useCallback((item: NavItem) => tx(item.label, item.labelBn), [tx]);
  return { tx, s, navLabel, lang: rt.lang, tokens, keepMissing };
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
