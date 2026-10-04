/**
 * SEO for a collection template page (W5): the page's own SEO title / description
 * may contain `{{item.x}}` tokens (filled from the item); anything left empty
 * falls back to the item's API-derived SEO, then to its title field.
 */
import { scopeTokens, type Rec } from '../binding';
import { fillTokens, tidyFilled, type TokenMap } from '../tokens';
import type { SiteLang, SiteSeo } from '../types';

export interface TemplateSeoInput {
  pageSeo: SiteSeo | undefined;
  /** `seo` of `GET /collections/:key/items/:slug`. */
  itemSeo: { title?: string | null; description?: string | null; image?: string | null } | undefined;
  item: Rec;
  titleField: string;
  siteName: string;
  siteTokens: TokenMap;
  lang: SiteLang;
}

export interface TemplateSeo {
  title: string;
  description?: string;
  ogImage?: string;
  noindex?: boolean;
}

export function resolveTemplateSeo(i: TemplateSeoInput): TemplateSeo {
  const tokens: TokenMap = { ...i.siteTokens, ...scopeTokens({ item: i.item }) };
  const fill = (t: string | undefined) => (t ? tidyFilled(fillTokens(t, tokens, { lang: i.lang })) : '');
  const itemTitle = (i.itemSeo?.title || (typeof i.item[i.titleField] === 'string' ? (i.item[i.titleField] as string) : '') || '').trim();
  const title = fill(i.pageSeo?.title) || (itemTitle ? (i.siteName ? `${itemTitle} | ${i.siteName}` : itemTitle) : i.siteName);
  const description = fill(i.pageSeo?.description) || (i.itemSeo?.description ?? '') || undefined;
  const ogImage = i.pageSeo?.ogImage || i.itemSeo?.image || undefined;
  return { title, description, ogImage, noindex: i.pageSeo?.noindex };
}
