/**
 * Custom modules (Website Builder W13–W17, FEATURES_V4_PLAN §1b): the shared
 * types and the pure value helpers. A module = fields schema (the editor form)
 * + Liquid template + CSS + optional JS. Pages store
 * `{ type: "CustomModule", props: { moduleKey, version?, values } }`.
 *
 * Kept free of React and Puck runtime imports (unit-tested in node).
 */

export const MODULE_FIELD_TYPES = [
  'text', 'textarea', 'richtext', 'number', 'boolean', 'select', 'color', 'image', 'link', 'date', 'repeater', 'collection',
] as const;
export type ModuleFieldType = (typeof MODULE_FIELD_TYPES)[number];

/** Same aliases the backend accepts (sites.modules.logic.ts FIELD_TYPE_ALIASES). */
export const FIELD_TYPE_ALIASES: Record<string, ModuleFieldType> = {
  rich: 'richtext', 'rich-text': 'richtext', html: 'richtext', colour: 'color', bool: 'boolean', yesno: 'boolean', 'yes/no': 'boolean',
  url: 'link', string: 'text', list: 'repeater', int: 'number', float: 'number',
};

export const FIELD_TYPE_LABELS: Record<ModuleFieldType, string> = {
  text: 'Text', textarea: 'Long text', richtext: 'Rich text', number: 'Number', boolean: 'Yes / no', select: 'Choice (select)',
  color: 'Colour', image: 'Image', link: 'Link', date: 'Date', repeater: 'Repeater (list of items)', collection: 'Collection (school data)',
};

export type FilterOp = 'eq' | 'ne' | 'in' | 'contains' | 'gt' | 'gte' | 'lt' | 'lte' | 'has';

export interface ModuleSelectOption {
  value: string;
  label?: string;
  labelBn?: string;
}

export interface ModuleField {
  key: string;
  type: ModuleFieldType;
  label?: string;
  labelBn?: string;
  help?: string;
  /** Text-like fields: add a Bangla twin (`<key>Bn`) in the editor form. */
  bn?: boolean;
  required?: boolean;
  placeholder?: string;
  default?: unknown;
  options?: Array<string | ModuleSelectOption>;
  min?: number;
  max?: number;
  step?: number;
  /** repeater: the fields of one item. */
  fields?: ModuleField[];
  maxItems?: number;
  itemLabel?: string;
  /** collection: which collection, and the default query. */
  collection?: string;
  limit?: number;
  sort?: string;
  filters?: Array<{ field: string; op: FilterOp; value: string }>;
}

/** A module definition as the renderer sees it (published snapshot, or a draft in the module editor). */
export interface ModuleDef {
  key: string;
  version: number | null;
  draft?: boolean;
  name: string;
  nameBn?: string | null;
  category?: string;
  icon?: string | null;
  fields: ModuleField[];
  template: string;
  css: string;
  js: string;
}

/** Per-instance override of a collection field (editor form). */
export interface CollectionFieldValue {
  collection?: string;
  limit?: number;
  sort?: string;
  filters?: Array<{ field: string; op: FilterOp; value: string }>;
}

export type Rec = Record<string, unknown>;

/* ── Fields ─────────────────────────────────────────────────────────────── */

export function canonicalType(t: unknown): ModuleFieldType | null {
  if (typeof t !== 'string') return null;
  const lower = t.trim().toLowerCase();
  if ((MODULE_FIELD_TYPES as readonly string[]).includes(lower)) return lower as ModuleFieldType;
  return FIELD_TYPE_ALIASES[lower] ?? null;
}

/** Lenient client-side normaliser (the server is strict): drops entries it can't understand. */
export function normaliseFields(input: unknown, depth = 0): ModuleField[] {
  if (!Array.isArray(input)) return [];
  const out: ModuleField[] = [];
  const seen = new Set<string>();
  for (const raw of input) {
    if (!raw || typeof raw !== 'object') continue;
    const r = raw as Rec;
    const type = canonicalType(r.type);
    const key = typeof r.key === 'string' ? r.key.trim() : '';
    if (!type || !/^[A-Za-z][A-Za-z0-9_]{0,39}$/.test(key) || seen.has(key)) continue;
    seen.add(key);
    const f: ModuleField = { ...(r as object), key, type } as ModuleField;
    if (type === 'repeater') f.fields = depth > 0 ? [] : normaliseFields(r.fields, depth + 1).filter((x) => x.type !== 'collection' && x.type !== 'repeater');
    if (type === 'collection' && r.filter && typeof r.filter === 'object' && !Array.isArray(r.filter)) {
      f.filters = [...(f.filters ?? []), ...Object.entries(r.filter as Rec).map(([field, value]) => ({ field, op: 'eq' as FilterOp, value: String(value) }))];
      delete (f as unknown as Rec).filter;
    }
    out.push(f);
  }
  return out;
}

/** Quick client-side schema check for the module editor (the server repeats it strictly on save/publish). */
export function checkFields(input: unknown, path = 'fields', depth = 0): string[] {
  if (!Array.isArray(input)) return [`${path}: must be a list of fields`];
  const out: string[] = [];
  const seen = new Set<string>();
  input.forEach((raw, i) => {
    const p = `${path}[${i}]`;
    if (!raw || typeof raw !== 'object') { out.push(`${p}: not a field object`); return; }
    const r = raw as Rec;
    const key = typeof r.key === 'string' ? r.key : '';
    const type = canonicalType(r.type);
    if (!/^[A-Za-z][A-Za-z0-9_]{0,39}$/.test(key)) out.push(`${p}: key "${key}" must start with a letter and use letters, digits or _`);
    else if (seen.has(key)) out.push(`${p}: duplicate key "${key}"`);
    seen.add(key);
    if (!type) out.push(`${p}: unknown type "${String(r.type)}"`);
    if (type === 'select' && !(Array.isArray(r.options) && r.options.length)) out.push(`${p}: a select field needs options`);
    if (type === 'collection' && !r.collection) out.push(`${p}: choose a collection`);
    if (depth > 0 && type === 'collection') out.push(`${p}: a repeater cannot contain a collection field`);
    if (type === 'repeater') {
      if (depth > 0) out.push(`${p}: a repeater cannot contain another repeater`);
      else out.push(...checkFields(r.fields ?? [], `${p}.fields`, depth + 1));
    }
  });
  if (depth === 0 && input.length > 50) out.push(`${path}: at most 50 fields`);
  return out;
}

export function fieldLabel(f: Pick<ModuleField, 'key' | 'label' | 'labelBn'>, lang: 'en' | 'bn' = 'en'): string {
  if (lang === 'bn' && f.labelBn) return f.labelBn;
  if (f.label) return f.label;
  const words = f.key.replace(/[_-]+/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function optionList(f: ModuleField): ModuleSelectOption[] {
  return (f.options ?? []).map((o) => (typeof o === 'string' ? { value: o, label: o } : { value: o.value, label: o.label ?? o.value, labelBn: o.labelBn }));
}

const TEXTY: ModuleFieldType[] = ['text', 'textarea', 'richtext'];
export const isTextType = (t: ModuleFieldType) => TEXTY.includes(t);

/** `default` may be a plain value or `{ en, bn }` for text twins. */
function splitDefault(d: unknown): { en: unknown; bn: unknown } {
  if (d && typeof d === 'object' && !Array.isArray(d) && ('en' in (d as Rec) || 'bn' in (d as Rec))) return { en: (d as Rec).en, bn: (d as Rec).bn };
  return { en: d, bn: undefined };
}

/** The stored-props default for one field (what a fresh block starts with). */
function defaultFor(f: ModuleField): unknown {
  const d = f.default;
  switch (f.type) {
    case 'text': case 'textarea': case 'richtext': return splitDefault(d).en ?? '';
    case 'number': return typeof d === 'number' ? d : d != null && d !== '' && Number.isFinite(Number(d)) ? Number(d) : null;
    case 'boolean': return d === undefined ? false : d === true || d === 'true';
    case 'select': return typeof d === 'string' ? d : optionList(f)[0]?.value ?? '';
    case 'repeater': return Array.isArray(d) ? d : [];
    case 'collection': return {};
    default: return typeof d === 'string' ? d : '';
  }
}

/** Default `values` for a new block instance. Text twins become `<key>Bn`. */
export function defaultValues(fields: ModuleField[]): Rec {
  const out: Rec = {};
  for (const f of fields) {
    out[f.key] = defaultFor(f);
    if (f.bn && isTextType(f.type)) out[`${f.key}Bn`] = splitDefault(f.default).bn ?? '';
  }
  return out;
}

/* ── Values → template data ─────────────────────────────────────────────── */

/** Liquid treats '' as truthy; normalising empties to null makes `{% if x %}` behave as authors expect. */
export function emptyToNull(v: unknown): unknown {
  return typeof v === 'string' && v.trim() === '' ? null : v;
}

function nonEmpty(v: unknown): boolean {
  return typeof v === 'string' ? v.replace(/<[^>]*>/g, '').trim() !== '' : v != null;
}

/**
 * Turns stored `values` into what the template sees as `module.*`:
 *  - text with `bn: true` → the visitor's language (Bangla twin when filled),
 *    plus `<key>_en` / `<key>_bn`;
 *  - numbers/booleans coerced, empty strings → null;
 *  - repeaters → arrays of resolved items;
 *  - collection fields are filled in separately (`collections` map: fetched items).
 */
export function resolveModuleValues(fields: ModuleField[], values: Rec | null | undefined, lang: 'en' | 'bn', collections: Record<string, Rec[]> = {}): Rec {
  const v = values ?? {};
  const out: Rec = {};
  for (const f of fields) {
    const raw = v[f.key] === undefined ? defaultFor(f) : v[f.key];
    switch (f.type) {
      case 'text': case 'textarea': case 'richtext': {
        const en = raw ?? '';
        const bnRaw = v[`${f.key}Bn`] ?? (v[f.key] === undefined ? splitDefault(f.default).bn : undefined);
        const bn = f.bn && nonEmpty(bnRaw) ? bnRaw : null;
        out[f.key] = emptyToNull(lang === 'bn' && bn ? bn : en);
        if (f.bn) {
          out[`${f.key}_en`] = emptyToNull(en);
          out[`${f.key}_bn`] = emptyToNull(bn);
        }
        break;
      }
      case 'number': {
        const n = typeof raw === 'number' ? raw : raw != null && raw !== '' ? Number(raw) : NaN;
        out[f.key] = Number.isFinite(n) ? n : null;
        break;
      }
      case 'boolean':
        out[f.key] = raw === true || raw === 'true';
        break;
      case 'repeater': {
        const rows = Array.isArray(raw) ? raw.filter((x) => x && typeof x === 'object') : [];
        out[f.key] = rows.slice(0, f.maxItems ?? 50).map((row) => resolveModuleValues(f.fields ?? [], row as Rec, lang));
        break;
      }
      case 'collection':
        out[f.key] = collections[f.key] ?? [];
        break;
      default:
        out[f.key] = emptyToNull(typeof raw === 'string' ? raw : raw == null ? null : String(raw));
    }
  }
  return out;
}

/** The query of one collection field: schema defaults, overridden per instance by the editor. */
export function collectionFieldQuery(f: ModuleField, value: unknown): { collection: string; limit: number; sort?: string; filters: NonNullable<ModuleField['filters']> } {
  const o = (value && typeof value === 'object' && !Array.isArray(value) ? value : {}) as CollectionFieldValue;
  const limit = Math.min(50, Math.max(1, Math.floor(Number(o.limit ?? f.limit ?? 6)) || 6));
  const sort = (typeof o.sort === 'string' && o.sort.trim() ? o.sort.trim() : f.sort) || undefined;
  const filters = (Array.isArray(o.filters) && o.filters.length ? o.filters : f.filters ?? []).filter((x) => x && x.field).slice(0, 10);
  return { collection: (typeof o.collection === 'string' && o.collection) || f.collection || '', limit, sort, filters };
}

/**
 * The aliases module templates rely on: `url` (profile page link, from the
 * computed `_url`) and `photo` (first image-ish field). Empty strings → null.
 */
export function moduleItem(item: Rec): Rec {
  const out: Rec = {};
  for (const [k, val] of Object.entries(item)) out[k] = emptyToNull(val);
  if (out.url == null && typeof item._url === 'string') out.url = item._url;
  if (out.photo == null) {
    const images = Array.isArray(item.images) ? item.images[0] : undefined;
    out.photo = emptyToNull(item.photoUrl ?? item.imageUrl ?? item.coverUrl ?? images ?? null);
  }
  return out;
}

/** `{ 'institution.name': 'X', 'site.name': 'Y' }` → `{ institution: { name: 'X' }, site: { name: 'Y' } }`. */
export function nestTokens(tokens: Record<string, string | undefined>): Record<string, Rec> {
  const out: Record<string, Rec> = {};
  for (const [k, v] of Object.entries(tokens)) {
    if (v == null) continue;
    const parts = k.split('.');
    if (parts.length === 1) { (out._ ??= {})[k] = v; continue; }
    let cur: Rec = (out[parts[0]] ??= {});
    for (let i = 1; i < parts.length - 1; i++) {
      const next = cur[parts[i]];
      cur = (next && typeof next === 'object' ? next : (cur[parts[i]] = {})) as Rec;
    }
    cur[parts[parts.length - 1]] = v;
  }
  return out;
}

/** Hash used to key module renders (stable JSON). */
export function stableKey(v: unknown): string {
  const seen = new WeakSet<object>();
  return JSON.stringify(v, (_k, val) => {
    if (val && typeof val === 'object') {
      if (seen.has(val)) return undefined;
      seen.add(val);
      if (!Array.isArray(val)) return Object.fromEntries(Object.keys(val).sort().map((k) => [k, (val as Rec)[k]]));
    }
    return val;
  });
}

/** Coerces whatever the API returned into a ModuleDef (or null). */
export function toModuleDef(raw: unknown): ModuleDef | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Rec;
  const key = typeof r.key === 'string' ? r.key : '';
  if (!key) return null;
  const s = (x: unknown) => (typeof x === 'string' ? x : '');
  return {
    key,
    version: typeof r.version === 'number' ? r.version : null,
    draft: r.draft === true,
    name: s(r.name) || key,
    nameBn: typeof r.nameBn === 'string' ? r.nameBn : null,
    category: s(r.category) || 'general',
    icon: typeof r.icon === 'string' ? r.icon : null,
    fields: normaliseFields(r.fields),
    template: s(r.template),
    css: s(r.css),
    js: s(r.js),
  };
}

/** Puck type names of the per-module palette entries (editor only); saved pages always use `CustomModule`. */
export const MODULE_ALIAS_PREFIX = 'CustomModule__';
export const moduleAliasType = (key: string) => `${MODULE_ALIAS_PREFIX}${key.replace(/[^A-Za-z0-9_-]/g, '_')}`;
