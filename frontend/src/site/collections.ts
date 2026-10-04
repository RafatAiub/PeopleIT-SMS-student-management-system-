/**
 * Collections (Website Builder W1 API, consumed by W2/W3/W5): types, the pure
 * query builder, relation-include detection and template-route matching.
 * Network calls live in `api.ts`; the contract is docs/plans/FEATURES_V4_PLAN.md §8.
 *
 * There is deliberately no `students` collection (privacy, W7) — the registry
 * never lists one, and `PRIVATE_COLLECTIONS` guards the editor against ever
 * offering it should a future registry bug leak it.
 */
import { fillTokens } from './tokens';
import { getPath, isEmptyValue, scopeTokens, type Scope } from './binding';

export type CollectionFieldType = 'text' | 'rich' | 'image' | 'date' | 'number' | 'bool' | 'url' | 'list';
export type FilterOp = 'eq' | 'ne' | 'in' | 'contains' | 'gt' | 'gte' | 'lt' | 'lte' | 'has';
export const FILTER_OPS: FilterOp[] = ['eq', 'ne', 'in', 'contains', 'gt', 'gte', 'lt', 'lte', 'has'];
export const FILTER_OP_LABEL: Record<FilterOp, string> = {
  eq: 'equals', ne: 'does not equal', in: 'is one of (a, b, c)', contains: 'contains', gt: 'greater than', gte: 'at least', lt: 'less than', lte: 'at most', has: 'list has',
};

export interface CollectionFieldMeta {
  key: string;
  label: string;
  type: CollectionFieldType;
  filter: FilterOp[];
  sortable: boolean;
  searchable: boolean;
  detailOnly: boolean;
  options: string[] | null;
}

export interface CollectionRelationMeta {
  key: string;
  label: string;
  /** Target collection, or null for plain nested data (photos, routine…). */
  collection: string | null;
  many: boolean;
}

export interface CollectionMeta {
  key: string;
  label: string;
  labelPlural: string;
  available: boolean;
  unavailableReason: string | null;
  slugSource?: string;
  titleField: string;
  /** Public URL prefix of profile pages; null = no profile pages (cannot have a template page). */
  routeBase: string | null;
  defaultSort: string;
  maxPageSize: number;
  fields: CollectionFieldMeta[];
  relations: CollectionRelationMeta[];
}

export type CollectionItem = Record<string, unknown> & { slug: string };

export interface CollectionPage {
  items: CollectionItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export interface CollectionItemResult {
  item: CollectionItem;
  seo: { title: string | null; description: string | null; image: string | null };
}

export interface TemplateRoute {
  collection: string;
  base: string;
  pageSlug: string;
}

/** Never offered in any picker, whatever the server returns. */
export const PRIVATE_COLLECTIONS = new Set(['students', 'student', 'guardians', 'guardian', 'submissions', 'form-submissions']);

export function publicCollections(list: CollectionMeta[] | undefined): CollectionMeta[] {
  return (list ?? []).filter((c) => !PRIVATE_COLLECTIONS.has(c.key));
}

/** Collections that may have a TEMPLATE (profile) page: available and with a route base. */
export function templateCollections(list: CollectionMeta[] | undefined): CollectionMeta[] {
  return publicCollections(list).filter((c) => c.available && !!c.routeBase);
}

/* ── Query building (W3) ────────────────────────────────────────────────── */

export type FilterSource = 'literal' | 'item' | 'parent' | 'page' | 'url';

export interface CollectionFilterSpec {
  field: string;
  op: FilterOp;
  /** Where the value comes from. `literal` uses `value` (may hold `{{item.x}}` / `{{url.q}}` tokens). */
  source?: FilterSource;
  /** Literal text, or the path / URL-param name for the other sources. */
  value?: string;
}

export type PaginateMode = 'none' | 'pages' | 'more';

export interface CollectionQuerySpec {
  filters?: CollectionFilterSpec[];
  /** A sortable field key, '' / undefined = the collection default. */
  sortField?: string;
  sortDir?: 'asc' | 'desc';
  /** Search text (tokens allowed, e.g. `{{url.q}}`); empty = no search. */
  search?: string;
  /** Items shown in total ('none') or per page ('pages' | 'more'); 0 = server default. */
  limit?: number;
  paginate?: PaginateMode;
  include?: string[];
}

export const MAX_PAGE_SIZE = 50;
export const MAX_FILTERS = 10;

export type CollectionParams = Record<string, string | number>;

/** Resolves one filter's value against the scope; undefined = skip the filter (no value yet). */
export function resolveFilterValue(f: CollectionFilterSpec, scope: Scope): string | undefined {
  let raw: unknown;
  switch (f.source ?? 'literal') {
    case 'url': raw = (scope.url ?? {})[(f.value ?? '').trim()]; break;
    case 'item': case 'parent': case 'page': raw = getPath(scope[f.source as 'item'], (f.value ?? '').trim()); break;
    default: raw = fillTokens(f.value ?? '', { ...scopeTokens(scope) }, { keepMissing: false });
  }
  if (isEmptyValue(raw)) return undefined;
  const s = Array.isArray(raw) ? raw.join(',') : String(raw);
  return s.trim() === '' ? undefined : s.trim();
}

/**
 * `GET /collections/:key` query params for a CollectionList. Filters whose value
 * is missing (empty URL param / empty item field) are dropped rather than sent
 * as "equals nothing", so `?dept=` shows everything.
 */
export function buildCollectionQuery(spec: CollectionQuerySpec, scope: Scope, opts: { page?: number } = {}): CollectionParams {
  const out: CollectionParams = {};
  const seen = new Set<string>();
  for (const f of spec.filters ?? []) {
    if (!f?.field || !FILTER_OPS.includes(f.op)) continue;
    const v = resolveFilterValue(f, scope);
    const key = `filter[${f.field}][${f.op}]`;
    if (v === undefined || seen.has(key) || seen.size >= MAX_FILTERS) continue; // duplicates are a 400 server-side
    seen.add(key);
    out[key] = v;
  }
  if (spec.sortField) out.sort = `${spec.sortDir === 'desc' ? '-' : ''}${spec.sortField}`;
  const search = spec.search ? fillTokens(spec.search, scopeTokens(scope), { keepMissing: false }).trim().slice(0, 100) : '';
  if (search) out.q = search;
  const limit = Math.max(0, Math.floor(Number(spec.limit) || 0));
  const paginated = spec.paginate === 'pages' || spec.paginate === 'more';
  const pageSize = Math.min(MAX_PAGE_SIZE, limit || (paginated ? 12 : MAX_PAGE_SIZE));
  out.pageSize = pageSize;
  out.page = Math.min(1000, Math.max(1, Math.floor(opts.page ?? 1)));
  const include = Array.from(new Set((spec.include ?? []).filter(Boolean)));
  if (include.length) out.include = include.join(',');
  return out;
}

/** Stable React-Query key part for a params object. */
export function paramsKey(p: CollectionParams): string {
  return Object.keys(p).sort().map((k) => `${k}=${p[k]}`).join('&');
}

/* ── Relation includes ──────────────────────────────────────────────────── */

/**
 * Which relations does a block tree (item template / template page) read?
 * Scans bindings, `{{item.rel…}}` tokens, visibility rules and nested-list
 * `relation` props so the query can `include=` exactly what is needed.
 */
export function detectIncludes(content: unknown, relationKeys: string[]): string[] {
  if (!relationKeys.length || content == null) return [];
  let json: string;
  try { json = JSON.stringify(content); } catch { return []; }
  const found: string[] = [];
  for (const r of relationKeys) {
    const k = r.replace(/[^A-Za-z0-9_]/g, '');
    if (!k) continue;
    const re = new RegExp(`(?:"path":"|\\{\\{\\s*(?:item|parent|page)\\.|"relation":")${k}(?![A-Za-z0-9_])`);
    if (re.test(json)) found.push(r);
  }
  return found;
}

/* ── Template routes (W5) ───────────────────────────────────────────────── */

const trimSlashes = (s: string) => s.replace(/^\/+|\/+$/g, '');

/** `teachers/rahim-k3f9a2` + `[{base:'/teachers'}]` → the route and item slug; null when no template owns the path. */
export function matchTemplateRoute(path: string, routes: TemplateRoute[] | undefined): { route: TemplateRoute; slug: string } | null {
  const clean = trimSlashes(path);
  if (!clean || !routes?.length) return null;
  const segs = clean.split('/');
  for (const route of routes) {
    const base = trimSlashes(route.base).split('/').filter(Boolean);
    if (!base.length || segs.length !== base.length + 1) continue;
    if (base.every((b, i) => b === segs[i])) {
      const raw = segs[segs.length - 1];
      let slug = raw;
      try { slug = decodeURIComponent(raw); } catch { /* keep raw */ }
      return slug ? { route, slug } : null;
    }
  }
  return null;
}

/** Public path of an item's profile page (`/teachers/<slug>`); null when the collection has no profile pages. */
export function itemPath(meta: Pick<CollectionMeta, 'routeBase'> | undefined | null, slug: string | undefined | null): string | null {
  if (!meta?.routeBase || !slug) return null;
  return `/${trimSlashes(meta.routeBase)}/${encodeURIComponent(slug)}`;
}

/** Default page slug of a template page (what the backend picks when `slug` is omitted). */
export const templatePageSlug = (collectionKey: string) => `template-${collectionKey}`;

/* ── Nested data shapes (relations with `collection: null`) ─────────────── */

/** Field lists of plain nested data (§8.6), so the ⚡ picker can offer `item.photos[…]` columns inside a related-items list. */
export const NESTED_SHAPES: Record<string, Array<[key: string, label: string, type: CollectionFieldType]>> = {
  'albums.photos': [['url', 'Photo', 'image'], ['caption', 'Caption', 'text']],
  'classes.routine': [['dayOfWeek', 'Day', 'text'], ['startTime', 'Start time', 'text'], ['endTime', 'End time', 'text'], ['sectionName', 'Section', 'text'], ['subject', 'Subject', 'text'], ['roomNumber', 'Room', 'text'], ['teacherName', 'Teacher', 'text']],
  'classes.sections': [['name', 'Section', 'text']],
  'courses.lessons': [['title', 'Lesson', 'text'], ['module', 'Module', 'text'], ['kind', 'Kind', 'text'], ['durationMin', 'Minutes', 'number'], ['isFreePreview', 'Free preview', 'bool']],
  'exams.classSummaries': [['className', 'Class', 'text'], ['appeared', 'Appeared', 'number'], ['passed', 'Passed', 'number'], ['passRate', 'Pass rate', 'number'], ['gpa5Count', 'GPA 5', 'number']],
};

/** A synthetic collection description for the items of a nested relation (no profile pages, no filters). */
export function nestedMeta(ownerKey: string, relationKey: string, label: string): CollectionMeta | null {
  const shape = NESTED_SHAPES[`${ownerKey}.${relationKey}`];
  if (!shape) return null;
  return {
    key: `${ownerKey}.${relationKey}`, label, labelPlural: label, available: true, unavailableReason: null, titleField: shape[0][0], routeBase: null, defaultSort: '', maxPageSize: 50,
    fields: shape.map(([key, l, type]) => ({ key, label: l, type, filter: [], sortable: false, searchable: false, detailOnly: false, options: null })),
    relations: [],
  };
}

/** Computed fields every item gets (see `decorateItem`). */
export const COMPUTED_FIELDS: CollectionFieldMeta[] = [
  { key: '_url', label: 'Link to its profile page', type: 'url', filter: [], sortable: false, searchable: false, detailOnly: false, options: null },
  { key: '_index', label: 'Position in the list (1, 2, 3…)', type: 'number', filter: [], sortable: false, searchable: false, detailOnly: false, options: null },
];
