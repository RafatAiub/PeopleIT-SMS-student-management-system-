// =============================================================================
// Website custom modules (W13, FEATURES_V4_PLAN §1b) — pure logic:
//   - the fields-schema (zod) and its normaliser (aliases → canonical types)
//   - server-side Liquid validation (liquidjs parse) with line/column errors
//   - the `{% collection %}` tag argument grammar (kept in sync with
//     frontend/src/site/modules/collectionTag.ts — same grammar, same errors)
//   - size caps, keys, and the import/export document format.
// No database access here, so tests can call it directly.
// =============================================================================

import { z } from 'zod';
import { Liquid, Tag, Value, analyzeSync, type TagToken, type TopLevelToken, type Template } from 'liquidjs';
import { getCollection } from './sites.collections';

// ── Caps ────────────────────────────────────────────────────────────────────

export const MODULE_CODE_MAX_BYTES = 100 * 1024; // template, css and js each
export const MODULE_MAX_FIELDS = 50; // all fields, nested repeater fields included
export const MODULE_MAX_PER_SITE = 200;
export const MODULE_MAX_VERSIONS = 50;
export const MODULE_KEY_PATTERN = /^[a-z][a-z0-9_-]{0,59}$/;
export const MODULE_EXPORT_FORMAT = 'peoplenit-site-module';

export const byteLength = (s: string) => Buffer.byteLength(s ?? '', 'utf8');

/** Throws a human message when one of template/css/js is over the cap. */
export function codeSizeProblem(code: { template?: string | null; css?: string | null; js?: string | null }): string | null {
  for (const k of ['template', 'css', 'js'] as const) {
    const v = code[k];
    if (typeof v === 'string' && byteLength(v) > MODULE_CODE_MAX_BYTES) {
      return `${k === 'template' ? 'HTML (Liquid)' : k.toUpperCase()} is too large (${Math.ceil(byteLength(v) / 1024)} KB, limit ${MODULE_CODE_MAX_BYTES / 1024} KB)`;
    }
  }
  return null;
}

// ── Keys ────────────────────────────────────────────────────────────────────

export function moduleKeyFrom(name: string): string {
  const base = name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50);
  const k = /^[a-z]/.test(base) ? base : `module-${base}`.replace(/-+$/, '');
  return MODULE_KEY_PATTERN.test(k) ? k : 'module';
}

/** `key`, then `key-2`, `key-3`… — the first one not in `taken`. */
export function uniqueModuleKey(base: string, taken: Iterable<string>): string {
  const set = new Set(taken);
  if (!set.has(base)) return base;
  const stem = base.replace(/-\d+$/, '').slice(0, 54);
  for (let i = 2; i < 10_000; i++) {
    const k = `${stem}-${i}`;
    if (!set.has(k)) return k;
  }
  return `${stem}-${Date.now().toString(36)}`;
}

// ── Fields schema ───────────────────────────────────────────────────────────

export const MODULE_FIELD_TYPES = [
  'text', 'textarea', 'richtext', 'number', 'boolean', 'select', 'color', 'image', 'link', 'date', 'repeater', 'collection',
] as const;
export type ModuleFieldType = (typeof MODULE_FIELD_TYPES)[number];

/** Friendly spellings accepted in the JSON and normalised away. */
export const FIELD_TYPE_ALIASES: Record<string, ModuleFieldType> = {
  rich: 'richtext', 'rich-text': 'richtext', html: 'richtext', colour: 'color', bool: 'boolean', yesno: 'boolean', 'yes/no': 'boolean',
  url: 'link', string: 'text', list: 'repeater', int: 'number', float: 'number',
};

export const COLLECTION_FILTER_OPS = ['eq', 'ne', 'in', 'contains', 'gt', 'gte', 'lt', 'lte', 'has'] as const;

const fieldKey = z.string().trim().regex(/^[A-Za-z][A-Za-z0-9_]{0,39}$/, 'Field keys use letters, digits and _ (start with a letter, max 40)');
const SORT_RE = /^-?[A-Za-z_][A-Za-z0-9_]*(,-?[A-Za-z_][A-Za-z0-9_]*)?$/;

const optionDto = z.union([
  z.string().trim().min(1).max(120),
  z.object({ value: z.string().trim().max(120), label: z.string().trim().max(120).optional(), labelBn: z.string().trim().max(120).optional() }),
]);

const filterDto = z.object({
  field: fieldKey,
  op: z.enum(COLLECTION_FILTER_OPS).default('eq'),
  value: z.union([z.string().max(200), z.number(), z.boolean()]).transform((v) => String(v)),
});

export interface ModuleField {
  key: string;
  type: ModuleFieldType;
  label?: string;
  labelBn?: string;
  help?: string;
  bn?: boolean;
  required?: boolean;
  placeholder?: string;
  default?: unknown;
  options?: Array<string | { value: string; label?: string; labelBn?: string }>;
  min?: number;
  max?: number;
  step?: number;
  fields?: ModuleField[];
  maxItems?: number;
  itemLabel?: string;
  collection?: string;
  limit?: number;
  sort?: string;
  filters?: Array<{ field: string; op: (typeof COLLECTION_FILTER_OPS)[number]; value: string }>;
}

const baseField = {
  key: fieldKey,
  label: z.string().trim().max(120).optional(),
  labelBn: z.string().trim().max(120).optional(),
  help: z.string().trim().max(300).optional(),
  bn: z.boolean().optional(),
  required: z.boolean().optional(),
  placeholder: z.string().trim().max(200).optional(),
  default: z.unknown().optional(),
  options: z.array(optionDto).max(50).optional(),
  min: z.number().finite().optional(),
  max: z.number().finite().optional(),
  step: z.number().finite().positive().optional(),
  maxItems: z.number().int().min(1).max(50).optional(),
  itemLabel: z.string().trim().max(60).optional(),
  collection: z.string().trim().max(40).optional(),
  limit: z.number().int().min(1).max(50).optional(),
  sort: z.string().trim().max(80).regex(SORT_RE, 'Sort is a field name, "-" in front for descending (e.g. "-date")').optional(),
  filters: z.array(filterDto).max(10).optional(),
  // Shorthand: { "department": "Science" } → filters [{ field, op: eq, value }]
  filter: z.record(z.union([z.string().max(200), z.number(), z.boolean()])).optional(),
};

const typeDto = z
  .string()
  .trim()
  .transform((t, ctx) => {
    const lower = t.toLowerCase();
    const canonical = (MODULE_FIELD_TYPES as readonly string[]).includes(lower) ? (lower as ModuleFieldType) : FIELD_TYPE_ALIASES[lower];
    if (!canonical) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Unknown field type "${t}" (use ${MODULE_FIELD_TYPES.join(', ')})` });
      return z.NEVER;
    }
    return canonical;
  });

type RawField = z.infer<z.ZodObject<typeof baseField>> & { type: ModuleFieldType; fields?: RawField[] };

const fieldDto: z.ZodType<RawField, z.ZodTypeDef, unknown> = z.lazy(() =>
  z.object({ ...baseField, type: typeDto, fields: z.array(fieldDto).max(MODULE_MAX_FIELDS).optional() }).strip(),
) as unknown as z.ZodType<RawField, z.ZodTypeDef, unknown>;

export const ModuleFieldsSchema = z.array(fieldDto).max(MODULE_MAX_FIELDS);

export interface FieldIssue {
  path: string;
  message: string;
}

function countFields(list: RawField[]): number {
  return list.reduce((n, f) => n + 1 + (f.fields ? countFields(f.fields) : 0), 0);
}

function normaliseField(f: RawField, path: string, issues: FieldIssue[], depth: number): ModuleField {
  const out: ModuleField = { key: f.key, type: f.type };
  for (const k of ['label', 'labelBn', 'help', 'placeholder', 'itemLabel'] as const) if (f[k]) out[k] = f[k];
  if (f.bn !== undefined) out.bn = f.bn;
  if (f.required) out.required = true;
  if (f.default !== undefined) out.default = f.default;
  switch (f.type) {
    case 'select':
      if (!f.options?.length) issues.push({ path, message: 'A select field needs "options"' });
      else out.options = f.options;
      break;
    case 'number':
      if (f.min !== undefined) out.min = f.min;
      if (f.max !== undefined) out.max = f.max;
      if (f.step !== undefined) out.step = f.step;
      if (f.min !== undefined && f.max !== undefined && f.min > f.max) issues.push({ path, message: '"min" is greater than "max"' });
      break;
    case 'repeater': {
      if (depth > 0) issues.push({ path, message: 'A repeater cannot contain another repeater' });
      const sub = f.fields ?? [];
      if (!sub.length) issues.push({ path, message: 'A repeater needs "fields" (the fields of one item)' });
      out.fields = normaliseList(sub, `${path}.fields`, issues, depth + 1);
      if (out.fields.some((x) => x.type === 'collection')) issues.push({ path, message: 'A repeater cannot contain a collection field' });
      if (f.maxItems) out.maxItems = f.maxItems;
      break;
    }
    case 'collection': {
      const key = f.collection ?? '';
      if (!key) issues.push({ path, message: 'A collection field needs "collection" (e.g. "teachers")' });
      else if (!getCollection(key)) issues.push({ path, message: `Unknown collection "${key}"` });
      out.collection = key;
      if (f.limit) out.limit = f.limit;
      if (f.sort) out.sort = f.sort;
      const filters = [
        ...(f.filters ?? []),
        ...Object.entries(f.filter ?? {}).map(([field, value]) => ({ field, op: 'eq' as const, value: String(value) })),
      ];
      if (filters.length > 10) issues.push({ path, message: 'At most 10 filters' });
      if (filters.length) out.filters = filters.slice(0, 10);
      break;
    }
    default:
      break;
  }
  return out;
}

function normaliseList(list: RawField[], path: string, issues: FieldIssue[], depth: number): ModuleField[] {
  const seen = new Set<string>();
  return list.map((f, i) => {
    const p = `${path}[${i}]`;
    if (seen.has(f.key)) issues.push({ path: p, message: `Duplicate field key "${f.key}"` });
    seen.add(f.key);
    return normaliseField(f, p, issues, depth);
  });
}

/** Parses + normalises a fields schema. Never throws; `issues` empty = valid. */
export function parseModuleFields(input: unknown): { fields: ModuleField[]; issues: FieldIssue[] } {
  const parsed = ModuleFieldsSchema.safeParse(input ?? []);
  if (!parsed.success) {
    return {
      fields: [],
      issues: parsed.error.issues.map((i) => ({ path: `fields${i.path.map((p) => (typeof p === 'number' ? `[${p}]` : `.${p}`)).join('')}`, message: i.message })),
    };
  }
  const issues: FieldIssue[] = [];
  if (countFields(parsed.data) > MODULE_MAX_FIELDS) issues.push({ path: 'fields', message: `At most ${MODULE_MAX_FIELDS} fields (nested fields included)` });
  const fields = normaliseList(parsed.data, 'fields', issues, 0);
  return { fields, issues };
}

// ── {% collection %} tag grammar ────────────────────────────────────────────
// {% collection "notices" limit:5 sort:"-date" filter.category:"Sports" q:url.query.q as notices %}

export type TagArgValue = { kind: 'string'; value: string } | { kind: 'number'; value: number } | { kind: 'var'; value: string };
export interface CollectionTagArgs {
  collection: string;
  options: Array<{ name: string; value: TagArgValue }>;
  as: string;
}

const OPTION_RE = /^(limit|sort|q|page|include|filter\.[A-Za-z_][A-Za-z0-9_]*(?:\.(?:eq|ne|in|contains|gt|gte|lt|lte|has))?)$/;

export function parseCollectionTagArgs(input: string): CollectionTagArgs {
  const s = input ?? '';
  let i = 0;
  const ws = () => { while (i < s.length && /[\s,]/.test(s[i])) i++; };
  const quoted = (): string | null => {
    const q = s[i];
    if (q !== '"' && q !== "'") return null;
    let out = '';
    i++;
    while (i < s.length && s[i] !== q) {
      if (s[i] === '\\' && i + 1 < s.length) { out += s[i + 1]; i += 2; continue; }
      out += s[i++];
    }
    if (s[i] !== q) throw new Error('Unclosed quote in {% collection %}');
    i++;
    return out;
  };
  const word = (re: RegExp): string => {
    const m = re.exec(s.slice(i));
    if (!m) return '';
    i += m[0].length;
    return m[0];
  };
  ws();
  const collection = quoted();
  if (collection === null) throw new Error('{% collection %} needs a quoted collection key first, e.g. {% collection "notices" limit:5 as notices %}');
  if (!/^[a-z][a-z0-9_-]{0,39}$/.test(collection)) throw new Error(`Invalid collection key "${collection}"`);
  const options: CollectionTagArgs['options'] = [];
  let as = '';
  for (let guard = 0; guard < 40; guard++) {
    ws();
    if (i >= s.length) break;
    const name = word(/^[A-Za-z_][A-Za-z0-9_.]*/);
    if (!name) throw new Error(`Unexpected "${s.slice(i, i + 12)}" in {% collection %}`);
    if (name === 'as') {
      ws();
      as = word(/^[A-Za-z_][A-Za-z0-9_]*/);
      if (!as) throw new Error('{% collection %}: "as" must be followed by a variable name');
      ws();
      if (i < s.length) throw new Error('{% collection %}: "as <name>" must come last');
      break;
    }
    if (!OPTION_RE.test(name)) throw new Error(`Unknown option "${name}" in {% collection %} (use limit, sort, q, page, include, filter.<field> or filter.<field>.<op>)`);
    ws();
    if (s[i] !== ':') throw new Error(`{% collection %}: expected ":" after "${name}"`);
    i++;
    ws();
    let value: TagArgValue;
    const str = quoted();
    if (str !== null) value = { kind: 'string', value: str };
    else {
      const num = word(/^-?\d+(\.\d+)?(?![A-Za-z_])/);
      if (num) value = { kind: 'number', value: Number(num) };
      else {
        const path = word(/^[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*|\[\d+\])*/);
        if (!path) throw new Error(`{% collection %}: missing value for "${name}"`);
        value = { kind: 'var', value: path };
      }
    }
    if (options.some((o) => o.name === name)) throw new Error(`{% collection %}: "${name}" is given twice`);
    options.push({ name, value });
  }
  if (options.filter((o) => o.name.startsWith('filter.')).length > 10) throw new Error('{% collection %}: at most 10 filters');
  const lim = options.find((o) => o.name === 'limit');
  if (lim && lim.value.kind === 'number' && (lim.value.value < 1 || lim.value.value > 50)) throw new Error('{% collection %}: limit must be 1–50');
  return { collection, options, as: as || collection.replace(/-/g, '_') };
}

// ── Liquid validation ───────────────────────────────────────────────────────

export const MODULE_FILTERS = ['t', 'bn_digits', 'money', 'num', 'img', 'markdown', 'days_until'] as const;
const BLOCKED_TAGS = ['include', 'render', 'layout'] as const;

export interface TemplateIssue {
  line: number | null;
  col: number | null;
  message: string;
}

class BlockedTag extends Tag {
  constructor(token: TagToken, remain: TopLevelToken[], liquid: Liquid) {
    super(token, remain, liquid);
    throw new Error(`{% ${token.name} %} is not available in modules (no files or partials). Copy the markup in instead.`);
  }
  *render(): Generator<unknown, void, unknown> { /* never reached */ }
}

class CollectionTagCheck extends Tag {
  constructor(token: TagToken, remain: TopLevelToken[], liquid: Liquid) {
    super(token, remain, liquid);
    const parsed = parseCollectionTagArgs(token.args);
    if (!getCollection(parsed.collection)) throw new Error(`Unknown collection "${parsed.collection}"`);
    for (const o of parsed.options) if (o.value.kind === 'var') new Value(o.value.value, liquid);
  }
  *render(): Generator<unknown, void, unknown> { /* validation only */ }
}

let checker: Liquid | null = null;
function checkerEngine(): Liquid {
  if (checker) return checker;
  const engine = new Liquid({ strictFilters: true, outputEscape: 'escape', ownPropertyOnly: true, parseLimit: 1_000_000 });
  for (const f of MODULE_FILTERS) engine.registerFilter(f, (v: unknown) => v);
  for (const t of BLOCKED_TAGS) engine.registerTag(t, BlockedTag);
  engine.registerTag('collection', CollectionTagCheck);
  checker = engine;
  return engine;
}

function positionOf(err: unknown): { line: number | null; col: number | null } {
  const tok = (err as { token?: { getPosition?: () => [number, number] } })?.token;
  if (tok?.getPosition) {
    try {
      const [line, col] = tok.getPosition();
      return { line, col };
    } catch { /* fall through */ }
  }
  const m = /line:(\d+), col:(\d+)/.exec(String((err as Error)?.message ?? ''));
  return m ? { line: Number(m[1]), col: Number(m[2]) } : { line: null, col: null };
}

function cleanMessage(msg: string): string {
  return msg.replace(/, line:\d+, col:\d+$/, '').replace(/^(ParseError|TokenizationError): /, '');
}

/**
 * Parses a Liquid template the way the renderer will (same filters, the
 * collection tag, no include/render/layout). Returns problems with 1-based
 * line/col, plus warnings for `module.<x>` references to undeclared fields.
 */
export function validateTemplate(template: string, fields: ModuleField[] = []): { errors: TemplateIssue[]; warnings: TemplateIssue[] } {
  const errors: TemplateIssue[] = [];
  const warnings: TemplateIssue[] = [];
  let parsed: Template[] | null = null;
  try {
    parsed = checkerEngine().parse(template ?? '');
  } catch (err) {
    const list = (err as { errors?: unknown[] }).errors;
    for (const e of Array.isArray(list) && list.length ? list : [err]) {
      errors.push({ ...positionOf(e), message: cleanMessage(String((e as Error)?.message ?? e)) });
    }
  }
  if (parsed) {
    try {
      const declared = new Set(fields.map((f) => f.key));
      const analysis = analyzeSync(parsed, { partials: false });
      for (const v of analysis.globals.module ?? []) {
        const first = v.segments[1];
        if (typeof first !== 'string') continue;
        const base = first.replace(/_(en|bn)$/, '');
        if (!declared.has(first) && !declared.has(base)) {
          const [line, col] = v.location.row !== undefined ? [v.location.row, v.location.col] : [null, null];
          if (!warnings.some((w) => w.message.includes(`"module.${first}"`))) {
            warnings.push({ line, col, message: `"module.${first}" is not one of this module's fields` });
          }
        }
      }
    } catch { /* analysis is advisory */ }
  }
  return { errors, warnings };
}

/** Light CSS sanity checks: balanced braces and no @import (modules cannot load other stylesheets). */
export function validateCss(css: string): TemplateIssue[] {
  const out: TemplateIssue[] = [];
  const text = (css ?? '').replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
  let depth = 0;
  let line = 1;
  for (const ch of text) {
    if (ch === '\n') line++;
    else if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth < 0) { out.push({ line, col: null, message: 'Unexpected "}"' }); depth = 0; }
    }
  }
  if (depth > 0) out.push({ line, col: null, message: 'A "{" is never closed' });
  const imp = /@import\b/i.exec(text);
  if (imp) out.push({ line: text.slice(0, imp.index).split('\n').length, col: null, message: '@import is not allowed in module CSS' });
  return out;
}

// ── Import / export ─────────────────────────────────────────────────────────

export interface ModuleDoc {
  key: string;
  name: string;
  nameBn?: string | null;
  description?: string | null;
  category?: string | null;
  icon?: string | null;
  fields: unknown;
  template: string;
  css?: string | null;
  js?: string | null;
}

const docModuleDto = z.object({
  key: z.string().trim().max(60).optional(),
  name: z.string().trim().min(1).max(120),
  nameBn: z.string().trim().max(120).nullish(),
  description: z.string().trim().max(500).nullish(),
  category: z.string().trim().max(40).nullish(),
  icon: z.string().trim().max(40).nullish(),
  fields: z.unknown(),
  template: z.string(),
  css: z.string().nullish(),
  js: z.string().nullish(),
});

/** Accepts `{ format, module: {...} }` (our export) or a bare module object. */
export function readModuleDoc(input: unknown): { doc: z.infer<typeof docModuleDto> } | { error: string } {
  const raw = input && typeof input === 'object' && 'module' in (input as Record<string, unknown>) ? (input as Record<string, unknown>).module : input;
  const parsed = docModuleDto.safeParse(raw);
  if (!parsed.success) {
    const i = parsed.error.issues[0];
    return { error: `Not a module file: ${i.path.join('.') || 'module'} — ${i.message}` };
  }
  return { doc: parsed.data };
}

export function exportDoc(m: ModuleDoc & { version?: number | null }) {
  return {
    format: MODULE_EXPORT_FORMAT,
    formatVersion: 1,
    exportedAt: new Date().toISOString(),
    module: {
      key: m.key, name: m.name, nameBn: m.nameBn ?? null, description: m.description ?? null, category: m.category ?? 'general', icon: m.icon ?? null,
      fields: m.fields, template: m.template, css: m.css ?? '', js: m.js ?? '', version: m.version ?? null,
    },
  };
}

// ── Usage ───────────────────────────────────────────────────────────────────

/** Counts CustomModule blocks with `moduleKey === key` anywhere in a page document (slots and zones included). */
export function countModuleUsage(data: unknown, key: string): number {
  let n = 0;
  const walk = (v: unknown, depth: number) => {
    if (depth > 40 || v === null || typeof v !== 'object') return;
    if (Array.isArray(v)) { for (const x of v) walk(x, depth + 1); return; }
    const o = v as Record<string, unknown>;
    if (o.type === 'CustomModule' && o.props && typeof o.props === 'object' && (o.props as Record<string, unknown>).moduleKey === key) n++;
    for (const x of Object.values(o)) walk(x, depth + 1);
  };
  walk(data, 0);
  return n;
}
