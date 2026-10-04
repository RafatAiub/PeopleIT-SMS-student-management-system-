/**
 * Public Sites API client. Deliberately separate from `@/api/client`: the
 * public site is anonymous (no token, no branch header, no refresh loop, no
 * toasts) and may run on a school's own domain.
 *
 * `createSiteApi(previewToken)` binds a preview token (sent as the
 * `X-Site-Preview` header), which unpublished sites need for every public
 * endpoint. `siteApi` is the unbound (published-only) instance.
 *
 * Every response goes through a normaliser so blocks get stable shapes.
 * Shapes follow backend/src/modules/sites/sites.public.service.ts and
 * sites.data.service.ts.
 */
import axios, { AxiosError, type AxiosInstance } from 'axios';
import type {
  CheckoutOptions,
  CreateOrderInput,
  CreateOrderResult,
  DetailSeo,
  EnrolledCourse,
  LearnCourse,
  Paged,
  PublicAdmissionCircular,
  PublicAdmissionDetail,
  PublicAlbum,
  PublicAlbumDetail,
  PublicBranch,
  PublicClassStat,
  PublicCommitteeMember,
  PublicCourse,
  PublicCourseDetail,
  PublicDownload,
  PublicEvent,
  PublicExamRoutineExam,
  PublicExamRoutineSlot,
  PublicFeeChartItem,
  PublicFeesLink,
  PublicFormField,
  PublicHoliday,
  PublicInstitution,
  PublicLibraryBook,
  PublicMarksheet,
  PublicNotice,
  PublicNoticeDetail,
  PublicOrder,
  PublicOrderItem,
  PublicPage,
  PublicPost,
  PublicProduct,
  PublicProfile,
  PublicResultSummaryItem,
  PublicResultsArchiveItem,
  PublicRoutineSlot,
  PublicSiteInfo,
  PublicStaffMember,
  PublicStats,
  PublicSubjectOffering,
  PublicTeacher,
  PublicTopper,
  PublicTransportRoute,
  ResolvedSite,
  SiteCustomer,
  SiteLessonKind,
  SitePageData,
} from './types';
import { normaliseNavigation, normaliseSettings, normaliseTheme } from './theme';
import type { CollectionFieldMeta, CollectionItem, CollectionItemResult, CollectionMeta, CollectionPage, CollectionParams, CollectionRelationMeta, TemplateRoute } from './collections';
import { toModuleDef, type ModuleDef } from './modules/types';

const env = ((import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {}) as Record<string, string | undefined>;

export const API_ROOT = (env.VITE_API_URL || '/api/v1').replace(/\/$/, '');
export const SITE_API_BASE = `${API_ROOT}/public/sites`;

/** A failed public request. `status` 404 = not found / not published; 403 = feature off. */
export class SiteApiError extends Error {
  status: number;
  fieldErrors: Array<{ field: string; message: string }>;
  constructor(message: string, status: number, fieldErrors: Array<{ field: string; message: string }> = []) {
    super(message);
    this.status = status;
    this.fieldErrors = fieldErrors;
  }
}

function toError(e: unknown): SiteApiError {
  const ax = e as AxiosError<{ message?: string; errors?: Array<{ field?: string; message?: string }> }>;
  const status = ax?.response?.status ?? 0;
  const body = ax?.response?.data;
  const msg = body?.message || ax?.message || 'Request failed';
  const fieldErrors = Array.isArray(body?.errors) ? body!.errors.map((x) => ({ field: String(x.field ?? ''), message: String(x.message ?? '') })) : [];
  return new SiteApiError(msg, status, fieldErrors);
}

/**
 * Unwraps the `{ success, message, data }` envelope (or passes raw data through).
 * Paginated responses carry `meta` beside `data`; those become
 * `{ items, total, page, pageSize, … }` so the paged normalisers keep the totals.
 */
function unwrap<T = unknown>(body: unknown): T {
  if (body && typeof body === 'object' && 'data' in (body as Record<string, unknown>) && 'success' in (body as Record<string, unknown>)) {
    const { data, meta } = body as { data: unknown; meta?: unknown };
    if (Array.isArray(data) && meta && typeof meta === 'object') return { ...(meta as Record<string, unknown>), items: data } as T;
    return data as T;
  }
  return body as T;
}

/* ── Normalisers ────────────────────────────────────────────────────────── */

type Obj = Record<string, any>;
const str = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v : typeof v === 'number' ? String(v) : undefined);
const num = (v: unknown): number | undefined => {
  const n = typeof v === 'string' && v.trim() ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : undefined;
};
const arr = (v: unknown): Obj[] => {
  if (Array.isArray(v)) return v as Obj[];
  if (v && typeof v === 'object') {
    const o = v as Obj;
    for (const k of ['items', 'data', 'results', 'rows', 'list']) if (Array.isArray(o[k])) return o[k];
  }
  return [];
};
const obj = (v: unknown): Obj => (v && typeof v === 'object' ? (v as Obj) : {});

export function normalisePageData(v: unknown): SitePageData {
  const o = obj(v);
  return {
    root: o.root && typeof o.root === 'object' ? o.root : { props: {} },
    content: Array.isArray(o.content) ? o.content : [],
    zones: o.zones && typeof o.zones === 'object' ? o.zones : undefined,
  };
}

function normaliseInstitution(v: unknown, settings: Obj): PublicInstitution {
  const o = obj(v);
  const c = o.contact && typeof o.contact === 'object' ? (o.contact as Obj) : o;
  return {
    id: str(o.id),
    name: str(o.name) ?? '',
    nameBn: str(o.nameBn),
    slug: str(o.slug),
    logo: str(o.logoUrl) ?? str(o.logo),
    establishedYear: str(o.establishedYear) ?? str(settings.establishedYear),
    contact: { phone: str(c.phone), email: str(c.email), address: str(c.address), website: str(c.website) },
  };
}

function normaliseSite(v: unknown): PublicSiteInfo {
  const o = obj(v);
  return {
    id: String(o.id ?? ''),
    subdomain: String(o.subdomain ?? ''),
    templateKey: str(o.templateKey),
    theme: normaliseTheme(o.theme),
    navigation: normaliseNavigation(o.navigation),
    settings: normaliseSettings(o.settings),
    status: o.status === 'PUBLISHED' || o.status === 'DRAFT' ? o.status : undefined,
    canonicalUrl: str(o.canonicalUrl),
    // Never default this from `settings` client-side — the backend already enforces the
    // plan-feature gate (§7.6) and always sends the field; `undefined`/anything but
    // `false` reads as "show the credit", which is the safe default before the field exists.
    poweredBy: o.poweredBy !== false,
  };
}

/* ── Portal data normalisers (Track B §7.3) ─────────────────────────────── */

function normaliseOfficer(v: unknown): { name?: string; designation?: string; phone?: string; email?: string } | null {
  const o = obj(v);
  if (!o.name && !o.designation && !o.phone && !o.email) return null;
  return { name: str(o.name), designation: str(o.designation), phone: str(o.phone), email: str(o.email) };
}

function normaliseStaffMember(o: Obj): PublicStaffMember {
  return {
    name: String(o.name ?? ''),
    designation: str(o.designation),
    department: str(o.department),
    subject: str(o.subject),
    qualification: str(o.qualification),
    photoUrl: str(o.photoUrl) ?? str(o.photo),
    classTeacherOf: Array.isArray(o.classTeacherOf) ? o.classTeacherOf.map(String) : [],
  };
}

function normaliseProfile(o: Obj): PublicProfile {
  const c = obj(o.contact);
  const head = o.headOfInstitution;
  return {
    name: String(o.name ?? ''),
    nameBn: str(o.nameBn),
    slug: str(o.slug),
    eiin: str(o.eiin),
    establishedYear: o.establishedYear ?? undefined,
    mpoInfo: str(o.mpoInfo),
    recognitionInfo: str(o.recognitionInfo),
    aboutText: str(o.aboutText),
    logoUrl: str(o.logoUrl),
    contact: { address: str(c.address), phone: str(c.phone), email: str(c.email) },
    informationOfficer: normaliseOfficer(o.informationOfficer),
    complaintsOfficer: normaliseOfficer(o.complaintsOfficer),
    headOfInstitution: head && typeof head === 'object' && (obj(head).name || obj(head).userId) ? normaliseStaffMember(obj(head)) : null,
  };
}

function normaliseClassStat(o: Obj): PublicClassStat {
  const g = obj(o.genderCounts);
  return {
    className: String(o.className ?? ''),
    sections: Array.isArray(o.sections) ? o.sections.map(String) : [],
    genderCounts: { male: num(g.male) ?? 0, female: num(g.female) ?? 0, other: num(g.other) ?? 0, total: num(g.total) ?? 0 },
  };
}

function normaliseSubject(o: Obj): PublicSubjectOffering {
  return { className: String(o.className ?? ''), group: str(o.group), subject: String(o.subject ?? ''), paper: str(o.paper), isGraded: o.isGraded !== false };
}

function normaliseExamRoutineExam(o: Obj): PublicExamRoutineExam {
  return { id: String(o.id ?? ''), name: String(o.name ?? ''), startDate: str(o.startDate), endDate: str(o.endDate) };
}

function normaliseExamRoutineSlot(o: Obj): PublicExamRoutineSlot {
  return {
    className: String(o.className ?? ''),
    sectionName: str(o.sectionName),
    subjectName: String(o.subjectName ?? ''),
    date: str(o.date),
    startTime: str(o.startTime),
    endTime: str(o.endTime),
    room: str(o.room),
  };
}

function normaliseResultSummaryItem(o: Obj): PublicResultSummaryItem {
  return { className: String(o.className ?? ''), appeared: num(o.appeared) ?? 0, passed: num(o.passed) ?? 0, passRate: num(o.passRate) ?? 0, gpa5Count: num(o.gpa5Count) ?? 0 };
}

function normaliseResultsArchiveItem(o: Obj): PublicResultsArchiveItem {
  return { id: String(o.id ?? ''), name: String(o.name ?? ''), startDate: str(o.startDate), endDate: str(o.endDate) };
}

function normaliseFeeChartItem(o: Obj): PublicFeeChartItem {
  return {
    className: String(o.className ?? ''),
    items: arr(o.items).map((i) => ({ category: String(i.category ?? ''), amount: num(i.amount) ?? 0, frequency: str(i.frequency) })),
  };
}

function normaliseHoliday(o: Obj): PublicHoliday {
  return { date: String(o.date ?? ''), title: String(o.title ?? ''), type: str(o.type), isTentative: o.isTentative === true };
}

function normaliseLibraryBook(o: Obj): PublicLibraryBook {
  return {
    title: String(o.title ?? ''),
    author: str(o.author),
    category: str(o.category),
    publisher: str(o.publisher),
    availableCopies: num(o.availableCopies),
    available: o.available === true,
  };
}

function normaliseTransportRoute(o: Obj): PublicTransportRoute {
  return {
    id: String(o.id ?? ''),
    name: String(o.name ?? ''),
    fare: num(o.fare),
    stops: arr(o.stops).map((s) => ({ name: String(s.name ?? ''), sequence: num(s.sequence), pickupTime: str(s.pickupTime), dropTime: str(s.dropTime) })),
  };
}

function normaliseBranch(o: Obj): PublicBranch {
  return { id: String(o.id ?? ''), name: String(o.name ?? ''), address: str(o.address), phone: str(o.phone), email: str(o.email) };
}

/**
 * The backend's `PublicCommitteeMember` (`sites.portal.logic.ts`) deliberately
 * carries no `id` (committee rows have no public identifier); `i` (array
 * index) gives React a stable key. Falls back to the real `id` if a future
 * backend revision adds one.
 */
function normaliseCommitteeMember(o: Obj, i = 0): PublicCommitteeMember {
  return {
    id: str(o.id) ?? `committee-${i}`,
    name: String(o.name ?? ''),
    nameBn: str(o.nameBn),
    role: String(o.role ?? ''),
    roleBn: str(o.roleBn),
    photoUrl: str(o.photoUrl),
    phone: o.phone == null ? null : str(o.phone) ?? null,
  };
}

function normaliseAlbum(o: Obj): PublicAlbum {
  return { id: String(o.id ?? ''), title: String(o.title ?? ''), titleBn: str(o.titleBn), coverUrl: str(o.coverUrl), eventDate: str(o.eventDate), photoCount: num(o.photoCount) ?? 0 };
}

function normaliseAlbumDetail(o: Obj): PublicAlbumDetail {
  return {
    id: String(o.id ?? ''),
    title: String(o.title ?? ''),
    titleBn: str(o.titleBn),
    coverUrl: str(o.coverUrl),
    description: str(o.description),
    eventDate: str(o.eventDate),
    photos: arr(o.photos).map((p) => ({ url: String(p.url ?? ''), caption: str(p.caption) })),
  };
}

function normaliseDownload(o: Obj): PublicDownload {
  return { id: String(o.id ?? ''), title: String(o.title ?? ''), titleBn: str(o.titleBn), category: str(o.category), fileUrl: String(o.fileUrl ?? ''), publishedAt: str(o.publishedAt) };
}

function normaliseAdmission(o: Obj): PublicAdmissionCircular {
  return {
    id: String(o.id ?? ''),
    session: str(o.session),
    classNames: Array.isArray(o.classNames) ? o.classNames.map(String) : [],
    title: String(o.title ?? ''),
    titleBn: str(o.titleBn),
    startDate: str(o.startDate),
    endDate: str(o.endDate),
    fee: num(o.fee),
    pdfUrl: str(o.pdfUrl),
    applyUrl: str(o.applyUrl),
    formId: str(o.formId),
    closed: o.closed === true,
  };
}

function normaliseAdmissionDetail(o: Obj): PublicAdmissionDetail {
  return { ...normaliseAdmission(o), body: str(o.body) };
}

function normaliseNoticeDetail(o: Obj): PublicNoticeDetail {
  return { id: String(o.id ?? ''), title: String(o.title ?? ''), content: str(o.content), publishedAt: str(o.publishedAt) };
}

function normaliseSeo(o: Obj): DetailSeo {
  return { title: str(o.title), description: str(o.description), image: o.image === null ? null : str(o.image) };
}

function normalisePost(o: Obj): PublicPost {
  return {
    id: String(o.id ?? o.slug ?? ''),
    slug: String(o.slug ?? ''),
    title: String(o.title ?? ''),
    excerpt: str(o.excerpt),
    coverUrl: str(o.coverUrl),
    body: o.body,
    publishedAt: str(o.publishedAt) ?? str(o.createdAt),
    tags: Array.isArray(o.tags) ? o.tags.map(String) : [],
  };
}

function normaliseProduct(o: Obj): PublicProduct {
  return {
    id: String(o.id ?? o.slug ?? ''),
    slug: String(o.slug ?? ''),
    name: String(o.name ?? ''),
    nameBn: str(o.nameBn),
    description: str(o.description) ?? '',
    images: Array.isArray(o.images) ? o.images.filter((x: unknown) => typeof x === 'string') : [],
    price: num(o.price) ?? 0,
    compareAtPrice: num(o.compareAtPrice),
    currency: str(o.currency) ?? 'BDT',
    kind: o.kind === 'DIGITAL' ? 'DIGITAL' : 'PHYSICAL',
    inStock: o.inStock !== false && o.stock !== 0,
    stock: o.stock == null ? null : num(o.stock) ?? null,
    category: str(o.category),
  };
}

function normaliseCourse(o: Obj): PublicCourse {
  return {
    id: String(o.id ?? o.slug ?? ''),
    slug: String(o.slug ?? ''),
    title: String(o.title ?? ''),
    titleBn: str(o.titleBn),
    summary: str(o.summary),
    description: str(o.description) ?? '',
    coverUrl: str(o.coverUrl),
    price: num(o.price) ?? 0,
    compareAtPrice: num(o.compareAtPrice),
    currency: str(o.currency) ?? 'BDT',
    level: str(o.level),
    language: str(o.language),
    category: str(o.category),
    instructorName: str(o.instructorName),
    instructorBio: str(o.instructorBio),
    instructorPhoto: str(o.instructorPhoto),
    durationText: str(o.durationText),
    lessonCount: num(o.lessonCount) ?? 0,
    totalMinutes: num(o.totalMinutes) ?? 0,
  };
}

const LESSON_KINDS = ['VIDEO', 'TEXT', 'FILE', 'EMBED'] as const;
const lessonKind = (v: unknown): SiteLessonKind => ((LESSON_KINDS as readonly string[]).includes(v as string) ? (v as SiteLessonKind) : 'TEXT');

function normaliseCourseDetail(o: Obj): PublicCourseDetail {
  return {
    ...normaliseCourse(o),
    curriculum: arr(o.curriculum).map((l) => ({
      id: String(l.id ?? ''),
      module: str(l.module),
      title: String(l.title ?? ''),
      kind: lessonKind(l.kind),
      durationMin: num(l.durationMin),
      isFreePreview: l.isFreePreview === true,
      preview: l.preview && typeof l.preview === 'object' ? { videoUrl: str(obj(l.preview).videoUrl), body: str(obj(l.preview).body), fileUrl: str(obj(l.preview).fileUrl) } : undefined,
    })),
  };
}

function normaliseLearnCourse(o: Obj): LearnCourse {
  return {
    ...normaliseCourse(o),
    curriculum: arr(o.curriculum).map((l) => ({
      id: String(l.id ?? ''),
      module: str(l.module),
      title: String(l.title ?? ''),
      kind: lessonKind(l.kind),
      durationMin: num(l.durationMin),
      isFreePreview: l.isFreePreview === true,
      videoUrl: str(l.videoUrl),
      body: str(l.body),
      fileUrl: str(l.fileUrl),
    })),
    completedLessonIds: Array.isArray(o.completedLessonIds) ? o.completedLessonIds.map(String) : [],
    progress: num(o.progress) ?? 0,
  };
}

function normaliseOrderItem(o: Obj): PublicOrderItem {
  return {
    kind: o.kind === 'COURSE' ? 'COURSE' : 'PRODUCT',
    refId: String(o.refId ?? ''),
    name: String(o.name ?? ''),
    unitPrice: num(o.unitPrice) ?? 0,
    qty: num(o.qty) ?? 1,
    downloadUrl: str(o.downloadUrl),
    courseSlug: str(o.courseSlug),
  };
}

const ORDER_STATUSES = ['PENDING', 'PAID', 'FULFILLED', 'CANCELLED', 'REFUNDED'] as const;
const PAYMENT_METHODS = ['COD', 'BKASH', 'NAGAD', 'SSLCOMMERZ', 'FREE'] as const;

function normaliseOrder(o: Obj): PublicOrder {
  return {
    orderNo: String(o.orderNo ?? ''),
    status: (ORDER_STATUSES as readonly string[]).includes(o.status) ? o.status : 'PENDING',
    paymentMethod: (PAYMENT_METHODS as readonly string[]).includes(o.paymentMethod) ? o.paymentMethod : 'COD',
    isDemo: o.isDemo === true,
    currency: str(o.currency) ?? 'BDT',
    subtotal: num(o.subtotal) ?? 0,
    shipping: num(o.shipping) ?? 0,
    total: num(o.total) ?? 0,
    createdAt: str(o.createdAt) ?? '',
    paidAt: str(o.paidAt),
    customerName: str(o.customerName) ?? '',
    email: str(o.email) ?? '',
    items: arr(o.items).map(normaliseOrderItem),
  };
}

function normaliseCustomer(o: Obj): SiteCustomer {
  return { id: String(o.id ?? ''), name: String(o.name ?? ''), email: String(o.email ?? ''), phone: str(o.phone) };
}

function normaliseCheckoutOptions(o: Obj): CheckoutOptions {
  return {
    shopEnabled: o.shopEnabled === true,
    coursesEnabled: o.coursesEnabled === true,
    currency: str(o.currency) ?? 'BDT',
    shippingFee: num(o.shippingFee) ?? 0,
    freeShippingOver: o.freeShippingOver == null ? null : num(o.freeShippingOver) ?? null,
    codEnabled: o.codEnabled === true,
    gateways: arr(o.gateways).map((g) => ({ gateway: String(g.gateway ?? ''), label: String(g.label ?? g.gateway ?? ''), live: g.live === true, demo: g.demo === true })),
  };
}

function normaliseEnrolledCourse(o: Obj): EnrolledCourse {
  return {
    courseSlug: String(o.courseSlug ?? o.slug ?? ''),
    title: String(o.title ?? ''),
    titleBn: str(o.titleBn),
    coverUrl: str(o.coverUrl),
    progress: num(o.progress) ?? 0,
    nextLessonId: str(o.nextLessonId),
  };
}

const FIELD_TYPES = ['text', 'textarea', 'email', 'phone', 'number', 'date', 'select', 'radio', 'checkbox'] as const;

function normaliseField(f: Obj): PublicFormField {
  const t = f.type === 'tel' ? 'phone' : f.type;
  return {
    key: String(f.key ?? ''),
    label: String(f.label ?? f.key ?? ''),
    labelBn: str(f.labelBn),
    type: ((FIELD_TYPES as readonly string[]).includes(t) ? t : 'text') as PublicFormField['type'],
    required: Boolean(f.required),
    options: Array.isArray(f.options) ? f.options.map(String) : undefined,
  };
}

function normaliseCollectionMeta(c: Obj): CollectionMeta {
  const fields: CollectionFieldMeta[] = arr(c.fields).map((f) => ({
    key: String(f.key ?? ''),
    label: String(f.label ?? f.key ?? ''),
    type: (['text', 'rich', 'image', 'date', 'number', 'bool', 'url', 'list'] as const).includes(f.type) ? f.type : 'text',
    filter: Array.isArray(f.filter) ? f.filter.map(String) : [],
    sortable: f.sortable === true,
    searchable: f.searchable === true,
    detailOnly: f.detailOnly === true,
    options: Array.isArray(f.options) ? f.options.map(String) : null,
  })).filter((f) => f.key) as CollectionFieldMeta[];
  const relations: CollectionRelationMeta[] = arr(c.relations).map((r) => ({
    key: String(r.key ?? ''), label: String(r.label ?? r.key ?? ''), collection: str(r.collection) ?? null, many: r.many !== false,
  })).filter((r) => r.key);
  return {
    key: String(c.key ?? ''),
    label: String(c.label ?? c.key ?? ''),
    labelPlural: String(c.labelPlural ?? c.label ?? c.key ?? ''),
    available: c.available !== false,
    unavailableReason: str(c.unavailableReason) ?? null,
    slugSource: str(c.slugSource),
    titleField: String(c.titleField ?? 'title'),
    routeBase: str(c.routeBase) ?? null,
    defaultSort: String(c.defaultSort ?? ''),
    maxPageSize: num(c.maxPageSize) ?? 50,
    fields,
    relations,
  };
}

/* ── Customer-token storage (per site, tried/caught: private mode, storage full) ── */

export interface StoredSiteCustomer {
  token: string;
  customer: SiteCustomer;
}

const customerKey = (siteId: string) => `site-customer:${siteId}`;

export function loadSiteCustomer(siteId: string): StoredSiteCustomer | null {
  try {
    const raw = localStorage.getItem(customerKey(siteId));
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<StoredSiteCustomer>;
    return v && typeof v.token === 'string' && v.customer ? (v as StoredSiteCustomer) : null;
  } catch {
    return null;
  }
}

export function saveSiteCustomer(siteId: string, data: StoredSiteCustomer): void {
  try {
    localStorage.setItem(customerKey(siteId), JSON.stringify(data));
  } catch {
    /* private mode or storage full */
  }
}

export function clearSiteCustomer(siteId: string): void {
  try {
    localStorage.removeItem(customerKey(siteId));
  } catch {
    /* private mode */
  }
}

/* ── Client ─────────────────────────────────────────────────────────────── */

export function createSiteApi(previewToken?: string | null) {
  const http: AxiosInstance = axios.create({
    baseURL: SITE_API_BASE,
    timeout: 20000,
    headers: previewToken ? { 'X-Site-Preview': previewToken } : undefined,
  });

  async function get<T = unknown>(url: string, params?: Record<string, unknown>): Promise<T> {
    try {
      return unwrap<T>((await http.get(url, { params })).data);
    } catch (e) {
      throw toError(e);
    }
  }
  async function post<T = unknown>(url: string, body: unknown, opts: { token?: string | null } = {}): Promise<T> {
    try {
      const headers = opts.token ? { Authorization: `Bearer ${opts.token}` } : undefined;
      return unwrap<T>((await http.post(url, body, { headers })).data);
    } catch (e) {
      throw toError(e);
    }
  }
  async function getAuth<T = unknown>(url: string, token: string | null | undefined, params?: Record<string, unknown>): Promise<T> {
    try {
      const headers = token ? { Authorization: `Bearer ${token}` } : undefined;
      return unwrap<T>((await http.get(url, { params, headers })).data);
    } catch (e) {
      throw toError(e);
    }
  }
  async function delAuth<T = unknown>(url: string, token: string | null | undefined): Promise<T> {
    try {
      const headers = token ? { Authorization: `Bearer ${token}` } : undefined;
      return unwrap<T>((await http.delete(url, { headers })).data);
    } catch (e) {
      throw toError(e);
    }
  }
  const sid = (siteId: string) => `/${encodeURIComponent(siteId)}`;

  return {
    previewToken: previewToken ?? null,

    /** `GET /resolve?host=` or `?slug=`. 404 → SiteApiError(404). */
    async resolve(by: { host: string } | { slug: string }): Promise<ResolvedSite & { preview: boolean }> {
      const raw = await get<Obj>('/resolve', { ...by, ...(previewToken ? { preview: previewToken } : {}) });
      const site = normaliseSite(raw.site);
      return {
        preview: raw.preview === true,
        site,
        institution: normaliseInstitution(raw.institution, obj(obj(raw.site).settings)),
        pages: arr(raw.pages).map((p) => ({ slug: String(p.slug ?? ''), title: String(p.title ?? ''), titleBn: str(p.titleBn), noindex: p.noindex === true })),
        templateRoutes: arr(raw.templateRoutes)
          .map((r): TemplateRoute => ({ collection: String(r.collection ?? ''), base: String(r.base ?? ''), pageSlug: String(r.pageSlug ?? '') }))
          .filter((r) => r.collection && r.base && r.pageSlug),
      };
    },

    /** `GET /:siteId/collections` — the registry (fields, filter ops, relations, route bases). */
    async collections(siteId: string): Promise<CollectionMeta[]> {
      const raw = await get<Obj>(`${sid(siteId)}/collections`);
      return arr(raw.collections ?? raw).map(normaliseCollectionMeta).filter((c) => c.key);
    },

    /** `GET /:siteId/collections/:key` — filter / sort / search / paginate / include (see collections.ts `buildCollectionQuery`). */
    async collectionItems(siteId: string, key: string, params: CollectionParams = {}): Promise<CollectionPage> {
      const raw = await get<unknown>(`${sid(siteId)}/collections/${encodeURIComponent(key)}`, params);
      const o = obj(raw);
      const items = arr(raw).filter((i) => i && typeof i === 'object').map((i) => ({ ...i, slug: String(i.slug ?? '') })) as CollectionItem[];
      const pageSize = num(o.pageSize) ?? num(params.pageSize) ?? Math.max(items.length, 1);
      const total = num(o.total) ?? items.length;
      const page = num(o.page) ?? num(params.page) ?? 1;
      const totalPages = num(o.totalPages) ?? Math.max(1, Math.ceil(total / pageSize));
      return { items, total, page, pageSize, totalPages, hasNext: o.hasNext === true || page < totalPages, hasPrev: o.hasPrev === true || page > 1 };
    },

    /** `GET /:siteId/collections/:key/items/:slug` — one item with detail-only fields, requested relations and derived SEO. */
    async collectionItem(siteId: string, key: string, slug: string, opts: { include?: string[] } = {}): Promise<CollectionItemResult> {
      const raw = await get<Obj>(`${sid(siteId)}/collections/${encodeURIComponent(key)}/items/${encodeURIComponent(slug)}`, opts.include?.length ? { include: opts.include.join(',') } : undefined);
      const item = obj(raw.item);
      const seo = obj(raw.seo);
      return { item: { ...item, slug: String(item.slug ?? slug) }, seo: { title: str(seo.title) ?? null, description: str(seo.description) ?? null, image: str(seo.image) ?? null } };
    },

    /** `GET /:siteId/modules` — published custom-module definitions (drafts too with a preview token + `drafts`). */
    async modules(siteId: string, opts: { drafts?: boolean } = {}): Promise<ModuleDef[]> {
      const raw = await get<Obj>(`${sid(siteId)}/modules`, opts.drafts ? { drafts: '1' } : undefined);
      return arr(raw.modules ?? raw).map(toModuleDef).filter((m): m is ModuleDef => m !== null);
    },

    /** `GET /:siteId/modules/:key/versions/:version` — one pinned published version. */
    async moduleVersion(siteId: string, key: string, version: number): Promise<ModuleDef | null> {
      const raw = await get<Obj>(`${sid(siteId)}/modules/${encodeURIComponent(key)}/versions/${encodeURIComponent(String(version))}`);
      return toModuleDef(raw.module);
    },

    /** `GET /:siteId/pages/:slug` (home = `_home`). Draft when the preview token is valid. */
    async page(siteId: string, slug: string): Promise<PublicPage> {
      const raw = await get<Obj>(`${sid(siteId)}/pages/${encodeURIComponent(slug || '_home')}`);
      const p = obj(raw.page ?? raw);
      return {
        slug: String(p.slug ?? slug),
        title: String(p.title ?? ''),
        titleBn: str(p.titleBn),
        data: normalisePageData(p.data ?? p.published),
        seo: obj(p.seo),
        publishedAt: str(p.publishedAt),
        isPreview: raw.preview === true,
        kind: p.kind === 'TEMPLATE' ? 'TEMPLATE' : 'PAGE',
        collectionKey: str(p.collectionKey) ?? null,
      };
    },

    async posts(siteId: string, params: { page?: number; pageSize?: number; tag?: string } = {}): Promise<Paged<PublicPost>> {
      const raw = await get<unknown>(`${sid(siteId)}/posts`, params);
      const o = obj(raw);
      const items = arr(raw).map(normalisePost);
      return {
        items,
        total: num(o.total) ?? items.length,
        page: num(o.page) ?? params.page ?? 1,
        pageSize: num(o.pageSize) ?? params.pageSize ?? Math.max(items.length, 1),
      };
    },

    async post(siteId: string, slug: string): Promise<PublicPost> {
      const raw = await get<Obj>(`${sid(siteId)}/posts/${encodeURIComponent(slug)}`);
      return normalisePost(obj(raw.post ?? raw));
    },

    /** `GET /:siteId/forms/:formId` — public field definitions. */
    async form(siteId: string, formId: string): Promise<{ id: string; name?: string; honeypotField: string; fields: PublicFormField[] }> {
      const raw = await get<Obj>(`${sid(siteId)}/forms/${encodeURIComponent(formId)}`);
      return {
        id: String(raw.id ?? formId),
        name: str(raw.name),
        honeypotField: str(raw.honeypotField) ?? 'website',
        fields: arr(raw.fields).map(normaliseField).filter((f) => f.key),
      };
    },

    /** `POST /:siteId/forms/:formId/submit` — flat `{ key: value }` body plus the honeypot. */
    submitForm(siteId: string, formId: string, values: Record<string, string | boolean>, honeypot = '', honeypotField = 'website'): Promise<unknown> {
      return post(`${sid(siteId)}/forms/${encodeURIComponent(formId)}/submit`, { ...values, [honeypotField]: honeypot });
    },

    /* Live data */
    async notices(siteId: string, limit = 5): Promise<PublicNotice[]> {
      const raw = await get(`${sid(siteId)}/data/notices`, { limit });
      return arr(raw).map((n) => ({
        id: String(n.id ?? n.title),
        title: String(n.title ?? ''),
        body: str(n.content) ?? str(n.body),
        date: str(n.publishedAt) ?? str(n.date),
        priority: str(n.priority),
        attachmentUrl: str(n.attachmentUrl),
      }));
    },

    /** Events and holidays merged into one list. */
    async events(siteId: string, range: { from?: string; to?: string } = {}): Promise<PublicEvent[]> {
      const raw = obj(await get(`${sid(siteId)}/data/events`, range));
      const events = arr(raw.events).map((e) => ({
        id: `e-${e.id}`,
        title: String(e.title ?? ''),
        start: String(e.startDate ?? e.date ?? ''),
        end: str(e.endDate),
        kind: 'EVENT' as const,
        description: str(e.description),
        location: str(e.venue),
      }));
      const holidays = arr(raw.holidays).map((h) => ({
        id: `h-${h.id}`,
        title: `${String(h.title ?? '')}${h.isTentative ? ' (tentative)' : ''}`,
        start: String(h.date ?? ''),
        kind: 'HOLIDAY' as const,
      }));
      return [...events, ...holidays].filter((e) => e.start);
    },

    async teachers(siteId: string): Promise<PublicTeacher[]> {
      const raw = await get(`${sid(siteId)}/data/teachers`);
      return arr(raw).map((t, i) => ({
        id: String(t.id ?? `${t.name}-${i}`),
        name: String(t.name ?? ''),
        subject: str(t.subject),
        photo: str(t.photoUrl) ?? str(t.photo),
        designation: str(t.designation),
      }));
    },

    /** `GET /:siteId/data/exams` — finished exams (empty when results/toppers are off). */
    async exams(siteId: string): Promise<Array<{ id: string; name: string }>> {
      const raw = await get(`${sid(siteId)}/data/exams`);
      return arr(raw).map((x) => ({ id: String(x.id), name: String(x.name ?? x.id) }));
    },

    /** 403 when the school hasn't enabled toppers. */
    async toppers(siteId: string, params: { examId?: string; limit?: number }): Promise<PublicTopper[]> {
      const raw = obj(await get(`${sid(siteId)}/data/toppers`, params));
      const examName = str(obj(raw.exam).name);
      return arr(raw.items).map((t) => ({ name: String(t.name ?? ''), className: str(t.className), gpa: t.gpa ?? undefined, examName }));
    },

    /** 403 = public results off; 404 = no match; 400 = several matches (enter student ID). */
    async resultsLookup(siteId: string, body: { examId: string; roll?: string; studentId?: string; dob: string; website?: string }): Promise<PublicMarksheet> {
      const raw = await post<Obj>(`${sid(siteId)}/data/results-lookup`, body);
      const s = obj(raw.student);
      const sum = obj(raw.summary);
      return {
        studentName: str(s.name),
        className: str(s.className),
        section: str(s.sectionName),
        roll: s.rollNumber ?? undefined,
        examName: str(obj(raw.exam).name),
        gpa: sum.gpa ?? undefined,
        grade: str(sum.grade),
        totalMarks: sum.totalObtained != null && sum.totalMax != null ? `${sum.totalObtained} / ${sum.totalMax}` : sum.total ?? undefined,
        subjects: arr(raw.subjects).map((m) => ({
          name: String(m.subject ?? m.name ?? ''),
          marks: m.marksObtained != null ? (m.maxMarks != null ? `${m.marksObtained} / ${m.maxMarks}` : m.marksObtained) : undefined,
          grade: str(m.grade),
          gradePoint: m.gradePoint ?? undefined,
        })),
      };
    },

    /** Without `class`: the class/section choices. With it: that routine. */
    async routine(siteId: string, params: { class?: string; section?: string }): Promise<{ classes: Array<{ className: string; sections: string[] }>; slots: PublicRoutineSlot[] }> {
      const raw = obj(await get(`${sid(siteId)}/data/routine`, params));
      return {
        classes: arr(raw.classes).map((c) => ({ className: String(c.className ?? ''), sections: Array.isArray(c.sections) ? c.sections.map(String).filter(Boolean) : [] })).filter((c) => c.className),
        slots: arr(raw.slots).map((r) => ({
          day: String(r.dayOfWeek ?? r.day ?? ''),
          start: str(r.startTime),
          end: str(r.endTime),
          subject: String(r.subject ?? ''),
          teacher: str(r.teacherName),
          room: str(r.roomNumber),
        })),
      };
    },

    async stats(siteId: string): Promise<PublicStats> {
      const o = obj(await get(`${sid(siteId)}/data/stats`));
      return { students: num(o.students), teachers: num(o.teachers), classes: num(o.classes), yearsEstablished: num(o.yearsEstablished) };
    },

    async feesLink(siteId: string): Promise<PublicFeesLink> {
      const o = obj(await get(`${sid(siteId)}/data/fees-link`));
      return { enabled: Boolean(o.enabled), url: str(o.payUrl) ?? str(o.portalUrl), demo: o.demo === true };
    },

    /** `GET /data/courses?limit` — real published courses (was always `[]` before the LMS wave). */
    async courses(siteId: string, limit = 6): Promise<PublicCourse[]> {
      return arr(await get(`${sid(siteId)}/data/courses`, { limit })).map(normaliseCourse);
    },

    /* ── Portal data (Track B §7.3 — DSHE compliance) ────────────────────── */

    /** `GET /data/profile` — institution facts; `headOfInstitution` resolved server-side against the live `User` row. */
    async profile(siteId: string): Promise<PublicProfile> {
      return normaliseProfile(obj(await get(`${sid(siteId)}/data/profile`)));
    },

    /** `GET /data/staff?category=head|teachers|staff` (default `teachers`). `teachers`/`staff` require `showOnWebsite=true`. */
    async staff(siteId: string, params: { category?: 'head' | 'teachers' | 'staff' } = {}): Promise<PublicStaffMember[]> {
      return arr(await get(`${sid(siteId)}/data/staff`, params)).map(normaliseStaffMember);
    },

    /** `GET /data/class-stats` — DSHE items 3/4 (class & gender counts, sections). Counts only, no student names/ids. */
    async classStats(siteId: string): Promise<PublicClassStat[]> {
      return arr(await get(`${sid(siteId)}/data/class-stats`)).map(normaliseClassStat);
    },

    async subjects(siteId: string, params: { class?: string } = {}): Promise<PublicSubjectOffering[]> {
      return arr(await get(`${sid(siteId)}/data/subjects`, params)).map(normaliseSubject);
    },

    /** No `examId`: the exam picker. With it: that exam's routine slots. */
    async examRoutine(siteId: string, params: { examId?: string; class?: string } = {}): Promise<{ exams: PublicExamRoutineExam[]; slots: PublicExamRoutineSlot[] }> {
      const raw = obj(await get(`${sid(siteId)}/data/exam-routine`, params));
      return { exams: arr(raw.exams).map(normaliseExamRoutineExam), slots: arr(raw.slots).map(normaliseExamRoutineSlot) };
    },

    /** 403 unless `settings.publicResults || settings.publicResultSummary`. No student names/ids/marks — pass rate and GPA-5 count per class only. */
    async resultSummary(siteId: string, params: { examId?: string } = {}): Promise<{ exam: { id: string; name: string } | null; items: PublicResultSummaryItem[] }> {
      const raw = obj(await get(`${sid(siteId)}/data/result-summary`, params));
      const exam = obj(raw.exam);
      return { exam: exam.id ? { id: String(exam.id), name: String(exam.name ?? '') } : null, items: arr(raw.items).map(normaliseResultSummaryItem) };
    },

    /** 403 unless `settings.publicResults`. Published exams only. */
    async resultsArchive(siteId: string): Promise<PublicResultsArchiveItem[]> {
      return arr(await get(`${sid(siteId)}/data/results-archive`)).map(normaliseResultsArchiveItem);
    },

    /** 403 unless `settings.publicFeeChart`. */
    async feeChart(siteId: string): Promise<PublicFeeChartItem[]> {
      return arr(await get(`${sid(siteId)}/data/fee-chart`)).map(normaliseFeeChartItem);
    },

    async holidaysCalendar(siteId: string, params: { year?: number } = {}): Promise<{ year: number; items: PublicHoliday[] }> {
      const raw = obj(await get(`${sid(siteId)}/data/holidays`, params));
      return { year: num(raw.year) ?? new Date().getFullYear(), items: arr(raw.items).map(normaliseHoliday) };
    },

    /** 403 unless `settings.publicLibrary`. Paginated. */
    async library(siteId: string, params: { q?: string; page?: number; pageSize?: number } = {}): Promise<Paged<PublicLibraryBook>> {
      const raw = await get<unknown>(`${sid(siteId)}/data/library`, params);
      const o = obj(raw);
      const items = arr(raw).map(normaliseLibraryBook);
      return { items, total: num(o.total) ?? items.length, page: num(o.page) ?? params.page ?? 1, pageSize: num(o.pageSize) ?? params.pageSize ?? Math.max(items.length, 1) };
    },

    /** 403 unless `settings.publicTransport`. No vehicle or driver info at all. */
    async transport(siteId: string): Promise<PublicTransportRoute[]> {
      return arr(await get(`${sid(siteId)}/data/transport`)).map(normaliseTransportRoute);
    },

    async branches(siteId: string): Promise<PublicBranch[]> {
      return arr(await get(`${sid(siteId)}/data/branches`)).map(normaliseBranch);
    },

    /** `phone` is `null` unless the admin turned on "show phone" for that member. */
    async committee(siteId: string): Promise<PublicCommitteeMember[]> {
      return arr(await get(`${sid(siteId)}/data/committee`)).map((o, i) => normaliseCommitteeMember(o, i));
    },

    async albums(siteId: string, params: { page?: number; pageSize?: number } = {}): Promise<Paged<PublicAlbum>> {
      const raw = await get<unknown>(`${sid(siteId)}/data/albums`, params);
      const o = obj(raw);
      const items = arr(raw).map(normaliseAlbum);
      return { items, total: num(o.total) ?? items.length, page: num(o.page) ?? params.page ?? 1, pageSize: num(o.pageSize) ?? params.pageSize ?? Math.max(items.length, 1) };
    },

    /** Detail route: `/gallery/:id` (matches the sitemap — see routes.ts). */
    async album(siteId: string, id: string): Promise<{ album: PublicAlbumDetail; seo: DetailSeo }> {
      const raw = obj(await get(`${sid(siteId)}/data/albums/${encodeURIComponent(id)}`));
      return { album: normaliseAlbumDetail(obj(raw.album)), seo: normaliseSeo(obj(raw.seo)) };
    },

    async downloads(siteId: string, params: { category?: string } = {}): Promise<PublicDownload[]> {
      return arr(await get(`${sid(siteId)}/data/downloads`, params)).map(normaliseDownload);
    },

    async admissions(siteId: string, params: { page?: number; pageSize?: number } = {}): Promise<Paged<PublicAdmissionCircular>> {
      const raw = await get<unknown>(`${sid(siteId)}/data/admissions`, params);
      const o = obj(raw);
      const items = arr(raw).map(normaliseAdmission);
      return { items, total: num(o.total) ?? items.length, page: num(o.page) ?? params.page ?? 1, pageSize: num(o.pageSize) ?? params.pageSize ?? Math.max(items.length, 1) };
    },

    /** Detail route: `/admissions/:id` (matches the sitemap — see routes.ts). */
    async admission(siteId: string, id: string): Promise<{ admission: PublicAdmissionDetail; seo: DetailSeo }> {
      const raw = obj(await get(`${sid(siteId)}/data/admissions/${encodeURIComponent(id)}`));
      return { admission: normaliseAdmissionDetail(obj(raw.admission)), seo: normaliseSeo(obj(raw.seo)) };
    },

    /** Detail route: `/notices/:id` (matches the sitemap — see routes.ts). Same audience rule as the notices list. */
    async noticeDetail(siteId: string, id: string): Promise<{ notice: PublicNoticeDetail; seo: DetailSeo }> {
      const raw = obj(await get(`${sid(siteId)}/data/notices/${encodeURIComponent(id)}`));
      return { notice: normaliseNoticeDetail(obj(raw.notice)), seo: normaliseSeo(obj(raw.seo)) };
    },

    /* ── Customer account recovery ─────────────────────────────────────────── */

    async accountForgot(siteId: string, email: string): Promise<{ requested: true }> {
      await post(`${sid(siteId)}/account/forgot`, { email });
      return { requested: true };
    },

    async accountReset(siteId: string, token: string, password: string): Promise<{ reset: true }> {
      await post(`${sid(siteId)}/account/reset`, { token, password });
      return { reset: true };
    },

    /* ── Shop ─────────────────────────────────────────────────────────── */

    async products(siteId: string, params: { category?: string; q?: string; page?: number; pageSize?: number } = {}): Promise<Paged<PublicProduct>> {
      const raw = await get<unknown>(`${sid(siteId)}/products`, params);
      const o = obj(raw);
      const items = arr(raw).map(normaliseProduct);
      return { items, total: num(o.total) ?? items.length, page: num(o.page) ?? params.page ?? 1, pageSize: num(o.pageSize) ?? params.pageSize ?? Math.max(items.length, 1) };
    },

    async product(siteId: string, slug: string): Promise<PublicProduct> {
      const raw = await get<Obj>(`${sid(siteId)}/products/${encodeURIComponent(slug)}`);
      return normaliseProduct(obj(raw.product ?? raw));
    },

    /* ── Courses (catalogue) ─────────────────────────────────────────────── */

    async coursesCatalogue(siteId: string, params: { category?: string; q?: string; page?: number; pageSize?: number } = {}): Promise<Paged<PublicCourse>> {
      const raw = await get<unknown>(`${sid(siteId)}/courses`, params);
      const o = obj(raw);
      const items = arr(raw).map(normaliseCourse);
      return { items, total: num(o.total) ?? items.length, page: num(o.page) ?? params.page ?? 1, pageSize: num(o.pageSize) ?? params.pageSize ?? Math.max(items.length, 1) };
    },

    async courseDetail(siteId: string, slug: string): Promise<PublicCourseDetail> {
      const raw = await get<Obj>(`${sid(siteId)}/courses/${encodeURIComponent(slug)}`);
      return normaliseCourseDetail(obj(raw.course ?? raw));
    },

    async checkoutOptions(siteId: string): Promise<CheckoutOptions> {
      return normaliseCheckoutOptions(obj(await get(`${sid(siteId)}/checkout/options`)));
    },

    /* ── Customer account ─────────────────────────────────────────────────── */

    async accountRegister(siteId: string, body: { name: string; email: string; password: string; phone?: string }): Promise<StoredSiteCustomer> {
      const raw = obj(await post<Obj>(`${sid(siteId)}/account/register`, body));
      return { token: String(raw.token ?? ''), customer: normaliseCustomer(obj(raw.customer)) };
    },

    async accountLogin(siteId: string, body: { email: string; password: string }): Promise<StoredSiteCustomer> {
      const raw = obj(await post<Obj>(`${sid(siteId)}/account/login`, body));
      return { token: String(raw.token ?? ''), customer: normaliseCustomer(obj(raw.customer)) };
    },

    async accountMe(siteId: string, token: string): Promise<SiteCustomer> {
      return normaliseCustomer(obj(await getAuth(`${sid(siteId)}/account/me`, token)));
    },

    async accountOrders(siteId: string, token: string): Promise<PublicOrder[]> {
      return arr(await getAuth(`${sid(siteId)}/account/orders`, token)).map(normaliseOrder);
    },

    async accountCourses(siteId: string, token: string): Promise<EnrolledCourse[]> {
      return arr(await getAuth(`${sid(siteId)}/account/courses`, token)).map(normaliseEnrolledCourse);
    },

    /* ── Orders and payment ───────────────────────────────────────────────── */

    async createOrder(siteId: string, body: CreateOrderInput, token?: string | null): Promise<CreateOrderResult> {
      const raw = obj(await post<Obj>(`${sid(siteId)}/orders`, body, { token }));
      return { order: normaliseOrder(obj(raw.order)), paymentUrl: str(raw.paymentUrl), demo: raw.demo === true };
    },

    async getOrder(siteId: string, orderNo: string, params: { email?: string; token?: string | null } = {}): Promise<PublicOrder> {
      const { token, ...query } = params;
      const raw = await getAuth<Obj>(`${sid(siteId)}/orders/${encodeURIComponent(orderNo)}`, token, query);
      return normaliseOrder(obj(raw.order ?? raw));
    },

    async demoPay(siteId: string, orderNo: string, body: { email: string; outcome: 'success' | 'fail' }): Promise<PublicOrder> {
      const raw = obj(await post<Obj>(`${sid(siteId)}/orders/${encodeURIComponent(orderNo)}/demo-pay`, body));
      return normaliseOrder(obj(raw.order ?? raw));
    },

    /* ── Learning (Bearer required, enrolment ACTIVE) ───────────────────────── */

    async enrollFree(siteId: string, courseSlug: string, token: string): Promise<unknown> {
      return post(`${sid(siteId)}/courses/${encodeURIComponent(courseSlug)}/enroll`, {}, { token });
    },

    async learn(siteId: string, courseSlug: string, token: string): Promise<LearnCourse> {
      const raw = await getAuth<Obj>(`${sid(siteId)}/learn/${encodeURIComponent(courseSlug)}`, token);
      return normaliseLearnCourse(obj(raw.course ?? raw));
    },

    async completeLesson(siteId: string, courseSlug: string, lessonId: string, token: string): Promise<{ progress: number }> {
      const raw = obj(await post<Obj>(`${sid(siteId)}/learn/${encodeURIComponent(courseSlug)}/lessons/${encodeURIComponent(lessonId)}/complete`, {}, { token }));
      return { progress: num(raw.progress) ?? 0 };
    },

    async uncompleteLesson(siteId: string, courseSlug: string, lessonId: string, token: string): Promise<{ progress: number }> {
      const raw = obj(await delAuth<Obj>(`${sid(siteId)}/learn/${encodeURIComponent(courseSlug)}/lessons/${encodeURIComponent(lessonId)}/complete`, token));
      return { progress: num(raw.progress) ?? 0 };
    },

    /** Reuses the public admission assistant (`POST /ai/admission-assistant`, needs the institution slug). */
    async admissionAssistant(body: { slug: string; message: string; website?: string }): Promise<{ answer: string; demo: boolean }> {
      try {
        const res = await axios.post(`${API_ROOT}/ai/admission-assistant`, body, { timeout: 30000 });
        const o = obj(unwrap(res.data));
        return { answer: String(o.answer ?? ''), demo: Boolean(o.demo) };
      } catch (e) {
        throw toError(e);
      }
    },
  };
}

export type SiteApi = ReturnType<typeof createSiteApi>;

/** Published-only client (no preview token). */
export const siteApi: SiteApi = createSiteApi();
