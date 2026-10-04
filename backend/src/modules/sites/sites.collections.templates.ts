// =============================================================================
// Website collections — template (profile) pages: the templateRoutes returned
// by resolve and the sitemap entries. Kept apart from the query service so
// sites.public.service.ts can import it without an import cycle.
// =============================================================================

import { Prisma, Site } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { joinItemPath, type ParsedQuery } from './sites.collections.logic';
import { getCollection, type CollectionCtx } from './sites.collections';

const settingsOf = (site: Site): Record<string, unknown> => (site.settings && typeof site.settings === 'object' ? (site.settings as Record<string, unknown>) : {});

export function ctxOf(site: Site, preview: boolean): CollectionCtx {
  return { siteId: site.id, institutionId: site.institutionId, preview, settings: settingsOf(site) };
}

// ── Template pages: resolve + sitemap ───────────────────────────────────────

/** One entry per TEMPLATE page the visitor may see (published, or any when previewing). */
export async function templateRoutes(site: Pick<Site, 'id' | 'institutionId'>, preview: boolean) {
  const pages = await prisma.sitePage.findMany({
    where: {
      siteId: site.id,
      institutionId: site.institutionId,
      kind: 'TEMPLATE',
      collectionKey: { not: null },
      ...(preview ? {} : { published: { not: Prisma.DbNull } }),
    },
    select: { slug: true, collectionKey: true },
    orderBy: { sortOrder: 'asc' },
  });
  const out: { collection: string; base: string; pageSlug: string }[] = [];
  for (const p of pages) {
    const def = p.collectionKey ? getCollection(p.collectionKey) : undefined;
    if (def?.routeBase) out.push({ collection: def.key, base: def.routeBase, pageSlug: p.slug });
  }
  return out;
}

const SITEMAP_CAP = 500;

/** Every item URL of every collection that has a published TEMPLATE page. */
export async function templateSitemapPaths(site: Site): Promise<{ path: string; lastmod: null }[]> {
  const routes = await templateRoutes(site, false);
  const ctx = ctxOf(site, false);
  const all: ParsedQuery = { filters: [], sort: [], q: null, page: 1, pageSize: SITEMAP_CAP, include: [] };
  const out: { path: string; lastmod: null }[] = [];
  for (const r of routes) {
    const def = getCollection(r.collection);
    if (!def || def.unavailableReason(ctx)) continue;
    const { rows } = await def.list(ctx, all);
    for (const row of rows) {
      const slug = row.item.slug;
      if (typeof slug === 'string' && slug) out.push({ path: joinItemPath(r.base, slug), lastmod: null });
    }
  }
  return out;
}
