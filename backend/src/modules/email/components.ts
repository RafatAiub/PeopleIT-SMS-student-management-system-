import { FONT_STACK, PLATFORM_BRAND } from './brand';
import { escapeHtml } from './escape';

// =============================================================================
// Reusable, table-based, inline-styled building blocks for the shared email
// layout. Every function here returns a self-contained HTML fragment — no
// external <style> blocks, since a large share of mail clients strip them.
// =============================================================================

/** Bulletproof-ish CTA button: a bgcolor'd <td> + inline-styled <a>, which survives Outlook's Word rendering engine. Always uses the AA-contrast button color — never the raw accent. */
export function button(url: string, label: string): string {
  const href = escapeHtml(url);
  const text = escapeHtml(label);
  return `
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:24px auto;">
    <tr>
      <td align="center" bgcolor="${PLATFORM_BRAND.buttonBg}" style="border-radius:6px;">
        <a href="${href}" target="_blank" rel="noopener"
           style="display:inline-block;padding:13px 30px;font-family:${FONT_STACK};font-size:15px;line-height:1.2;font-weight:600;color:${PLATFORM_BRAND.buttonText};text-decoration:none;border-radius:6px;">
          ${text}
        </a>
      </td>
    </tr>
  </table>`;
}

/** Fallback "if the button doesn't work" plain link — required for clients that strip inline styles entirely. */
export function fallbackLink(url: string): string {
  const href = escapeHtml(url);
  return `<p style="margin:0 0 20px;font-size:13px;color:#6b7280;line-height:1.6;">
    If the button doesn't work, paste this link into your browser:<br/>
    <a href="${href}" style="color:${PLATFORM_BRAND.buttonBg};word-break:break-all;">${href}</a>
  </p>`;
}

export interface InfoRow {
  label: string;
  value: string | number;
}

/** Two-column "label : value" table — invoices, receipts, subscription facts. */
export function infoTable(rows: InfoRow[]): string {
  const trs = rows
    .map(
      (r, i) => `
      <tr>
        <td style="padding:9px 0;border-bottom:${i === rows.length - 1 ? 'none' : '1px solid #e5e7eb'};font-family:${FONT_STACK};font-size:13px;color:#6b7280;white-space:nowrap;vertical-align:top;">${escapeHtml(r.label)}</td>
        <td style="padding:9px 0 9px 16px;border-bottom:${i === rows.length - 1 ? 'none' : '1px solid #e5e7eb'};font-family:${FONT_STACK};font-size:14px;color:#111827;font-weight:600;text-align:right;">${escapeHtml(r.value)}</td>
      </tr>`,
    )
    .join('');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:4px 0 20px;background:#f9fafb;border-radius:8px;padding:4px 16px;">${trs}</table>`;
}

export interface LineItem {
  name: string;
  qty: number;
  unitPrice: number;
  currency: string;
}

/** Order/invoice line-items table with a totals row — used by commerce order emails. */
export function lineItemsTable(items: LineItem[], totals: { subtotal?: number; shipping?: number; total: number; currency: string }): string {
  const rows = items
    .map(
      (l) => `
      <tr>
        <td style="padding:8px 0;border-bottom:1px solid #e5e7eb;font-family:${FONT_STACK};font-size:13px;color:#111827;">${escapeHtml(l.name)}</td>
        <td style="padding:8px 0;border-bottom:1px solid #e5e7eb;font-family:${FONT_STACK};font-size:13px;color:#6b7280;text-align:center;">x${escapeHtml(l.qty)}</td>
        <td style="padding:8px 0;border-bottom:1px solid #e5e7eb;font-family:${FONT_STACK};font-size:13px;color:#111827;text-align:right;">${escapeHtml(l.currency)} ${escapeHtml(l.unitPrice.toFixed(2))}</td>
      </tr>`,
    )
    .join('');
  const totalRows: string[] = [];
  if (totals.subtotal !== undefined) {
    totalRows.push(`<tr><td colspan="2" style="padding:6px 0;font-family:${FONT_STACK};font-size:13px;color:#6b7280;text-align:right;">Subtotal</td><td style="padding:6px 0;font-family:${FONT_STACK};font-size:13px;color:#111827;text-align:right;">${escapeHtml(totals.currency)} ${escapeHtml(totals.subtotal.toFixed(2))}</td></tr>`);
  }
  if (totals.shipping !== undefined && totals.shipping > 0) {
    totalRows.push(`<tr><td colspan="2" style="padding:6px 0;font-family:${FONT_STACK};font-size:13px;color:#6b7280;text-align:right;">Shipping</td><td style="padding:6px 0;font-family:${FONT_STACK};font-size:13px;color:#111827;text-align:right;">${escapeHtml(totals.currency)} ${escapeHtml(totals.shipping.toFixed(2))}</td></tr>`);
  }
  totalRows.push(`<tr><td colspan="2" style="padding:8px 0 0;font-family:${FONT_STACK};font-size:14px;font-weight:700;color:#111827;text-align:right;">Total</td><td style="padding:8px 0 0;font-family:${FONT_STACK};font-size:14px;font-weight:700;color:#111827;text-align:right;">${escapeHtml(totals.currency)} ${escapeHtml(totals.total.toFixed(2))}</td></tr>`);

  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:4px 0 20px;">
    <thead>
      <tr>
        <th align="left" style="padding:0 0 8px;border-bottom:2px solid #111827;font-family:${FONT_STACK};font-size:11px;letter-spacing:.04em;text-transform:uppercase;color:#6b7280;font-weight:600;">Item</th>
        <th align="center" style="padding:0 0 8px;border-bottom:2px solid #111827;font-family:${FONT_STACK};font-size:11px;letter-spacing:.04em;text-transform:uppercase;color:#6b7280;font-weight:600;">Qty</th>
        <th align="right" style="padding:0 0 8px;border-bottom:2px solid #111827;font-family:${FONT_STACK};font-size:11px;letter-spacing:.04em;text-transform:uppercase;color:#6b7280;font-weight:600;">Price</th>
      </tr>
    </thead>
    <tbody>${rows}${totalRows.join('')}</tbody>
  </table>`;
}

/** A single body paragraph. */
export function paragraph(text: string): string {
  return `<p style="margin:0 0 16px;font-family:${FONT_STACK};font-size:15px;line-height:1.6;color:#374151;">${escapeHtml(text)}</p>`;
}

/** Paragraph that allows pre-escaped inline HTML (e.g. embedding a name in bold) — caller is responsible for escaping any dynamic parts before calling this. */
export function richParagraph(html: string): string {
  return `<p style="margin:0 0 16px;font-family:${FONT_STACK};font-size:15px;line-height:1.6;color:#374151;">${html}</p>`;
}

/**
 * A Bangla-copy paragraph inside an otherwise-English (or mixed) document —
 * marks `lang="bn"` on the element itself (not just the `<html>` tag), which
 * is the correct thing to do for genuinely mixed-language content and is what
 * screen readers/font-selection actually key off per element.
 */
export function bnParagraph(text: string): string {
  return `<p lang="bn" style="margin:0 0 16px;font-family:${FONT_STACK};font-size:15px;line-height:1.8;color:#374151;">${escapeHtml(text)}</p>`;
}

const LABEL_VALUE_LINE = /^\s{2,}(.{1,40}?)\s{2,}:\s+(.*)$/;

/**
 * Converts a plain-text template body (as produced by
 * notifications/templates.defaults.ts and interpolate()) into HTML.
 *
 * These bodies are tenant-editable freeform text, written with a consistent
 * convention: a block of `  Label   : value` lines (two-plus leading spaces,
 * two-plus spaces before the colon) that is meant to read as a small fact
 * sheet. Rather than forcing every notify() call site to pass structured vars
 * through to the email channel, this recognises that convention and renders
 * it as a proper two-column info table — every other line becomes a normal
 * paragraph. Blank lines separate paragraphs/tables.
 *
 * Every raw value is escaped — this text can contain student names, teacher
 * comments, and other untrusted content.
 */
export function renderPlainBodyToHtml(body: string): string {
  const blocks = body.split(/\n{2,}/);
  const html: string[] = [];

  for (const block of blocks) {
    const lines = block.split('\n').filter((l) => l.length > 0);
    if (lines.length === 0) continue;

    const parsed = lines.map((l) => l.match(LABEL_VALUE_LINE));
    if (parsed.every((m) => m !== null)) {
      html.push(
        infoTable(
          parsed.map((m) => ({ label: m![1].trim(), value: m![2].trim() })),
        ),
      );
      continue;
    }

    // Not a fact-sheet block — render as a paragraph, preserving line breaks.
    html.push(
      `<p style="margin:0 0 16px;font-family:${FONT_STACK};font-size:15px;line-height:1.6;color:#374151;">${lines
        .map((l) => escapeHtml(l))
        .join('<br/>')}</p>`,
    );
  }

  return html.join('');
}
