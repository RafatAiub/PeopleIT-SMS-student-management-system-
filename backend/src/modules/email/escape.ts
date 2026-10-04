// =============================================================================
// HTML escaping helpers for email templates.
//
// Every value that reaches an email template can originate from user input —
// a student name, a teacher's leave reason, a shop customer's address. None of
// it is trusted, and unlike the plain-text bodies this system already sent,
// HTML interpretation makes an unescaped value a markup/JS injection vector in
// whatever mail client renders it. Every template MUST route interpolated
// values through escapeHtml() before splicing them into markup.
// =============================================================================

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/** Escapes the five HTML-significant characters. Safe to call on already-escaped text (idempotent only for those five). */
export function escapeHtml(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value).replace(/[&<>"']/g, (ch) => HTML_ESCAPES[ch]);
}

/** Escapes, then turns newlines into <br/> — for short freeform text blocks (notes, messages). */
export function escapeHtmlMultiline(value: unknown): string {
  return escapeHtml(value).replace(/\r\n|\r|\n/g, '<br/>');
}

/**
 * A safe `encodeURIComponent`-style href builder: escapes the final HTML
 * attribute value too, since a URL can itself contain `&` (query strings) that
 * must be entity-encoded inside an href="" attribute.
 */
export function escapeAttr(value: unknown): string {
  return escapeHtml(value);
}
