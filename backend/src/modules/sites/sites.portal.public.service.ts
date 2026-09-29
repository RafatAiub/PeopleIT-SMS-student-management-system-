// =============================================================================
// Sites portal — public (unauthenticated) data service (Track B3/B4). Same
// rules as sites.public.service.ts: PUBLISHED data only (unless a valid
// preview token is presented), public-safe fields only, opt-in settings
// gates for anything that could be sensitive (results, fees, library,
// transport). Every query filters by institutionId AND siteId.
// =============================================================================

import { Prisma, UserRole } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { ForbiddenError, NotFoundError } from '../../utils/AppError';
import { getDefaultBands } from '../grading/grading.resolver';
import { summarizeMarks } from '../grading/grading.core';
import { STAFF_ROLES } from '../saas/entitlements.service';
import {
  plainTextExcerpt,
  summarizeClassResults,
  summarizeGenderCounts,
  toPublicCommitteeMember,
  toPublicStaffMember,
  type PublicStaffMember,
  type StaffCategory,
  type StudentExamOutcome,
} from './sites.portal.logic';
import { readGates } from './sites.logic';
import { publicExam } from './sites.data.service';
import { visibleSite } from './sites.public.service';
import type { PaginationDtoType } from './sites.dto';

const settingsOf = (raw: unknown): Record<string, unknown> => (raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {});
const flag = (settings: Record<string, unknown>, key: string) => settings[key] === true;

// ── Profile (B1/B3) ──────────────────────────────────────────────────────────

async function publicHead(institutionId: string): Promise<PublicStaffMember | null> {
  const institution = await prisma.institution.findUnique({ where: { id: institutionId }, select: { headOfInstitution: true } });
  const head = institution?.headOfInstitution as Record<string, unknown> | null;
  if (!head || typeof head !== 'object') return null;
  const userId = typeof head.userId === 'string' ? head.userId : null;
  if (userId) {
    const user = await prisma.user.findFirst({
      where: { id: userId, institutionId },
      select: { firstName: true, lastName: true, avatarUrl: true, staffProfile: { select: { designation: true } } },
    });
    if (user) {
      return toPublicStaffMember({
        userId,
        name: `${user.firstName} ${user.lastName}`.trim(),
        photoUrl: user.avatarUrl ?? (typeof head.photoUrl === 'string' ? head.photoUrl : null),
        designation: (typeof head.designation === 'string' ? head.designation : null) ?? user.staffProfile?.designation ?? null,
        department: null,
        subject: null,
        qualification: null,
        classTeacherOf: [],
      });
    }
  }
  if (typeof head.name === 'string' && head.name) {
    return toPublicStaffMember({
      userId: '',
      name: head.name,
      photoUrl: typeof head.photoUrl === 'string' ? head.photoUrl : null,
      designation: typeof head.designation === 'string' ? head.designation : null,
      department: null,
      subject: null,
      qualification: null,
      classTeacherOf: [],
    });
  }
  return null;
}

export async function profile(siteId: string, preview?: string) {
  const { site } = await visibleSite(siteId, preview);
  const institution = await prisma.institution.findUniqueOrThrow({
    where: { id: site.institutionId },
    select: {
      name: true,
      nameBn: true,
      slug: true,
      eiin: true,
      establishedYear: true,
      mpoInfo: true,
      recognitionInfo: true,
      informationOfficer: true,
      complaintsOfficer: true,
      address: true,
      phone: true,
      email: true,
      contactPhone: true,
      contactEmail: true,
      logoUrl: true,
      aboutText: true,
    },
  });
  return {
    name: institution.name,
    nameBn: institution.nameBn,
    slug: institution.slug,
    eiin: institution.eiin,
    establishedYear: institution.establishedYear ?? readGates(site.settings).establishedYear,
    mpoInfo: institution.mpoInfo,
    recognitionInfo: institution.recognitionInfo,
    aboutText: institution.aboutText,
    logoUrl: institution.logoUrl,
    contact: {
      address: institution.address,
      phone: institution.contactPhone ?? institution.phone,
      email: institution.contactEmail ?? institution.email,
    },
    // Deliberately public: DSHE items 8/9 require these to be published (the
    // admin fills this field specifically so it can be shown), unlike the
    // general staff privacy rule.
    informationOfficer: institution.informationOfficer,
    complaintsOfficer: institution.complaintsOfficer,
    headOfInstitution: await publicHead(site.institutionId),
  };
}

// ── Staff directory (B3, owner decision 3) ──────────────────────────────────

const NON_TEACHING_STAFF_ROLES: UserRole[] = STAFF_ROLES.filter((r) => r !== UserRole.TEACHER);

async function publicStaffList(institutionId: string, roles: UserRole[]): Promise<PublicStaffMember[]> {
  const users = await prisma.user.findMany({
    where: { institutionId, role: { in: roles }, isActive: true, status: 'ACTIVE', showOnWebsite: true },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      avatarUrl: true,
      teacherProfile: { select: { id: true, subjectExpertise: true, qualification: true } },
      staffProfile: { select: { designation: true, department: true } },
    },
    orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
    take: 300,
  });
  const teacherIds = users.map((u) => u.teacherProfile?.id).filter((id): id is string => Boolean(id));
  const sections = teacherIds.length
    ? await prisma.section.findMany({
        where: { classTeacherId: { in: teacherIds } },
        select: { classTeacherId: true, name: true, class: { select: { name: true } } },
      })
    : [];
  const classesOf = new Map<string, string[]>();
  for (const s of sections) {
    const key = s.classTeacherId as string;
    classesOf.set(key, [...(classesOf.get(key) ?? []), `${s.class.name} ${s.name}`]);
  }
  return users.map((u) =>
    toPublicStaffMember({
      userId: u.id,
      name: `${u.firstName} ${u.lastName}`.trim(),
      photoUrl: u.avatarUrl,
      designation: u.staffProfile?.designation ?? null,
      department: u.staffProfile?.department ?? null,
      subject: u.teacherProfile?.subjectExpertise ?? null,
      qualification: u.teacherProfile?.qualification ?? null,
      classTeacherOf: u.teacherProfile ? classesOf.get(u.teacherProfile.id) ?? [] : [],
    }),
  );
}

export async function staff(siteId: string, category: StaffCategory, preview?: string) {
  const { site } = await visibleSite(siteId, preview);
  if (category === 'head') {
    const head = await publicHead(site.institutionId);
    return { items: head ? [head] : [] };
  }
  const roles = category === 'teachers' ? [UserRole.TEACHER] : NON_TEACHING_STAFF_ROLES;
  return { items: await publicStaffList(site.institutionId, roles) };
}

// ── Class / gender counts, sections, subjects (B3) ──────────────────────────

export async function classStats(siteId: string, preview?: string) {
  const { site } = await visibleSite(siteId, preview);
  const classes = await prisma.class.findMany({
    where: { branch: { institutionId: site.institutionId } },
    select: { id: true, name: true, level: true, sections: { select: { name: true } } },
    orderBy: { level: 'asc' },
    take: 200,
  });
  const groups = await prisma.student.groupBy({
    by: ['classId', 'gender'],
    where: { institutionId: site.institutionId, status: 'ACTIVE', classId: { not: null } },
    _count: { _all: true },
  });
  const counts = summarizeGenderCounts(groups.map((g) => ({ key: g.classId as string, gender: g.gender, count: g._count._all })));
  return {
    items: classes.map((c) => ({
      className: c.name,
      sections: c.sections.map((s) => s.name),
      genderCounts: counts[c.id] ?? { male: 0, female: 0, other: 0, total: 0 },
    })),
  };
}

export async function subjects(siteId: string, className: string | undefined, preview?: string) {
  const { site } = await visibleSite(siteId, preview);
  const where: Prisma.SubjectOfferingWhereInput = { institutionId: site.institutionId, ...(className ? { className } : {}) };
  const rows = await prisma.subjectOffering.findMany({
    where,
    select: { className: true, group: true, paper: true, isGraded: true, displayOrder: true, subject: { select: { name: true } } },
    orderBy: [{ className: 'asc' }, { displayOrder: 'asc' }],
    take: 500,
  });
  return { items: rows.map((r) => ({ className: r.className, group: r.group, subject: r.subject.name, paper: r.paper, isGraded: r.isGraded })) };
}

// ── Exam routine (B3) ────────────────────────────────────────────────────────

export async function examRoutine(siteId: string, q: { examId?: string; class?: string }, preview?: string) {
  const { site } = await visibleSite(siteId, preview);
  if (!q.examId) {
    const exams = await prisma.exam.findMany({
      where: { institutionId: site.institutionId, isActive: true },
      select: { id: true, name: true, startDate: true, endDate: true },
      orderBy: { startDate: 'desc' },
      take: 30,
    });
    return { exams, slots: [] as unknown[] };
  }
  const slots = await prisma.examTimetableSlot.findMany({
    where: { institutionId: site.institutionId, examId: q.examId, ...(q.class ? { className: q.class } : {}) },
    select: { className: true, sectionName: true, subjectName: true, date: true, startTime: true, endTime: true, room: true },
    orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
    take: 500,
  });
  return { exams: [] as unknown[], slots };
}

// ── Results summary + archive (B3, opt-in) ──────────────────────────────────

export async function resultSummary(siteId: string, examId: string | undefined, preview?: string) {
  const { site } = await visibleSite(siteId, preview);
  const settings = settingsOf(site.settings);
  if (!flag(settings, 'publicResults') && !flag(settings, 'publicResultSummary')) {
    throw new ForbiddenError('This school has not enabled the result summary');
  }
  const exam = await publicExam(site.institutionId, examId);
  if (!exam) return { exam: null, items: [] };

  const [rows, bands] = await Promise.all([
    prisma.examResult.findMany({
      where: { institutionId: site.institutionId, examId: exam.id, student: { status: 'ACTIVE' } },
      select: { studentId: true, subject: true, marksObtained: true, maxMarks: true, student: { select: { class: { select: { name: true } } } } },
    }),
    getDefaultBands(site.institutionId),
  ]);

  const byStudent = new Map<string, { className: string; marks: { subject: string; marksObtained: number; maxMarks: number }[] }>();
  for (const r of rows) {
    let entry = byStudent.get(r.studentId);
    if (!entry) {
      entry = { className: r.student.class?.name ?? 'Unclassed', marks: [] };
      byStudent.set(r.studentId, entry);
    }
    entry.marks.push({ subject: r.subject, marksObtained: Number(r.marksObtained), maxMarks: Number(r.maxMarks) });
  }
  const outcomes: StudentExamOutcome[] = [...byStudent.values()].map((s) => {
    const summary = summarizeMarks(s.marks, bands);
    return { className: s.className, passed: summary.passed, gpa: summary.gpa };
  });
  return { exam, items: summarizeClassResults(outcomes) };
}

export async function resultsArchive(siteId: string, preview?: string) {
  const { site } = await visibleSite(siteId, preview);
  if (!flag(settingsOf(site.settings), 'publicResults')) throw new ForbiddenError('This school has not enabled online results');
  const items = await prisma.exam.findMany({
    where: { institutionId: site.institutionId, isActive: true, endDate: { lte: new Date() }, results: { some: {} } },
    select: { id: true, name: true, startDate: true, endDate: true },
    orderBy: { endDate: 'desc' },
    take: 50,
  });
  return { items };
}

// ── Fee chart (B3, opt-in) ───────────────────────────────────────────────────

export async function feeChart(siteId: string, preview?: string) {
  const { site } = await visibleSite(siteId, preview);
  if (!flag(settingsOf(site.settings), 'publicFeeChart')) throw new ForbiddenError('This school has not published a fee chart');
  const rows = await prisma.feeSchedule.findMany({
    where: { institutionId: site.institutionId, isActive: true },
    select: { amount: true, frequency: true, class: { select: { name: true, level: true } }, feeCategory: { select: { name: true } } },
    orderBy: [{ class: { level: 'asc' } }],
    take: 500,
  });
  const byClass = new Map<string, { category: string; amount: number; frequency: string }[]>();
  for (const r of rows) {
    const key = r.class?.name ?? 'All classes';
    byClass.set(key, [...(byClass.get(key) ?? []), { category: r.feeCategory.name, amount: Number(r.amount), frequency: r.frequency }]);
  }
  return { items: [...byClass.entries()].map(([className, feeItems]) => ({ className, items: feeItems })) };
}

// ── Holidays (B3) ────────────────────────────────────────────────────────────

export async function holidays(siteId: string, year: number | undefined, preview?: string) {
  const { site } = await visibleSite(siteId, preview);
  const y = year ?? new Date().getUTCFullYear();
  const from = new Date(Date.UTC(y, 0, 1));
  const to = new Date(Date.UTC(y, 11, 31, 23, 59, 59));
  const items = await prisma.holiday.findMany({
    where: { institutionId: site.institutionId, deletedAt: null, date: { gte: from, lte: to } },
    select: { date: true, title: true, type: true, isTentative: true },
    orderBy: { date: 'asc' },
    take: 400,
  });
  return { year: y, items };
}

// ── Library (B3, opt-in) ─────────────────────────────────────────────────────

export async function library(siteId: string, q: PaginationDtoType & { q?: string }, preview?: string) {
  const { site } = await visibleSite(siteId, preview);
  if (!flag(settingsOf(site.settings), 'publicLibrary')) throw new ForbiddenError('This school has not published its library catalogue');
  const where: Prisma.LibraryBookWhereInput = {
    institutionId: site.institutionId,
    ...(q.q ? { OR: [{ title: { contains: q.q, mode: 'insensitive' } }, { author: { contains: q.q, mode: 'insensitive' } }] } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.libraryBook.findMany({
      where,
      select: { title: true, author: true, category: true, publisher: true, availableCopies: true },
      orderBy: { title: 'asc' },
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
    }),
    prisma.libraryBook.count({ where }),
  ]);
  return { items: items.map((b) => ({ ...b, available: b.availableCopies > 0 })), total };
}

// ── Transport (B3, opt-in — no driver info) ─────────────────────────────────

export async function transport(siteId: string, preview?: string) {
  const { site } = await visibleSite(siteId, preview);
  if (!flag(settingsOf(site.settings), 'publicTransport')) throw new ForbiddenError('This school has not published its transport routes');
  const routes = await prisma.transportRoute.findMany({
    where: { institutionId: site.institutionId, isActive: true },
    select: {
      id: true,
      name: true,
      routeFare: true,
      stopPoints: { select: { name: true, sequence: true, pickupTime: true, dropTime: true }, orderBy: { sequence: 'asc' } },
    },
    orderBy: { name: 'asc' },
  });
  return { items: routes.map((r) => ({ id: r.id, name: r.name, fare: Number(r.routeFare), stops: r.stopPoints })) };
}

// ── Branches (B3) ────────────────────────────────────────────────────────────

export async function branches(siteId: string, preview?: string) {
  const { site } = await visibleSite(siteId, preview);
  const items = await prisma.branch.findMany({
    where: { institutionId: site.institutionId, isActive: true },
    select: { id: true, name: true, address: true, phone: true, email: true },
    orderBy: { name: 'asc' },
  });
  return { items };
}

// ── Committee (B3) ───────────────────────────────────────────────────────────

export async function committee(siteId: string, preview?: string) {
  const { site } = await visibleSite(siteId, preview);
  const rows = await prisma.siteCommitteeMember.findMany({
    where: { siteId: site.id, institutionId: site.institutionId },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
  });
  return { items: rows.map(toPublicCommitteeMember) };
}

// ── Albums (B3/B4) ───────────────────────────────────────────────────────────

export async function albums(siteId: string, q: PaginationDtoType, preview?: string) {
  const { site, preview: isPreview } = await visibleSite(siteId, preview);
  const where: Prisma.SiteAlbumWhereInput = { siteId: site.id, institutionId: site.institutionId, ...(isPreview ? {} : { status: 'PUBLISHED' }) };
  const [items, total] = await Promise.all([
    prisma.siteAlbum.findMany({
      where,
      select: { id: true, title: true, titleBn: true, coverUrl: true, eventDate: true, _count: { select: { photos: true } } },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
    }),
    prisma.siteAlbum.count({ where }),
  ]);
  return { items: items.map(({ _count, ...a }) => ({ ...a, photoCount: _count.photos })), total, preview: isPreview };
}

export async function albumDetail(siteId: string, id: string, preview?: string) {
  const { site, preview: isPreview } = await visibleSite(siteId, preview);
  const album = await prisma.siteAlbum.findFirst({
    where: { id, siteId: site.id, institutionId: site.institutionId, ...(isPreview ? {} : { status: 'PUBLISHED' }) },
    include: { photos: { orderBy: { sortOrder: 'asc' } } },
  });
  if (!album) throw new NotFoundError('Album not found');
  return {
    album: {
      id: album.id,
      title: album.title,
      titleBn: album.titleBn,
      coverUrl: album.coverUrl,
      description: album.description,
      eventDate: album.eventDate,
      photos: album.photos.map((p) => ({ url: p.url, caption: p.caption })),
    },
    seo: { title: album.title, description: plainTextExcerpt(album.description, 160), image: album.coverUrl ?? album.photos[0]?.url ?? null },
    preview: isPreview,
  };
}

// ── Downloads (B3) ───────────────────────────────────────────────────────────

export async function downloads(siteId: string, category: string | undefined, preview?: string) {
  const { site, preview: isPreview } = await visibleSite(siteId, preview);
  const where: Prisma.SiteDownloadWhereInput = {
    siteId: site.id,
    institutionId: site.institutionId,
    ...(isPreview ? {} : { status: 'PUBLISHED' }),
    ...(category ? { category } : {}),
  };
  const items = await prisma.siteDownload.findMany({
    where,
    select: { id: true, title: true, titleBn: true, category: true, fileUrl: true, publishedAt: true },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
    take: 200,
  });
  return { items };
}

// ── Admission circulars (B3/B4) ──────────────────────────────────────────────

function withComputed<T extends { fee: Prisma.Decimal | null; endDate: Date | null }>(a: T) {
  return { ...a, fee: a.fee != null ? Number(a.fee) : null, closed: a.endDate ? a.endDate.getTime() < Date.now() : false };
}

export async function admissions(siteId: string, q: PaginationDtoType, preview?: string) {
  const { site, preview: isPreview } = await visibleSite(siteId, preview);
  const where: Prisma.SiteAdmissionCircularWhereInput = {
    siteId: site.id,
    institutionId: site.institutionId,
    ...(isPreview ? {} : { status: 'PUBLISHED' }),
  };
  const [items, total] = await Promise.all([
    prisma.siteAdmissionCircular.findMany({
      where,
      select: {
        id: true, session: true, classNames: true, title: true, titleBn: true,
        startDate: true, endDate: true, fee: true, pdfUrl: true, applyUrl: true, formId: true,
      },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
    }),
    prisma.siteAdmissionCircular.count({ where }),
  ]);
  return { items: items.map(withComputed), total, preview: isPreview };
}

export async function admissionDetail(siteId: string, id: string, preview?: string) {
  const { site, preview: isPreview } = await visibleSite(siteId, preview);
  const a = await prisma.siteAdmissionCircular.findFirst({
    where: { id, siteId: site.id, institutionId: site.institutionId, ...(isPreview ? {} : { status: 'PUBLISHED' }) },
  });
  if (!a) throw new NotFoundError('Admission circular not found');
  return {
    admission: withComputed(a),
    seo: { title: a.title, description: plainTextExcerpt(a.body, 160), image: a.pdfUrl ?? null },
    preview: isPreview,
  };
}

// ── Notice detail (B4) ───────────────────────────────────────────────────────

export async function noticeDetail(siteId: string, id: string, preview?: string) {
  const { site } = await visibleSite(siteId, preview);
  const now = new Date();
  const notice = await prisma.notice.findFirst({
    where: {
      id,
      institutionId: site.institutionId,
      isActive: true,
      audience: { in: ['ALL', 'PUBLIC'] },
      classId: null,
      sectionId: null,
      publishedAt: { lte: now },
      OR: [{ scheduledAt: null }, { scheduledAt: { lte: now } }],
    },
    select: { id: true, title: true, content: true, publishedAt: true },
  });
  if (!notice) throw new NotFoundError('Notice not found');
  return { notice, seo: { title: notice.title, description: plainTextExcerpt(notice.content, 160), image: null } };
}
