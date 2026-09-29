// =============================================================================
// Brand constants shared by every email template.
//
// Accent color is PeopleNIT orange, but it is NEVER used as a background for
// white text — #f57722 fails WCAG AA contrast with white. Buttons (and any
// other white-on-color surface) use the darker #c2550a instead, which passes
// AA for normal-size white text. Keep this rule in one place: every template
// must call button() from components.ts rather than hand-roll a CTA.
// =============================================================================

export const PLATFORM_BRAND = {
  name: 'PeopleNIT SMS',
  /** Decorative accent only (top bar, links, thin rules) — never a button background with white text. */
  accent: '#f57722',
  /** Button background — AA-contrast with white text. Always use this for CTAs, regardless of institution branding. */
  buttonBg: '#c2550a',
  buttonText: '#ffffff',
} as const;

/** Institution-level override, supplied by callers that send mail "on behalf of" a school. */
export interface InstitutionBranding {
  name: string;
  logoUrl?: string | null;
  /** Accent-only override (top bar) — CTA buttons always stay PLATFORM_BRAND.buttonBg for guaranteed contrast. */
  color?: string | null;
}

/** Font stack with Bangla coverage — every template must use this, not a Latin-only stack. */
export const FONT_STACK =
  "'Noto Sans Bengali','Hind Siliguri',-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

const HEX_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

/** Falls back to the platform accent for anything that isn't a plausible hex color — never trust free-text institution settings inside a `style` attribute. */
export function safeAccent(color: string | null | undefined): string {
  return color && HEX_RE.test(color.trim()) ? color.trim() : PLATFORM_BRAND.accent;
}
