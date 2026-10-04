// =============================================================================
// Sites — public (unauthenticated) service. Returns PUBLISHED data only,
// except when a valid preview token is presented. Never exposes internal
// user ids, submission data or anything about individual people.
// =============================================================================

import { EmailPriority, Prisma, Site } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { NotFoundError, ValidationError } from '../../utils/AppError';
import { logger } from '../../utils/logger';
import { sendDirectMail } from '../../utils/mailer';
import { sendEmail } from '../email/sender';
import { formSubmittedAckEmail } from '../email/templates/site-form.templates';
import { findInstitutionBranding } from '../notifications/notifications.repository';
import * as enquiriesService from '../enquiries/enquiries.service';
import { CreateEnquiryDto } from '../enquiries/enquiries.dto';
import {
  FormField,
  HONEYPOT_FIELD,
  buildRobots,
  buildSitemap,
  mapEnquiryValues,
  publicSettings,
  slugFromParam,
  validateSubmission,
} from './sites.logic';
import { resolvePoweredBy } from './sites.portal.logic';
import { liveBaseUrl, platformSiteDomain } from './sites.config';
import { verifyPreviewToken } from './sites.preview';
import { normalizeHostname, wwwAlternate } from './domains/hostname';
import { primaryActiveHost } from './sites.repository';
import { isFeatureEnabled } from '../saas/entitlements.service';
import { templateRoutes, templateSitemapPaths } from './sites.collections.templates';

const NOT_FOUND = 'Site not found';

async function siteWithInstitution(where: Prisma.SiteWhereUniqueInput) {
  const site = await prisma.site.findUnique({ where, include: { institution: { select: { isActive: true } } } });
  if (!site || !site.institution.isActive) return null;
  return site;
}

/** A site visitors may see: published, or any site when the preview token is valid. */
export async function visibleSite(siteId: string, previewToken?: string | null): Promise<{ site: Site; preview: boolean }> {
  const site = await siteWithInstitution({ id: siteId });
  if (!site) throw new NotFoundError(NOT_FOUND);
  const preview = verifyPreviewToken(previewToken, site.id);
  if (!preview && site.status !== 'PUBLISHED') throw new NotFoundError(NOT_FOUND);
  return { site, preview };
}

async function findByHost(rawHost: string) {
  const host = normalizeHostname(rawHost);
  if (!host) return null;
  const root = platformSiteDomain();
  if (root && host.endsWith(`.${root}`)) {
    const sub = host.slice(0, -(root.length + 1));
    if (sub && !sub.includes('.')) return siteWithInstitution({ subdomain: sub });
  }
  const domains = await prisma.siteDomain.findMany({
    where: { hostname: { in: [host, wwwAlternate(host)] }, status: 'ACTIVE' },
    select: { siteId: true, hostname: true },
  });
  const match = domains.find((d) => d.hostname === host) ?? domains[0];
  return match ? siteWithInstitution({ id: match.siteId }) : null;
}

export async function resolveSite(q: { host?: string; slug?: string; preview?: string }) {
  const site = q.slug ? await siteWithInstitution({ subdomain: q.slug }) : await findByHost(q.host ?? '');
  if (!site) throw new NotFoundError(NOT_FOUND);
  const preview = verifyPreviewToken(q.preview, site.id);
  if (!preview && site.status !== 'PUBLISHED') throw new NotFoundError(NOT_FOUND);

  const [institution, pages, primaryHost, brandingFeature, templates] = await Promise.all([
    prisma.institution.findUniqueOrThrow({
      where: { id: site.institutionId },
      select: { name: true, slug: true, logoUrl: true, address: true, contactEmail: true, contactPhone: true, email: true, phone: true },
    }),
    prisma.sitePage.findMany({
      // TEMPLATE pages are collection profile designs, not navigable pages: see templateRoutes.
      where: { siteId: site.id, kind: 'PAGE', ...(preview ? {} : { published: { not: Prisma.DbNull } }) },
      select: { slug: true, title: true, titleBn: true, seo: true },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    }),
    primaryActiveHost(site.id),
    // Owner decision 4: hidePoweredBy only takes effect on a plan that
    // carries this feature — resolved server-side so a crafted request
    // can never remove the credit on its own.
    isFeatureEnabled(site.institutionId, 'website_remove_branding'),
    templateRoutes(site, preview),
  ]);
  const rawSettings = (site.settings && typeof site.settings === 'object' ? (site.settings as Record<string, unknown>) : {}) as Record<string, unknown>;

  return {
    preview,
    site: {
      id: site.id,
      status: site.status,
      subdomain: site.subdomain,
      templateKey: site.templateKey,
      theme: site.theme,
      navigation: site.navigation,
      settings: publicSettings(site.settings),
      // Only an explicit grant counts: the entitlements "no plan ⇒ everything
      // enabled" fallback must not remove the credit.
      poweredBy: resolvePoweredBy(
        rawSettings.hidePoweredBy === true,
        brandingFeature.enabled && (brandingFeature.source === 'plan' || brandingFeature.source === 'override'),
      ),
      publishedAt: site.publishedAt,
      canonicalUrl: liveBaseUrl(site.subdomain, primaryHost),
    },
    institution: {
      name: institution.name,
      // Public institution code, used by the AI admission-assistant widget.
      slug: institution.slug,
      logoUrl: institution.logoUrl,
      // School contact details (the institution's, never an individual's).
      contact: {
        address: institution.address,
        email: institution.contactEmail ?? institution.email,
        phone: institution.contactPhone ?? institution.phone,
      },
    },
    pages: pages.map((p) => ({
      slug: p.slug,
      title: p.title,
      titleBn: p.titleBn,
      noindex: Boolean((p.seo as Record<string, unknown> | null)?.noindex),
    })),
    templateRoutes: templates,
  };
}

export async function getPublicPage(siteId: string, slugParam: string, previewToken?: string) {
  const { site, preview } = await visibleSite(siteId, previewToken);
  const slug = slugFromParam(slugParam);
  const page = await prisma.sitePage.findUnique({ where: { siteId_slug: { siteId: site.id, slug } } });
  if (!page) throw new NotFoundError('Page not found');
  const data = preview ? page.draft : page.published;
  if (!data) throw new NotFoundError('Page not found');
  return {
    page: {
      id: page.id,
      slug: page.slug,
      title: page.title,
      titleBn: page.titleBn,
      kind: page.kind,
      collectionKey: page.collectionKey,
      seo: page.seo,
      data,
      publishedAt: page.publishedAt,
      updatedAt: preview ? page.updatedAt : page.publishedAt,
    },
    preview,
  };
}

const POST_LIST_SELECT = { slug: true, title: true, excerpt: true, coverUrl: true, publishedAt: true, tags: true } as const;

function postWhere(siteId: string, preview: boolean): Prisma.SitePostWhereInput {
  return preview ? { siteId } : { siteId, status: 'PUBLISHED', publishedAt: { lte: new Date() } };
}

export async function listPublicPosts(siteId: string, q: { page: number; pageSize: number; tag?: string }, previewToken?: string) {
  const { site, preview } = await visibleSite(siteId, previewToken);
  const where: Prisma.SitePostWhereInput = { ...postWhere(site.id, preview), ...(q.tag ? { tags: { has: q.tag } } : {}) };
  const [items, total] = await Promise.all([
    prisma.sitePost.findMany({
      where,
      select: POST_LIST_SELECT,
      orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
    }),
    prisma.sitePost.count({ where }),
  ]);
  return { items, total, preview };
}

export async function getPublicPost(siteId: string, slug: string, previewToken?: string) {
  const { site, preview } = await visibleSite(siteId, previewToken);
  const post = await prisma.sitePost.findFirst({
    where: { ...postWhere(site.id, preview), slug: slug.toLowerCase() },
    select: { ...POST_LIST_SELECT, body: true, updatedAt: true },
  });
  if (!post) throw new NotFoundError('Post not found');
  return { post, preview };
}

// ── Forms ───────────────────────────────────────────────────────────────────

export async function getPublicForm(siteId: string, formId: string, previewToken?: string) {
  const { site } = await visibleSite(siteId, previewToken);
  const form = await prisma.siteForm.findFirst({ where: { id: formId, siteId: site.id }, select: { id: true, name: true, fields: true, target: true } });
  if (!form) throw new NotFoundError('Form not found');
  return { ...form, honeypotField: HONEYPOT_FIELD };
}

export async function submitForm(
  siteId: string,
  formId: string,
  body: Record<string, unknown>,
  meta: { ip?: string | null; userAgent?: string | null },
) {
  const { site } = await visibleSite(siteId, null);
  const form = await prisma.siteForm.findFirst({ where: { id: formId, siteId: site.id } });
  if (!form) throw new NotFoundError('Form not found');

  // Honeypot filled: pretend success, store nothing.
  const honey = body[HONEYPOT_FIELD];
  if (typeof honey === 'string' ? honey.trim() !== '' : honey !== undefined && honey !== null && honey !== false) {
    return { received: true };
  }

  const fields = (Array.isArray(form.fields) ? form.fields : []) as unknown as FormField[];
  const result = validateSubmission(fields, body);
  if (!result.ok) throw new ValidationError('Please check the form', result.errors.map((e) => ({ field: e.field, message: e.message })));

  let enquiryId: string | null = null;
  if (form.target === 'ENQUIRY') {
    const mapped = mapEnquiryValues(result.values);
    const parsed = CreateEnquiryDto.safeParse({ ...mapped, source: 'WEBSITE', status: 'NEW' });
    if (!parsed.success) {
      throw new ValidationError(
        'Please check the form',
        parsed.error.errors.map((e) => ({ field: String(e.path[0] ?? 'form'), message: e.message })),
      );
    }
    const enquiry = await enquiriesService.createEnquiry(site.institutionId, parsed.data);
    enquiryId = enquiry.id;
  }

  const submission = await prisma.siteFormSubmission.create({
    data: {
      formId: form.id,
      institutionId: site.institutionId,
      data: { ...result.values, ...(enquiryId ? { _enquiryId: enquiryId } : {}) } as Prisma.InputJsonValue,
      ip: meta.ip?.slice(0, 64) ?? null,
      userAgent: meta.userAgent?.slice(0, 300) ?? null,
    },
    select: { id: true },
  });

  notifyStaff(site.institutionId, form, result.values, enquiryId).catch((error) =>
    logger.error('Sites: form notification failed', { formId: form.id, error: (error as Error).message }),
  );
  notifySubmitter(site.institutionId, form.name, fields, result.values).catch((error) =>
    logger.error('Sites: form-submitter acknowledgement failed', { formId: form.id, error: (error as Error).message }),
  );
  logger.info('Site form submitted', { formId: form.id, submissionId: submission.id, institutionId: site.institutionId });
  return { received: true };
}

/** Acknowledges receipt to whichever field the form itself declares as type "email" — never guesses a key name. */
async function notifySubmitter(
  institutionId: string,
  formName: string,
  fields: FormField[],
  values: Record<string, string | boolean>,
) {
  const emailField = fields.find((f) => f.type === 'email');
  const submitterEmail = emailField ? values[emailField.key] : undefined;
  if (typeof submitterEmail !== 'string' || !submitterEmail.includes('@')) return;

  const nameField = fields.find((f) => /name/i.test(f.key));
  const name = nameField && typeof values[nameField.key] === 'string' ? (values[nameField.key] as string) : undefined;

  const branding = await findInstitutionBranding(institutionId);
  const mail = formSubmittedAckEmail({
    name,
    institutionName: branding.name,
    formName,
    institution: { name: branding.name, logoUrl: branding.logoUrl, color: branding.color },
  });
  await sendEmail({
    to: submitterEmail,
    subject: mail.subject,
    html: mail.html,
    text: mail.text,
    template: 'sites.form-submitted-ack',
    priority: EmailPriority.P1_TRANSACTIONAL,
    institutionId,
    fromName: branding.name,
    replyTo: branding.contactEmail ?? undefined,
  });
}

async function notifyStaff(
  institutionId: string,
  form: { id: string; name: string; target: string; notifyEmails: string[] },
  values: Record<string, string | boolean>,
  enquiryId: string | null,
) {
  const admins = await prisma.user.findMany({ where: { institutionId, role: 'ADMIN', isActive: true }, select: { id: true } });
  if (admins.length) {
    await prisma.notification.createMany({
      data: admins.map((a) => ({
        institutionId,
        recipientUserId: a.id,
        type: enquiryId ? 'ADMISSION_ENQUIRY' : 'SITE_FORM_SUBMISSION',
        title: enquiryId ? 'New admission enquiry (website)' : `New website form: ${form.name}`,
        body: enquiryId ? `${values.studentName ?? ''} submitted "${form.name}"` : `Someone submitted "${form.name}" on the school website`,
        data: enquiryId ? { link: '/admissions/enquiries', enquiryId } : { link: '/website-builder', formId: form.id },
      })),
    });
  }
  if (form.notifyEmails.length) {
    const lines = Object.entries(values).map(([k, v]) => `${k}: ${v === true ? 'yes' : v === false ? 'no' : v}`);
    const text = `A new submission arrived on the website form "${form.name}".\n\n${lines.join('\n')}\n`;
    for (const to of form.notifyEmails) {
      await sendDirectMail({
        to,
        subject: `Website form: ${form.name}`,
        text,
        priority: EmailPriority.P1_TRANSACTIONAL,
        template: 'sites.form-staff-notice',
        institutionId,
      }).catch((error) =>
        logger.warn('Sites: form notify email failed', { formId: form.id, error: (error as Error).message }),
      );
    }
  }
}

// ── Sitemap / robots / caddy ────────────────────────────────────────────────

function dedupePaths<T extends { path: string }>(entries: T[]): T[] {
  const seen = new Set<string>();
  return entries.filter((e) => (seen.has(e.path) ? false : (seen.add(e.path), true)));
}

export async function sitemap(siteId: string) {
  const { site } = await visibleSite(siteId, null);
  const [pages, posts, albums, admissions, notices, primaryHost, templatePaths] = await Promise.all([
    prisma.sitePage.findMany({
      where: { siteId: site.id, kind: 'PAGE', published: { not: Prisma.DbNull } },
      select: { slug: true, seo: true, publishedAt: true },
      orderBy: { sortOrder: 'asc' },
    }),
    prisma.sitePost.findMany({
      where: postWhere(site.id, false),
      select: { slug: true, publishedAt: true, updatedAt: true },
      orderBy: { publishedAt: 'desc' },
      take: 1000,
    }),
    // Track B4 — detail-page URLs (see WEBSITE_V3_PLAN.md §7 for the route convention).
    prisma.siteAlbum.findMany({
      where: { siteId: site.id, institutionId: site.institutionId, status: 'PUBLISHED' },
      select: { id: true, updatedAt: true },
      take: 500,
    }),
    prisma.siteAdmissionCircular.findMany({
      where: { siteId: site.id, institutionId: site.institutionId, status: 'PUBLISHED' },
      select: { id: true, updatedAt: true },
      take: 500,
    }),
    prisma.notice.findMany({
      where: { institutionId: site.institutionId, isActive: true, audience: { in: ['ALL', 'PUBLIC'] }, classId: null, sectionId: null, publishedAt: { lte: new Date() } },
      select: { id: true, publishedAt: true },
      orderBy: { publishedAt: 'desc' },
      take: 200,
    }),
    primaryActiveHost(site.id),
    // W5: every item URL of each collection that has a published template page.
    templateSitemapPaths(site),
  ]);
  const base = liveBaseUrl(site.subdomain, primaryHost);
  const entries = dedupePaths([
    ...pages
      .filter((p) => !(p.seo as Record<string, unknown> | null)?.noindex)
      .map((p) => ({ path: p.slug ? `/${p.slug}` : '/', lastmod: p.publishedAt })),
    ...posts.map((p) => ({ path: `/blog/${p.slug}`, lastmod: p.updatedAt })),
    ...albums.map((a) => ({ path: `/gallery/${a.id}`, lastmod: a.updatedAt })),
    ...admissions.map((a) => ({ path: `/admissions/${a.id}`, lastmod: a.updatedAt })),
    ...notices.map((n) => ({ path: `/notices/${n.id}`, lastmod: n.publishedAt })),
    ...templatePaths,
  ]);
  return buildSitemap(base, entries);
}

export async function robots(siteId: string) {
  const site = await siteWithInstitution({ id: siteId });
  if (!site) throw new NotFoundError(NOT_FOUND);
  const published = site.status === 'PUBLISHED';
  const base = published ? liveBaseUrl(site.subdomain, await primaryActiveHost(site.id)) : null;
  return buildRobots(base, published);
}

/** Caddy on-demand TLS: true only for hostnames we should issue a certificate for. */
export async function caddyAllows(rawDomain: string): Promise<boolean> {
  const host = normalizeHostname(rawDomain);
  if (!host) return false;
  const root = platformSiteDomain();
  if (root && host.endsWith(`.${root}`)) {
    const sub = host.slice(0, -(root.length + 1));
    if (!sub || sub.includes('.')) return false;
    return Boolean(await siteWithInstitution({ subdomain: sub }));
  }
  const d = await prisma.siteDomain.findUnique({ where: { hostname: host }, select: { status: true } });
  return d?.status === 'ACTIVE';
}
