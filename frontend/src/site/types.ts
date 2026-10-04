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

/** Header chrome variants rendered by `public/Chrome.tsx` (see WEBSITE_BRIEF templates addendum). */
export type SiteHeaderStyle = 'modern' | 'portal' | 'corporate' | 'banner' | 'centered' | 'minimal';
export type SiteFooterStyle = 'modern' | 'portal' | 'corporate' | 'columns' | 'minimal';
/** `full` = edge-to-edge page; `boxed` = a centred ~1000px column over a page background. */
export type SiteLayoutMode = 'full' | 'boxed';

export interface SiteTheme {
  /** Hex colour, e.g. `#1d4ed8`. */
  primary: string;
  accent: string;
  font: SiteFontKey;
  /** Optional separate heading font; falls back to `font`. */
  headingFont?: SiteFontKey;
  radius: SiteRadius;
  mode: SiteMode;
  /** Header/footer chrome variant; defaults to `modern` (the original single design). */
  headerStyle?: SiteHeaderStyle;
  footerStyle?: SiteFooterStyle;
  layout?: SiteLayoutMode;
  /** `'none'` (default), a built-in pattern key (`dots`/`grid`/`diagonal`/`waves`), or an `https://` image URL — shown behind a `boxed` layout. */
  pageBackground?: string;
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

export interface SiteShopSettings {
  enabled: boolean;
  currency: 'BDT';
  shippingFee: number;
  freeShippingOver?: number | null;
  codEnabled: boolean;
  notifyEmails: string[];
  termsUrl?: string;
}

export interface SiteCoursesSettings {
  enabled: boolean;
}

export interface SiteTopBarLink {
  label: string;
  labelBn?: string;
  href: string;
}

/** Options for the `portal` / `corporate` header top bar (see WEBSITE_BRIEF templates addendum). */
export interface SiteTopBarSettings {
  showDate?: boolean;
  showContact?: boolean;
  showSocial?: boolean;
  loginLinks?: SiteTopBarLink[];
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
  /** Site-wide custom CSS (max 100 KB); injected as a <style> tag, never executed as script. */
  customCss?: string;
  /** Tracking pixels / chat widgets; run only in host mode on a non-app host (§1). Max 50 KB. */
  headHtml?: string;
  bodyEndHtml?: string;
  shop?: SiteShopSettings;
  courses?: SiteCoursesSettings;
  topBar?: SiteTopBarSettings;
  /** School-wide emergency numbers (whitelisted setting — §7.6); shown by `HotlineList` on every page when set. */
  hotlines?: Array<{ number: string; label?: string; labelBn?: string }>;
  /** Shown by `ImportantLinks` when set. */
  importantLinks?: Array<{ label: string; labelBn?: string; href: string }>;
  /** Shown by `EServices` when set. */
  eServices?: Array<{ label: string; labelBn?: string; href: string; icon?: string }>;
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
  /**
   * Server-computed (`resolve` never trusts `settings.hidePoweredBy` alone —
   * see docs/redesign/WEBSITE_V3_PLAN.md §7.6). Defaults to `true` when the
   * field is missing (older/undecided backend responses).
   */
  poweredBy?: boolean;
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
  /** Published collection template pages (`/teachers/:slug` …); empty when the site has none. */
  templateRoutes: Array<{ collection: string; base: string; pageSlug: string }>;
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
  /** `TEMPLATE` pages render once per collection item (§8.8); everything else is a normal page. */
  kind?: 'PAGE' | 'TEMPLATE';
  collectionKey?: string | null;
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

/* ── Shop, courses (LMS), orders (Website Builder v2) ───────────────────── */

export type SiteProductKind = 'PHYSICAL' | 'DIGITAL';
export type SiteOrderStatus = 'PENDING' | 'PAID' | 'FULFILLED' | 'CANCELLED' | 'REFUNDED';
export type SitePaymentMethod = 'COD' | 'BKASH' | 'NAGAD' | 'SSLCOMMERZ' | 'FREE';

export interface PublicProduct {
  id: string;
  slug: string;
  name: string;
  nameBn?: string;
  /** Sanitised HTML; may be `''`. */
  description: string;
  images: string[];
  price: number;
  compareAtPrice?: number;
  currency: string;
  kind: SiteProductKind;
  inStock: boolean;
  stock?: number | null;
  category?: string;
}

export interface PublicCourse {
  id: string;
  slug: string;
  title: string;
  titleBn?: string;
  summary?: string;
  description: string;
  coverUrl?: string;
  price: number;
  compareAtPrice?: number;
  currency: string;
  level?: string;
  language?: string;
  category?: string;
  instructorName?: string;
  instructorBio?: string;
  instructorPhoto?: string;
  durationText?: string;
  lessonCount: number;
  totalMinutes: number;
}

export type SiteLessonKind = 'VIDEO' | 'TEXT' | 'FILE' | 'EMBED';

export interface PublicCurriculumLesson {
  id: string;
  module?: string;
  title: string;
  kind: SiteLessonKind;
  durationMin?: number;
  isFreePreview: boolean;
  /** Only present for free-preview lessons on the catalogue detail endpoint. */
  preview?: { videoUrl?: string; body?: string; fileUrl?: string };
}

export interface PublicCourseDetail extends PublicCourse {
  curriculum: PublicCurriculumLesson[];
}

/** A learner's curriculum item: full content, gated by enrollment (`GET /learn/:slug`). */
export interface LearnLesson {
  id: string;
  module?: string;
  title: string;
  kind: SiteLessonKind;
  durationMin?: number;
  isFreePreview: boolean;
  videoUrl?: string;
  body?: string;
  fileUrl?: string;
}

export interface LearnCourse extends PublicCourse {
  curriculum: LearnLesson[];
  completedLessonIds: string[];
  /** 0–100. */
  progress: number;
}

export interface EnrolledCourse {
  courseSlug: string;
  title: string;
  titleBn?: string;
  coverUrl?: string;
  progress: number;
  nextLessonId?: string;
}

export interface PublicOrderItem {
  kind: 'PRODUCT' | 'COURSE';
  refId: string;
  name: string;
  unitPrice: number;
  qty: number;
  /** Present only for PAID digital items belonging to the requesting customer/email. */
  downloadUrl?: string;
  courseSlug?: string;
}

export interface PublicOrderAddress {
  line1?: string;
  city?: string;
  area?: string;
  postcode?: string;
}

export interface PublicOrder {
  orderNo: string;
  status: SiteOrderStatus;
  paymentMethod: SitePaymentMethod;
  isDemo: boolean;
  currency: string;
  subtotal: number;
  shipping: number;
  total: number;
  createdAt: string;
  paidAt?: string;
  customerName: string;
  email: string;
  items: PublicOrderItem[];
}

export interface SiteCustomer {
  id: string;
  name: string;
  email: string;
  phone?: string;
}

export interface CheckoutGateway {
  gateway: string;
  label: string;
  live: boolean;
  demo: boolean;
}

export interface CheckoutOptions {
  shopEnabled: boolean;
  coursesEnabled: boolean;
  currency: string;
  shippingFee: number;
  freeShippingOver?: number | null;
  codEnabled: boolean;
  gateways: CheckoutGateway[];
}

export interface CreateOrderInput {
  items: Array<{ kind: 'PRODUCT' | 'COURSE'; refId: string; qty: number }>;
  customer: { name: string; email: string; phone: string; address?: PublicOrderAddress };
  paymentMethod: SitePaymentMethod;
  note?: string;
  returnUrl: string;
}

export interface CreateOrderResult {
  order: PublicOrder;
  paymentUrl?: string;
  demo?: boolean;
}

/* ── Portal data sources (Track B §7.3 — DSHE compliance, committee, albums,
   downloads, admissions, staff visibility, profile facts) ────────────────── */

export interface PublicOfficer {
  name?: string;
  designation?: string;
  phone?: string;
  email?: string;
}

/** `GET /data/staff?category=head|teachers|staff` and the `headOfInstitution` on `data/profile`. Never phone/email/DOB/salary/userId. */
export interface PublicStaffMember {
  name: string;
  designation?: string;
  department?: string;
  subject?: string;
  qualification?: string;
  photoUrl?: string;
  classTeacherOf: string[];
}

export interface PublicProfile {
  name: string;
  nameBn?: string;
  slug?: string;
  eiin?: string;
  establishedYear?: number | string;
  mpoInfo?: string;
  recognitionInfo?: string;
  aboutText?: string;
  logoUrl?: string;
  contact: { address?: string; phone?: string; email?: string };
  informationOfficer?: PublicOfficer | null;
  complaintsOfficer?: PublicOfficer | null;
  headOfInstitution?: PublicStaffMember | null;
}

export interface PublicClassStat {
  className: string;
  sections: string[];
  genderCounts: { male: number; female: number; other: number; total: number };
}

export interface PublicSubjectOffering {
  className: string;
  group?: string;
  subject: string;
  paper?: string;
  isGraded?: boolean;
}

export interface PublicExamRoutineExam { id: string; name: string; startDate?: string; endDate?: string }

export interface PublicExamRoutineSlot {
  className: string;
  sectionName?: string;
  subjectName: string;
  date?: string;
  startTime?: string;
  endTime?: string;
  room?: string;
}

export interface PublicResultSummaryItem { className: string; appeared: number; passed: number; passRate: number; gpa5Count: number }

export interface PublicResultsArchiveItem { id: string; name: string; startDate?: string; endDate?: string }

export interface PublicFeeChartItem { className: string; items: Array<{ category: string; amount: number; frequency?: string }> }

export interface PublicHoliday { date: string; title: string; type?: string; isTentative?: boolean }

export interface PublicLibraryBook { title: string; author?: string; category?: string; publisher?: string; availableCopies?: number; available?: boolean }

export interface PublicTransportStop { name: string; sequence?: number; pickupTime?: string; dropTime?: string }

/** No vehicle or driver info at all (owner decision — see §7.3). */
export interface PublicTransportRoute { id: string; name: string; fare?: number; stops: PublicTransportStop[] }

export interface PublicBranch { id: string; name: string; address?: string; phone?: string; email?: string }

/** `phone` is `null` unless the admin set `showPhone`. */
export interface PublicCommitteeMember { id: string; name: string; nameBn?: string; role: string; roleBn?: string; photoUrl?: string; phone?: string | null }

export interface PublicAlbum { id: string; title: string; titleBn?: string; coverUrl?: string; eventDate?: string; photoCount: number }

export interface PublicAlbumPhoto { url: string; caption?: string }

export interface PublicAlbumDetail { id: string; title: string; titleBn?: string; coverUrl?: string; description?: string; eventDate?: string; photos: PublicAlbumPhoto[] }

export interface PublicDownload { id: string; title: string; titleBn?: string; category?: string; fileUrl: string; publishedAt?: string }

export interface PublicAdmissionCircular {
  id: string;
  session?: string;
  classNames: string[];
  title: string;
  titleBn?: string;
  startDate?: string;
  endDate?: string;
  fee?: number;
  pdfUrl?: string;
  applyUrl?: string;
  formId?: string;
  closed?: boolean;
}

export interface PublicAdmissionDetail extends PublicAdmissionCircular { body?: string }

export interface PublicNoticeDetail { id: string; title: string; content?: string; publishedAt?: string }

/** Derived, not stored — `{ title: <record title>, description: plainTextExcerpt(...), image: <cover/pdf/null> }`. */
export interface DetailSeo { title?: string; description?: string; image?: string | null }
