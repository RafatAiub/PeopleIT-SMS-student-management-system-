/**
 * The custom-module Liquid engine (W14). Loaded lazily (`import('./engine')`)
 * so liquidjs only downloads on pages that actually use a module.
 *
 * Safety (FEATURES_V4_PLAN §1b):
 *  - output autoescape ON (`outputEscape: 'escape'`); `| raw` and `| markdown`
 *    opt out, and the final HTML is sanitised by DOMPurify anyway;
 *  - no file system: `include` / `render` / `layout` are replaced by tags that
 *    fail at parse time;
 *  - `ownPropertyOnly`, a render-time limit, a memory limit and an output cap;
 *  - data only through `{% collection %}`, which calls the host's whitelisted,
 *    tenant-safe collections API (max 8 queries per render).
 */
import { Liquid, Tag, Value, filters as builtinFilters, type Context, type TagToken, type Template, type TopLevelToken } from 'liquidjs';
import type { CollectionParams } from '../collections';
import { formatSiteDate, siteString } from '../strings';
import { toBanglaDigits } from '../format';
import { optimiseImage } from '../blocks/shared';
import { isQueryableCollection, parseCollectionTagArgs, tagQueryParams, type CollectionTagArgs } from './collectionTag';
import { renderMarkdown } from './markdown';
import { MODULE_PHRASES_BN } from './phrases';
import type { Rec } from './types';

export type ModuleLang = 'en' | 'bn';

export interface LiquidEnv {
  lang: ModuleLang;
  /** Runs one collections API query; returns items already decorated (url/photo aliases). */
  fetchCollection: (key: string, params: CollectionParams) => Promise<Rec[]>;
  maxFetches?: number;
  /** Override "now" (tests). */
  now?: () => Date;
}

export const MAX_OUTPUT_CHARS = 256 * 1024;
/** Wall-clock deadline for one render (liquidjs counts awaited `{% collection %}` fetches too, hence generous). */
export const RENDER_LIMIT_MS = 15_000;
export const MODULE_FILTER_NAMES = ['t', 'bn_digits', 'money', 'num', 'img', 'markdown', 'days_until'] as const;

export class ModuleTemplateError extends Error {
  line: number | null;
  col: number | null;
  constructor(message: string, line: number | null = null, col: number | null = null) {
    super(message);
    this.name = 'ModuleTemplateError';
    this.line = line;
    this.col = col;
  }
}

/* ── Formatting helpers (exported for tests) ─────────────────────────────── */

/** ৳ with Bangladeshi grouping (12,34,567), Bangla digits when `lang` is bn. */
export function formatTaka(value: unknown, lang: ModuleLang = 'en', decimals?: number): string {
  const n = typeof value === 'number' ? value : Number(String(value ?? '').replace(/[,\s৳]/g, ''));
  if (value == null || value === '' || !Number.isFinite(n)) return value == null ? '' : String(value);
  const abs = Math.abs(n);
  const d = decimals ?? (Number.isInteger(abs) ? 0 : 2);
  const [int, dec] = abs.toFixed(Math.max(0, Math.min(4, d))).split('.');
  const last3 = int.slice(-3);
  const rest = int.slice(0, -3);
  const grouped = rest ? `${rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',')},${last3}` : last3;
  const s = `${n < 0 ? '-' : ''}৳${grouped}${dec ? `.${dec}` : ''}`;
  return lang === 'bn' ? toBanglaDigits(s) : s;
}

/** A number with Bangladeshi grouping (12,34,567) and, in Bangla, Bangla digits; `decimals` is a maximum. Non-numbers pass through. */
export function formatNum(value: unknown, lang: ModuleLang = 'en', decimals?: number): string {
  if (value == null || value === '') return '';
  const n = typeof value === 'number' ? value : Number(String(value).replace(/,/g, ''));
  if (!Number.isFinite(n)) return String(value);
  // `decimals` = at most that many (trailing zeros trimmed): 95 → "95", 98.456 → "98.5" with num: 1.
  let out = formatTaka(n, 'en', decimals ?? (Number.isInteger(n) ? 0 : Math.min(2, String(n).split('.')[1]?.length ?? 0))).replace('৳', '');
  if (out.includes('.')) out = out.replace(/\.?0+$/, '');
  return lang === 'bn' ? toBanglaDigits(out) : out;
}

/** Whole days from `now` until `date` (negative when past; null when not a date). Dhaka calendar days. */
export function daysUntil(date: unknown, now: Date = new Date()): number | null {
  if (date == null || date === '') return null;
  const t = new Date(String(date)).getTime();
  if (!Number.isFinite(t)) return null;
  const DAY = 86_400_000;
  const dhaka = (ms: number) => Math.floor((ms + 6 * 3_600_000) / DAY);
  return dhaka(t) - dhaka(now.getTime());
}

const DATE_PRESETS: Record<string, Intl.DateTimeFormatOptions> = {
  long: { day: 'numeric', month: 'long', year: 'numeric' },
  short: { day: 'numeric', month: 'short', year: 'numeric' },
  day: { day: 'numeric', month: 'short' },
  month: { month: 'long', year: 'numeric' },
  weekday: { weekday: 'long', day: 'numeric', month: 'long' },
  time: { hour: 'numeric', minute: '2-digit' },
  datetime: { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' },
};

/** `t`: `{en,bn}` objects pick by language; strings use the phrase book, or the inline Bangla argument. */
export function translateValue(v: unknown, lang: ModuleLang, bnArg?: unknown): string {
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    const o = v as Rec;
    const en = typeof o.en === 'string' ? o.en : '';
    const bn = typeof o.bn === 'string' ? o.bn : '';
    return lang === 'bn' ? bn || en : en || bn;
  }
  const s = v == null ? '' : String(v);
  if (lang !== 'bn') return s;
  if (typeof bnArg === 'string' && bnArg.trim()) return bnArg;
  return MODULE_PHRASES_BN[s] ?? siteString('bn', s);
}

/* ── Engine ─────────────────────────────────────────────────────────────── */

const ENVS = new WeakMap<object, LiquidEnv>();

type FilterThis = { context: Context };
const langOf = (self: FilterThis): ModuleLang => ((self.context.environments as Rec)?.lang === 'bn' ? 'bn' : 'en');

class BlockedTag extends Tag {
  constructor(token: TagToken, remain: TopLevelToken[], liquid: Liquid) {
    super(token, remain, liquid);
    throw new Error(`{% ${token.name} %} is not available in modules (no files or partials). Copy the markup in instead.`);
  }
  *render(): Generator<unknown, void, unknown> { /* never reached */ }
}

class CollectionTag extends Tag {
  private args: CollectionTagArgs;
  private vars = new Map<string, Value>();
  constructor(token: TagToken, remain: TopLevelToken[], liquid: Liquid) {
    super(token, remain, liquid);
    this.args = parseCollectionTagArgs(token.args);
    if (!isQueryableCollection(this.args.collection)) throw new Error(`Unknown collection "${this.args.collection}"`);
    for (const o of this.args.options) if (o.value.kind === 'var') this.vars.set(o.name, new Value(o.value.value, liquid));
  }
  *render(ctx: Context): Generator<unknown, void, unknown> {
    const env = ENVS.get(ctx.environments as object);
    if (!env) throw new Error('{% collection %} is not available here');
    const counter = ctx.getRegister('peoplenit_collection_fetches', {}) as { n?: number };
    counter.n = (counter.n ?? 0) + 1;
    const max = env.maxFetches ?? 8;
    if (counter.n > max) throw new Error(`Too many {% collection %} queries in one module (max ${max})`);
    const resolved: Array<{ name: string; value: unknown }> = [];
    for (const o of this.args.options) {
      const value = o.value.kind === 'var' ? yield this.vars.get(o.name)!.value(ctx, false) : o.value.value;
      resolved.push({ name: o.name, value });
    }
    const items = (yield env.fetchCollection(this.args.collection, tagQueryParams(resolved))) as unknown;
    ctx.bottom()[this.args.as] = Array.isArray(items) ? items : [];
  }
}

let engine: Liquid | null = null;

export function moduleEngine(): Liquid {
  if (engine) return engine;
  const e = new Liquid({
    outputEscape: 'escape',
    strictFilters: true,
    strictVariables: false,
    ownPropertyOnly: true,
    jsTruthy: false,
    dynamicPartials: false,
    relativeReference: false,
    parseLimit: 400_000,
    renderLimit: RENDER_LIMIT_MS,
    memoryLimit: 20_000_000,
    cache: false,
  });
  e.registerFilter('t', function (this: FilterThis, v: unknown, bn?: unknown) { return translateValue(v, langOf(this), bn); });
  e.registerFilter('bn_digits', (v: unknown) => (v == null ? '' : toBanglaDigits(String(v))));
  e.registerFilter('money', function (this: FilterThis, v: unknown, decimals?: unknown) {
    return formatTaka(v, langOf(this), decimals == null ? undefined : Number(decimals));
  });
  e.registerFilter('num', function (this: FilterThis, v: unknown, decimals?: unknown) {
    return formatNum(v, langOf(this), decimals == null ? undefined : Number(decimals));
  });
  e.registerFilter('img', (v: unknown, width?: unknown) => {
    if (typeof v !== 'string' || !v) return '';
    const w = Math.min(2400, Math.max(40, Math.floor(Number(width) || 800)));
    return optimiseImage(v, w) ?? '';
  });
  e.registerFilter('markdown', { handler: (v: unknown) => renderMarkdown(v), raw: true });
  e.registerFilter('days_until', function (this: FilterThis, v: unknown) {
    const env = ENVS.get(this.context.environments as object);
    return daysUntil(v, env?.now?.() ?? new Date());
  });
  // `date`: friendly presets (long, short, day, month, weekday, time, datetime) in the
  // visitor's language; anything with a % is a strftime format (built-in behaviour).
  const builtinDate = (builtinFilters as unknown as Record<string, (...a: unknown[]) => unknown>).date;
  e.registerFilter('date', function (this: FilterThis, v: unknown, fmt?: unknown, tz?: unknown) {
    if (v == null || v === '') return '';
    if (typeof fmt === 'string' && fmt.includes('%')) return builtinDate.call(this, v, fmt, tz);
    const preset = DATE_PRESETS[typeof fmt === 'string' && fmt ? fmt : 'long'] ?? DATE_PRESETS.long;
    const value = v === 'now' || v === 'today' ? new Date() : (v as string | Date);
    return formatSiteDate(value instanceof Date ? value : String(value), langOf(this), preset) || String(v);
  });
  for (const t of ['include', 'render', 'layout']) e.registerTag(t, BlockedTag);
  e.registerTag('collection', CollectionTag);
  engine = e;
  return e;
}

/* ── Parse / render ─────────────────────────────────────────────────────── */

const parsed = new Map<string, Template[]>();

function positionOf(err: unknown): { line: number | null; col: number | null } {
  const tok = (err as { token?: { getPosition?: () => [number, number] } })?.token;
  if (tok?.getPosition) {
    try {
      const [line, col] = tok.getPosition();
      return { line, col };
    } catch { /* ignore */ }
  }
  const m = /line:(\d+), col:(\d+)/.exec(String((err as Error)?.message ?? ''));
  return m ? { line: Number(m[1]), col: Number(m[2]) } : { line: null, col: null };
}

export function toTemplateError(err: unknown): ModuleTemplateError {
  if (err instanceof ModuleTemplateError) return err;
  const inner = (err as { errors?: unknown[] })?.errors?.[0] ?? err;
  const { line, col } = positionOf(inner);
  const msg = String((inner as Error)?.message ?? inner ?? 'Template error')
    .replace(/, line:\d+, col:\d+$/, '')
    .replace(/^(ParseError|RenderError|TokenizationError): /, '');
  return new ModuleTemplateError(msg, line, col);
}

export function parseTemplate(template: string): Template[] {
  const hit = parsed.get(template);
  if (hit) return hit;
  let tpls: Template[];
  try {
    tpls = moduleEngine().parse(template ?? '');
  } catch (err) {
    throw toTemplateError(err);
  }
  if (parsed.size > 60) parsed.delete(parsed.keys().next().value as string);
  parsed.set(template, tpls);
  return tpls;
}

/** Parse-only check for the module editor: null when fine. */
export function checkTemplate(template: string): ModuleTemplateError | null {
  try {
    parseTemplate(template);
    return null;
  } catch (err) {
    return toTemplateError(err);
  }
}

/** Renders a template against `data` (module, site, institution, page, item, parent, lang, url). */
export async function renderLiquid(template: string, data: Rec, env: LiquidEnv): Promise<string> {
  const tpls = parseTemplate(template);
  const scope: Rec = { ...data, lang: env.lang };
  ENVS.set(scope, env);
  let html: string;
  try {
    html = String(await moduleEngine().render(tpls, scope));
  } catch (err) {
    throw toTemplateError(err);
  }
  if (html.length > MAX_OUTPUT_CHARS) throw new ModuleTemplateError(`The module produced too much HTML (${Math.round(html.length / 1024)} KB, limit ${MAX_OUTPUT_CHARS / 1024} KB)`);
  return html;
}
