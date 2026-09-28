/**
 * Shared types for the public school website (Sites). Shapes follow the API
 * contract in docs/redesign/WEBSITE_BRIEF.md. Everything the backend returns
 * is normalised through `api.ts`, so blocks never see raw responses.
 */

export type SiteLang = 'en' | 'bn';

/** Font keys the theme editor offers. `system` is also forced by lite mode. */
export type SiteFontKey =
  | 'inter'
  | 'poppins'
  | 'nunito'
  | 'merriweather'
  | 'playfair'
  | 'lora'
  | 'noto-naskh'
  | 'system';

export type SiteRadius = 'none' | 'sm' | 'md' | 'lg' | 'xl';
export type SiteMode = 'light' | 'dark';

export interface SiteTheme {
  /** Hex colour, e.g. `#1d4ed8`. */
  primary: string;
  accent: string;
  font: SiteFontKey;
  /** Optional separate heading font; falls back to `font`. */
  headingFont?: SiteFontKey;
  radius: SiteRadius;
  mode: SiteMode;
}

export interface NavItem {
  label: string;
  labelBn?: string;
  href: string;
  children?: NavItem[];
}

export interface SiteNavigation {
  header: NavItem[];
  footer: NavItem[];
}

export interface SiteSocial {
  facebook?: string;
  youtube?: string;
  instagram?: string;
  x?: string;
  linkedin?: string;
  whatsapp?: string;
  [key: string]: string | undefined;
}

export interface SiteSettings {
  siteName: string;
  siteNameBn?: string;
  tagline?: string;
  taglineBn?: string;
  logoUrl?: string;
  faviconUrl?: string;
  social: SiteSocial;
  analyticsId?: string;
  defaultLanguage: SiteLang;
  languages: SiteLang[];
  liteMode: boolean;
  publicResults?: boolean;
  showToppers?: boolean;
  establishedYear?: number;
  /** SiteForm used by EnquiryForm blocks that don't name a form (needs backend support). */
  defaultEnquiryFormId?: string;
  footerText?: string;
  footerTextBn?: string;
}

export interface SiteSeo {
  title?: string;
  description?: string;
  ogImage?: string;
  noindex?: boolean;
}

/** A Puck page document. Kept structural so this file needs no Puck import. */
export interface SitePageData {
  root: { props?: Record<string, unknown>; [key: string]: unknown };
  content: SiteComponentData[];
  zones?: Record<string, SiteComponentData[]>;
}

export interface SiteComponentData {
  type: string;
  props: Record<string, unknown> & { id?: string };
}

export interface PublicInstitution {
  id?: string;
  name: string;
  nameBn?: string;
  slug?: string;
  logo?: string;
  establishedYear?: number | string;
  contact: {
    phone?: string;
    email?: string;
    address?: string;
    website?: string;
  };
}

export interface PublicSiteInfo {
  id: string;
  subdomain: string;
  templateKey?: string;
  theme: SiteTheme;
  navigation: SiteNavigation;
  settings: SiteSettings;
  status?: 'DRAFT' | 'PUBLISHED';
  /** Live base URL (primary domain or subdomain), for canonical/hreflang tags. */
  canonicalUrl?: string;
}

export interface PublicPageRef {
  slug: string;
  title: string;
  titleBn?: string;
  noindex?: boolean;
}

export interface ResolvedSite {
  site: PublicSiteInfo;
  institution: PublicInstitution;
  pages: PublicPageRef[];
}

export interface PublicPage {
  slug: string;
  title: string;
  titleBn?: string;
  data: SitePageData;
  seo: SiteSeo;
  publishedAt?: string;
  /** True when the backend served the draft through a preview token. */
  isPreview?: boolean;
}

export interface PublicPost {
  id: string;
  slug: string;
  title: string;
  excerpt?: string;
  coverUrl?: string;
  body?: unknown;
  publishedAt?: string;
  tags: string[];
}

export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

/* ── Live school data (public-safe fields only) ─────────────────────────── */

export interface PublicNotice {
  id: string;
  title: string;
  body?: string;
  date?: string;
  priority?: string;
  attachmentUrl?: string;
}

export interface PublicEvent {
  id: string;
  title: string;
  start: string;
  end?: string;
  kind: 'EVENT' | 'HOLIDAY';
  description?: string;
  location?: string;
}

export interface PublicTeacher {
  id: string;
  name: string;
  subject?: string;
  photo?: string;
  designation?: string;
}

export interface PublicTopper {
  name: string;
  className?: string;
  gpa?: number | string;
  examName?: string;
}

export interface PublicRoutineSlot {
  day: string;
  start?: string;
  end?: string;
  period?: string | number;
  subject: string;
  teacher?: string;
  room?: string;
}

export interface PublicStats {
  students?: number;
  teachers?: number;
  classes?: number;
  yearsEstablished?: number;
}

export interface PublicFeesLink {
  enabled: boolean;
  url?: string;
  /** Payment gateways are in sandbox/demo mode. */
  demo?: boolean;
}

export interface PublicFormField {
  key: string;
  label: string;
  labelBn?: string;
  type: 'text' | 'textarea' | 'email' | 'phone' | 'number' | 'date' | 'select' | 'radio' | 'checkbox';
  required?: boolean;
  options?: string[];
}

export interface PublicMarksheet {
  studentName?: string;
  className?: string;
  section?: string;
  roll?: string | number;
  examName?: string;
  gpa?: number | string;
  grade?: string;
  totalMarks?: number | string;
  subjects: Array<{ name: string; marks?: number | string; grade?: string; gradePoint?: number | string }>;
}
