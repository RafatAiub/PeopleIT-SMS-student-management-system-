import { useQuery } from '@tanstack/react-query';
import { createSiteApi } from '@/site/api';
import { publicCollections, type CollectionMeta } from '@/site/collections';

/**
 * The collection registry (`GET /public/sites/:siteId/collections`) for dashboard
 * screens that sit outside the editor's SiteRuntimeProvider (Pages tab, SEO drawer).
 * Needs the preview token while the site is unpublished.
 */
export function useCollectionRegistry(siteId: string | undefined, previewToken: string | null | undefined) {
  return useQuery({
    queryKey: ['site-collections-registry', siteId, previewToken ? 'preview' : 'live'],
    queryFn: async (): Promise<CollectionMeta[]> => publicCollections(await createSiteApi(previewToken).collections(siteId as string)),
    enabled: Boolean(siteId),
    staleTime: 5 * 60_000,
    retry: 1,
  });
}
