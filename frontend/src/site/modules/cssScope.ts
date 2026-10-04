/**
 * Scopes a module's CSS to one instance: every selector gets the instance's
 * attribute selector in front, so `.card { … }` in one module can never style
 * another block on the page.
 *
 *   scopeCss('.a, .b:hover { color: red }', '[data-module="m1"]')
 *   → '[data-module="m1"] .a, [data-module="m1"] .b:hover { color: red }'
 *
 * - `:root`, `html`, `body`, `:host` at the start of a selector become the
 *   scope itself (so `:root { --x: 1 }` sets a variable on the module).
 * - @media / @supports / @container / @layer (and any unknown block at-rule)
 *   are scoped recursively; @keyframes, @font-face, @property, @page and
 *   @counter-style are kept as-is (they contain no selectors).
 * - @import, @charset and @namespace are dropped (modules can't load stylesheets).
 * - Comments are removed; strings and parentheses are respected when splitting.
 * Theme CSS variables (`--site-primary`, …) keep working because the module
 * renders inside `.site-root`.
 */

const VERBATIM_AT = /^@(?:-[a-z]+-)?(keyframes|font-face|property|page|counter-style|font-feature-values|view-transition)\b/i;
const DROP_STATEMENT = /^@(import|charset|namespace)\b/i;
const ROOTISH = /^(?::root|html|body|:host)(?![\w-])/i;

function stripComments(css: string): string {
  let out = '';
  let i = 0;
  let quote: string | null = null;
  while (i < css.length) {
    const ch = css[i];
    if (quote) {
      out += ch;
      if (ch === '\\' && i + 1 < css.length) { out += css[i + 1]; i += 2; continue; }
      if (ch === quote) quote = null;
      i++;
      continue;
    }
    if (ch === '"' || ch === "'") { quote = ch; out += ch; i++; continue; }
    if (ch === '/' && css[i + 1] === '*') {
      const end = css.indexOf('*/', i + 2);
      i = end === -1 ? css.length : end + 2;
      continue;
    }
    out += ch;
    i++;
  }
  return out;
}

/** Index of the next `stop` char at depth 0 (outside strings/parens/brackets), or -1. */
function findTopLevel(text: string, from: number, stops: string): number {
  let depth = 0;
  let quote: string | null = null;
  for (let i = from; i < text.length; i++) {
    const ch = text[i];
    if (quote) {
      if (ch === '\\') { i++; continue; }
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") { quote = ch; continue; }
    if (ch === '(' || ch === '[') depth++;
    else if ((ch === ')' || ch === ']') && depth > 0) depth--;
    else if (depth === 0 && stops.includes(ch)) return i;
  }
  return -1;
}

/** Index of the `}` matching the `{` at `open`, or -1. */
function matchBrace(text: string, open: number): number {
  let depth = 0;
  let quote: string | null = null;
  for (let i = open; i < text.length; i++) {
    const ch = text[i];
    if (quote) {
      if (ch === '\\') { i++; continue; }
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") { quote = ch; continue; }
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function splitSelectors(prelude: string): string[] {
  const out: string[] = [];
  let start = 0;
  for (;;) {
    const comma = findTopLevel(prelude, start, ',');
    if (comma === -1) { out.push(prelude.slice(start)); break; }
    out.push(prelude.slice(start, comma));
    start = comma + 1;
  }
  return out.map((s) => s.trim()).filter(Boolean);
}

export function scopeSelector(sel: string, scope: string): string {
  const s = sel.trim();
  if (!s) return s;
  if (s.startsWith(scope)) return s;
  if (ROOTISH.test(s)) {
    const rest = s.replace(ROOTISH, '');
    // `body.dark .x` → `[scope].dark .x`; `html > body .x` → `[scope] .x`
    return `${scope}${rest.replace(/^\s*>?\s*(?:body|html)(?![\w-])/i, '')}`;
  }
  return `${scope} ${s}`;
}

function scopeBlock(css: string, scope: string, depth: number): string {
  const out: string[] = [];
  let i = 0;
  while (i < css.length) {
    while (i < css.length && /\s/.test(css[i])) i++;
    if (i >= css.length) break;
    const brace = findTopLevel(css, i, '{;}');
    if (brace === -1) break; // trailing junk without a block
    const ch = css[brace];
    const prelude = css.slice(i, brace).trim();
    if (ch === '}') { i = brace + 1; continue; } // stray closer
    if (ch === ';') {
      if (prelude && !DROP_STATEMENT.test(prelude) && prelude.startsWith('@')) out.push(`${prelude};`);
      i = brace + 1;
      continue;
    }
    const close = matchBrace(css, brace);
    const body = close === -1 ? css.slice(brace + 1) : css.slice(brace + 1, close);
    i = close === -1 ? css.length : close + 1;
    if (!prelude) continue;
    if (prelude.startsWith('@')) {
      if (DROP_STATEMENT.test(prelude)) continue;
      if (VERBATIM_AT.test(prelude)) out.push(`${prelude} {${body}}`);
      // @media/@supports/… and any unknown block at-rule (e.g. @starting-style): scope what's inside.
      else if (depth < 8) out.push(`${prelude} {\n${scopeBlock(body, scope, depth + 1)}\n}`);
      continue;
    }
    const selectors = splitSelectors(prelude).map((s) => scopeSelector(s, scope));
    if (selectors.length) out.push(`${selectors.join(', ')} {${body}}`);
  }
  return out.join('\n');
}

export function scopeCss(css: string, scope: string): string {
  if (!css || !css.trim()) return '';
  return scopeBlock(stripComments(css), scope, 0);
}

/** `[data-module="<id>"]` for an instance id (sanitised so it can't break out of the selector). */
export function moduleScopeAttr(instanceId: string): string {
  return `[data-module="${instanceId.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 80)}"]`;
}

export function safeInstanceId(instanceId: string): string {
  return instanceId.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 80) || 'module';
}

/** Light CSS checks for the module editor (same rules as the server): balanced braces, no @import. */
export function checkCss(css: string): Array<{ line: number | null; message: string }> {
  const out: Array<{ line: number | null; message: string }> = [];
  const text = (css ?? '').replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
  let depth = 0;
  let line = 1;
  for (const ch of text) {
    if (ch === '\n') line++;
    else if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth < 0) { out.push({ line, message: 'Unexpected "}"' }); depth = 0; }
    }
  }
  if (depth > 0) out.push({ line, message: 'A "{" is never closed' });
  const imp = /@import\b/i.exec(text);
  if (imp) out.push({ line: text.slice(0, imp.index).split('\n').length, message: '@import is not allowed in module CSS' });
  return out;
}

/** Neutralises `</style` so CSS text can't close its <style> element. */
export function cssForStyleTag(css: string): string {
  return css.replace(/<\/(style)/gi, '<\\/$1');
}
