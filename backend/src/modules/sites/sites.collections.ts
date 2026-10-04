// =============================================================================
// Website collections — the declarative, whitelisted registry (W1/W5/W7/W9).
//
// Every collection declares its public fields, filter/sort/search rules and
// relations, and ships its OWN adapter (list / get / include) with explicit
// Prisma `select` lists and tenant scoping (institutionId, plus siteId for
// site-owned content; Class has no institutionId so it is scoped through
// branch.institutionId). Query-string input never reaches Prisma as a key:
// sites.collections.logic compiles validated values onto server-defined
// column paths, and the adapter ANDs that with its mandatory scope.
//
// There is deliberately NO collection for students, guardians or form
// submissions. Student data only appears as suppressed aggregates (class
// gender counts, exam result summaries).
// =============================================================================

import { EventCategory, EventType, HolidayType, Prisma, SiteProductKind, UserRole } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { summarizeMarks } from '../grading/grading.core';
import { getDefaultBands } from '../grading/grading.resolver';
import { STAFF_ROLES } from '../saas/entitlements.service';
import { readGates } from './sites.logic';
import {
  compileAll,
  makePublicSlug,
  suppressClassCounts,
  suppressClassSummary,
  type FieldDef,
  type FieldType,
  type Op,
  type ParsedQuery,
  type QueryShape,
  type RelationDef,
} from './sites.collections.logic';
import {
  plainTextExcerpt,
  summarizeClassResults,
  summarizeGenderCounts,
  toPublicCommitteeMember,
  type StudentExamOutcome,
} from './sites.portal.logic';

// ── Types ───────────────────────────────────────────────────────────────────

export type Item = Record<string, unknown>;

export interface CollectionCtx {
  siteId: string;
  institutionId: string;
  preview: boolean;
  settings: Record<string, unknown>;
}

/** An item plus the internal ids the include step needs (never serialised). */
export interface Row {
  item: Item;
  ref: Record<string, string | null>;
}

export interface CollectionDef extends QueryShape {
  label: string;
  labelPlural: string;
  titleField: string;
  slugSource: 'publicSlug' | 'slug' | 'id';
  /** Public URL prefix for profile pages; null = no template pages. */
  routeBase: string | null;
  /** "name", "-publishedAt" or "manual". */
  defaultSort: string;
  seo: { description?: string; image?: string };
  /** Null when available, otherwise why the school has not switched it on. */
  unavailableReason(ctx: CollectionCtx): string | null;
  list(ctx: CollectionCtx, q: ParsedQuery): Promise<{ rows: Row[]; total: number }>;
  get(ctx: CollectionCtx, slug: string): Promise<Row | null>;
  include(ctx: CollectionCtx, rows: Row[], rels: string[]): Promise<void>;
}

// ── Small helpers ───────────────────────────────────────────────────────────

const fld = (key: string, label: string, type: FieldType, extra: Partial<FieldDef> = {}): FieldDef => ({ key, label, type, ...extra });
const rel = (key: string, label: string, collection: string | null, many = true): RelationDef => ({ key, label, collection, many });

const TEXT_OPS: Op[] = ['eq', 'in', 'contains'];
const CMP_OPS: Op[] = ['gt', 'gte', 'lt', 'lte'];
const available = () => null;

const skipTake = (q: ParsedQuery) => ({ skip: (q.page - 1) * q.pageSize, take: q.pageSize });
const num = (d: Prisma.Decimal | number | null | undefined) => (d == null ? null : Number(d));
const fullName = (u: { firstName: string; lastName: string }) => `${u.firstName} ${u.lastName}`.trim();
const settingsFlag = (settings: Record<string, unknown>, key: string): Record<string, unknown> => {
  const v = settings[key];
  return v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
};
const publishedOnly = (ctx: CollectionCtx) => (ctx.preview ? {} : { status: 'PUBLISHED' as const });

function orderOf(compiled: { orderBy: Record<string, unknown>[] }, fallback: Record<string, unknown>[]) {
  return [...(compiled.orderBy.length ? compiled.orderBy : fallback), { id: 'asc' }];
}

/** Drops detailOnly fields from a list item. */
function stripDetail(fields: FieldDef[], item: Item, detail: boolean): Item {
  if (detail) return item;
  const out = { ...item };
  for (const f of fields) if (f.detailOnly) delete out[f.key];
  return out;
}

// ── Public slug backfill (users and classes) ────────────────────────────────

const isUniqueViolation = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';

/** Gives every listed user without a publicSlug one. Returns id -> slug for all of them. */
export async function ensureUserSlugs(
  institutionId: string,
  users: { id: string; firstName: string; lastName: string; publicSlug: string | null }[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  for (const u of users) {
    if (u.publicSlug) {
      out.set(u.id, u.publicSlug);
      continue;
    }
    for (let attempt = 0; attempt < 5 && !out.has(u.id); attempt++) {
      const slug = makePublicSlug(fullName(u), 'staff');
      try {
        const r = await prisma.user.updateMany({ where: { id: u.id, institutionId, publicSlug: null }, data: { publicSlug: slug } });
        if (r.count === 1) out.set(u.id, slug);
        else {
          // Someone else generated it first.
          const cur = await prisma.user.findFirst({ where: { id: u.id, institutionId }, select: { publicSlug: true } });
          if (cur?.publicSlug) out.set(u.id, cur.publicSlug);
          else break;
        }
      } catch (e) {
        if (!isUniqueViolation(e)) throw e;
      }
    }
  }
  return out;
}

export async function ensureClassSlugs(
  institutionId: string,
  classes: { id: string; name: string; publicSlug: string | null }[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  for (const c of classes) {
    if (c.publicSlug) {
      out.set(c.id, c.publicSlug);
      continue;
    }
    for (let attempt = 0; attempt < 5 && !out.has(c.id); attempt++) {
      const slug = makePublicSlug(c.name, 'class');
      try {
        const r = await prisma.class.updateMany({ where: { id: c.id, branch: { institutionId }, publicSlug: null }, data: { publicSlug: slug } });
        if (r.count === 1) out.set(c.id, slug);
        else {
          const cur = await prisma.class.findFirst({ where: { id: c.id, branch: { institutionId } }, select: { publicSlug: true } });
          if (cur?.publicSlug) out.set(c.id, cur.publicSlug);
          else break;
        }
      } catch (e) {
        if (!isUniqueViolation(e)) throw e;
      }
    }
  }
  return out;
}

// ── Shared card builders ────────────────────────────────────────────────────

const TEACHER_SRC = {
  id: true,
  subjectExpertise: true,
  user: {
    select: {
      id: true,
      institutionId: true,
      publicSlug: true,
      firstName: true,
      lastName: true,
      avatarUrl: true,
      isActive: true,
      status: true,
      showOnWebsite: true,
      staffProfile: { select: { designation: true } },
    },
  },
} satisfies Prisma.TeacherSelect;
type TeacherSrc = Prisma.TeacherGetPayload<{ select: typeof TEACHER_SRC }>;

export interface TeacherCard {
  slug: string;
  name: string;
  photoUrl: string | null;
  designation: string | null;
  subject: string | null;
}

/** Cards ONLY for teachers who opted in (showOnWebsite) and are active in this institution. */
async function teacherCards(institutionId: string, teachers: (TeacherSrc | null | undefined)[]): Promise<Map<string, TeacherCard>> {
  const visible = new Map<string, TeacherSrc>();
  for (const t of teachers) {
    if (!t) continue;
    const u = t.user;
    if (u.showOnWebsite && u.isActive && u.status === 'ACTIVE' && u.institutionId === institutionId) visible.set(t.id, t);
  }
  const slugs = await ensureUserSlugs(
    institutionId,
    [...visible.values()].map((t) => t.user),
  );
  const out = new Map<string, TeacherCard>();
  for (const t of visible.values()) {
    const slug = slugs.get(t.user.id);
    if (!slug) continue;
    out.set(t.id, {
      slug,
      name: fullName(t.user),
      photoUrl: t.user.avatarUrl ?? null,
      designation: t.user.staffProfile?.designation ?? null,
      subject: t.subjectExpertise ?? null,
    });
  }
  return out;
}

export interface ClassCard {
  slug: string;
  name: string;
  level: number;
}

async function classCardsByName(institutionId: string, names: string[]): Promise<Map<string, ClassCard[]>> {
  const out = new Map<string, ClassCard[]>();
  if (!names.length) return out;
  const rows = await prisma.class.findMany({
    where: { branch: { institutionId }, name: { in: names } },
    select: { id: true, name: true, level: true, publicSlug: true },
    orderBy: [{ level: 'asc' }, { id: 'asc' }],
    take: 500,
  });
  const slugs = await ensureClassSlugs(institutionId, rows);
  for (const r of rows) {
    const slug = slugs.get(r.id);
    if (!slug) continue;
    out.set(r.name, [...(out.get(r.name) ?? []), { slug, name: r.name, level: r.level }]);
  }
  return out;
}

async function subjectCardsByName(institutionId: string, names: string[]): Promise<Map<string, { slug: string; name: string }>> {
  const out = new Map<string, { slug: string; name: string }>();
  if (!names.length) return out;
  const rows = await prisma.subject.findMany({
    where: { institutionId, name: { in: names } },
    select: { id: true, name: true },
    take: 500,
  });
  for (const r of rows) out.set(r.name, { slug: r.id, name: r.name });
  return out;
}

const uniqBy = <T,>(items: T[], key: (t: T) => string): T[] => [...new Map(items.map((i) => [key(i), i])).values()];

// ── teachers / staff ────────────────────────────────────────────────────────

const USER_SELECT = {
  id: true,
  publicSlug: true,
  firstName: true,
  lastName: true,
  avatarUrl: true,
  teacherProfile: { select: { id: true, subjectExpertise: true, qualification: true } },
  staffProfile: { select: { designation: true, department: true } },
} satisfies Prisma.UserSelect;
type UserRow = Prisma.UserGetPayload<{ select: typeof USER_SELECT }>;

const PERSON_FIELDS: FieldDef[] = [
  fld('name', 'Name', 'text', { filter: ['contains'], sortable: true, searchable: true, searchCols: ['firstName', 'lastName'], sortCols: ['firstName', 'lastName'] }),
  fld('photoUrl', 'Photo', 'image'),
  fld('designation', 'Designation', 'text', { filter: TEXT_OPS, sortable: true, searchable: true, col: 'staffProfile.designation' }),
  fld('department', 'Department', 'text', { filter: TEXT_OPS, sortable: true, col: 'staffProfile.department' }),
  fld('subject', 'Subject', 'text', { filter: ['eq', 'contains'], sortable: true, searchable: true, col: 'teacherProfile.subjectExpertise' }),
  fld('qualification', 'Qualification', 'text', { filter: ['contains'], sortable: true, col: 'teacherProfile.qualification' }),
  fld('classNames', 'Classes taught (class teacher of)', 'list'),
];

function userCollection(opts: {
  key: 'teachers' | 'staff';
  label: string;
  labelPlural: string;
  roles: UserRole[];
  routeBase: string;
  relations: RelationDef[];
}): CollectionDef {
  const scope = (ctx: CollectionCtx): Prisma.UserWhereInput => ({
    institutionId: ctx.institutionId,
    role: { in: opts.roles },
    isActive: true,
    status: 'ACTIVE',
    showOnWebsite: true, // owner decision 3: public only after opt-in
  });
  const defaultOrder = [{ firstName: 'asc' }, { lastName: 'asc' }];

  async function toRows(ctx: CollectionCtx, users: UserRow[]): Promise<Row[]> {
    const slugs = await ensureUserSlugs(ctx.institutionId, users);
    const teacherIds = users.map((u) => u.teacherProfile?.id).filter((id): id is string => Boolean(id));
    const sections = teacherIds.length
      ? await prisma.section.findMany({
          where: { classTeacherId: { in: teacherIds }, class: { branch: { institutionId: ctx.institutionId } } },
          select: { classTeacherId: true, name: true, class: { select: { name: true } } },
          take: 2000,
        })
      : [];
    const classNamesOf = new Map<string, string[]>();
    for (const s of sections) classNamesOf.set(s.classTeacherId as string, [...(classNamesOf.get(s.classTeacherId as string) ?? []), `${s.class.name} ${s.name}`]);
    return users.map((u) => ({
      item: {
        slug: slugs.get(u.id) ?? null,
        name: fullName(u),
        photoUrl: u.avatarUrl ?? null,
        designation: u.staffProfile?.designation ?? null,
        department: u.staffProfile?.department ?? null,
        subject: u.teacherProfile?.subjectExpertise ?? null,
        qualification: u.teacherProfile?.qualification ?? null,
        classNames: u.teacherProfile ? classNamesOf.get(u.teacherProfile.id) ?? [] : [],
      },
      ref: { userId: u.id, teacherId: u.teacherProfile?.id ?? null },
    }));
  }

  const def: CollectionDef = {
    key: opts.key,
    label: opts.label,
    labelPlural: opts.labelPlural,
    titleField: 'name',
    slugSource: 'publicSlug',
    routeBase: opts.routeBase,
    defaultSort: 'name',
    seo: { image: 'photoUrl', description: 'qualification' },
    fields: PERSON_FIELDS,
    relations: opts.relations,
    unavailableReason: available,

    async list(ctx, q) {
      const c = compileAll(def, q);
      const where = { AND: [scope(ctx), ...c.where] } as Prisma.UserWhereInput;
      const [users, total] = await Promise.all([
        prisma.user.findMany({ where, select: USER_SELECT, orderBy: orderOf(c, defaultOrder) as Prisma.UserOrderByWithRelationInput[], ...skipTake(q) }),
        prisma.user.count({ where }),
      ]);
      return { rows: await toRows(ctx, users), total };
    },

    async get(ctx, slug) {
      const user = await prisma.user.findFirst({ where: { AND: [scope(ctx), { publicSlug: slug }] }, select: USER_SELECT });
      return user ? (await toRows(ctx, [user]))[0] : null;
    },

    async include(ctx, rows, rels) {
      if (!rels.length) return;
      const teacherIds = rows.map((r) => r.ref.teacherId).filter((id): id is string => Boolean(id));
      const sections = teacherIds.length
        ? await prisma.section.findMany({
            where: { classTeacherId: { in: teacherIds }, class: { branch: { institutionId: ctx.institutionId } } },
            select: { classTeacherId: true, class: { select: { name: true } } },
            take: 2000,
          })
        : [];
      const slots = teacherIds.length
        ? await prisma.timetableSlot.findMany({
            where: { institutionId: ctx.institutionId, teacherId: { in: teacherIds } },
            select: { teacherId: true, className: true, subject: true },
            take: 5000,
          })
        : [];
      const classNamesOf = (tid: string) => [...new Set([...sections.filter((s) => s.classTeacherId === tid).map((s) => s.class.name), ...slots.filter((s) => s.teacherId === tid).map((s) => s.className)])];
      const subjectNamesOf = (tid: string) => [...new Set(slots.filter((s) => s.teacherId === tid).map((s) => s.subject))];

      const classes = rels.includes('classes') ? await classCardsByName(ctx.institutionId, [...new Set(teacherIds.flatMap(classNamesOf))]) : null;
      const subjects = rels.includes('subjects') ? await subjectCardsByName(ctx.institutionId, [...new Set(teacherIds.flatMap(subjectNamesOf))]) : null;

      for (const row of rows) {
        const tid = row.ref.teacherId;
        if (classes) row.item.classes = tid ? uniqBy(classNamesOf(tid).flatMap((n) => classes.get(n) ?? []), (c) => c.slug) : [];
        if (subjects) row.item.subjects = tid ? subjectNamesOf(tid).map((n) => subjects.get(n)).filter((s): s is { slug: string; name: string } => Boolean(s)) : [];
      }
    },
  };
  return def;
}

const teachers = userCollection({
  key: 'teachers',
  label: 'Teacher',
  labelPlural: 'Teachers',
  roles: [UserRole.TEACHER],
  routeBase: '/teachers',
  relations: [rel('classes', 'Classes', 'classes'), rel('subjects', 'Subjects', 'subjects')],
});

const staff = userCollection({
  key: 'staff',
  label: 'Staff member',
  labelPlural: 'Staff',
  roles: STAFF_ROLES.filter((r) => r !== UserRole.TEACHER),
  routeBase: '/staff',
  relations: [],
});

// ── committee ───────────────────────────────────────────────────────────────

const committee: CollectionDef = (() => {
  const fields = [
    fld('name', 'Name', 'text', { filter: ['contains'], sortable: true, searchable: true, col: 'name' }),
    fld('nameBn', 'Name (Bangla)', 'text'),
    fld('role', 'Role', 'text', { filter: ['eq', 'contains'], sortable: true, searchable: true, col: 'role' }),
    fld('roleBn', 'Role (Bangla)', 'text'),
    fld('photoUrl', 'Photo', 'image'),
    fld('phone', 'Phone (only if shown)', 'text'),
  ];
  const select = { id: true, name: true, nameBn: true, role: true, roleBn: true, photoUrl: true, phone: true, showPhone: true, sortOrder: true } satisfies Prisma.SiteCommitteeMemberSelect;
  const scope = (ctx: CollectionCtx) => ({ siteId: ctx.siteId, institutionId: ctx.institutionId });
  const map = (r: Prisma.SiteCommitteeMemberGetPayload<{ select: typeof select }>): Row => {
    const m = toPublicCommitteeMember(r);
    return { item: { slug: r.id, name: m.name, nameBn: m.nameBn, role: m.role, roleBn: m.roleBn, photoUrl: m.photoUrl, phone: m.phone }, ref: { id: r.id } };
  };
  const def: CollectionDef = {
    key: 'committee', label: 'Committee member', labelPlural: 'Managing committee', titleField: 'name', slugSource: 'id', routeBase: null, defaultSort: 'manual',
    seo: { image: 'photoUrl' }, fields, relations: [], unavailableReason: available,
    async list(ctx, q) {
      const c = compileAll(def, q);
      const where = { AND: [scope(ctx), ...c.where] } as Prisma.SiteCommitteeMemberWhereInput;
      const [rows, total] = await Promise.all([
        prisma.siteCommitteeMember.findMany({ where, select, orderBy: orderOf(c, [{ sortOrder: 'asc' }, { createdAt: 'asc' }]) as Prisma.SiteCommitteeMemberOrderByWithRelationInput[], ...skipTake(q) }),
        prisma.siteCommitteeMember.count({ where }),
      ]);
      return { rows: rows.map(map), total };
    },
    async get(ctx, slug) {
      const r = await prisma.siteCommitteeMember.findFirst({ where: { ...scope(ctx), id: slug }, select });
      return r ? map(r) : null;
    },
    async include() {},
  };
  return def;
})();

// ── classes ─────────────────────────────────────────────────────────────────

const classes: CollectionDef = (() => {
  const fields = [
    fld('name', 'Name', 'text', { filter: TEXT_OPS, sortable: true, searchable: true, col: 'name' }),
    fld('level', 'Level', 'number', { filter: ['eq', 'in', ...CMP_OPS], sortable: true, col: 'level' }),
    fld('medium', 'Medium', 'text', { filter: ['eq', 'in'], col: 'medium.name' }),
    fld('shift', 'Shift', 'text', { filter: ['eq', 'in'], col: 'shift.name' }),
    fld('sectionNames', 'Sections', 'list'),
    fld('studentCount', 'Students (hidden when small)', 'number'),
    fld('maleCount', 'Boys (hidden when small)', 'number'),
    fld('femaleCount', 'Girls (hidden when small)', 'number'),
    fld('otherCount', 'Other (hidden when small)', 'number'),
  ];
  const select = {
    id: true,
    publicSlug: true,
    name: true,
    level: true,
    medium: { select: { name: true } },
    shift: { select: { name: true } },
    sections: { select: { name: true }, orderBy: { name: 'asc' } },
  } satisfies Prisma.ClassSelect;
  type ClassRow = Prisma.ClassGetPayload<{ select: typeof select }>;
  const scope = (ctx: CollectionCtx): Prisma.ClassWhereInput => ({ branch: { institutionId: ctx.institutionId } });

  async function toRows(ctx: CollectionCtx, list: ClassRow[]): Promise<Row[]> {
    const slugs = await ensureClassSlugs(ctx.institutionId, list);
    const groups = list.length
      ? await prisma.student.groupBy({
          by: ['classId', 'gender'],
          where: { institutionId: ctx.institutionId, status: 'ACTIVE', classId: { in: list.map((c) => c.id) } },
          _count: { _all: true },
        })
      : [];
    const counts = summarizeGenderCounts(groups.map((g) => ({ key: g.classId as string, gender: g.gender, count: g._count._all })));
    return list.map((c) => ({
      item: {
        slug: slugs.get(c.id) ?? null,
        name: c.name,
        level: c.level,
        medium: c.medium?.name ?? null,
        shift: c.shift?.name ?? null,
        sectionNames: c.sections.map((s) => s.name),
        ...suppressClassCounts(counts[c.id] ?? { male: 0, female: 0, other: 0, total: 0 }),
      },
      ref: { id: c.id, name: c.name },
    }));
  }

  const def: CollectionDef = {
    key: 'classes', label: 'Class', labelPlural: 'Classes', titleField: 'name', slugSource: 'publicSlug', routeBase: '/classes', defaultSort: 'level',
    seo: {}, fields,
    relations: [
      rel('sections', 'Sections and class teachers', null),
      rel('subjects', 'Subjects', 'subjects'),
      rel('routine', 'Weekly routine', null),
      rel('classTeacher', 'Class teachers', 'teachers'),
      rel('teachers', 'Teachers', 'teachers'),
    ],
    unavailableReason: available,
    async list(ctx, q) {
      const c = compileAll(def, q);
      const where = { AND: [scope(ctx), ...c.where] } as Prisma.ClassWhereInput;
      const [list, total] = await Promise.all([
        prisma.class.findMany({ where, select, orderBy: orderOf(c, [{ level: 'asc' }, { name: 'asc' }]) as Prisma.ClassOrderByWithRelationInput[], ...skipTake(q) }),
        prisma.class.count({ where }),
      ]);
      return { rows: await toRows(ctx, list), total };
    },
    async get(ctx, slug) {
      const c = await prisma.class.findFirst({ where: { AND: [scope(ctx), { publicSlug: slug }] }, select });
      return c ? (await toRows(ctx, [c]))[0] : null;
    },
    async include(ctx, rows, rels) {
      if (!rels.length) return;
      const ids = rows.map((r) => r.ref.id as string);
      const names = [...new Set(rows.map((r) => r.ref.name as string))];

      const wantSections = rels.includes('sections') || rels.includes('classTeacher');
      const sections = wantSections
        ? await prisma.section.findMany({
            where: { classId: { in: ids }, class: { branch: { institutionId: ctx.institutionId } } },
            select: { classId: true, name: true, classTeacher: { select: TEACHER_SRC } },
            orderBy: [{ name: 'asc' }, { id: 'asc' }],
            take: 2000,
          })
        : [];
      const wantSlots = rels.includes('routine') || rels.includes('teachers');
      const slots = wantSlots
        ? await prisma.timetableSlot.findMany({
            where: { institutionId: ctx.institutionId, className: { in: names } },
            select: {
              dayOfWeek: true, startTime: true, endTime: true, className: true, sectionName: true, subject: true, roomNumber: true,
              teacher: { select: TEACHER_SRC },
            },
            orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }, { id: 'asc' }],
            take: 3000,
          })
        : [];
      const cards = await teacherCards(ctx.institutionId, [...sections.map((s) => s.classTeacher), ...slots.map((s) => s.teacher)]);
      const offerings = rels.includes('subjects')
        ? await prisma.subjectOffering.findMany({
            where: { institutionId: ctx.institutionId, className: { in: names } },
            select: { className: true, group: true, paper: true, subject: { select: { id: true, name: true } } },
            orderBy: [{ displayOrder: 'asc' }, { id: 'asc' }],
            take: 1500,
          })
        : [];

      for (const row of rows) {
        const id = row.ref.id as string;
        const name = row.ref.name as string;
        const mySections = sections.filter((s) => s.classId === id);
        const mySlots = slots.filter((s) => s.className === name);
        if (rels.includes('sections')) {
          row.item.sections = mySections.map((s) => ({ name: s.name, classTeacher: s.classTeacher ? cards.get(s.classTeacher.id) ?? null : null }));
        }
        if (rels.includes('classTeacher')) {
          row.item.classTeacher = uniqBy(
            mySections.map((s) => (s.classTeacher ? cards.get(s.classTeacher.id) : undefined)).filter((c): c is TeacherCard => Boolean(c)),
            (c) => c.slug,
          );
        }
        if (rels.includes('teachers')) {
          row.item.teachers = uniqBy(
            mySlots.map((s) => (s.teacher ? cards.get(s.teacher.id) : undefined)).filter((c): c is TeacherCard => Boolean(c)),
            (c) => c.slug,
          );
        }
        if (rels.includes('routine')) {
          row.item.routine = mySlots.map((s) => ({
            dayOfWeek: s.dayOfWeek,
            startTime: s.startTime,
            endTime: s.endTime,
            sectionName: s.sectionName,
            subject: s.subject,
            roomNumber: s.roomNumber ?? null,
            // W7: a teacher's name appears only if that teacher opted in.
            teacherName: s.teacher ? cards.get(s.teacher.id)?.name ?? null : null,
          }));
        }
        if (rels.includes('subjects')) {
          row.item.subjects = uniqBy(
            offerings.filter((o) => o.className === name).map((o) => ({ slug: o.subject.id, name: o.subject.name, group: o.group, paper: o.paper })),
            (o) => `${o.slug}:${o.group}:${o.paper}`,
          );
        }
      }
    },
  };
  return def;
})();

// ── subjects ────────────────────────────────────────────────────────────────

const subjects: CollectionDef = (() => {
  const fields = [
    fld('name', 'Name', 'text', { filter: ['eq', 'contains'], sortable: true, searchable: true, col: 'name' }),
    fld('classNames', 'Classes', 'list', { filter: ['has'], where: (_op, v) => ({ offerings: { some: { className: v } } }) }),
  ];
  const select = (institutionId: string) =>
    ({ id: true, name: true, offerings: { where: { institutionId }, select: { className: true }, take: 200 } }) satisfies Prisma.SubjectSelect;
  type SubjectRow = Prisma.SubjectGetPayload<{ select: ReturnType<typeof select> }>;
  const scope = (ctx: CollectionCtx) => ({ institutionId: ctx.institutionId });
  const map = (s: SubjectRow): Row => ({
    item: { slug: s.id, name: s.name, classNames: [...new Set(s.offerings.map((o) => o.className))] },
    ref: { id: s.id, name: s.name },
  });
  const def: CollectionDef = {
    key: 'subjects', label: 'Subject', labelPlural: 'Subjects', titleField: 'name', slugSource: 'id', routeBase: '/subjects', defaultSort: 'name',
    seo: {}, fields, relations: [rel('classes', 'Classes', 'classes'), rel('teachers', 'Teachers', 'teachers')], unavailableReason: available,
    async list(ctx, q) {
      const c = compileAll(def, q);
      const where = { AND: [scope(ctx), ...c.where] } as Prisma.SubjectWhereInput;
      const [list, total] = await Promise.all([
        prisma.subject.findMany({ where, select: select(ctx.institutionId), orderBy: orderOf(c, [{ name: 'asc' }]) as Prisma.SubjectOrderByWithRelationInput[], ...skipTake(q) }),
        prisma.subject.count({ where }),
      ]);
      return { rows: list.map(map), total };
    },
    async get(ctx, slug) {
      const s = await prisma.subject.findFirst({ where: { ...scope(ctx), id: slug }, select: select(ctx.institutionId) });
      return s ? map(s) : null;
    },
    async include(ctx, rows, rels) {
      if (!rels.length) return;
      if (rels.includes('classes')) {
        const classNames = [...new Set(rows.flatMap((r) => r.item.classNames as string[]))];
        const cards = await classCardsByName(ctx.institutionId, classNames);
        for (const row of rows) row.item.classes = uniqBy((row.item.classNames as string[]).flatMap((n) => cards.get(n) ?? []), (c) => c.slug);
      }
      if (rels.includes('teachers')) {
        const names = [...new Set(rows.map((r) => r.ref.name as string))];
        const slots = await prisma.timetableSlot.findMany({
          where: { institutionId: ctx.institutionId, subject: { in: names }, teacherId: { not: null } },
          select: { subject: true, teacher: { select: TEACHER_SRC } },
          take: 3000,
        });
        const cards = await teacherCards(ctx.institutionId, slots.map((s) => s.teacher));
        for (const row of rows) {
          row.item.teachers = uniqBy(
            slots.filter((s) => s.subject === row.ref.name).map((s) => (s.teacher ? cards.get(s.teacher.id) : undefined)).filter((c): c is TeacherCard => Boolean(c)),
            (c) => c.slug,
          );
        }
      }
    },
  };
  return def;
})();

// ── notices ─────────────────────────────────────────────────────────────────

const notices: CollectionDef = (() => {
  const fields = [
    fld('title', 'Title', 'text', { filter: ['contains'], sortable: true, searchable: true, col: 'title' }),
    fld('excerpt', 'Excerpt', 'text'),
    fld('content', 'Content', 'rich', { detailOnly: true }),
    fld('publishedAt', 'Published', 'date', { filter: CMP_OPS, sortable: true, col: 'publishedAt' }),
  ];
  const select = { id: true, title: true, content: true, publishedAt: true } satisfies Prisma.NoticeSelect;
  // Same audience rule as data/notices: school-wide public notices only.
  const scope = (ctx: CollectionCtx): Prisma.NoticeWhereInput => {
    const now = new Date();
    return {
      institutionId: ctx.institutionId,
      isActive: true,
      audience: { in: ['ALL', 'PUBLIC'] },
      classId: null,
      sectionId: null,
      publishedAt: { lte: now },
      OR: [{ scheduledAt: null }, { scheduledAt: { lte: now } }],
    };
  };
  const map = (n: Prisma.NoticeGetPayload<{ select: typeof select }>, detail: boolean): Row => ({
    item: stripDetail(fields, { slug: n.id, title: n.title, excerpt: plainTextExcerpt(n.content, 160), content: n.content, publishedAt: n.publishedAt }, detail),
    ref: { id: n.id },
  });
  const def: CollectionDef = {
    key: 'notices', label: 'Notice', labelPlural: 'Notices', titleField: 'title', slugSource: 'id', routeBase: '/notices', defaultSort: '-publishedAt',
    seo: { description: 'content' }, fields, relations: [], unavailableReason: available,
    async list(ctx, q) {
      const c = compileAll(def, q);
      const where = { AND: [scope(ctx), ...c.where] } as Prisma.NoticeWhereInput;
      const [list, total] = await Promise.all([
        prisma.notice.findMany({ where, select, orderBy: orderOf(c, [{ publishedAt: 'desc' }]) as Prisma.NoticeOrderByWithRelationInput[], ...skipTake(q) }),
        prisma.notice.count({ where }),
      ]);
      return { rows: list.map((n) => map(n, false)), total };
    },
    async get(ctx, slug) {
      const n = await prisma.notice.findFirst({ where: { AND: [scope(ctx), { id: slug }] }, select });
      return n ? map(n, true) : null;
    },
    async include() {},
  };
  return def;
})();

// ── events ──────────────────────────────────────────────────────────────────

const events: CollectionDef = (() => {
  const fields = [
    fld('title', 'Title', 'text', { filter: ['contains'], sortable: true, searchable: true, col: 'title' }),
    fld('description', 'Description', 'text'),
    fld('category', 'Category', 'text', { filter: ['eq', 'in'], col: 'category', options: Object.values(EventCategory) }),
    fld('type', 'Type', 'text', { filter: ['eq'], col: 'type', options: Object.values(EventType) }),
    fld('startDate', 'Start date', 'date', { filter: ['eq', ...CMP_OPS], sortable: true, col: 'startDate' }),
    fld('endDate', 'End date', 'date', { filter: ['eq', ...CMP_OPS], sortable: true, col: 'endDate' }),
    fld('startTime', 'Start time', 'text'),
    fld('endTime', 'End time', 'text'),
    fld('venue', 'Venue', 'text', { filter: ['contains'], searchable: true, col: 'venue' }),
    fld('imageUrl', 'Image', 'image'),
  ];
  const select = {
    id: true, title: true, description: true, category: true, type: true, startDate: true, endDate: true, startTime: true, endTime: true, venue: true, imageUrl: true,
  } satisfies Prisma.EventSelect;
  // Community-facing events only; staff-only meetings stay private.
  const scope = (ctx: CollectionCtx): Prisma.EventWhereInput => ({ institutionId: ctx.institutionId, audience: { hasSome: ['STUDENTS', 'GUARDIANS'] } });
  const map = (e: Prisma.EventGetPayload<{ select: typeof select }>): Row => ({
    item: {
      slug: e.id, title: e.title, description: e.description ?? null, category: e.category, type: e.type, startDate: e.startDate, endDate: e.endDate,
      startTime: e.startTime ?? null, endTime: e.endTime ?? null, venue: e.venue ?? null, imageUrl: e.imageUrl ?? null,
    },
    ref: { id: e.id },
  });
  const def: CollectionDef = {
    key: 'events', label: 'Event', labelPlural: 'Events', titleField: 'title', slugSource: 'id', routeBase: '/events', defaultSort: 'startDate',
    seo: { description: 'description', image: 'imageUrl' }, fields, relations: [], unavailableReason: available,
    async list(ctx, q) {
      const c = compileAll(def, q);
      const where = { AND: [scope(ctx), ...c.where] } as Prisma.EventWhereInput;
      const [list, total] = await Promise.all([
        prisma.event.findMany({ where, select, orderBy: orderOf(c, [{ startDate: 'asc' }]) as Prisma.EventOrderByWithRelationInput[], ...skipTake(q) }),
        prisma.event.count({ where }),
      ]);
      return { rows: list.map(map), total };
    },
    async get(ctx, slug) {
      const e = await prisma.event.findFirst({ where: { AND: [scope(ctx), { id: slug }] }, select });
      return e ? map(e) : null;
    },
    async include() {},
  };
  return def;
})();

// ── albums ──────────────────────────────────────────────────────────────────

const albums: CollectionDef = (() => {
  const fields = [
    fld('title', 'Title', 'text', { filter: ['contains'], sortable: true, searchable: true, col: 'title' }),
    fld('titleBn', 'Title (Bangla)', 'text'),
    fld('coverUrl', 'Cover', 'image'),
    fld('description', 'Description', 'text'),
    fld('eventDate', 'Event date', 'date', { filter: CMP_OPS, sortable: true, col: 'eventDate' }),
    fld('photoCount', 'Photos', 'number'),
  ];
  const select = { id: true, title: true, titleBn: true, coverUrl: true, description: true, eventDate: true, _count: { select: { photos: true } } } satisfies Prisma.SiteAlbumSelect;
  const scope = (ctx: CollectionCtx) => ({ siteId: ctx.siteId, institutionId: ctx.institutionId, ...publishedOnly(ctx) });
  const map = (a: Prisma.SiteAlbumGetPayload<{ select: typeof select }>): Row => ({
    item: { slug: a.id, title: a.title, titleBn: a.titleBn ?? null, coverUrl: a.coverUrl ?? null, description: a.description ?? null, eventDate: a.eventDate ?? null, photoCount: a._count.photos },
    ref: { id: a.id },
  });
  const def: CollectionDef = {
    key: 'albums', label: 'Album', labelPlural: 'Photo albums', titleField: 'title', slugSource: 'id', routeBase: '/gallery', defaultSort: 'manual',
    seo: { description: 'description', image: 'coverUrl' }, fields, relations: [rel('photos', 'Photos', null)], unavailableReason: available,
    async list(ctx, q) {
      const c = compileAll(def, q);
      const where = { AND: [scope(ctx), ...c.where] } as Prisma.SiteAlbumWhereInput;
      const [list, total] = await Promise.all([
        prisma.siteAlbum.findMany({ where, select, orderBy: orderOf(c, [{ sortOrder: 'asc' }, { createdAt: 'desc' }]) as Prisma.SiteAlbumOrderByWithRelationInput[], ...skipTake(q) }),
        prisma.siteAlbum.count({ where }),
      ]);
      return { rows: list.map(map), total };
    },
    async get(ctx, slug) {
      const a = await prisma.siteAlbum.findFirst({ where: { ...scope(ctx), id: slug }, select });
      return a ? map(a) : null;
    },
    async include(ctx, rows, rels) {
      if (!rels.includes('photos') || !rows.length) return;
      const photos = await prisma.siteAlbumPhoto.findMany({
        where: { albumId: { in: rows.map((r) => r.ref.id as string) }, album: { siteId: ctx.siteId, institutionId: ctx.institutionId } },
        select: { albumId: true, url: true, caption: true },
        orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
        take: 2000,
      });
      for (const row of rows) row.item.photos = photos.filter((p) => p.albumId === row.ref.id).map((p) => ({ url: p.url, caption: p.caption ?? null }));
    },
  };
  return def;
})();

// ── admissions ──────────────────────────────────────────────────────────────

const admissions: CollectionDef = (() => {
  const fields = [
    fld('session', 'Session', 'text', { filter: ['eq', 'in'], sortable: true, col: 'session' }),
    fld('classNames', 'Classes', 'list', { filter: ['has'], col: 'classNames' }),
    fld('title', 'Title', 'text', { filter: ['contains'], sortable: true, searchable: true, col: 'title' }),
    fld('titleBn', 'Title (Bangla)', 'text'),
    fld('startDate', 'Opens', 'date', { filter: CMP_OPS, sortable: true, col: 'startDate' }),
    fld('endDate', 'Closes', 'date', { filter: CMP_OPS, sortable: true, col: 'endDate' }),
    fld('fee', 'Fee', 'number', { filter: CMP_OPS, sortable: true, col: 'fee' }),
    fld('pdfUrl', 'PDF', 'url'),
    fld('applyUrl', 'Apply link', 'url'),
    fld('formId', 'Form', 'text'),
    fld('closed', 'Closed', 'bool'),
    fld('body', 'Body', 'rich', { detailOnly: true }),
  ];
  const select = {
    id: true, session: true, classNames: true, title: true, titleBn: true, body: true, startDate: true, endDate: true, fee: true, pdfUrl: true, applyUrl: true, formId: true,
  } satisfies Prisma.SiteAdmissionCircularSelect;
  const scope = (ctx: CollectionCtx) => ({ siteId: ctx.siteId, institutionId: ctx.institutionId, ...publishedOnly(ctx) });
  const map = (a: Prisma.SiteAdmissionCircularGetPayload<{ select: typeof select }>, detail: boolean): Row => ({
    item: stripDetail(
      fields,
      {
        slug: a.id, session: a.session, classNames: a.classNames, title: a.title, titleBn: a.titleBn ?? null, startDate: a.startDate ?? null, endDate: a.endDate ?? null,
        fee: num(a.fee), pdfUrl: a.pdfUrl ?? null, applyUrl: a.applyUrl ?? null, formId: a.formId ?? null, closed: a.endDate ? a.endDate.getTime() < Date.now() : false, body: a.body,
      },
      detail,
    ),
    ref: { id: a.id },
  });
  const def: CollectionDef = {
    key: 'admissions', label: 'Admission circular', labelPlural: 'Admission circulars', titleField: 'title', slugSource: 'id', routeBase: '/admissions', defaultSort: 'manual',
    seo: { description: 'body', image: 'pdfUrl' }, fields, relations: [], unavailableReason: available,
    async list(ctx, q) {
      const c = compileAll(def, q);
      const where = { AND: [scope(ctx), ...c.where] } as Prisma.SiteAdmissionCircularWhereInput;
      const [list, total] = await Promise.all([
        prisma.siteAdmissionCircular.findMany({ where, select, orderBy: orderOf(c, [{ sortOrder: 'asc' }, { createdAt: 'desc' }]) as Prisma.SiteAdmissionCircularOrderByWithRelationInput[], ...skipTake(q) }),
        prisma.siteAdmissionCircular.count({ where }),
      ]);
      return { rows: list.map((a) => map(a, false)), total };
    },
    async get(ctx, slug) {
      const a = await prisma.siteAdmissionCircular.findFirst({ where: { ...scope(ctx), id: slug }, select });
      return a ? map(a, true) : null;
    },
    async include() {},
  };
  return def;
})();

// ── downloads ───────────────────────────────────────────────────────────────

const downloads: CollectionDef = (() => {
  const fields = [
    fld('title', 'Title', 'text', { filter: ['contains'], sortable: true, searchable: true, col: 'title' }),
    fld('titleBn', 'Title (Bangla)', 'text'),
    fld('category', 'Category', 'text', { filter: ['eq', 'in'], sortable: true, col: 'category' }),
    fld('fileUrl', 'File', 'url'),
    fld('publishedAt', 'Published', 'date', { filter: CMP_OPS, sortable: true, col: 'publishedAt' }),
  ];
  const select = { id: true, title: true, titleBn: true, category: true, fileUrl: true, publishedAt: true } satisfies Prisma.SiteDownloadSelect;
  const scope = (ctx: CollectionCtx) => ({ siteId: ctx.siteId, institutionId: ctx.institutionId, ...publishedOnly(ctx) });
  const map = (d: Prisma.SiteDownloadGetPayload<{ select: typeof select }>): Row => ({
    item: { slug: d.id, title: d.title, titleBn: d.titleBn ?? null, category: d.category, fileUrl: d.fileUrl, publishedAt: d.publishedAt ?? null },
    ref: { id: d.id },
  });
  const def: CollectionDef = {
    key: 'downloads', label: 'Download', labelPlural: 'Downloads', titleField: 'title', slugSource: 'id', routeBase: null, defaultSort: 'manual',
    seo: {}, fields, relations: [], unavailableReason: available,
    async list(ctx, q) {
      const c = compileAll(def, q);
      const where = { AND: [scope(ctx), ...c.where] } as Prisma.SiteDownloadWhereInput;
      const [list, total] = await Promise.all([
        prisma.siteDownload.findMany({ where, select, orderBy: orderOf(c, [{ sortOrder: 'asc' }, { createdAt: 'desc' }]) as Prisma.SiteDownloadOrderByWithRelationInput[], ...skipTake(q) }),
        prisma.siteDownload.count({ where }),
      ]);
      return { rows: list.map(map), total };
    },
    async get(ctx, slug) {
      const d = await prisma.siteDownload.findFirst({ where: { ...scope(ctx), id: slug }, select });
      return d ? map(d) : null;
    },
    async include() {},
  };
  return def;
})();

// ── courses ─────────────────────────────────────────────────────────────────

const courses: CollectionDef = (() => {
  const fields = [
    fld('title', 'Title', 'text', { filter: ['contains'], sortable: true, searchable: true, col: 'title' }),
    fld('titleBn', 'Title (Bangla)', 'text'),
    fld('summary', 'Summary', 'text'),
    fld('coverUrl', 'Cover', 'image'),
    fld('price', 'Price', 'number', { filter: ['eq', ...CMP_OPS], sortable: true, col: 'price' }),
    fld('level', 'Level', 'text', { filter: ['eq'], col: 'level' }),
    fld('category', 'Category', 'text', { filter: ['eq', 'in'], col: 'category' }),
    fld('instructorName', 'Instructor', 'text'),
    fld('durationText', 'Duration', 'text'),
    fld('lessonCount', 'Lessons', 'number'),
    fld('totalMinutes', 'Total minutes', 'number'),
    fld('description', 'Description', 'rich', { detailOnly: true }),
  ];
  const select = {
    id: true, slug: true, title: true, titleBn: true, summary: true, coverUrl: true, price: true, level: true, category: true, instructorName: true, durationText: true, description: true,
  } satisfies Prisma.SiteCourseSelect;
  const scope = (ctx: CollectionCtx) => ({ siteId: ctx.siteId, institutionId: ctx.institutionId, ...publishedOnly(ctx) });

  async function toRows(ctx: CollectionCtx, list: Prisma.SiteCourseGetPayload<{ select: typeof select }>[], detail: boolean): Promise<Row[]> {
    const ids = list.map((c) => c.id);
    const agg = ids.length
      ? await prisma.siteCourseLesson.groupBy({
          by: ['courseId'],
          where: { courseId: { in: ids }, institutionId: ctx.institutionId },
          _count: { _all: true },
          _sum: { durationMin: true },
        })
      : [];
    const byId = new Map(agg.map((a) => [a.courseId, { count: a._count._all, minutes: a._sum.durationMin ?? 0 }]));
    return list.map((c) => ({
      item: stripDetail(
        fields,
        {
          slug: c.slug, title: c.title, titleBn: c.titleBn ?? null, summary: c.summary ?? null, coverUrl: c.coverUrl ?? null, price: num(c.price), level: c.level ?? null,
          category: c.category ?? null, instructorName: c.instructorName ?? null, durationText: c.durationText ?? null,
          lessonCount: byId.get(c.id)?.count ?? 0, totalMinutes: byId.get(c.id)?.minutes ?? 0, description: c.description,
        },
        detail,
      ),
      ref: { id: c.id },
    }));
  }

  const def: CollectionDef = {
    key: 'courses', label: 'Course', labelPlural: 'Courses', titleField: 'title', slugSource: 'slug', routeBase: '/courses', defaultSort: 'manual',
    seo: { description: 'summary', image: 'coverUrl' }, fields, relations: [rel('lessons', 'Curriculum', null)],
    unavailableReason: (ctx) => (settingsFlag(ctx.settings, 'courses').enabled === true ? null : 'Courses are not switched on for this school'),
    async list(ctx, q) {
      const c = compileAll(def, q);
      const where = { AND: [scope(ctx), ...c.where] } as Prisma.SiteCourseWhereInput;
      const [list, total] = await Promise.all([
        prisma.siteCourse.findMany({ where, select, orderBy: orderOf(c, [{ sortOrder: 'asc' }, { createdAt: 'desc' }]) as Prisma.SiteCourseOrderByWithRelationInput[], ...skipTake(q) }),
        prisma.siteCourse.count({ where }),
      ]);
      return { rows: await toRows(ctx, list, false), total };
    },
    async get(ctx, slug) {
      const c = await prisma.siteCourse.findFirst({ where: { ...scope(ctx), slug: slug.toLowerCase() }, select });
      return c ? (await toRows(ctx, [c], true))[0] : null;
    },
    async include(ctx, rows, rels) {
      if (!rels.includes('lessons') || !rows.length) return;
      // Curriculum outline only — never video, file or body content.
      const lessons = await prisma.siteCourseLesson.findMany({
        where: { courseId: { in: rows.map((r) => r.ref.id as string) }, institutionId: ctx.institutionId },
        select: { courseId: true, module: true, title: true, kind: true, durationMin: true, isFreePreview: true },
        orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
        take: 2000,
      });
      for (const row of rows) {
        row.item.lessons = lessons
          .filter((l) => l.courseId === row.ref.id)
          .map((l) => ({ title: l.title, module: l.module ?? null, kind: l.kind, durationMin: l.durationMin ?? null, isFreePreview: l.isFreePreview }));
      }
    },
  };
  return def;
})();

// ── products ────────────────────────────────────────────────────────────────

const products: CollectionDef = (() => {
  const fields = [
    fld('name', 'Name', 'text', { filter: ['contains'], sortable: true, searchable: true, col: 'name' }),
    fld('nameBn', 'Name (Bangla)', 'text'),
    fld('images', 'Images', 'list'),
    fld('price', 'Price', 'number', { filter: ['eq', ...CMP_OPS], sortable: true, col: 'price' }),
    fld('compareAtPrice', 'Compare-at price', 'number'),
    fld('category', 'Category', 'text', { filter: ['eq', 'in'], col: 'category' }),
    fld('kind', 'Kind', 'text', { filter: ['eq'], col: 'kind', options: Object.values(SiteProductKind) }),
    fld('inStock', 'In stock', 'bool'),
    fld('description', 'Description', 'rich', { detailOnly: true }),
  ];
  // digitalUrl, sku and the exact stock level are never selected.
  const select = { id: true, slug: true, name: true, nameBn: true, images: true, price: true, compareAtPrice: true, category: true, kind: true, stock: true, description: true } satisfies Prisma.SiteProductSelect;
  const scope = (ctx: CollectionCtx) => ({ siteId: ctx.siteId, institutionId: ctx.institutionId, ...publishedOnly(ctx) });
  const map = (p: Prisma.SiteProductGetPayload<{ select: typeof select }>, detail: boolean): Row => ({
    item: stripDetail(
      fields,
      {
        slug: p.slug, name: p.name, nameBn: p.nameBn ?? null, images: p.images, price: num(p.price), compareAtPrice: num(p.compareAtPrice), category: p.category ?? null,
        kind: p.kind, inStock: p.stock === null || p.stock > 0, description: p.description,
      },
      detail,
    ),
    ref: { id: p.id },
  });
  const def: CollectionDef = {
    key: 'products', label: 'Product', labelPlural: 'Products', titleField: 'name', slugSource: 'slug', routeBase: null, defaultSort: 'manual',
    seo: { description: 'description', image: 'images' }, fields, relations: [],
    unavailableReason: (ctx) => (settingsFlag(ctx.settings, 'shop').enabled === true ? null : 'The shop is not switched on for this school'),
    async list(ctx, q) {
      const c = compileAll(def, q);
      const where = { AND: [scope(ctx), ...c.where] } as Prisma.SiteProductWhereInput;
      const [list, total] = await Promise.all([
        prisma.siteProduct.findMany({ where, select, orderBy: orderOf(c, [{ sortOrder: 'asc' }, { createdAt: 'desc' }]) as Prisma.SiteProductOrderByWithRelationInput[], ...skipTake(q) }),
        prisma.siteProduct.count({ where }),
      ]);
      return { rows: list.map((p) => map(p, false)), total };
    },
    async get(ctx, slug) {
      const p = await prisma.siteProduct.findFirst({ where: { ...scope(ctx), slug: slug.toLowerCase() }, select });
      return p ? map(p, true) : null;
    },
    async include() {},
  };
  return def;
})();

// ── holidays ────────────────────────────────────────────────────────────────

const holidays: CollectionDef = (() => {
  const fields = [
    fld('title', 'Title', 'text', { filter: ['contains'], sortable: true, searchable: true, col: 'title' }),
    fld('date', 'Date', 'date', { filter: ['eq', ...CMP_OPS], sortable: true, col: 'date' }),
    fld('type', 'Type', 'text', { filter: ['eq', 'in'], col: 'type', options: Object.values(HolidayType) }),
    fld('isTentative', 'Tentative', 'bool', { filter: ['eq'], col: 'isTentative' }),
  ];
  const select = { id: true, date: true, title: true, type: true, isTentative: true } satisfies Prisma.HolidaySelect;
  // Weekly off-days are excluded: they would swamp every list.
  const scope = (ctx: CollectionCtx): Prisma.HolidayWhereInput => ({ institutionId: ctx.institutionId, deletedAt: null, type: { not: 'WEEKLY' } });
  const map = (h: Prisma.HolidayGetPayload<{ select: typeof select }>): Row => ({
    item: { slug: h.id, title: h.title, date: h.date, type: h.type, isTentative: h.isTentative },
    ref: { id: h.id },
  });
  const def: CollectionDef = {
    key: 'holidays', label: 'Holiday', labelPlural: 'Holidays', titleField: 'title', slugSource: 'id', routeBase: null, defaultSort: 'date',
    seo: {}, fields, relations: [], unavailableReason: available,
    async list(ctx, q) {
      const c = compileAll(def, q);
      const where = { AND: [scope(ctx), ...c.where] } as Prisma.HolidayWhereInput;
      const [list, total] = await Promise.all([
        prisma.holiday.findMany({ where, select, orderBy: orderOf(c, [{ date: 'asc' }]) as Prisma.HolidayOrderByWithRelationInput[], ...skipTake(q) }),
        prisma.holiday.count({ where }),
      ]);
      return { rows: list.map(map), total };
    },
    async get(ctx, slug) {
      const h = await prisma.holiday.findFirst({ where: { AND: [scope(ctx), { id: slug }] }, select });
      return h ? map(h) : null;
    },
    async include() {},
  };
  return def;
})();

// ── branches ────────────────────────────────────────────────────────────────

const branches: CollectionDef = (() => {
  const fields = [
    fld('name', 'Name', 'text', { filter: ['contains'], sortable: true, searchable: true, col: 'name' }),
    fld('address', 'Address', 'text'),
    fld('phone', 'Phone', 'text'),
    fld('email', 'Email', 'text'),
  ];
  const select = { id: true, name: true, address: true, phone: true, email: true } satisfies Prisma.BranchSelect;
  const scope = (ctx: CollectionCtx): Prisma.BranchWhereInput => ({ institutionId: ctx.institutionId, isActive: true });
  const map = (b: Prisma.BranchGetPayload<{ select: typeof select }>): Row => ({
    item: { slug: b.id, name: b.name, address: b.address ?? null, phone: b.phone ?? null, email: b.email ?? null },
    ref: { id: b.id },
  });
  const def: CollectionDef = {
    key: 'branches', label: 'Branch', labelPlural: 'Branches', titleField: 'name', slugSource: 'id', routeBase: null, defaultSort: 'name',
    seo: {}, fields, relations: [], unavailableReason: available,
    async list(ctx, q) {
      const c = compileAll(def, q);
      const where = { AND: [scope(ctx), ...c.where] } as Prisma.BranchWhereInput;
      const [list, total] = await Promise.all([
        prisma.branch.findMany({ where, select, orderBy: orderOf(c, [{ name: 'asc' }]) as Prisma.BranchOrderByWithRelationInput[], ...skipTake(q) }),
        prisma.branch.count({ where }),
      ]);
      return { rows: list.map(map), total };
    },
    async get(ctx, slug) {
      const b = await prisma.branch.findFirst({ where: { AND: [scope(ctx), { id: slug }] }, select });
      return b ? map(b) : null;
    },
    async include() {},
  };
  return def;
})();

// ── exams (result summaries as aggregates only) ─────────────────────────────

const exams: CollectionDef = (() => {
  const fields = [
    fld('name', 'Name', 'text', { filter: ['contains'], sortable: true, searchable: true, col: 'name' }),
    fld('startDate', 'Start date', 'date', { filter: CMP_OPS, sortable: true, col: 'startDate' }),
    fld('endDate', 'End date', 'date', { filter: CMP_OPS, sortable: true, col: 'endDate' }),
  ];
  const select = { id: true, name: true, startDate: true, endDate: true } satisfies Prisma.ExamSelect;
  // Finished, active, results-published exams that actually have results.
  const scope = (ctx: CollectionCtx): Prisma.ExamWhereInput => ({
    institutionId: ctx.institutionId,
    isActive: true,
    isPublished: true,
    endDate: { lte: new Date() },
    results: { some: { institutionId: ctx.institutionId } },
  });
  const map = (e: Prisma.ExamGetPayload<{ select: typeof select }>): Row => ({
    item: { slug: e.id, name: e.name, startDate: e.startDate, endDate: e.endDate },
    ref: { id: e.id },
  });
  const def: CollectionDef = {
    key: 'exams', label: 'Exam', labelPlural: 'Exams', titleField: 'name', slugSource: 'id', routeBase: null, defaultSort: '-endDate',
    seo: {}, fields, relations: [rel('classSummaries', 'Result summary per class', null)],
    unavailableReason: (ctx) => {
      const g = readGates(ctx.settings);
      return g.publicResults || ctx.settings.publicResultSummary === true ? null : 'Public results are not switched on for this school';
    },
    async list(ctx, q) {
      const c = compileAll(def, q);
      const where = { AND: [scope(ctx), ...c.where] } as Prisma.ExamWhereInput;
      const [list, total] = await Promise.all([
        prisma.exam.findMany({ where, select, orderBy: orderOf(c, [{ endDate: 'desc' }]) as Prisma.ExamOrderByWithRelationInput[], ...skipTake(q) }),
        prisma.exam.count({ where }),
      ]);
      return { rows: list.map(map), total };
    },
    async get(ctx, slug) {
      const e = await prisma.exam.findFirst({ where: { AND: [scope(ctx), { id: slug }] }, select });
      return e ? map(e) : null;
    },
    async include(ctx, rows, rels) {
      if (!rels.includes('classSummaries') || !rows.length) return;
      const examIds = rows.map((r) => r.ref.id as string);
      const [results, bands] = await Promise.all([
        prisma.examResult.findMany({
          where: { institutionId: ctx.institutionId, examId: { in: examIds }, student: { status: 'ACTIVE' } },
          select: { examId: true, studentId: true, subject: true, marksObtained: true, maxMarks: true, student: { select: { class: { select: { name: true } } } } },
        }),
        getDefaultBands(ctx.institutionId),
      ]);
      // examId -> studentId -> { class, marks }. Only aggregates leave this function.
      const byExam = new Map<string, Map<string, { className: string; marks: { subject: string; marksObtained: number; maxMarks: number }[] }>>();
      for (const r of results) {
        const students = byExam.get(r.examId) ?? new Map();
        const entry = students.get(r.studentId) ?? { className: r.student.class?.name ?? 'Unclassed', marks: [] };
        entry.marks.push({ subject: r.subject, marksObtained: Number(r.marksObtained), maxMarks: Number(r.maxMarks) });
        students.set(r.studentId, entry);
        byExam.set(r.examId, students);
      }
      for (const row of rows) {
        const students = byExam.get(row.ref.id as string) ?? new Map();
        const outcomes: StudentExamOutcome[] = [...students.values()].map((s) => {
          const summary = summarizeMarks(s.marks, bands);
          return { className: s.className, passed: summary.passed, gpa: summary.gpa };
        });
        row.item.classSummaries = summarizeClassResults(outcomes).map(suppressClassSummary);
      }
    },
  };
  return def;
})();

// ── Registry ────────────────────────────────────────────────────────────────

export const COLLECTIONS: readonly CollectionDef[] = [
  teachers, staff, committee, classes, subjects, notices, events, albums, admissions, downloads, courses, products, holidays, branches, exams,
];

const BY_KEY = new Map(COLLECTIONS.map((c) => [c.key, c]));

export function getCollection(key: string): CollectionDef | undefined {
  return BY_KEY.get(key);
}

/** Collections that may have a TEMPLATE (profile) page. */
export function templateCollections(): CollectionDef[] {
  return COLLECTIONS.filter((c) => c.routeBase);
}
