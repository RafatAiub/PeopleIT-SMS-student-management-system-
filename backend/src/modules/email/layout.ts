import { FONT_STACK, InstitutionBranding, PLATFORM_BRAND, safeAccent } from './brand';
import { escapeHtml } from './escape';

export interface LayoutOptions {
  /** Shows in the inbox preview line, hidden in the body — first ~100 chars of context. */
  preheader: string;
  heading: string;
  /** Pre-built, already-escaped HTML for the message body (paragraphs, buttons, tables). */
  bodyHtml: string;
  /** When sending on behalf of a school; falls back to the platform brand. */
  institution?: InstitutionBranding | null;
  /** Extra footer line(s), e.g. "You're receiving this because…" or an unsubscribe link. */
  footerExtra?: string;
  /** Document-level language (owner decision: BN copy still gets lang="bn" on that specific block via components.bnParagraph — this is for templates that are BN end-to-end). Defaults to 'en'. */
  lang?: 'en' | 'bn';
}

const WRAPPER_BG = '#f4f5f7';
const CARD_BG = '#ffffff';

/**
 * The one shared HTML shell every email in the system renders through.
 * Table-based layout, inline CSS only (no <style> block dependencies),
 * 600px card, dark-mode-friendly meta hints, and a hidden preheader.
 */
export function buildEmailLayout(opts: LayoutOptions): string {
  const brandName = opts.institution?.name?.trim() || PLATFORM_BRAND.name;
  const accent = safeAccent(opts.institution?.color);
  const logoUrl = opts.institution?.logoUrl?.trim();
  const showPlatformSubline = Boolean(opts.institution && brandName !== PLATFORM_BRAND.name);

  return `<!doctype html>
<html lang="${opts.lang ?? 'en'}" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta http-equiv="X-UA-Compatible" content="IE=edge" />
<meta name="color-scheme" content="light dark" />
<meta name="supported-color-schemes" content="light dark" />
<title>${escapeHtml(brandName)}</title>
<!--[if mso]>
<style type="text/css">
  table, td { font-family: Arial, sans-serif; }
</style>
<![endif]-->
</head>
<body style="margin:0;padding:0;background-color:${WRAPPER_BG};">
  <!-- Preheader: shown in inbox preview, hidden in the body -->
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:${WRAPPER_BG};opacity:0;">
    ${escapeHtml(opts.preheader)}
  </div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${WRAPPER_BG};">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background-color:${CARD_BG};border-radius:12px;overflow:hidden;">
          <tr>
            <td style="background-color:${accent};height:5px;line-height:5px;font-size:0;">&nbsp;</td>
          </tr>
          <tr>
            <td style="padding:28px 32px 0;">
              <table role="presentation" cellpadding="0" cellspacing="0">
                <tr>
                  ${logoUrl ? `<td style="padding-right:10px;vertical-align:middle;"><img src="${escapeHtml(logoUrl)}" alt="${escapeHtml(brandName)}" height="32" style="display:block;height:32px;width:auto;border:0;" /></td>` : ''}
                  <td style="vertical-align:middle;">
                    <span style="font-family:${FONT_STACK};font-size:13px;font-weight:700;letter-spacing:.03em;color:#111827;">${escapeHtml(brandName)}</span>
                    ${showPlatformSubline ? `<br/><span style="font-family:${FONT_STACK};font-size:11px;color:#9ca3af;">via ${escapeHtml(PLATFORM_BRAND.name)}</span>` : ''}
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 32px 8px;">
              <h1 style="margin:0 0 18px;font-family:${FONT_STACK};font-size:21px;line-height:1.3;color:#111827;font-weight:700;">${escapeHtml(opts.heading)}</h1>
              ${opts.bodyHtml}
            </td>
          </tr>
          <tr>
            <td style="padding:8px 32px 28px;">
              <hr style="border:none;border-top:1px solid #e5e7eb;margin:8px 0 16px;" />
              <p style="margin:0 0 4px;font-family:${FONT_STACK};font-size:12px;line-height:1.6;color:#9ca3af;">
                This is an automated message from ${escapeHtml(brandName)}, sent via ${escapeHtml(PLATFORM_BRAND.name)}. Please do not reply directly to this email.
              </p>
              ${opts.footerExtra ? `<p style="margin:8px 0 0;font-family:${FONT_STACK};font-size:12px;line-height:1.6;color:#9ca3af;">${opts.footerExtra}</p>` : ''}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
