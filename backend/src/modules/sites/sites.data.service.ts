// =============================================================================
// Sites — live school-data endpoints for public website blocks.
//
// Public-safe fields only: no phones, addresses or student IDs of
// individuals. Toppers need settings.showToppers; the results lookup needs
// settings.publicResults and returns one student's marksheet only when the
// caller knows the exam, the roll/student ID AND the date of birth.
// =============================================================================

import { prisma } from '../../config/prisma';
import { ForbiddenError, NotFoundError, ValidationError } from '../../utils/AppError';
import { computeGrade } from '../../utils/grading';
import { summarizeMarks } from '../grading/grading.core';
import { getDefaultBands } from '../grading/grading.resolver';
import { listGatewayModes } from '../fees/online/onlinePayment.service';
import { dobMatches, maskName, readGates } from './sites.logic';
import { frontendBase } from './sites.config';
import { visibleSite } from './sites.public.service';
import type { ResultsLookupDtoType } from './sites.dto';

const DAY_MS = 24 * 60 * 60 * 1000;

function parseDay(s: string | undefined, fallback: Date): Date {
  if (!s) return fallback;
  const d = new Date(`${s}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? fallback : d;
}

export async function notices(siteId: string, q: { limit: number; preview?: string }) {
  const { site } = await visibleSite(siteId, q.preview);
  const now = new Date();
  const items = await prisma.notice.findMany({
    where: {
      institutionId: site.institutionId,
      isActive: true,
      audience: { in: ['ALL', 'PUBLIC'] },
      classId: null,
      sectionId: null,
      publishedAt: { lte: now },
      OR: [{ scheduledAt: null }, { scheduledAt: { lte: now } }],
    },
    select: { id: true, title: true, content: true, publishedAt: true },
    orderBy: { publishedAt: 'desc' },
    take: q.limit,
  });
  return { items };
}

export async function events(siteId: string, q: { from?: string; to?: string; preview?: string }) {
  const { site } = await visibleSite(siteId, q.preview);
  const today = new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00.000Z');
  const from = parseDay(q.from, today);
  let to = parseDay(q.to, new Date(from.getTime() + 90 * DAY_MS));
  if (to < from) throw new ValidationError('"to" must be on or after "from"');
  if (to.getTime() - from.getTime() > 366 * DAY_MS) to = new Date(from.getTime() + 366 * DAY_MS);

  const [eventRows, holidays] = await Promise.all([
    prisma.event.findMany({
      where: {
        institutionId: site.institutionId,
        startDate: { lte: to },
        endDate: { gte: from },
        // Community-facing events only; staff-only meetings stay private.
        audience: { hasSome: ['STUDENTS', 'GUARDIANS'] },
      },
      select: {
        id: true, title: true, description: true, category: true, type: true, startDate: true, endDate: true,
        startTime: true, endTime: true, venue: true, imageUrl: true,
      },
      orderBy: { startDate: 'asc' },
      take: 200,
    }),
    prisma.holiday.findMany({
      where: { institutionId: site.institutionId, deletedAt: null, date: { gte: from, lte: to }, type: { not: 'WEEKLY' } },
      select: { id: true, date: true, title: true, type: true, isTentative: true },
      orderBy: { date: 'asc' },
      take: 200,
    }),
  ]);
  return { from, to, events: eventRows, holidays };
}

export async function teachers(siteId: string, preview?: string) {
  const { site } = await visibleSite(siteId, preview);
  const users = await prisma.user.findMany({
    // Website v3 / owner decision 3: hidden until each teacher opts in
    // (Website > Staff visibility). Behaviour change — this directory was
    // previously every active TEACHER unconditionally.
    where: { institutionId: site.institutionId, role: 'TEACHER', isActive: true, status: 'ACTIVE', showOnWebsite: true },
    select: {
      firstName: true,
      lastName: true,
      avatarUrl: true,
      teacherProfile: { select: { subjectExpertise: true, qualification: true } },
      staffProfile: { select: { designation: true, department: true } },
    },
    orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
    take: 300,
  });
  return {
    items: users.map((u) => ({
      name: `${u.firstName} ${u.lastName}`.trim(),
      subject: u.teacherProfile?.subjectExpertise ?? null,
      qualification: u.teacherProfile?.qualification ?? null,
      designation: u.staffProfile?.designation ?? null,
      department: u.staffProfile?.department ?? null,
      photoUrl: u.avatarUrl ?? null,
    })),
  };
}

/** Finished, active exams — the choices for the results/toppers blocks. */
export async function exams(siteId: string, preview?: string) {
  const { site } = await visibleSite(siteId, preview);
  const gates = readGates(site.settings);
  if (!gates.publicResults && !gates.showToppers) return { items: [] };
  const items = await prisma.exam.findMany({
    where: { institutionId: site.institutionId, isActive: true, endDate: { lte: new Date() } },
    select: { id: true, name: true, startDate: true, endDate: true },
    orderBy: { endDate: 'desc' },
    take: 30,
  });
  return { items };
}

/** Exported for sites.portal.public.service.ts (result-summary, results-archive). */
export async function publicExam(institutionId: string, examId?: string) {
  const where = { institutionId, isActive: true, endDate: { lte: new Date() } };
  const exam = examId
    ? await prisma.exam.findFirst({ where: { ...where, id: examId }, select: { id: true, name: true } })
    : await prisma.exam.findFirst({ where: { ...where, results: { some: {} } }, select: { id: true, name: true }, orderBy: { endDate: 'desc' } });
  return exam;
}

export async function toppers(siteId: string, q: { examId?: string; limit: number; preview?: string }) {
  const { site } = await visibleSite(siteId, q.preview);
  if (!readGates(site.settings).showToppers) throw new ForbiddenError('This school has not enabled the toppers list');
  const exam = await publicExam(site.institutionId, q.examId);
  if (!exam) return { exam: null, items: [] };

  const [rows, bands] = await Promise.all([
    prisma.examResult.findMany({
      // W7: a student appears in the toppers list only with guardian consent (publicConsent).
      where: { institutionId: site.institutionId, examId: exam.id, student: { status: 'ACTIVE', publicConsent: true } },
      select: {
        studentId: true,
        subject: true,
        marksObtained: true,
        maxMarks: true,
        student: { select: { firstName: true, lastName: true, class: { select: { name: true } } } },
      },
    }),
    getDefaultBands(site.institutionId),
  ]);

  const byStudent = new Map<string, { name: string; className: string | null; marks: { subject: string; marksObtained: number; maxMarks: number }[] }>();
  for (const r of rows) {
    let entry = byStudent.get(r.studentId);
    if (!entry) {
      entry = { name: maskName(r.student.firstName, r.student.lastName), className: r.student.class?.name ?? null, marks: [] };
      byStudent.set(r.studentId, entry);
    }
    entry.marks.push({ subject: r.subject, marksObtained: Number(r.marksObtained), maxMarks: Number(r.maxMarks) });
  }

  const ranked = [...byStudent.values()]
    .map((s) => ({ ...s, summary: summarizeMarks(s.marks, bands) }))
    .filter((s) => s.summary.passed)
    .sort((a, b) => b.summary.gpa - a.summary.gpa || b.summary.percent - a.summary.percent)
    .slice(0, q.limit);

  return {
    exam,
    items: ranked.map((s, i) => ({
      rank: i + 1,
      name: s.name,
      className: s.className,
      gpa: s.summary.gpa,
      grade: s.summary.grade,
    })),
  };
}

const NO_RESULT = 'No result found for those details';

export async function resultsLookup(siteId: string, body: ResultsLookupDtoType, preview?: string) {
  const { site } = await visibleSite(siteId, preview);
  if (!readGates(site.settings).publicResults) throw new ForbiddenError('This school has not enabled online results');
  if (body.website) throw new NotFoundError(NO_RESULT);

  const exam = await publicExam(site.institutionId, body.examId);
  if (!exam) throw new NotFoundError(NO_RESULT);

  const candidates = await prisma.student.findMany({
    where: {
      institutionId: site.institutionId,
      dateOfBirth: { not: null },
      ...(body.studentId ? { studentId: body.studentId } : { rollNumber: body.roll }),
      ...(body.classId ? { classId: body.classId } : {}),
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      rollNumber: true,
      dateOfBirth: true,
      class: { select: { name: true } },
      section: { select: { name: true } },
    },
    take: 50,
  });
  const matches = candidates.filter((s) => s.dateOfBirth && dobMatches(s.dateOfBirth, body.dob));
  if (matches.length === 0) throw new NotFoundError(NO_RESULT);
  if (matches.length > 1) throw new ValidationError('More than one student matches. Enter the student ID, or choose the class.');
  const student = matches[0];

  const [results, bands] = await Promise.all([
    prisma.examResult.findMany({
      where: { institutionId: site.institutionId, examId: exam.id, studentId: student.id },
      select: { subject: true, marksObtained: true, maxMarks: true, grade: true },
      orderBy: { subject: 'asc' },
    }),
    getDefaultBands(site.institutionId),
  ]);
  if (results.length === 0) throw new NotFoundError(NO_RESULT);

  const subjects = results.map((r) => {
    const marks = Number(r.marksObtained);
    const max = Number(r.maxMarks);
    return { subject: r.subject, marksObtained: marks, maxMarks: max, grade: r.grade || computeGrade(marks, max) };
  });
  return {
    exam,
    student: {
      name: `${student.firstName} ${student.lastName}`.trim(),
      className: student.class?.name ?? null,
      sectionName: student.section?.name ?? null,
      rollNumber: student.rollNumber,
    },
    subjects,
    summary: summarizeMarks(subjects, bands),
  };
}

export async function routine(siteId: string, q: { class?: string; section?: string; preview?: string }) {
  const { site } = await visibleSite(siteId, q.preview);
  if (!q.class) {
    const groups = await prisma.timetableSlot.groupBy({
      by: ['className', 'sectionName'],
      where: { institutionId: site.institutionId },
      orderBy: [{ className: 'asc' }, { sectionName: 'asc' }],
    });
    const classes = new Map<string, string[]>();
    for (const g of groups) classes.set(g.className, [...(classes.get(g.className) ?? []), g.sectionName]);
    return { classes: [...classes.entries()].map(([className, sections]) => ({ className, sections })), slots: [] };
  }
  const slots = await prisma.timetableSlot.findMany({
    where: { institutionId: site.institutionId, className: q.class, ...(q.section ? { sectionName: q.section } : {}) },
    select: {
      dayOfWeek: true, startTime: true, endTime: true, className: true, sectionName: true, subject: true, roomNumber: true,
      teacher: { select: { user: { select: { firstName: true, lastName: true, institutionId: true, showOnWebsite: true, isActive: true, status: true } } } },
    },
    orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
    take: 500,
  });
  return {
    classes: [],
    slots: slots.map(({ teacher, ...s }) => ({
      ...s,
      // W7: the teacher's name is public only if that teacher opted in (showOnWebsite).
      teacherName:
        teacher && teacher.user.showOnWebsite && teacher.user.isActive && teacher.user.status === 'ACTIVE' && teacher.user.institutionId === site.institutionId
          ? `${teacher.user.firstName} ${teacher.user.lastName}`.trim()
          : null,
    })),
  };
}

export async function stats(siteId: string, preview?: string) {
  const { site } = await visibleSite(siteId, preview);
  const id = site.institutionId;
  const [students, teacherCount, classes] = await Promise.all([
    prisma.student.count({ where: { institutionId: id, status: 'ACTIVE' } }),
    prisma.user.count({ where: { institutionId: id, role: 'TEACHER', isActive: true } }),
    prisma.class.count({ where: { branch: { institutionId: id } } }),
  ]);
  const { establishedYear } = readGates(site.settings);
  return {
    students,
    teachers: teacherCount,
    classes,
    establishedYear,
    yearsEstablished: establishedYear ? new Date().getFullYear() - establishedYear : null,
  };
}

export async function feesLink(siteId: string, preview?: string) {
  await visibleSite(siteId, preview);
  const modes = listGatewayModes();
  const available = modes.filter((m) => m.available);
  return {
    enabled: available.length > 0,
    demo: available.length > 0 && !available.some((m) => m.live),
    gateways: available.map((m) => ({ gateway: m.gateway, label: m.label, live: m.live })),
    portalUrl: `${frontendBase()}/login`,
    payUrl: `${frontendBase()}/fees`,
  };
}

export async function courses(siteId: string, q: { limit: number; preview?: string }) {
  const { site } = await visibleSite(siteId, q.preview);
  const settings = (site.settings && typeof site.settings === 'object' ? site.settings : {}) as Record<string, unknown>;
  const coursesSettings = (settings.courses && typeof settings.courses === 'object' ? settings.courses : {}) as Record<string, unknown>;
  if (coursesSettings.enabled !== true) return { items: [] as unknown[], comingSoon: true };

  const items = await prisma.siteCourse.findMany({
    where: { siteId: site.id, institutionId: site.institutionId, status: 'PUBLISHED' },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
    take: q.limit,
  });
  const ids = items.map((c) => c.id);
  const agg = ids.length
    ? await prisma.siteCourseLesson.groupBy({ by: ['courseId'], where: { courseId: { in: ids } }, _count: { _all: true }, _sum: { durationMin: true } })
    : [];
  const byId = new Map(agg.map((a) => [a.courseId, { count: a._count._all, minutes: a._sum.durationMin ?? 0 }]));
  return {
    items: items.map((c) => ({
      id: c.id,
      slug: c.slug,
      title: c.title,
      titleBn: c.titleBn,
      summary: c.summary,
      coverUrl: c.coverUrl,
      price: Number(c.price),
      currency: 'BDT',
      level: c.level,
      category: c.category,
      instructorName: c.instructorName,
      durationText: c.durationText,
      lessonCount: byId.get(c.id)?.count ?? 0,
      totalMinutes: byId.get(c.id)?.minutes ?? 0,
    })),
    comingSoon: false,
  };
}
