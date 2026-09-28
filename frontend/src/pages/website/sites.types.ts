// =============================================================================
// Website builder (Sites) — admin-side types for /api/v1/sites.
// Shapes follow docs/redesign/WEBSITE_BRIEF.md ("Data model" + "API contract").
// Puck page data is kept loosely typed here (`PuckData`) so this file doesn't
// depend on the editor bundle; the editor casts to Puck's own `Data` type.
// =============================================================================

export type SiteStatus = 'DRAFT' | 'PUBLISHED';
export type ThemeMode = 'light' | 'dark' | 'auto';

export interface SiteTheme {
  primary: string;
  accent: string;
  font: string;
  radius: string | number;
  mode: ThemeMode | string;
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

export interface SiteSocialLinks {
  facebook?: string;
  youtube?: string;
  instagram?: string;
  linkedin?: string;
  x?: string;
  whatsapp?: string;
  [key: string]: string | undefined;
}

export interface SiteSettings {
  siteName: string;
  logoUrl?: string | null;
  faviconUrl?: string | null;
  social: SiteSocialLinks;
  analyticsId?: string | null;
  defaultLanguage: 'en' | 'bn' | string;
  languages: string[];
  liteMode: boolean;
  publicResults?: boolean;
  showToppers?: boolean;
  [key: string]: unknown;
}

export interface Site {
  id: string;
  institutionId: string;
  subdomain: string;
  templateKey: string | null;
  theme: Partial<SiteTheme> | null;
  navigation: Partial<SiteNavigation> | null;
  settings: Partial<SiteSettings> | null;
  status: SiteStatus;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Puck page data: `{ root: { props }, content: [{ type, props }], zones? }`. */
export interface PuckData {
  root: { props?: Record<string, unknown>; [key: string]: unknown };
  content: { type: string; props: Record<string, unknown> }[];
  zones?: Record<string, { type: string; props: Record<string, unknown> }[]>;
}

export interface PageSeo {
  title?: string;
  description?: string;
  ogImage?: string;
  noindex?: boolean;
}

export interface SitePageSummary {
  id: string;
  siteId: string;
  slug: string;
  title: string;
  titleBn?: string | null;
  seo?: PageSeo | null;
  sortOrder: number;
  isSystem: boolean;
  publishedAt: string | null;
  scheduledPublishAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SitePage extends SitePageSummary {
  draft: PuckData | null;
  published: PuckData | null;
}

export interface SitePageVersion {
  id: string;
  pageId: string;
  data?: PuckData;
  createdByUserId: string;
  createdByName?: string | null;
  note?: string | null;
  createdAt: string;
}

export type DomainStatus = 'PENDING_DNS' | 'VERIFYING' | 'ACTIVE' | 'FAILED';
export type DomainProvider = 'vercel' | 'cloudflare' | 'caddy' | 'manual';

export interface DnsRecord {
  type: string; // CNAME | TXT | A | AAAA
  name: string;
  value: string;
  ttl?: number | string;
  /** 'routing' | 'verification' | 'provider' */
  purpose?: string;
  note?: string;
  optional?: boolean;
}

export interface SiteDomain {
  id: string;
  siteId: string;
  hostname: string;
  isPrimary: boolean;
  status: DomainStatus;
  verificationToken: string;
  provider: DomainProvider | string;
  providerRef?: string | null;
  lastCheckedAt?: string | null;
  error?: string | null;
  isDemo: boolean;
  records?: DnsRecord[];
  sslNotice?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SiteMeResponse {
  site: Site;
  pages: SitePageSummary[];
  domains: SiteDomain[];
  platformDomain: string | null;
  previewUrl: string | null;
  previewToken?: string;
  previewTokenExpiresIn?: number;
  liveUrl: string | null;
  domainProvider?: { name: string; demo: boolean; fallbackReason?: string | null };
}

export type MediaKind = 'IMAGE' | 'VIDEO' | 'FILE';

export interface SiteMedia {
  id: string;
  url: string;
  kind: MediaKind;
  name: string;
  size?: number | null;
  width?: number | null;
  height?: number | null;
  alt?: string | null;
  createdByUserId: string;
  createdAt: string;
}

export type PostStatus = 'DRAFT' | 'PUBLISHED';

export interface SitePost {
  id: string;
  siteId: string;
  slug: string;
  title: string;
  excerpt?: string | null;
  coverUrl?: string | null;
  body: unknown;
  status: PostStatus;
  publishedAt?: string | null;
  authorUserId: string;
  authorName?: string | null;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export type FormFieldType = 'text' | 'textarea' | 'email' | 'phone' | 'number' | 'date' | 'select' | 'radio' | 'checkbox';

export interface SiteFormField {
  key: string;
  label: string;
  labelBn?: string;
  type: FormFieldType | string;
  required: boolean;
  options?: string[];
}

export type FormTarget = 'ENQUIRY' | 'INBOX';

export interface SiteForm {
  id: string;
  siteId: string;
  name: string;
  fields: SiteFormField[];
  target: FormTarget;
  notifyEmails: string[];
  submissionCount?: number;
  unreadCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface SiteFormSubmission {
  id: string;
  formId: string;
  data: Record<string, unknown>;
  ip?: string | null;
  userAgent?: string | null;
  createdAt: string;
  readAt?: string | null;
}

export interface GeneratedPage {
  slug: string;
  title: string;
  titleBn?: string;
  seo?: PageSeo;
  data: PuckData;
}

export interface GenerateSiteResponse {
  pages: GeneratedPage[];
  templateKey?: string;
  demo?: boolean;
  aiError?: string;
  model?: string | null;
  notice?: string;
  theme?: Partial<SiteTheme>;
  navigation?: Partial<SiteNavigation>;
}

export type ApplyMode = 'replace' | 'merge';
