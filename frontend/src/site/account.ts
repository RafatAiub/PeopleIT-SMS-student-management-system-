/**
 * Customer session for the shop/LMS account pages: wraps the
 * `site-customer:<siteId>` storage in `api.ts` with a small reactive store
 * (so the header's account link and `/account` update together) and the
 * register/login/logout calls.
 *
 * The snapshot is cached per `siteId` (not re-parsed from `localStorage` on
 * every render) — `useSyncExternalStore` requires a stable reference between
 * notifications, or React treats every render as a change and can loop.
 */
import { useCallback, useSyncExternalStore } from 'react';
import { clearSiteCustomer, loadSiteCustomer, saveSiteCustomer, SiteApiError, type StoredSiteCustomer } from './api';
import { useSiteApi, useSiteRuntime } from './runtime';
import type { SiteCustomer } from './types';

type Listener = () => void;
const listeners = new Map<string, Set<Listener>>();
const cache = new Map<string, StoredSiteCustomer | null>();

function notify(siteId: string) {
  listeners.get(siteId)?.forEach((l) => l());
}

function subscribe(siteId: string, l: Listener): () => void {
  if (!listeners.has(siteId)) listeners.set(siteId, new Set());
  listeners.get(siteId)!.add(l);
  return () => listeners.get(siteId)?.delete(l);
}

/** Cached snapshot for `siteId` — read from storage only once per key, then updated only by `setCached`. */
function getCached(siteId: string): StoredSiteCustomer | null {
  if (!cache.has(siteId)) cache.set(siteId, loadSiteCustomer(siteId));
  return cache.get(siteId) ?? null;
}

function setCached(siteId: string, value: StoredSiteCustomer | null) {
  cache.set(siteId, value);
  if (value) saveSiteCustomer(siteId, value);
  else clearSiteCustomer(siteId);
  notify(siteId);
}

export interface SiteAccount {
  customer: SiteCustomer | null;
  token: string | null;
  connected: boolean;
  register: (input: { name: string; email: string; password: string; phone?: string }) => Promise<StoredSiteCustomer>;
  login: (input: { email: string; password: string }) => Promise<StoredSiteCustomer>;
  logout: () => void;
  /** Re-fetches `/account/me` (e.g. after the token might have gone stale) and updates storage. */
  refresh: () => Promise<SiteCustomer | null>;
}

export function useSiteAccount(): SiteAccount {
  const { siteId } = useSiteRuntime();
  const api = useSiteApi();
  const key = siteId ?? '';

  const stored = useSyncExternalStore(
    (l) => subscribe(key, l),
    () => (key ? getCached(key) : null),
    () => null,
  );

  const register = useCallback(
    async (input: { name: string; email: string; password: string; phone?: string }) => {
      if (!siteId) throw new SiteApiError('Not connected', 0);
      const res = await api.accountRegister(siteId, input);
      setCached(siteId, res);
      return res;
    },
    [siteId, api],
  );

  const login = useCallback(
    async (input: { email: string; password: string }) => {
      if (!siteId) throw new SiteApiError('Not connected', 0);
      const res = await api.accountLogin(siteId, input);
      setCached(siteId, res);
      return res;
    },
    [siteId, api],
  );

  const logout = useCallback(() => {
    if (!siteId) return;
    setCached(siteId, null);
  }, [siteId]);

  const refresh = useCallback(async () => {
    if (!siteId || !stored?.token) return null;
    try {
      const customer = await api.accountMe(siteId, stored.token);
      setCached(siteId, { token: stored.token, customer });
      return customer;
    } catch (e) {
      if (e instanceof SiteApiError && e.status === 401) logout();
      return null;
    }
  }, [siteId, stored?.token, api, logout]);

  return { customer: stored?.customer ?? null, token: stored?.token ?? null, connected: Boolean(siteId), register, login, logout, refresh };
}
