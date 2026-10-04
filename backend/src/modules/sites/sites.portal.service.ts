// =============================================================================
// Sites portal — admin service (Track B): institution profile, staff
// visibility, committee, albums, downloads, admission circulars, and the
// DSHE compliance checklist. Every query filters by institutionId; tenant
// isolation is never optional (see CLAUDE.md rule 1).
// =============================================================================

import { Prisma, UserRole } from '@prisma/client';
import { ensureUserSlugs } from './sites.collections';
import { prisma } from '../../config/prisma';
import { NotFoundError, ValidationError } from '../../utils/AppError';
import { sanitizeHtml } from './sites.logic';
import { complianceChecklist, type ComplianceInput } from './sites.portal.logic';
import { getOrCreateSite, type SitesCtx } from './sites.service';
import { STAFF_ROLES } from '../saas/entitlements.service';
import type {
  CreateAdmissionDtoType,
  CreateAlbumDtoType,
  CreateAlbumPhotoDtoType,
  CreateCommitteeMemberDtoType,
  CreateDownloadDtoType,
  StaffVisibilityQueryDtoType,
  ToggleStaffVisibilityDtoType,
  UpdateAdmissionDtoType,
  UpdateAlbumDtoType,
  UpdateAlbumPhotoDtoType,
  UpdateCommitteeMemberDtoType,
  UpdateDownloadDtoType,
  UpdateProfileDtoType,
} from './sites.portal.dto';
import type { PaginationDtoType } from './sites.dto';

const json = (v: unknown) => v as Prisma.InputJsonValue;
const nullableJson = (v: unknown) => (v === undefined ? undefined : v === null ? Prisma.JsonNull : (v as Prisma.InputJsonValue));

// ── Profile (B1) ─────────────────────────────────────────────────────────────

const PROFILE_SELECT = {
  name: true,
  nameBn: true,
  slug: true,
  eiin: true,
  establishedYear: true,
  mpoInfo: true,
  recognitionInfo: true,
  headOfInstitution: true,
  informationOfficer: true,
  complaintsOfficer: true,
  address: true,
  phone: true,
  email: true,
  contactPhone: true,
  contactEmail: true,
  logoUrl: true,
  aboutText: true,
} satisfies Prisma.InstitutionSelect;

/** Resolves a stored head-of-institution reference against the live User row, when it names one. */
async function resolveHead(institutionId: string, raw: unknown) {
  const head = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : null;
  if (!head) return null;
  const userId = typeof head.userId === 'string' ? head.userId : null;
  if (!userId) return { userId: null, name: head.name ?? null, photoUrl: head.photoUrl ?? null, designation: head.designation ?? null };
  const user = await prisma.user.findFirst({
    where: { id: userId, institutionId },
    select: { firstName: true, lastName: true, avatarUrl: true, staffProfile: { select: { designation: true } } },
  });
  if (!user) return { userId, name: head.name ?? null, photoUrl: head.photoUrl ?? null, designation: head.designation ?? null };
  return {
    userId,
    name: `${user.firstName} ${user.lastName}`.trim(),
    photoUrl: user.avatarUrl ?? (head.photoUrl as string | null) ?? null,
    designation: (head.designation as string | null) ?? user.staffProfile?.designation ?? null,
  };
}

export async function getProfile(ctx: SitesCtx) {
  const institution = await prisma.institution.findUniqueOrThrow({ where: { id: ctx.institutionId }, select: PROFILE_SELECT });
  return { ...institution, headOfInstitution: await resolveHead(ctx.institutionId, institution.headOfInstitution) };
}

export async function updateProfile(ctx: SitesCtx, data: UpdateProfileDtoType) {
  if (data.headOfInstitution?.userId) {
    const user = await prisma.user.findFirst({ where: { id: data.headOfInstitution.userId, institutionId: ctx.institutionId, isActive: true }, select: { id: true } });
    if (!user) throw new NotFoundError('Selected head of institution is not a staff member of this school');
  }
  const patch: Prisma.InstitutionUpdateInput = {};
  if (data.nameBn !== undefined) patch.nameBn = data.nameBn;
  if (data.eiin !== undefined) patch.eiin = data.eiin;
  if (data.establishedYear !== undefined) patch.establishedYear = data.establishedYear;
  if (data.mpoInfo !== undefined) patch.mpoInfo = data.mpoInfo;
  if (data.recognitionInfo !== undefined) patch.recognitionInfo = data.recognitionInfo;
  if (data.headOfInstitution !== undefined) patch.headOfInstitution = nullableJson(data.headOfInstitution);
  if (data.informationOfficer !== undefined) patch.informationOfficer = nullableJson(data.informationOfficer);
  if (data.complaintsOfficer !== undefined) patch.complaintsOfficer = nullableJson(data.complaintsOfficer);
  await prisma.institution.update({ where: { id: ctx.institutionId }, data: patch });
  return getProfile(ctx);
}

// ── Staff visibility (B2, owner decision 3) ─────────────────────────────────

const NON_TEACHING_STAFF_ROLES = STAFF_ROLES.filter((r) => r !== UserRole.TEACHER);

export async function listStaffVisibility(ctx: SitesCtx, q: StaffVisibilityQueryDtoType) {
  const roles = q.role === 'TEACHER' ? [UserRole.TEACHER] : q.role === 'STAFF' ? NON_TEACHING_STAFF_ROLES : [...STAFF_ROLES];
  const where: Prisma.UserWhereInput = {
    institutionId: ctx.institutionId,
    role: { in: roles },
    isActive: true,
    ...(q.q ? { OR: [{ firstName: { contains: q.q, mode: 'insensitive' } }, { lastName: { contains: q.q, mode: 'insensitive' } }] } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.user.findMany({
      where,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        role: true,
        avatarUrl: true,
        showOnWebsite: true,
        staffProfile: { select: { designation: true, department: true } },
      },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
    }),
    prisma.user.count({ where }),
  ]);
  return {
    items: items.map((u) => ({
      id: u.id,
      name: `${u.firstName} ${u.lastName}`.trim(),
      role: u.role,
      designation: u.staffProfile?.designation ?? null,
      department: u.staffProfile?.department ?? null,
      photoUrl: u.avatarUrl,
      showOnWebsite: u.showOnWebsite,
    })),
    total,
  };
}

export async function setStaffVisibility(ctx: SitesCtx, data: ToggleStaffVisibilityDtoType) {
  const result = await prisma.user.updateMany({
    where: { id: { in: data.userIds }, institutionId: ctx.institutionId },
    data: { showOnWebsite: data.showOnWebsite },
  });
  if (data.showOnWebsite) {
    // Website collections: opted-in staff get their opaque public URL slug now.
    const unslugged = await prisma.user.findMany({
      where: { id: { in: data.userIds }, institutionId: ctx.institutionId, publicSlug: null },
      select: { id: true, firstName: true, lastName: true, publicSlug: true },
    });
    await ensureUserSlugs(ctx.institutionId, unslugged);
  }
  return { updated: result.count };
}

// ── Committee (B2) ───────────────────────────────────────────────────────────

export async function listCommittee(ctx: SitesCtx, q: PaginationDtoType) {
  const site = await getOrCreateSite(ctx.institutionId);
  const where = { institutionId: ctx.institutionId, siteId: site.id };
  const [items, total] = await Promise.all([
    prisma.siteCommitteeMember.findMany({ where, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }], skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
    prisma.siteCommitteeMember.count({ where }),
  ]);
  return { items, total };
}

async function committeeOrThrow(ctx: SitesCtx, id: string) {
  const row = await prisma.siteCommitteeMember.findFirst({ where: { id, institutionId: ctx.institutionId } });
  if (!row) throw new NotFoundError('Committee member not found');
  return row;
}

async function nextCommitteeSortOrder(siteId: string): Promise<number> {
  const agg = await prisma.siteCommitteeMember.aggregate({ where: { siteId }, _max: { sortOrder: true } });
  return (agg._max.sortOrder ?? 0) + 1;
}

export async function createCommitteeMember(ctx: SitesCtx, data: CreateCommitteeMemberDtoType) {
  const site = await getOrCreateSite(ctx.institutionId);
  const sortOrder = data.sortOrder ?? (await nextCommitteeSortOrder(site.id));
  return prisma.siteCommitteeMember.create({
    data: {
      siteId: site.id,
      institutionId: ctx.institutionId,
      name: data.name,
      nameBn: data.nameBn ?? null,
      role: data.role,
      roleBn: data.roleBn ?? null,
      photoUrl: data.photoUrl ?? null,
      phone: data.phone ?? null,
      showPhone: data.showPhone,
      sortOrder,
    },
  });
}

export async function updateCommitteeMember(ctx: SitesCtx, id: string, data: UpdateCommitteeMemberDtoType) {
  const row = await committeeOrThrow(ctx, id);
  return prisma.siteCommitteeMember.update({ where: { id: row.id }, data });
}

export async function deleteCommitteeMember(ctx: SitesCtx, id: string) {
  const row = await committeeOrThrow(ctx, id);
  await prisma.siteCommitteeMember.delete({ where: { id: row.id } });
  return { id: row.id };
}

// ── Albums (B2) ──────────────────────────────────────────────────────────────

export async function listAlbums(ctx: SitesCtx, q: PaginationDtoType & { status?: 'DRAFT' | 'PUBLISHED' }) {
  const site = await getOrCreateSite(ctx.institutionId);
  const where: Prisma.SiteAlbumWhereInput = { institutionId: ctx.institutionId, siteId: site.id, ...(q.status ? { status: q.status } : {}) };
  const [items, total] = await Promise.all([
    prisma.siteAlbum.findMany({
      where,
      include: { _count: { select: { photos: true } } },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
    }),
    prisma.siteAlbum.count({ where }),
  ]);
  return {
    items: items.map(({ _count, ...a }) => ({ ...a, photoCount: _count.photos })),
    total,
  };
}

async function albumOrThrow(ctx: SitesCtx, id: string) {
  const album = await prisma.siteAlbum.findFirst({ where: { id, institutionId: ctx.institutionId }, include: { photos: { orderBy: { sortOrder: 'asc' } } } });
  if (!album) throw new NotFoundError('Album not found');
  return album;
}

export async function getAlbum(ctx: SitesCtx, id: string) {
  return albumOrThrow(ctx, id);
}

async function nextAlbumSortOrder(siteId: string): Promise<number> {
  const agg = await prisma.siteAlbum.aggregate({ where: { siteId }, _max: { sortOrder: true } });
  return (agg._max.sortOrder ?? 0) + 1;
}

export async function createAlbum(ctx: SitesCtx, data: CreateAlbumDtoType) {
  const site = await getOrCreateSite(ctx.institutionId);
  const sortOrder = data.sortOrder ?? (await nextAlbumSortOrder(site.id));
  return prisma.siteAlbum.create({
    data: {
      siteId: site.id,
      institutionId: ctx.institutionId,
      title: data.title,
      titleBn: data.titleBn ?? null,
      coverUrl: data.coverUrl ?? null,
      description: data.description ? sanitizeHtml(data.description) : null,
      eventDate: data.eventDate ?? null,
      status: data.status,
      sortOrder,
    },
  });
}

export async function updateAlbum(ctx: SitesCtx, id: string, data: UpdateAlbumDtoType) {
  const album = await albumOrThrow(ctx, id);
  const patch: Prisma.SiteAlbumUpdateInput = { ...data };
  if (data.description !== undefined) patch.description = data.description ? sanitizeHtml(data.description) : null;
  return prisma.siteAlbum.update({ where: { id: album.id }, data: patch });
}

export async function deleteAlbum(ctx: SitesCtx, id: string) {
  const album = await albumOrThrow(ctx, id);
  await prisma.siteAlbum.delete({ where: { id: album.id } });
  return { id: album.id };
}

export async function addAlbumPhoto(ctx: SitesCtx, albumId: string, data: CreateAlbumPhotoDtoType) {
  const album = await albumOrThrow(ctx, albumId);
  const agg = await prisma.siteAlbumPhoto.aggregate({ where: { albumId: album.id }, _max: { sortOrder: true } });
  const sortOrder = (agg._max.sortOrder ?? 0) + 1;
  return prisma.siteAlbumPhoto.create({ data: { albumId: album.id, url: data.url, caption: data.caption ?? null, sortOrder } });
}

async function albumPhotoOrThrow(ctx: SitesCtx, albumId: string, photoId: string) {
  const album = await albumOrThrow(ctx, albumId);
  const photo = await prisma.siteAlbumPhoto.findFirst({ where: { id: photoId, albumId: album.id } });
  if (!photo) throw new NotFoundError('Photo not found');
  return { album, photo };
}

export async function updateAlbumPhoto(ctx: SitesCtx, albumId: string, photoId: string, data: UpdateAlbumPhotoDtoType) {
  const { photo } = await albumPhotoOrThrow(ctx, albumId, photoId);
  return prisma.siteAlbumPhoto.update({ where: { id: photo.id }, data });
}

export async function deleteAlbumPhoto(ctx: SitesCtx, albumId: string, photoId: string) {
  const { photo } = await albumPhotoOrThrow(ctx, albumId, photoId);
  await prisma.siteAlbumPhoto.delete({ where: { id: photo.id } });
  return { id: photo.id };
}

export async function reorderAlbumPhotos(ctx: SitesCtx, albumId: string, ids: string[]) {
  const album = await albumOrThrow(ctx, albumId);
  if (new Set(ids).size !== ids.length) throw new ValidationError('Photo ids must be unique');
  const owned = await prisma.siteAlbumPhoto.findMany({ where: { id: { in: ids }, albumId: album.id }, select: { id: true } });
  if (owned.length !== ids.length) throw new NotFoundError('One or more photos were not found');
  await prisma.$transaction(ids.map((pid, i) => prisma.siteAlbumPhoto.update({ where: { id: pid }, data: { sortOrder: i } })));
  return prisma.siteAlbumPhoto.findMany({ where: { albumId: album.id }, orderBy: { sortOrder: 'asc' } });
}

// ── Downloads (B2) ───────────────────────────────────────────────────────────

export async function listDownloads(ctx: SitesCtx, q: PaginationDtoType & { status?: 'DRAFT' | 'PUBLISHED'; category?: string }) {
  const site = await getOrCreateSite(ctx.institutionId);
  const where: Prisma.SiteDownloadWhereInput = {
    institutionId: ctx.institutionId,
    siteId: site.id,
    ...(q.status ? { status: q.status } : {}),
    ...(q.category ? { category: q.category } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.siteDownload.findMany({ where, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }], skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
    prisma.siteDownload.count({ where }),
  ]);
  return { items, total };
}

async function downloadOrThrow(ctx: SitesCtx, id: string) {
  const row = await prisma.siteDownload.findFirst({ where: { id, institutionId: ctx.institutionId } });
  if (!row) throw new NotFoundError('Download not found');
  return row;
}

async function nextDownloadSortOrder(siteId: string): Promise<number> {
  const agg = await prisma.siteDownload.aggregate({ where: { siteId }, _max: { sortOrder: true } });
  return (agg._max.sortOrder ?? 0) + 1;
}

export async function createDownload(ctx: SitesCtx, data: CreateDownloadDtoType) {
  const site = await getOrCreateSite(ctx.institutionId);
  const sortOrder = data.sortOrder ?? (await nextDownloadSortOrder(site.id));
  return prisma.siteDownload.create({
    data: {
      siteId: site.id,
      institutionId: ctx.institutionId,
      title: data.title,
      titleBn: data.titleBn ?? null,
      category: data.category,
      fileUrl: data.fileUrl,
      publishedAt: data.publishedAt ?? null,
      status: data.status,
      sortOrder,
    },
  });
}

export async function updateDownload(ctx: SitesCtx, id: string, data: UpdateDownloadDtoType) {
  const row = await downloadOrThrow(ctx, id);
  return prisma.siteDownload.update({ where: { id: row.id }, data });
}

export async function deleteDownload(ctx: SitesCtx, id: string) {
  const row = await downloadOrThrow(ctx, id);
  await prisma.siteDownload.delete({ where: { id: row.id } });
  return { id: row.id };
}

// ── Admission circulars (B2) ─────────────────────────────────────────────────

async function assertFormBelongsToSite(siteId: string, formId: string | null | undefined) {
  if (!formId) return;
  const form = await prisma.siteForm.findFirst({ where: { id: formId, siteId }, select: { id: true } });
  if (!form) throw new ValidationError('That form does not belong to this website');
}

export async function listAdmissions(ctx: SitesCtx, q: PaginationDtoType & { status?: 'DRAFT' | 'PUBLISHED' }) {
  const site = await getOrCreateSite(ctx.institutionId);
  const where: Prisma.SiteAdmissionCircularWhereInput = { institutionId: ctx.institutionId, siteId: site.id, ...(q.status ? { status: q.status } : {}) };
  const [items, total] = await Promise.all([
    prisma.siteAdmissionCircular.findMany({ where, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }], skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
    prisma.siteAdmissionCircular.count({ where }),
  ]);
  return { items, total };
}

async function admissionOrThrow(ctx: SitesCtx, id: string) {
  const row = await prisma.siteAdmissionCircular.findFirst({ where: { id, institutionId: ctx.institutionId } });
  if (!row) throw new NotFoundError('Admission circular not found');
  return row;
}

export async function getAdmission(ctx: SitesCtx, id: string) {
  return admissionOrThrow(ctx, id);
}

async function nextAdmissionSortOrder(siteId: string): Promise<number> {
  const agg = await prisma.siteAdmissionCircular.aggregate({ where: { siteId }, _max: { sortOrder: true } });
  return (agg._max.sortOrder ?? 0) + 1;
}

export async function createAdmission(ctx: SitesCtx, data: CreateAdmissionDtoType) {
  const site = await getOrCreateSite(ctx.institutionId);
  await assertFormBelongsToSite(site.id, data.formId);
  const sortOrder = data.sortOrder ?? (await nextAdmissionSortOrder(site.id));
  return prisma.siteAdmissionCircular.create({
    data: {
      siteId: site.id,
      institutionId: ctx.institutionId,
      session: data.session,
      classNames: data.classNames,
      title: data.title,
      titleBn: data.titleBn ?? null,
      body: sanitizeHtml(data.body),
      startDate: data.startDate ?? null,
      endDate: data.endDate ?? null,
      fee: data.fee != null ? new Prisma.Decimal(data.fee) : null,
      pdfUrl: data.pdfUrl ?? null,
      applyUrl: data.applyUrl ?? null,
      formId: data.formId ?? null,
      status: data.status,
      sortOrder,
    },
  });
}

export async function updateAdmission(ctx: SitesCtx, id: string, data: UpdateAdmissionDtoType) {
  const row = await admissionOrThrow(ctx, id);
  if (data.formId !== undefined) await assertFormBelongsToSite(row.siteId, data.formId);
  const patch: Prisma.SiteAdmissionCircularUpdateInput = { ...data };
  if (data.body !== undefined) patch.body = sanitizeHtml(data.body);
  if (data.fee !== undefined) patch.fee = data.fee != null ? new Prisma.Decimal(data.fee) : null;
  return prisma.siteAdmissionCircular.update({ where: { id: row.id }, data: patch });
}

export async function deleteAdmission(ctx: SitesCtx, id: string) {
  const row = await admissionOrThrow(ctx, id);
  await prisma.siteAdmissionCircular.delete({ where: { id: row.id } });
  return { id: row.id };
}

// ── DSHE compliance checklist ────────────────────────────────────────────────

export async function getCompliance(ctx: SitesCtx) {
  const site = await getOrCreateSite(ctx.institutionId);
  const institutionId = ctx.institutionId;
  const [
    institution,
    studentCount,
    sectionCount,
    routineCount,
    noticeCount,
    visibleStaffCount,
    committeeCount,
  ] = await Promise.all([
    prisma.institution.findUniqueOrThrow({
      where: { id: institutionId },
      select: {
        nameBn: true,
        aboutText: true,
        recognitionInfo: true,
        mpoInfo: true,
        address: true,
        phone: true,
        email: true,
        contactPhone: true,
        contactEmail: true,
        informationOfficer: true,
        complaintsOfficer: true,
        headOfInstitution: true,
      },
    }),
    prisma.student.count({ where: { institutionId, status: 'ACTIVE' } }),
    prisma.section.count({ where: { class: { branch: { institutionId } } } }),
    prisma.timetableSlot.count({ where: { institutionId } }),
    prisma.notice.count({ where: { institutionId, isActive: true } }),
    prisma.user.count({ where: { institutionId, isActive: true, showOnWebsite: true, role: { in: [...STAFF_ROLES] } } }),
    prisma.siteCommitteeMember.count({ where: { institutionId, siteId: site.id } }),
  ]);

  const officerFilled = (v: unknown) => Boolean(v && typeof v === 'object' && typeof (v as Record<string, unknown>).name === 'string' && (v as Record<string, unknown>).name);

  const input: ComplianceInput = {
    hasNameBn: Boolean(institution.nameBn),
    hasAboutText: Boolean(institution.aboutText),
    hasRecognitionInfo: Boolean(institution.recognitionInfo),
    hasStudentCounts: studentCount > 0,
    hasSections: sectionCount > 0,
    hasRoutine: routineCount > 0,
    hasNotices: noticeCount > 0,
    hasMpoInfo: Boolean(institution.mpoInfo),
    hasContactDetails: Boolean(institution.address) && Boolean(institution.contactPhone ?? institution.phone ?? institution.contactEmail ?? institution.email),
    hasInformationOfficer: officerFilled(institution.informationOfficer),
    hasComplaintsOfficer: officerFilled(institution.complaintsOfficer),
    hasHeadOfInstitution: Boolean(institution.headOfInstitution && typeof institution.headOfInstitution === 'object'),
    hasVisibleStaff: visibleStaffCount > 0,
    hasCommittee: committeeCount > 0,
  };
  const items = complianceChecklist(input);
  const filled = items.filter((i) => i.status === 'filled').length;
  return { items, filled, total: items.length };
}
