// =============================================================================
// Website collections — pure logic (no database, no network). Unit-tested in
// tests/sites-collections-logic.test.ts.
//
//   - field/relation definition types shared by the registry
//   - query-string parsing and whitelisting against a collection definition
//     (unknown field / op / include => BadRequestError, 400)
//   - compilation of a parsed query into Prisma where/orderBy FRAGMENTS built
//     only from server-defined column paths; user input contributes typed
//     VALUES, never keys
//   - small-number suppression (W7) and public slug generation
// =============================================================================

import { randomBytes } from 'crypto';
import { z } from 'zod';
import { BadRequestError } from '../../utils/AppError';
import { slugify } from './sites.logic';

// ── Definition types ────────────────────────────────────────────────────────

export const FIELD_TYPES = ['text', 'rich', 'image', 'date', 'number', 'bool', 'url', 'list'] as const;
export type FieldType = (typeof FIELD_TYPES)[number];

export const OPS = ['eq', 'ne', 'in', 'contains', 'gt', 'gte', 'lt', 'lte', 'has'] as const;
export type Op = (typeof OPS)[number];

export const MAX_PAGE_SIZE = 50;
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_FILTERS = 10;
export const MAX_IN_VALUES = 20;
export const MAX_SORTS = 2;

export interface FieldDef {
  key: string;
  label: string;
  type: FieldType;
  /** Allowed filter ops; empty/absent = not filterable. */
  filter?: Op[];
  sortable?: boolean;
  searchable?: boolean;
  /** Only present on the single-item response (long bodies). */
  detailOnly?: boolean;
  /** Allowed values for enum-like text fields. */
  options?: string[];
  /** Server-defined column path ("a.b" walks to-one relations). Enables filter/sort/search. */
  col?: string;
  searchCols?: string[];
  sortCols?: string[];
  /** Server-built where fragment for ops a plain column compare cannot express. */
  where?: (op: Op, value: unknown) => Record<string, unknown>;
}

export interface RelationDef {
  key: string;
  label: string;
  /** Collection the cards belong to (link via card.slug), or null for plain nested data. */
  collection: string | null;
  many: boolean;
}

/** What query parsing/compilation needs from a collection definition. */
export interface QueryShape {
  key: string;
  fields: FieldDef[];
  relations: RelationDef[];
}

export interface ParsedFilter {
  field: FieldDef;
  op: Op;
  value: unknown;
}

export interface ParsedQuery {
  filters: ParsedFilter[];
  sort: { field: FieldDef; dir: 'asc' | 'desc' }[];
  q: string | null;
  page: number;
  pageSize: number;
  include: string[];
}

// ── Parsing ─────────────────────────────────────────────────────────────────

const BaseQuery = z.object({
  q: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).max(1000).default(1),
  pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
  sort: z.string().max(100).optional(),
  include: z.string().max(200).optional(),
});

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Zod schema for one filter value of one field (single value, not the `in` list). */
function valueSchema(field: FieldDef): z.ZodType<unknown> {
  if (field.options?.length) {
    return z.string().refine((v) => field.options!.includes(v), { message: `must be one of: ${field.options.join(', ')}` });
  }
  switch (field.type) {
    case 'number':
      return z
        .string()
        .trim()
        .min(1)
        .transform((v) => Number(v))
        .refine((n) => Number.isFinite(n), { message: 'must be a number' });
    case 'bool':
      return z.enum(['true', 'false']).transform((v) => v === 'true');
    case 'date':
      return z
        .string()
        .trim()
        .refine((v) => (ISO_DAY.test(v) || /^\d{4}-\d{2}-\d{2}T/.test(v)) && !Number.isNaN(Date.parse(v)), {
          message: 'must be a date (YYYY-MM-DD or ISO 8601)',
        })
        .transform((v) => new Date(ISO_DAY.test(v) ? `${v}T00:00:00.000Z` : v));
    default:
      return z.string().min(1).max(200);
  }
}

function fail(message: string): never {
  throw new BadRequestError(message);
}

const isPlainObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const has = (o: Record<string, unknown>, k: string) => Object.prototype.hasOwnProperty.call(o, k);

/** Parses `req.query` for a collection. Throws BadRequestError (400) on anything not whitelisted. */
export function parseCollectionQuery(shape: QueryShape, raw: Record<string, unknown>): ParsedQuery {
  const base = BaseQuery.safeParse({ q: raw.q, page: raw.page, pageSize: raw.pageSize, sort: raw.sort, include: raw.include });
  if (!base.success) {
    const issue = base.error.issues[0];
    fail(`Invalid query parameter "${issue.path.join('.')}": ${issue.message}`);
  }
  const { q, page, pageSize, sort, include } = base.data;
  const fields = new Map(shape.fields.map((f) => [f.key, f]));

  // filter[field][op]=value
  const filters: ParsedFilter[] = [];
  if (raw.filter !== undefined) {
    if (!isPlainObject(raw.filter)) fail('Use filter[field][op]=value');
    for (const fieldKey of Object.keys(raw.filter)) {
      const field = fields.get(fieldKey);
      if (!field) fail(`Unknown field "${fieldKey}" for collection "${shape.key}"`);
      const ops = (raw.filter as Record<string, unknown>)[fieldKey];
      if (!isPlainObject(ops)) fail(`Use filter[${fieldKey}][op]=value`);
      for (const opKey of Object.keys(ops)) {
        if (!(OPS as readonly string[]).includes(opKey)) fail(`Unknown filter op "${opKey}"`);
        const op = opKey as Op;
        if (!field.filter?.includes(op)) fail(`Field "${fieldKey}" cannot be filtered with "${op}"`);
        const value = ops[opKey];
        if (typeof value !== 'string') fail(`filter[${fieldKey}][${op}] must be a single value`);
        let parsed: unknown;
        if (op === 'in') {
          const parts = value.split(',').map((s) => s.trim()).filter(Boolean);
          if (parts.length === 0 || parts.length > MAX_IN_VALUES) fail(`filter[${fieldKey}][in] needs 1-${MAX_IN_VALUES} values`);
          const each = valueSchema(field);
          parsed = parts.map((p) => {
            const r = each.safeParse(p);
            if (!r.success) fail(`filter[${fieldKey}][in]: ${r.error.issues[0].message}`);
            return r.data;
          });
        } else {
          // `has` compares one list element: validate it as a plain string.
          const schema = op === 'has' ? z.string().min(1).max(200) : valueSchema(field);
          const r = schema.safeParse(value);
          if (!r.success) fail(`filter[${fieldKey}][${op}]: ${r.error.issues[0].message}`);
          parsed = r.data;
        }
        filters.push({ field, op, value: parsed });
        if (filters.length > MAX_FILTERS) fail(`At most ${MAX_FILTERS} filters per request`);
      }
    }
  }

  // sort=-a,b
  const sorts: ParsedQuery['sort'] = [];
  if (sort) {
    const parts = sort.split(',').map((s) => s.trim()).filter(Boolean);
    if (parts.length > MAX_SORTS) fail(`At most ${MAX_SORTS} sort fields`);
    for (const part of parts) {
      const dir = part.startsWith('-') ? 'desc' : 'asc';
      const key = part.replace(/^[-+]/, '');
      const field = fields.get(key);
      if (!field) fail(`Unknown sort field "${key}" for collection "${shape.key}"`);
      if (!field.sortable) fail(`Field "${key}" is not sortable`);
      sorts.push({ field, dir });
    }
  }

  // include=rel1,rel2 (one level deep)
  const includes: string[] = [];
  if (include) {
    const relKeys = new Set(shape.relations.map((r) => r.key));
    for (const part of include.split(',').map((s) => s.trim()).filter(Boolean)) {
      if (!relKeys.has(part)) fail(`Unknown relation "${part}" for collection "${shape.key}"`);
      if (!includes.includes(part)) includes.push(part);
    }
  }

  return { filters, sort: sorts, q: q ? q : null, page, pageSize, include: includes };
}

/** Parses only `?include=` (single-item endpoint). */
export function parseIncludeOnly(shape: QueryShape, raw: Record<string, unknown>): string[] {
  return parseCollectionQuery(shape, { include: raw.include }).include;
}

// ── Compilation to Prisma fragments ─────────────────────────────────────────

function nest(path: string, leaf: unknown): Record<string, unknown> {
  const parts = path.split('.');
  let out: unknown = leaf;
  for (let i = parts.length - 1; i >= 0; i--) out = { [parts[i]]: out };
  return out as Record<string, unknown>;
}

function condition(op: Op, value: unknown, field: FieldDef): Record<string, unknown> {
  // Case-insensitive text compares, except enum-like columns which Prisma
  // does not allow `mode` on.
  const ci = field.type === 'text' && !field.options?.length ? { mode: 'insensitive' } : {};
  switch (op) {
    case 'eq':
      return { equals: value, ...ci };
    case 'ne':
      return { not: value };
    case 'in':
      return { in: value };
    case 'contains':
      return { contains: value, mode: 'insensitive' };
    case 'gt':
    case 'gte':
    case 'lt':
    case 'lte':
      return { [op]: value };
    case 'has':
      return { has: value };
  }
}

export interface CompiledQuery {
  /** AND these (together with the adapter's tenant scope) into the where. */
  where: Record<string, unknown>[];
  /** Empty when the request has no sort — the adapter then uses its default order. */
  orderBy: Record<string, unknown>[];
}

/** Server-defined columns + validated typed values only; never user-supplied keys. */
export function compileQuery(q: ParsedQuery): CompiledQuery {
  const where: Record<string, unknown>[] = [];
  for (const f of q.filters) {
    if (f.field.where) {
      where.push(f.field.where(f.op, f.value));
    } else if (f.op === 'contains' && f.field.searchCols?.length) {
      where.push({ OR: f.field.searchCols.map((c) => nest(c, condition('contains', f.value, f.field))) });
    } else if (f.field.col) {
      where.push(nest(f.field.col, condition(f.op, f.value, f.field)));
    }
  }
  return { where, orderBy: [] };
}

/** Free-text search across the searchable fields of a collection. */
export function compileSearch(shape: QueryShape, q: string | null): Record<string, unknown>[] {
  if (!q) return [];
  const ors: Record<string, unknown>[] = [];
  for (const f of shape.fields) {
    if (!f.searchable) continue;
    const cols = f.searchCols ?? (f.col ? [f.col] : []);
    for (const c of cols) ors.push(nest(c, { contains: q, mode: 'insensitive' }));
  }
  return ors.length ? [{ OR: ors }] : [];
}

export function compileOrder(q: ParsedQuery): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  for (const s of q.sort) {
    const cols = s.field.sortCols ?? (s.field.col ? [s.field.col] : []);
    for (const c of cols) out.push(nest(c, s.dir));
  }
  return out;
}

/** Everything an adapter ANDs into its tenant scope. */
export function compileAll(shape: QueryShape, q: ParsedQuery): { where: Record<string, unknown>[]; orderBy: Record<string, unknown>[] } {
  return { where: [...compileQuery(q).where, ...compileSearch(shape, q.q)], orderBy: compileOrder(q) };
}

// ── Small-number suppression (W7) ───────────────────────────────────────────

/** Cells with 1-4 people are never published (0 is fine: it identifies nobody). */
export const MIN_CELL = 5;

export function suppressSmall(n: number): number | null {
  return n > 0 && n < MIN_CELL ? null : n;
}

export interface ClassCounts {
  studentCount: number | null;
  maleCount: number | null;
  femaleCount: number | null;
  otherCount: number | null;
}

/**
 * Per-class student counts with small cells suppressed. If any gender cell is
 * suppressed the total is withheld as well, so it cannot be subtracted back.
 */
export function suppressClassCounts(c: { male: number; female: number; other: number; total: number }): ClassCounts {
  const male = suppressSmall(c.male);
  const female = suppressSmall(c.female);
  const other = suppressSmall(c.other);
  const anySuppressed = male === null || female === null || other === null;
  return { studentCount: anySuppressed ? null : c.total, maleCount: male, femaleCount: female, otherCount: other };
}

export interface ClassSummaryRaw {
  className: string;
  appeared: number;
  passed: number;
  passRate: number;
  gpa5Count: number;
}

export interface PublicClassSummary {
  className: string;
  appeared: number | null;
  passed: number | null;
  passRate: number | null;
  gpa5Count: number | null;
  suppressed: boolean;
}

/** Result aggregates: a class with fewer than 5 students appeared is withheld entirely. */
export function suppressClassSummary(row: ClassSummaryRaw): PublicClassSummary {
  if (row.appeared < MIN_CELL) {
    return { className: row.className, appeared: null, passed: null, passRate: null, gpa5Count: null, suppressed: true };
  }
  const failed = row.appeared - row.passed;
  const passedHidden = suppressSmall(row.passed) === null || suppressSmall(failed) === null;
  return {
    className: row.className,
    appeared: row.appeared,
    passed: passedHidden ? null : row.passed,
    passRate: passedHidden ? null : row.passRate,
    gpa5Count: suppressSmall(row.gpa5Count),
    suppressed: false,
  };
}

// ── Public slugs and template pages ─────────────────────────────────────────

const SLUG_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

export function randomSuffix(length = 6): string {
  const bytes = randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i++) out += SLUG_ALPHABET[bytes[i] % SLUG_ALPHABET.length];
  return out;
}

/** "Rahim Uddin" -> "rahim-uddin-k3f9a2". Non-latin names fall back to `fallback`. */
export function makePublicSlug(name: string, fallback = 'item'): string {
  const base = slugify(name, 40) || fallback;
  return `${base}-${randomSuffix()}`;
}

export const TEMPLATE_PAGE_PREFIX = 'template-';
export const templatePageSlug = (collectionKey: string) => `${TEMPLATE_PAGE_PREFIX}${collectionKey}`;

export function joinItemPath(base: string, slug: string): string {
  return `${base.replace(/\/+$/, '')}/${encodeURIComponent(slug)}`;
}
