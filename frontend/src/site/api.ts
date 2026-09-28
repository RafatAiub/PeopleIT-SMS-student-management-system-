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
  EnrolledCourse,
  LearnCourse,
  Paged,
  PublicCourse,
  PublicCourseDetail,
  PublicEvent,
  PublicFeesLink,
  PublicFormField,
  PublicInstitution,
  PublicMarksheet,
  PublicNotice,
  PublicOrder,
  PublicOrderItem,
  PublicPage,
  PublicPost,
  PublicProduct,
  PublicRoutineSlot,
  PublicSiteInfo,
  PublicStats,
  PublicTeacher,
  PublicTopper,
  ResolvedSite,
  SiteCustomer,
  SiteLessonKind,
  SitePageData,
} from './types';
import { normaliseNavigation, normaliseSettings, normaliseTheme } from './theme';

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
  };
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
      };
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
