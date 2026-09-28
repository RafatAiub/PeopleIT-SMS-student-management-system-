/**
 * Applies the site-wide `customCss` / `headHtml` / `bodyEndHtml` (§1):
 *  - `customCss` is always injected as a `<style>` (CSS can't run script);
 *    removed on unmount / change.
 *  - `headHtml` / `bodyEndHtml` run **only** in host mode on a non-app host
 *    (a real custom domain or platform subdomain) — never in path-mode
 *    preview (`/s/:subdomain`) and never while `mode === 'editor'`.
 */
import { useEffect } from 'react';
import { useSiteRuntime } from '../runtime';
import { injectHtml } from './hostScripts';

export function SiteCustomCode({ hostMode }: { hostMode: boolean }) {
  const { settings, mode } = useSiteRuntime();

  useEffect(() => {
    if (!settings.customCss || typeof document === 'undefined') return undefined;
    const el = document.createElement('style');
    el.setAttribute('data-site-custom-css', '');
    el.textContent = settings.customCss;
    document.head.appendChild(el);
    return () => el.remove();
  }, [settings.customCss]);

  useEffect(() => {
    if (!hostMode || mode === 'editor' || !settings.headHtml || typeof document === 'undefined') return undefined;
    return injectHtml(settings.headHtml, document.head, 'data-site-head-html');
  }, [hostMode, mode, settings.headHtml]);

  useEffect(() => {
    if (!hostMode || mode === 'editor' || !settings.bodyEndHtml || typeof document === 'undefined') return undefined;
    return injectHtml(settings.bodyEndHtml, document.body, 'data-site-body-html');
  }, [hostMode, mode, settings.bodyEndHtml]);

  return null;
}
