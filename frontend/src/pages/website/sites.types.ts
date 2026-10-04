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

/** `Site.settings.shop` — WEBSITE_V2_BRIEF.md §2. */
export interface ShopSettings {
  enabled: boolean;
  currency: 'BDT';
  shippingFee: number;
  freeShippingOver?: number | null;
  codEnabled: boolean;
  notifyEmails: string[];
  termsUrl?: string | null;
}

/** `Site.settings.courses` — WEBSITE_V2_BRIEF.md §2. */
export interface CoursesSettings {
  enabled: boolean;
}

/** A top-bar login link (`settings.topBar.loginLinks`, ≤4) — matches `site/types.ts` `SiteTopBarLink`. */
export interface SiteTopBarLink {
  label: string;
  labelBn?: string;
  href: string;
}

/** `Site.settings.topBar` — portal/corporate header top bar. Matches `site/types.ts` `SiteTopBarSettings`. */
export interface SiteTopBarSettings {
  showDate?: boolean;
  showContact?: boolean;
  showSocial?: boolean;
  loginLinks?: SiteTopBarLink[];
}

/** `Site.settings.hotlines[]` — WEBSITE_V3_PLAN.md §7 owner decision list. */
export interface SiteHotline {
  label: string;
  labelBn?: string;
  phone: string;
}

/** A single important link or e-service link (`settings.importantLinks[]` / `settings.eServices[]`). */
export interface SiteLinkItem {
  label: string;
  labelBn?: string;
  url: string;
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
  /** Site-wide custom code (max sizes per brief: CSS 100 KB, HTML 50 KB each). Host-mode only for head/body. */
  customCss?: string;
  headHtml?: string;
  bodyEndHtml?: string;
  shop?: ShopSettings;
  courses?: CoursesSettings;
  /** Portal settings (WEBSITE_V3_PLAN.md §7.6 `PUBLIC_SETTING_KEYS`). */
  topBar?: SiteTopBarSettings;
  hotlines?: SiteHotline[];
  importantLinks?: SiteLinkItem[];
  eServices?: SiteLinkItem[];
  /** Public "results by class" summary block (distinct from the existing `publicResults` lookup toggle). */
  publicResultSummary?: boolean;
  publicFeeChart?: boolean;
  publicLibrary?: boolean;
  publicTransport?: boolean;
  /** Honoured server-side only when the plan has `website_remove_branding` — see `resolve().poweredBy`. */
  hidePoweredBy?: boolean;
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
  /** `TEMPLATE` pages are the profile-page design of one collection (`/teachers/:slug`); absent = `PAGE`. */
  kind?: 'PAGE' | 'TEMPLATE';
  collectionKey?: string | null;
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

// =============================================================================
// Shop, Courses (LMS) and orders — docs/redesign/WEBSITE_V2_BRIEF.md §2 & §3.
// Money fields are plain numbers (the API converts Decimal on the way out).
// =============================================================================

export type SiteProductKind = 'PHYSICAL' | 'DIGITAL';

export interface SiteProduct {
  id: string;
  siteId: string;
  slug: string;
  name: string;
  nameBn?: string | null;
  /** Sanitised HTML; may be `''`. */
  description: string;
  images: string[];
  price: number;
  compareAtPrice?: number | null;
  sku?: string | null;
  /** `null` = unlimited stock. */
  stock?: number | null;
  category?: string | null;
  kind: SiteProductKind;
  /** Never returned by the public API; only visible here (admin) and revealed to a buyer after PAID. */
  digitalUrl?: string | null;
  status: SiteStatus;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export type SiteLessonKind = 'VIDEO' | 'TEXT' | 'FILE' | 'EMBED';

export interface SiteCourseLesson {
  id: string;
  courseId: string;
  /** Module/section title; lessons sharing one are grouped in the curriculum. */
  module?: string | null;
  title: string;
  kind: SiteLessonKind;
  videoUrl?: string | null;
  body?: string | null;
  fileUrl?: string | null;
  durationMin?: number | null;
  isFreePreview: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface SiteCourse {
  id: string;
  siteId: string;
  slug: string;
  title: string;
  titleBn?: string | null;
  summary?: string | null;
  description: string;
  coverUrl?: string | null;
  /** 0 = free. */
  price: number;
  compareAtPrice?: number | null;
  level?: string | null;
  language?: string | null;
  category?: string | null;
  instructorName?: string | null;
  instructorBio?: string | null;
  instructorPhoto?: string | null;
  durationText?: string | null;
  status: SiteStatus;
  sortOrder: number;
  /** Present on `GET /courses/:id`; ordered. */
  lessons?: SiteCourseLesson[];
  enrollmentCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface SiteCustomer {
  id: string;
  email: string;
  name: string;
  phone?: string | null;
  lastLoginAt?: string | null;
  orderCount?: number;
  enrollmentCount?: number;
  createdAt: string;
}

export type SiteOrderStatus = 'PENDING' | 'PAID' | 'FULFILLED' | 'CANCELLED' | 'REFUNDED';
export type SiteOrderPaymentMethod = 'COD' | 'BKASH' | 'NAGAD' | 'SSLCOMMERZ' | 'FREE';

export interface SiteOrderItem {
  kind: 'PRODUCT' | 'COURSE';
  refId: string;
  name: string;
  unitPrice: number;
  qty: number;
}

export interface SiteOrderAddress {
  line1: string;
  city: string;
  area?: string;
  postcode?: string;
}

export interface SiteOrder {
  id: string;
  siteId: string;
  orderNo: string;
  customerId?: string | null;
  customerName: string;
  email: string;
  phone: string;
  address?: SiteOrderAddress | null;
  /** Snapshot at order time; priced by the server. */
  items: SiteOrderItem[];
  subtotal: number;
  shipping: number;
  total: number;
  currency: string;
  status: SiteOrderStatus;
  paymentMethod: SiteOrderPaymentMethod;
  gatewayTranId?: string | null;
  gatewayRef?: string | null;
  isDemo: boolean;
  returnUrl?: string | null;
  paidAt?: string | null;
  note?: string | null;
  adminNote?: string | null;
  createdAt: string;
  updatedAt: string;
}

export type SiteEnrollmentStatus = 'ACTIVE' | 'REVOKED';

export interface SiteEnrollmentCustomer {
  id: string;
  name: string;
  email: string;
}

export interface SiteEnrollment {
  id: string;
  status: SiteEnrollmentStatus;
  customer: SiteEnrollmentCustomer;
  /** 0–100, computed from lesson completions. Present on the list endpoint; omitted from grant/revoke responses. */
  progress?: number;
  createdAt?: string;
}

export interface CommerceGateway {
  gateway: string;
  label: string;
  live: boolean;
  demo: boolean;
  available: boolean;
}

export interface CommerceSummary {
  products: number;
  publishedProducts: number;
  courses: number;
  publishedCourses: number;
  ordersPending: number;
  ordersPaid30d: number;
  revenue30d: number;
  customers: number;
  enrollments: number;
  gateways: CommerceGateway[];
}

// =============================================================================
// Website v3 (Track B/C) — institution profile, staff visibility, committee,
// albums, downloads, admission circulars, DSHE compliance.
// See docs/redesign/WEBSITE_V3_PLAN.md §7 for the backend contract these mirror.
// =============================================================================

/** Either an existing staff `User` (`userId` set, name/photo kept in sync server-side) or a typed name. */
export interface HeadOfInstitution {
  userId: string | null;
  name: string | null;
  photoUrl: string | null;
  designation: string | null;
}

/** Information officer / complaints officer (DSHE items 8/9) — deliberately public once filled. */
export interface SiteOfficer {
  name: string | null;
  designation: string | null;
  phone: string | null;
  email: string | null;
}

export interface SiteProfile {
  name: string;
  nameBn: string | null;
  slug: string;
  eiin: string | null;
  establishedYear: number | null;
  mpoInfo: string | null;
  recognitionInfo: string | null;
  headOfInstitution: HeadOfInstitution | null;
  informationOfficer: SiteOfficer | null;
  complaintsOfficer: SiteOfficer | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  logoUrl: string | null;
  aboutText: string | null;
}

export interface HeadOfInstitutionInput {
  userId?: string;
  name?: string;
  photoUrl?: string;
  designation?: string;
}

export interface SiteOfficerInput {
  name?: string;
  designation?: string;
  phone?: string;
  email?: string;
}

export interface UpdateProfilePayload {
  nameBn?: string | null;
  eiin?: string | null;
  establishedYear?: number | null;
  mpoInfo?: string | null;
  recognitionInfo?: string | null;
  headOfInstitution?: HeadOfInstitutionInput | null;
  informationOfficer?: SiteOfficerInput | null;
  complaintsOfficer?: SiteOfficerInput | null;
}

export type ComplianceStatus = 'filled' | 'partial' | 'missing';

/** One DSHE 11-item checklist row — `sites.portal.logic.ts` `complianceChecklist()`. */
export interface ComplianceItem {
  key: string;
  label: string;
  labelBn: string;
  status: ComplianceStatus;
  /** Human description of which admin screen fixes this item (not a route). */
  fixAt: string;
}

export interface ComplianceResponse {
  items: ComplianceItem[];
  filled: number;
  total: number;
}

export type StaffVisibilityRole = 'TEACHER' | 'STAFF';

export interface StaffVisibilityMember {
  id: string;
  name: string;
  role: string;
  designation: string | null;
  department: string | null;
  photoUrl: string | null;
  showOnWebsite: boolean;
}

export interface SiteCommitteeMember {
  id: string;
  siteId: string;
  institutionId: string;
  name: string;
  nameBn: string | null;
  role: string;
  roleBn: string | null;
  photoUrl: string | null;
  phone: string | null;
  showPhone: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface CommitteeMemberPayload {
  name: string;
  nameBn?: string;
  role: string;
  roleBn?: string;
  photoUrl?: string;
  phone?: string;
  showPhone: boolean;
  sortOrder?: number;
}

export interface SiteAlbumPhoto {
  id: string;
  url: string;
  caption: string | null;
  sortOrder: number;
}

export interface SiteAlbum {
  id: string;
  siteId: string;
  institutionId: string;
  title: string;
  titleBn: string | null;
  coverUrl: string | null;
  description: string | null;
  eventDate: string | null;
  status: SiteStatus;
  sortOrder: number;
  /** Present on the list endpoint only. */
  photoCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface SiteAlbumDetail extends SiteAlbum {
  /** Present on the detail endpoint only (ordered). */
  photos: SiteAlbumPhoto[];
}

export interface AlbumPayload {
  title: string;
  titleBn?: string;
  coverUrl?: string;
  description?: string;
  eventDate?: string | null;
  status: SiteStatus;
  sortOrder?: number;
}

export interface SiteDownload {
  id: string;
  siteId: string;
  institutionId: string;
  title: string;
  titleBn: string | null;
  category: string;
  fileUrl: string;
  publishedAt: string | null;
  status: SiteStatus;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface DownloadPayload {
  title: string;
  titleBn?: string;
  category: string;
  fileUrl: string;
  publishedAt?: string | null;
  status: SiteStatus;
  sortOrder?: number;
}

export interface SiteAdmissionCircular {
  id: string;
  siteId: string;
  institutionId: string;
  session: string;
  classNames: string[];
  title: string;
  titleBn: string | null;
  body: string;
  startDate: string | null;
  endDate: string | null;
  fee: number | null;
  pdfUrl: string | null;
  applyUrl: string | null;
  formId: string | null;
  status: SiteStatus;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface AdmissionPayload {
  session: string;
  classNames: string[];
  title: string;
  titleBn?: string;
  body: string;
  startDate?: string | null;
  endDate?: string | null;
  fee?: number | null;
  pdfUrl?: string;
  applyUrl?: string;
  formId?: string;
  status: SiteStatus;
  sortOrder?: number;
}
