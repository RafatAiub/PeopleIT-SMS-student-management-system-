import { paginatedResponse, successResponse } from '../../utils/response';
import { cache, previewOf, q, wrap } from './sites.controller';
import * as svc from './sites.collections.service';

// =============================================================================
// Website collections — thin public controllers (contract: FEATURES_V4_PLAN.md §8).
// Published responses are cached briefly; previews never.
// =============================================================================

const SECONDS = 120;

export const collectionsSchema = wrap(async (req, res) => {
  const r = await svc.schema(req.params.siteId, previewOf(req));
  cache(res, r.preview, SECONDS);
  successResponse(res, { collections: r.collections });
});

export const collectionList = wrap(async (req, res) => {
  const r = await svc.listItems(req.params.siteId, req.params.key, q(req), previewOf(req));
  cache(res, r.preview, SECONDS);
  paginatedResponse(res, r.items, r.total, r.page, r.pageSize, 'Success', { collection: req.params.key, preview: r.preview });
});

export const collectionItem = wrap(async (req, res) => {
  const r = await svc.getItem(req.params.siteId, req.params.key, req.params.slug, q(req), previewOf(req));
  cache(res, r.preview, SECONDS);
  successResponse(res, r);
});
