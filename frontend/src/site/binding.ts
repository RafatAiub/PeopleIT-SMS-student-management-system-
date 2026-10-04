/**
 * Data binding + visibility core (Website Builder W2 / W6). Pure — no React —
 * so the editor, the public renderer and the unit tests share one implementation.
 *
 * Every block may carry two reserved props (stored next to its normal props,
 * never rendered as-is):
 *   `_bind`    { <propPath>: { src, path, fmt?, fallback? } }  field → data
 *   `_visible` { match, when[], hideOn[] }                     show-if rules
 *
 * A "scope" is what a path resolves against:
 *   item    nearest collection-list item (or the template page's record)
 *   parent  the item of the next enclosing list (nested lists)
 *   page    the template page's own record
 *   site    institution / site tokens (`institution.name`, `site.tagline` …)
 *   url     query-string + route params
 */
import { applyFmt, isBindFmt, type BindFmt } from './format';
import type { SiteLang } from './types';

export type Rec = Record<string, unknown>;

export const BIND_SOURCES = ['item', 'parent', 'page', 'site'] as const;
export type BindSrc = (typeof BIND_SOURCES)[number];

export interface BindSpec {
  src: BindSrc;
  path: string;
  fmt?: BindFmt;
  fallback?: string;
}
export type BindMap = Record<string, BindSpec>;

export interface Scope {
  item?: Rec | null;
  parent?: Rec | null;
  page?: Rec | null;
  /** Flat token map (`institution.name` → value). */
  site?: Record<string, string | undefined> | null;
  url?: Record<string, string | undefined> | null;
}

export const EMPTY_SCOPE: Scope = {};

/* ── Paths ──────────────────────────────────────────────────────────────── */

/** `a.b[0].c` → ['a','b','0','c']. */
export function splitPath(path: string): string[] {
  return path
    .replace(/\[(\w+)\]/g, '.$1')
    .split('.')
    .map((s) => s.trim())
    .filter(Boolean);
}

const BLOCKED = new Set(['__proto__', 'prototype', 'constructor']);

export function getPath(obj: unknown, path: string): unknown {
  let cur: unknown = obj;
  for (const key of splitPath(path)) {
    if (cur == null || BLOCKED.has(key)) return undefined;
    if (Array.isArray(cur)) cur = cur[Number(key)];
    else if (typeof cur === 'object') cur = Object.prototype.hasOwnProperty.call(cur, key) ? (cur as Rec)[key] : undefined;
    else return undefined;
  }
  return cur;
}

/** Immutable set (copies every level on the path). Numeric keys create arrays. */
export function setPath<T>(obj: T, path: string, value: unknown): T {
  const keys = splitPath(path);
  if (!keys.length || keys.some((k) => BLOCKED.has(k))) return obj;
  const rec = (node: unknown, i: number): unknown => {
    const key = keys[i];
    const isIdx = Array.isArray(node) || (node == null && /^\d+$/.test(key));
    const base: Rec | unknown[] = Array.isArray(node) ? [...node] : node && typeof node === 'object' ? { ...(node as Rec) } : isIdx ? [] : {};
    const child = (base as Rec)[key];
    (base as Rec)[key] = i === keys.length - 1 ? value : rec(child, i + 1);
    return base;
  };
  return rec(obj, 0) as T;
}

export function isEmptyValue(v: unknown): boolean {
  if (v == null) return true;
  if (typeof v === 'string') return v.replace(/<[^>]*>/g, '').trim() === '';
  if (Array.isArray(v)) return v.length === 0;
  return false;
}

/* ── Binding ────────────────────────────────────────────────────────────── */

export function isBindSpec(v: unknown): v is BindSpec {
  if (!v || typeof v !== 'object') return false;
  const b = v as Partial<BindSpec>;
  return typeof b.src === 'string' && (BIND_SOURCES as readonly string[]).includes(b.src) && typeof b.path === 'string' && b.path.length > 0;
}

function scopeRoot(scope: Scope, src: BindSrc): unknown {
  if (src === 'site') return scope.site ?? undefined;
  return scope[src] ?? undefined;
}

/**
 * Resolves one binding. Returns `undefined` when the scope itself is absent
 * (the block then keeps its literal value — e.g. a template page with no
 * sample item chosen yet); returns `''` when the scope exists but the field
 * is empty and no fallback is set (so stale placeholder copy never shows).
 */
export function resolveBind(spec: BindSpec, scope: Scope, lang: SiteLang = 'en'): unknown {
  const root = scopeRoot(scope, spec.src);
  if (root == null) return undefined;
  const raw = spec.src === 'site' ? ((root as Record<string, unknown>)[spec.path] ?? getPath(root, spec.path)) : getPath(root, spec.path);
  if (isEmptyValue(raw)) return spec.fallback ?? '';
  if (raw !== null && typeof raw === 'object') return raw; // arrays/objects pass through (galleries, repeaters)
  return spec.fmt ? applyFmt(raw, spec.fmt, lang) : raw;
}

/** Copy of `props` with every `_bind` entry applied. `_bind` itself is kept so editors can still read it. */
export function applyBindings<P extends Rec>(props: P, scope: Scope, lang: SiteLang = 'en'): P {
  const bind = props._bind;
  if (!bind || typeof bind !== 'object') return props;
  let out: P = props;
  for (const [propPath, spec] of Object.entries(bind as Rec)) {
    if (!isBindSpec(spec)) continue;
    const v = resolveBind(spec, scope, lang);
    if (v === undefined) continue;
    out = setPath(out, propPath, v);
  }
  return out;
}

/** All bound prop paths of a props object (editor: marks fields as bound). */
export function boundPaths(props: Rec | undefined): string[] {
  const b = props?._bind;
  return b && typeof b === 'object' ? Object.entries(b as Rec).filter(([, s]) => isBindSpec(s)).map(([k]) => k) : [];
}

export function describeBind(spec: BindSpec): string {
  return `${spec.src}.${spec.path}${spec.fmt ? ` | ${spec.fmt}` : ''}`;
}

/** Add/replace/remove (spec = null) one binding; returns the new `_bind` map (undefined when empty). */
export function withBinding(current: unknown, propPath: string, spec: BindSpec | null): BindMap | undefined {
  const next: BindMap = {};
  if (current && typeof current === 'object') {
    for (const [k, v] of Object.entries(current as Rec)) if (isBindSpec(v) && k !== propPath) next[k] = v;
  }
  if (spec) next[propPath] = spec;
  return Object.keys(next).length ? next : undefined;
}

/* ── Scope tokens ({{item.x}} / {{parent.x}} / {{page.x}} / {{url.q}}) ──── */

/**
 * Flattens scope records into a token map (depth ≤ 3; arrays of scalars are
 * joined). Merged over the site tokens at render time, so `{{item.title}}`
 * works in any text prop without a `_bind`.
 */
export function scopeTokens(scope: Scope): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  const walk = (prefix: string, v: unknown, depth: number) => {
    if (v == null) return;
    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
      out[prefix] = String(v);
    } else if (Array.isArray(v)) {
      if (v.every((x) => x == null || typeof x !== 'object')) out[prefix] = v.filter((x) => x != null).join(', ');
    } else if (typeof v === 'object' && depth < 3) {
      for (const [k, val] of Object.entries(v as Rec)) if (!BLOCKED.has(k)) walk(`${prefix}.${k}`, val, depth + 1);
    }
  };
  walk('item', scope.item, 0);
  walk('parent', scope.parent, 0);
  walk('page', scope.page, 0);
  if (scope.url) for (const [k, v] of Object.entries(scope.url)) if (v != null) out[`url.${k}`] = v;
  return out;
}

/* ── Visibility (W6) ────────────────────────────────────────────────────── */

export const VIS_OPS = ['empty', 'notEmpty', 'eq', 'neq', 'gt', 'lt', 'contains'] as const;
export type VisOp = (typeof VIS_OPS)[number];
export const VIS_VIEWPORTS = ['sm', 'md', 'lg'] as const;
export type VisViewport = (typeof VIS_VIEWPORTS)[number];

export interface VisRule {
  src: 'item' | 'url' | 'parent' | 'page';
  path: string;
  op: VisOp;
  value?: string;
}
export interface VisibleSpec {
  match?: 'all' | 'any';
  when?: VisRule[];
  hideOn?: VisViewport[];
}

export function hasVisibility(spec: unknown): spec is VisibleSpec {
  if (!spec || typeof spec !== 'object') return false;
  const s = spec as VisibleSpec;
  return (Array.isArray(s.when) && s.when.length > 0) || (Array.isArray(s.hideOn) && s.hideOn.length > 0);
}

function toComparable(a: unknown, b: unknown): [number, number] | [string, string] {
  const na = typeof a === 'number' ? a : Number(a);
  const nb = Number(b);
  if (String(a).trim() !== '' && String(b).trim() !== '' && Number.isFinite(na) && Number.isFinite(nb)) return [na, nb];
  const da = Date.parse(String(a));
  const db = Date.parse(String(b));
  if (Number.isFinite(da) && Number.isFinite(db) && /\d{4}-\d{2}-\d{2}/.test(String(a)) && /\d{4}-\d{2}-\d{2}/.test(String(b))) return [da, db];
  return [String(a), String(b)];
}

export function evalRule(rule: VisRule, scope: Scope): boolean {
  const raw = rule.src === 'url' ? (scope.url ?? {})[rule.path] : getPath(scope[rule.src], rule.path);
  const want = rule.value ?? '';
  switch (rule.op) {
    case 'empty': return isEmptyValue(raw);
    case 'notEmpty': return !isEmptyValue(raw);
    case 'eq': return !isEmptyValue(raw) ? String(raw).trim().toLowerCase() === want.trim().toLowerCase() : want.trim() === '';
    case 'neq': return !isEmptyValue(raw) ? String(raw).trim().toLowerCase() !== want.trim().toLowerCase() : want.trim() !== '';
    case 'gt': { if (isEmptyValue(raw)) return false; const [a, b] = toComparable(raw, want); return a > b; }
    case 'lt': { if (isEmptyValue(raw)) return false; const [a, b] = toComparable(raw, want); return a < b; }
    case 'contains':
      if (Array.isArray(raw)) return raw.some((x) => String(x).toLowerCase() === want.toLowerCase());
      return !isEmptyValue(raw) && want !== '' && String(raw).toLowerCase().includes(want.toLowerCase());
    default: return true;
  }
}

/** Data conditions only (device hiding is CSS). No rules → visible. */
export function evalVisibility(spec: VisibleSpec | undefined | null, scope: Scope): boolean {
  const rules = (spec?.when ?? []).filter((r) => r && typeof r.path === 'string' && r.path && (VIS_OPS as readonly string[]).includes(r.op));
  if (!rules.length) return true;
  return spec?.match === 'any' ? rules.some((r) => evalRule(r, scope)) : rules.every((r) => evalRule(r, scope));
}

/** CSS classes (defined in site.css) that hide a block on the chosen devices. */
export function hideClasses(spec: VisibleSpec | undefined | null): string {
  const on = (spec?.hideOn ?? []).filter((v): v is VisViewport => (VIS_VIEWPORTS as readonly string[]).includes(v));
  return Array.from(new Set(on)).map((v) => `site-hide-${v}`).join(' ');
}

export { isBindFmt };
