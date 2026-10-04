import { z } from 'zod';
import { httpUrl } from '../../utils/url';
import { FORM_FIELD_TYPES, PAGE_SLUG_PATTERN, SUBDOMAIN_PATTERN } from './sites.logic';

// =============================================================================
// Sites DTOs (zod). Page/post bodies are Puck JSON — validated for shape and
// sanitised in sites.logic.normalizePuckData, so here they are `unknown`.
// =============================================================================

// Exported so sites.commerce.dto.ts / sites.lms.dto.ts (Website Builder v2)
// reuse the exact same primitives instead of redefining them.
export const id = z.string().trim().min(1).max(64);
export const optionalText = (max: number) =>
  z.preprocess((v) => (v === '' ? null : v), z.string().trim().max(max).nullable().optional());
export const optionalUrl = z.preprocess((v) => (v === '' ? null : v), httpUrl().nullable().optional());
const hexColor = z.string().trim().regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/, 'Must be a hex colour');

export const pagination = {
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
};

export const IdParamDto = z.object({ id });
export const VersionParamDto = z.object({ id, versionId: id });
export const SubmissionParamDto = z.object({ id, submissionId: id });

// ── Site ────────────────────────────────────────────────────────────────────

export const ThemeDto = z
  .object({
    primary: hexColor,
    accent: hexColor,
    font: z.string().trim().min(1).max(80),
    radius: z.enum(['none', 'sm', 'md', 'lg', 'xl', 'full']).or(z.string().trim().max(20)),
    mode: z.enum(['light', 'dark', 'auto']),
  })
  .passthrough();

type NavItem = { label: string; labelBn?: string | null; href: string; children?: NavItem[] };
const navHref = z
  .string()
  .trim()
  .max(500)
  .refine((v) => v.startsWith('/') || v.startsWith('#') || /^https?:\/\//i.test(v) || /^(mailto|tel):/i.test(v), {
    message: 'Link must start with /, #, http(s)://, mailto: or tel:',
  });
const NavItemDto: z.ZodType<NavItem> = z.lazy(() =>
  z.object({
    label: z.string().trim().min(1).max(80),
    labelBn: optionalText(80),
    href: navHref,
    children: z.array(NavItemDto).max(20).optional(),
  }),
) as z.ZodType<NavItem>;

export const NavigationDto = z.object({
  header: z.array(NavItemDto).max(30).default([]),
  footer: z.array(NavItemDto).max(60).default([]),
});

// Website Builder v2 — site-wide custom code and the shop/courses toggles.
// customCss is injected as a <style> (can't execute); headHtml/bodyEndHtml
// run only in host mode on a non-app host (see WEBSITE_V2_BRIEF.md §1).
const KB = 1024;
const optionalCode = (maxBytes: number) =>
  z.preprocess(
    (v) => (v === '' ? null : v),
    z
      .string()
      .nullable()
      .optional()
      .refine((v) => !v || Buffer.byteLength(v, 'utf8') <= maxBytes, {
        message: `Must be at most ${Math.round(maxBytes / KB)} KB`,
      }),
  );

export const ShopSettingsDto = z.object({
  enabled: z.boolean().default(false),
  currency: z.literal('BDT').default('BDT'),
  shippingFee: z.coerce.number().nonnegative().max(1_000_000).default(0),
  freeShippingOver: z.preprocess((v) => (v === '' ? null : v), z.coerce.number().nonnegative().max(10_000_000).nullable().optional()),
  codEnabled: z.boolean().default(true),
  notifyEmails: z.array(z.string().trim().toLowerCase().email().max(200)).max(10).default([]),
  termsUrl: optionalUrl,
});

export const CoursesSettingsDto = z.object({
  enabled: z.boolean().default(false),
});

export const SettingsDto = z
  .object({
    siteName: z.string().trim().min(1).max(150),
    siteNameBn: optionalText(150),
    tagline: optionalText(200),
    taglineBn: optionalText(200),
    logoUrl: optionalUrl,
    faviconUrl: optionalUrl,
    social: z.record(z.string().max(40), z.preprocess((v) => (v === '' ? undefined : v), httpUrl().optional())).default({}),
    analyticsId: z.preprocess(
      (v) => (v === '' ? null : v),
      z.string().trim().regex(/^[A-Za-z0-9-]{3,40}$/, 'Invalid analytics ID').nullable().optional(),
    ),
    defaultLanguage: z.enum(['en', 'bn']).default('en'),
    languages: z.array(z.enum(['en', 'bn'])).min(1).max(2).default(['en', 'bn']),
    liteMode: z.boolean().default(false),
    publicResults: z.boolean().default(false),
    showToppers: z.boolean().default(false),
    establishedYear: z.coerce.number().int().min(1800).max(2100).nullable().optional(),
    footerText: optionalText(500),
    footerTextBn: optionalText(500),
    // Website Builder v2
    customCss: optionalCode(100 * KB),
    headHtml: optionalCode(50 * KB),
    bodyEndHtml: optionalCode(50 * KB),
    shop: ShopSettingsDto.optional(),
    courses: CoursesSettingsDto.optional(),
  })
  // Extra keys are kept (sanitised) for the builder UI; only whitelisted keys
  // are ever exposed publicly (sites.logic.publicSettings).
  .passthrough();

export const UpdateSiteDto = z
  .object({
    // theme and settings are merged over the stored values (send only what changed);
    // navigation replaces the stored menus.
    theme: ThemeDto.partial().optional(),
    navigation: NavigationDto.optional(),
    settings: SettingsDto.partial().optional(),
    templateKey: z.string().trim().max(60).nullable().optional(),
    subdomain: z
      .string()
      .trim()
      .toLowerCase()
      .regex(SUBDOMAIN_PATTERN, 'Use 1–63 lowercase letters, digits or hyphens')
      .optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'Nothing to update' });

const SeoDto = z
  .object({
    title: optionalText(120),
    description: optionalText(320),
    ogImage: optionalUrl,
    noindex: z.boolean().optional(),
  })
  .strip();

const pageSlug = z
  .string()
  .trim()
  .toLowerCase()
  .max(80)
  .refine((v) => v === '' || PAGE_SLUG_PATTERN.test(v), { message: 'Use lowercase letters, digits and hyphens (one segment)' });

export const TemplatePageDto = z.object({
  slug: pageSlug,
  title: z.string().trim().min(1).max(150),
  titleBn: optionalText(150),
  seo: SeoDto.optional(),
  data: z.unknown(),
});

export const ApplyTemplateDto = z.object({
  templateKey: z.string().trim().min(1).max(60),
  mode: z.enum(['replace', 'merge']),
  pages: z.array(TemplatePageDto).min(1).max(30),
  theme: ThemeDto.optional(),
  navigation: NavigationDto.optional(),
});

export const GenerateSiteDto = z.object({
  tone: z.enum(['formal', 'friendly', 'inspiring', 'modern']).optional(),
  languages: z.array(z.enum(['en', 'bn'])).min(1).max(2).optional(),
});

// ── Pages ───────────────────────────────────────────────────────────────────

export const PageQueryDto = z.object({ ...pagination, pageSize: z.coerce.number().int().positive().max(100).default(100) });

// Website collections (W5): a TEMPLATE page is the profile-page design for one
// collection. Membership of the key in the registry is checked in the service.
const collectionKeyDto = z.string().trim().toLowerCase().min(1).max(40).regex(/^[a-z][a-z0-9_]*$/, 'Invalid collection key');

export const CreatePageDto = z
  .object({
    kind: z.enum(['PAGE', 'TEMPLATE']).default('PAGE'),
    collectionKey: collectionKeyDto.nullable().optional(),
    // Required for PAGE; for TEMPLATE it defaults to template-<collectionKey>.
    slug: pageSlug.refine((v) => v !== '', { message: 'Slug is required (the home page already exists)' }).optional(),
    title: z.string().trim().min(1).max(150),
    titleBn: optionalText(150),
    seo: SeoDto.optional(),
    data: z.unknown().optional(),
  })
  .superRefine((v, ctx) => {
    if (v.kind === 'TEMPLATE') {
      if (!v.collectionKey) ctx.addIssue({ code: 'custom', path: ['collectionKey'], message: 'collectionKey is required for a template page' });
    } else {
      if (v.collectionKey) ctx.addIssue({ code: 'custom', path: ['collectionKey'], message: 'collectionKey is only for template pages' });
      if (!v.slug) ctx.addIssue({ code: 'custom', path: ['slug'], message: 'Slug is required (the home page already exists)' });
    }
  });

export const UpdatePageDto = z
  .object({
    slug: pageSlug.optional(),
    // Only meaningful on TEMPLATE pages; `kind` itself cannot change.
    collectionKey: collectionKeyDto.optional(),
    title: z.string().trim().min(1).max(150).optional(),
    titleBn: optionalText(150),
    seo: SeoDto.optional(),
    draft: z.unknown().optional(),
    scheduledPublishAt: z.preprocess((v) => (v === '' ? null : v), z.coerce.date().nullable().optional()),
    /** Also save a version checkpoint of the new draft. */
    createVersion: z.boolean().optional(),
    note: optionalText(200),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'Nothing to update' });

export const PageOrderDto = z.object({ ids: z.array(id).min(1).max(200) });
export const PublishPageDto = z.object({ note: optionalText(200) }).default({});
export const VersionQueryDto = z.object(pagination);

// ── Media ───────────────────────────────────────────────────────────────────

export const MediaQueryDto = z.object({
  ...pagination,
  pageSize: z.coerce.number().int().positive().max(100).default(40),
  kind: z.enum(['IMAGE', 'VIDEO', 'FILE']).optional(),
  search: z.string().trim().max(100).optional(),
});

export const CreateMediaDto = z
  .object({
    url: httpUrl(),
    kind: z.enum(['IMAGE', 'VIDEO', 'FILE']).default('IMAGE'),
    name: z.string().trim().min(1).max(255),
    size: z.coerce.number().int().nonnegative().max(2_000_000_000).nullable().optional(),
    width: z.coerce.number().int().positive().max(50_000).nullable().optional(),
    height: z.coerce.number().int().positive().max(50_000).nullable().optional(),
    alt: optionalText(300),
  })
  .refine((v) => v.kind !== 'IMAGE' || (v.alt && v.alt.length > 0), {
    message: 'Images need alt text (describe the image for screen readers)',
    path: ['alt'],
  });

// ── Posts ───────────────────────────────────────────────────────────────────

export const PostQueryDto = z.object({
  ...pagination,
  status: z.enum(['DRAFT', 'PUBLISHED']).optional(),
  tag: z.string().trim().max(40).optional(),
  search: z.string().trim().max(100).optional(),
});

const tags = z.array(z.string().trim().min(1).max(40)).max(20);

export const CreatePostDto = z.object({
  slug: z.string().trim().toLowerCase().max(100).regex(PAGE_SLUG_PATTERN).optional(),
  title: z.string().trim().min(1).max(200),
  excerpt: optionalText(500),
  coverUrl: optionalUrl,
  body: z.unknown().optional(),
  status: z.enum(['DRAFT', 'PUBLISHED']).default('DRAFT'),
  publishedAt: z.preprocess((v) => (v === '' ? null : v), z.coerce.date().nullable().optional()),
  tags: tags.default([]),
});

export const UpdatePostDto = z
  .object({
    slug: z.string().trim().toLowerCase().max(100).regex(PAGE_SLUG_PATTERN).optional(),
    title: z.string().trim().min(1).max(200).optional(),
    excerpt: optionalText(500),
    coverUrl: optionalUrl,
    body: z.unknown().optional(),
    status: z.enum(['DRAFT', 'PUBLISHED']).optional(),
    publishedAt: z.preprocess((v) => (v === '' ? null : v), z.coerce.date().nullable().optional()),
    tags: tags.optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'Nothing to update' });

// ── Forms ───────────────────────────────────────────────────────────────────

export const FormFieldDto = z.object({
  key: z
    .string()
    .trim()
    .regex(/^[A-Za-z][A-Za-z0-9_]{0,39}$/, 'Field key: letters, digits and _ (start with a letter)'),
  label: z.string().trim().min(1).max(150),
  labelBn: optionalText(150),
  type: z.enum(FORM_FIELD_TYPES),
  required: z.boolean().default(false),
  options: z.array(z.string().trim().min(1).max(200)).max(50).optional(),
  placeholder: optionalText(150),
});

export const CreateFormDto = z.object({
  name: z.string().trim().min(1).max(150),
  fields: z.array(FormFieldDto).min(1).max(40),
  target: z.enum(['ENQUIRY', 'INBOX']).default('INBOX'),
  notifyEmails: z.array(z.string().trim().toLowerCase().email().max(200)).max(10).default([]),
});

export const UpdateFormDto = z
  .object({
    name: z.string().trim().min(1).max(150).optional(),
    fields: z.array(FormFieldDto).min(1).max(40).optional(),
    target: z.enum(['ENQUIRY', 'INBOX']).optional(),
    notifyEmails: z.array(z.string().trim().toLowerCase().email().max(200)).max(10).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'Nothing to update' });

export const FormQueryDto = z.object(pagination);
export const SubmissionQueryDto = z.object({ ...pagination, unread: z.enum(['true', 'false']).optional() });

// ── Domains ─────────────────────────────────────────────────────────────────

export const CreateDomainDto = z.object({ hostname: z.string().trim().min(1).max(260) });
export const DomainQueryDto = z.object(pagination);

// ── Public ──────────────────────────────────────────────────────────────────

export const ResolveQueryDto = z
  .object({
    host: z.string().trim().max(260).optional(),
    slug: z.string().trim().toLowerCase().max(63).optional(),
    preview: z.string().max(2000).optional(),
  })
  .refine((v) => Boolean(v.host || v.slug), { message: 'Pass host or slug' });

export const PublicSiteParamDto = z.object({ siteId: id });
export const PublicPageParamDto = z.object({ siteId: id, slug: z.string().trim().max(80) });
export const PublicPostParamDto = z.object({ siteId: id, slug: z.string().trim().max(100) });
export const PublicFormParamDto = z.object({ siteId: id, formId: id });
export const PublicPreviewQueryDto = z.object({ preview: z.string().max(2000).optional() });
export const PublicCollectionParamDto = z.object({ siteId: id, key: z.string().trim().toLowerCase().max(40) });
export const PublicCollectionItemParamDto = z.object({ siteId: id, key: z.string().trim().toLowerCase().max(40), slug: z.string().trim().min(1).max(160) });

export const PublicPostQueryDto = z.object({
  page: z.coerce.number().int().positive().max(1000).default(1),
  pageSize: z.coerce.number().int().positive().max(50).default(10),
  tag: z.string().trim().max(40).optional(),
});

export const CaddyAskQueryDto = z.object({ domain: z.string().trim().min(1).max(260) });

export const SubmitFormDto = z.record(z.string().max(60), z.unknown()).refine((v) => Object.keys(v).length <= 60, {
  message: 'Too many fields',
});

// ── Live data ───────────────────────────────────────────────────────────────

export const DataNoticesQueryDto = z.object({
  limit: z.coerce.number().int().positive().max(50).default(10),
  preview: z.string().max(2000).optional(),
});

export const DataCoursesQueryDto = z.object({
  limit: z.coerce.number().int().positive().max(50).default(12),
  preview: z.string().max(2000).optional(),
});

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');
export const DataEventsQueryDto = z.object({
  from: isoDate.optional(),
  to: isoDate.optional(),
  preview: z.string().max(2000).optional(),
});

export const DataToppersQueryDto = z.object({
  examId: id.optional(),
  limit: z.coerce.number().int().positive().max(50).default(10),
  preview: z.string().max(2000).optional(),
});

export const DataRoutineQueryDto = z.object({
  class: z.string().trim().max(60).optional(),
  section: z.string().trim().max(30).optional(),
  preview: z.string().max(2000).optional(),
});

export const DataPreviewOnlyQueryDto = z.object({ preview: z.string().max(2000).optional() });

export const ResultsLookupDto = z
  .object({
    examId: id,
    roll: z.string().trim().max(30).optional(),
    studentId: z.string().trim().max(60).optional(),
    classId: id.optional(),
    dob: isoDate,
    /** Honeypot. */
    website: z.string().optional(),
  })
  .refine((v) => Boolean(v.roll || v.studentId), { message: 'Enter the roll number or student ID' });

export type UpdateSiteDtoType = z.infer<typeof UpdateSiteDto>;
export type ApplyTemplateDtoType = z.infer<typeof ApplyTemplateDto>;
export type GenerateSiteDtoType = z.infer<typeof GenerateSiteDto>;
export type CreatePageDtoType = z.infer<typeof CreatePageDto>;
export type UpdatePageDtoType = z.infer<typeof UpdatePageDto>;
export type CreateMediaDtoType = z.infer<typeof CreateMediaDto>;
export type MediaQueryDtoType = z.infer<typeof MediaQueryDto>;
export type PostQueryDtoType = z.infer<typeof PostQueryDto>;
export type CreatePostDtoType = z.infer<typeof CreatePostDto>;
export type UpdatePostDtoType = z.infer<typeof UpdatePostDto>;
export type CreateFormDtoType = z.infer<typeof CreateFormDto>;
export type UpdateFormDtoType = z.infer<typeof UpdateFormDto>;
export type SubmissionQueryDtoType = z.infer<typeof SubmissionQueryDto>;
export type ResultsLookupDtoType = z.infer<typeof ResultsLookupDto>;
export type PaginationDtoType = { page: number; pageSize: number };
