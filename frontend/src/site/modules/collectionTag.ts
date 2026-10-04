/**
 * `{% collection "notices" limit:5 sort:"-publishedAt" filter.category:"Sports" q:url.query.q as notices %}`
 *
 * Argument grammar for the custom Liquid tag. Kept identical to the server's
 * copy in backend/src/modules/sites/sites.modules.logic.ts (the server parses
 * templates on save/publish; the browser parses them to render).
 *
 * Options: `limit` (1–50), `sort` ("field" / "-field"), `q` (search), `page`,
 * `include` (relations), `filter.<field>` (equals) and `filter.<field>.<op>`
 * (eq ne in contains gt gte lt lte has). Values are "quoted", numbers, or a
 * variable path (e.g. `item.department`, `url.query.q`). `as <name>` is
 * optional (defaults to the collection key).
 */
import type { CollectionParams } from '../collections';
import { PRIVATE_COLLECTIONS } from '../collections';

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

/** True for keys the tag may query (the API is the real gate; this just refuses private ones early). */
export function isQueryableCollection(key: string): boolean {
  return /^[a-z][a-z0-9_-]{0,39}$/.test(key) && !PRIVATE_COLLECTIONS.has(key);
}

/**
 * Evaluated option values → `GET /collections/:key` params (§8.3). Empty
 * values drop their option (so `filter.dept:url.query.dept` with no `?dept=`
 * shows everything), the same rule CollectionList uses.
 */
export function tagQueryParams(resolved: Array<{ name: string; value: unknown }>, defaultLimit = 10): CollectionParams {
  const out: CollectionParams = {};
  const str = (v: unknown): string => {
    if (v == null) return '';
    if (Array.isArray(v)) return v.map((x) => String(x ?? '')).filter(Boolean).join(',');
    return typeof v === 'object' ? '' : String(v).trim();
  };
  for (const { name, value } of resolved) {
    const v = str(value);
    if (!v) continue;
    if (name === 'limit') {
      const n = Math.floor(Number(v));
      if (Number.isFinite(n)) out.pageSize = Math.min(50, Math.max(1, n));
    } else if (name === 'page') {
      const n = Math.floor(Number(v));
      if (Number.isFinite(n)) out.page = Math.min(1000, Math.max(1, n));
    } else if (name === 'sort') out.sort = v.slice(0, 80);
    else if (name === 'q') out.q = v.slice(0, 100);
    else if (name === 'include') out.include = v.slice(0, 200);
    else if (name.startsWith('filter.')) {
      const [, field, op = 'eq'] = name.split('.');
      out[`filter[${field}][${op}]`] = v.slice(0, 200);
    }
  }
  if (out.pageSize === undefined) out.pageSize = defaultLimit;
  if (out.page === undefined) out.page = 1;
  return out;
}
