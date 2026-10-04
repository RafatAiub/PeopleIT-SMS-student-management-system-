// =============================================================================
// Website collections — public service. One generic, tenant-safe query API
// over the whitelisted registry in sites.collections.ts. Same publish/preview
// rules as every other public endpoint (visibleSite).
// =============================================================================

import { Site } from '@prisma/client';
import { ForbiddenError, NotFoundError } from '../../utils/AppError';
import { MAX_PAGE_SIZE, parseCollectionQuery, parseIncludeOnly } from './sites.collections.logic';
import { COLLECTIONS, getCollection, type CollectionCtx, type CollectionDef, type Item } from './sites.collections';
import { ctxOf } from './sites.collections.templates';
import { visibleSite } from './sites.public.service';
import { plainTextExcerpt } from './sites.portal.logic';

function requireCollection(key: string): CollectionDef {
  // `students` (and anything else unregistered) is simply not a collection.
  const def = getCollection(key);
  if (!def) throw new NotFoundError('Unknown collection');
  return def;
}

function requireAvailable(def: CollectionDef, ctx: CollectionCtx) {
  const reason = def.unavailableReason(ctx);
  if (reason) throw new ForbiddenError(reason);
}

// ── Registry (editor) ───────────────────────────────────────────────────────

export async function schema(siteId: string, preview?: string) {
  const { site, preview: isPreview } = await visibleSite(siteId, preview);
  const ctx = ctxOf(site, isPreview);
  return {
    preview: isPreview,
    collections: COLLECTIONS.map((def) => {
      const reason = def.unavailableReason(ctx);
      return {
        key: def.key,
        label: def.label,
        labelPlural: def.labelPlural,
        available: reason === null,
        unavailableReason: reason,
        slugSource: def.slugSource,
        titleField: def.titleField,
        routeBase: def.routeBase,
        defaultSort: def.defaultSort,
        maxPageSize: MAX_PAGE_SIZE,
        fields: def.fields.map((f) => ({
          key: f.key,
          label: f.label,
          type: f.type,
          filter: f.filter ?? [],
          sortable: Boolean(f.sortable),
          searchable: Boolean(f.searchable),
          detailOnly: Boolean(f.detailOnly),
          options: f.options ?? null,
        })),
        relations: def.relations.map((r) => ({ key: r.key, label: r.label, collection: r.collection, many: r.many })),
      };
    }),
  };
}

// ── Query ───────────────────────────────────────────────────────────────────

export async function listItems(siteId: string, key: string, rawQuery: Record<string, unknown>, previewToken?: string) {
  const { site, preview } = await visibleSite(siteId, previewToken);
  const def = requireCollection(key);
  const q = parseCollectionQuery(def, rawQuery);
  const ctx = ctxOf(site, preview);
  requireAvailable(def, ctx);
  const { rows, total } = await def.list(ctx, q);
  await def.include(ctx, rows, q.include);
  return { items: rows.map((r) => r.item), total, page: q.page, pageSize: q.pageSize, preview };
}

function seoOf(def: CollectionDef, item: Item) {
  const title = item[def.titleField];
  const descSource = def.seo.description ? item[def.seo.description] : null;
  const imgSource = def.seo.image ? item[def.seo.image] : null;
  const image = Array.isArray(imgSource) ? imgSource[0] : imgSource;
  return {
    title: typeof title === 'string' ? title : null,
    description: typeof descSource === 'string' ? plainTextExcerpt(descSource, 160) : null,
    image: typeof image === 'string' ? image : null,
  };
}

export async function getItem(siteId: string, key: string, slug: string, rawQuery: Record<string, unknown>, previewToken?: string) {
  const { site, preview } = await visibleSite(siteId, previewToken);
  const def = requireCollection(key);
  const include = parseIncludeOnly(def, rawQuery);
  const ctx = ctxOf(site, preview);
  requireAvailable(def, ctx);
  const row = await def.get(ctx, slug);
  if (!row) throw new NotFoundError('Item not found');
  await def.include(ctx, [row], include);
  return { item: row.item, seo: seoOf(def, row.item), preview };
}
