/**
 * Pure route parsing for the public site (no React/router import, so it's
 * unit-testable directly). `PublicSite.tsx`'s `SiteShell` uses this to pick
 * which view to render for a path relative to the site root.
 */

export type SiteRoute =
  | { kind: 'blog-list' }
  | { kind: 'blog-post'; slug: string }
  | { kind: 'shop-list' }
  | { kind: 'shop-product'; slug: string }
  | { kind: 'cart' }
  | { kind: 'checkout' }
  | { kind: 'order-lookup' }
  | { kind: 'order-status'; orderNo: string }
  | { kind: 'courses-list' }
  | { kind: 'course-detail'; slug: string }
  | { kind: 'learn-index' }
  | { kind: 'learn-player'; courseSlug: string; lessonId?: string }
  | { kind: 'account'; sub?: 'login' | 'register' | 'orders' | 'forgot' | 'reset-password' }
  | { kind: 'notice-detail'; id: string }
  | { kind: 'album-detail'; id: string }
  | { kind: 'admission-detail'; id: string }
  | { kind: 'page'; slug: string };

/** First path segments reserved for built-in routes — pages cannot use these slugs (see backend §2). */
export const RESERVED_SLUGS = ['blog', 'shop', 'cart', 'checkout', 'order', 'courses', 'learn', 'account'] as const;

/**
 * `notices/:id`, `gallery/:id` and `admissions/:id` are detail routes (Track B
 * §7.3/§7.4 — the sitemap links exactly these paths), but their single-segment
 * form (`/notices`, `/gallery`, `/admissions`) stays a normal content page —
 * several templates already ship a page with that exact slug (e.g.
 * `templates/modern-campus.ts`'s `gallery` page). Unlike `blog`, these are
 * **not** in `RESERVED_SLUGS`: the backend doesn't reserve them either (only
 * the words above are blocked from page creation), so schools may still title
 * a page "Notices"/"Gallery"/"Admissions" — the two-segment form simply never
 * collides with a real (flat) page slug.
 */
const DETAIL_LIST_SLUGS = { notices: 'notice-detail', gallery: 'album-detail', admissions: 'admission-detail' } as const;

export function isReservedSlug(first: string): boolean {
  return (RESERVED_SLUGS as readonly string[]).includes(first);
}

/** `path` is relative to the site root (no leading `/s/:subdomain`), e.g. `shop/uniform-set`. */
export function parseSitePath(path: string): SiteRoute {
  const clean = path.replace(/^\/+|\/+$/g, '');
  const [first, second, third] = clean.split('/');

  if (first === 'blog' && !second) return { kind: 'blog-list' };
  if (first === 'blog' && second && !third) return { kind: 'blog-post', slug: second };
  if (first === 'shop' && !second) return { kind: 'shop-list' };
  if (first === 'shop' && second && !third) return { kind: 'shop-product', slug: second };
  if (first === 'cart' && !second) return { kind: 'cart' };
  if (first === 'checkout' && !second) return { kind: 'checkout' };
  if (first === 'order' && !second) return { kind: 'order-lookup' };
  if (first === 'order' && second && !third) return { kind: 'order-status', orderNo: second };
  if (first === 'courses' && !second) return { kind: 'courses-list' };
  if (first === 'courses' && second && !third) return { kind: 'course-detail', slug: second };
  if (first === 'learn' && !second) return { kind: 'learn-index' };
  if (first === 'learn' && second) return { kind: 'learn-player', courseSlug: second, lessonId: third || undefined };
  if (first === 'account') {
    const sub = second === 'login' || second === 'register' || second === 'orders' || second === 'forgot' || second === 'reset-password' ? second : undefined;
    return { kind: 'account', sub };
  }
  if (first && second && !third && first in DETAIL_LIST_SLUGS) {
    return { kind: DETAIL_LIST_SLUGS[first as keyof typeof DETAIL_LIST_SLUGS], id: second };
  }
  return { kind: 'page', slug: clean };
}
