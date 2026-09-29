/**
 * Single source of truth for "which public data sources exist" — used by the
 * generic `DataList` block (`blocks/portal-data.tsx`) and by the sandboxed
 * code bridge's `SITE.data(source, params)` (`code/SandboxFrame.tsx`), so a
 * source can never be fetched from the sandbox that isn't also a real,
 * public-safe endpoint a visual block could show (docs/redesign/WEBSITE_V3_PLAN.md §7.3, C4).
 */
import type { SiteApi } from './api';

/** Every source `DataList` and `SITE.data()` may fetch. Kept in sync with Track B §7.3 plus the pre-existing v1/v2 endpoints. */
export const SITE_DATA_SOURCES = [
  'notices', 'events', 'teachers', 'staff', 'posts', 'courses', 'products',
  'profile', 'stats', 'toppers', 'routine', 'fees-link',
  'class-stats', 'subjects', 'exam-routine', 'result-summary', 'results-archive',
  'fee-chart', 'holidays', 'library', 'transport', 'branches',
  'committee', 'albums', 'downloads', 'admissions',
] as const;

export type SiteDataSourceKey = (typeof SITE_DATA_SOURCES)[number];

export function isSiteDataSource(v: unknown): v is SiteDataSourceKey {
  return typeof v === 'string' && (SITE_DATA_SOURCES as readonly string[]).includes(v);
}

/** Result shape is source-dependent (always JSON-safe); callers narrow it. */
export async function fetchSiteData(siteId: string, api: SiteApi, source: SiteDataSourceKey, params: Record<string, unknown> = {}): Promise<unknown> {
  const p = params ?? {};
  switch (source) {
    case 'notices': return api.notices(siteId, Number(p.limit) || 5);
    case 'events': return api.events(siteId, { from: p.from as string | undefined, to: p.to as string | undefined });
    case 'teachers': return api.teachers(siteId);
    case 'staff': return api.staff(siteId, { category: (p.category as 'head' | 'teachers' | 'staff' | undefined) ?? 'teachers' });
    case 'posts': return api.posts(siteId, { page: Number(p.page) || 1, pageSize: Number(p.pageSize) || 9, tag: p.tag as string | undefined });
    case 'courses': return api.courses(siteId, Number(p.limit) || 6);
    case 'products': return api.products(siteId, { category: p.category as string | undefined, q: p.q as string | undefined, page: Number(p.page) || 1, pageSize: Number(p.pageSize) || 12 });
    case 'profile': return api.profile(siteId);
    case 'stats': return api.stats(siteId);
    case 'toppers': return api.toppers(siteId, { examId: p.examId as string | undefined, limit: Number(p.limit) || 10 });
    case 'routine': return api.routine(siteId, { class: p.class as string | undefined, section: p.section as string | undefined });
    case 'fees-link': return api.feesLink(siteId);
    case 'class-stats': return api.classStats(siteId);
    case 'subjects': return api.subjects(siteId, { class: p.class as string | undefined });
    case 'exam-routine': return api.examRoutine(siteId, { examId: p.examId as string | undefined, class: p.class as string | undefined });
    case 'result-summary': return api.resultSummary(siteId, { examId: p.examId as string | undefined });
    case 'results-archive': return api.resultsArchive(siteId);
    case 'fee-chart': return api.feeChart(siteId);
    case 'holidays': return api.holidaysCalendar(siteId, { year: p.year ? Number(p.year) : undefined });
    case 'library': return api.library(siteId, { q: p.q as string | undefined, page: Number(p.page) || 1, pageSize: Number(p.pageSize) || 20 });
    case 'transport': return api.transport(siteId);
    case 'branches': return api.branches(siteId);
    case 'committee': return api.committee(siteId);
    case 'albums': return api.albums(siteId, { page: Number(p.page) || 1, pageSize: Number(p.pageSize) || 12 });
    case 'downloads': return api.downloads(siteId, { category: p.category as string | undefined });
    case 'admissions': return api.admissions(siteId, { page: Number(p.page) || 1, pageSize: Number(p.pageSize) || 10 });
    default: throw new Error(`Unknown data source: ${String(source)}`);
  }
}
