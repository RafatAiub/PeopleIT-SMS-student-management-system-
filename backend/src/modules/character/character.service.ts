import { randomUUID } from 'crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { logger } from '../../utils/logger';
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../../utils/AppError';
import { notifySafe } from '../notifications/notifications.service';
import { teacherSectionIds } from '../reports/analytics.scope';
import * as guardianRepository from '../guardians/guardian.repository';
import * as studentRepository from '../students/student.repository';
import { isModuleEnabled } from '../institution/modules.service';
import {
  DEFAULT_BADGES,
  DEFAULT_TRAITS,
  autoDedupeKey,
  averageByTrait,
  badgeRuleProblem,
  characterBand,
  isValidScore,
  leaderboardName,
  longestOnTimeStreak,
  meetsBadgeRule,
  overallPercent,
  periodRangeProblem,
  rankRows,
  type BadgeRule,
  type TraitLike,
} from './character.logic';
import type {
  AdjustPointsDtoType,
  AwardBadgeDtoType,
  AwardQueryDtoType,
  CreateBadgeDtoType,
  CreatePeriodDtoType,
  CreateTraitDtoType,
  GridQueryDtoType,
  LeaderboardQueryDtoType,
  SaveGridDtoType,
  UpdateBadgeDtoType,
  UpdatePeriodDtoType,
  UpdateSettingsDtoType,
  UpdateTraitDtoType,
} from './character.dto';

// =============================================================================
// Character (আখলাক) scoring & badges (T2). Every query is scoped by
// ctx.institutionId (from the verified JWT via setTenant). Routes are gated by
// requireModule('islamic.character') and role checks; this layer adds the
// row-level rules:
//   • TEACHER — only students in their sections (class teacher or timetable,
//     the same rule attendance and analytics use: teacherSectionIds()).
//   • STUDENT — own record; GUARDIAN — linked children only.
// =============================================================================

export interface CharacterCtx {
  institutionId: string;
  userId: string;
  role: string;
}

export const MODULE_KEY = 'islamic.character' as const;
const MANAGERS = new Set(['ADMIN', 'MANAGEMENT', 'SUPER_ADMIN']);
const isManager = (ctx: CharacterCtx) => MANAGERS.has(ctx.role);
const isTeacher = (ctx: CharacterCtx) => ctx.role === 'TEACHER';

const dec = (n: number) => new Prisma.Decimal(n.toFixed(2));
const num = (v: Prisma.Decimal | number | null | undefined): number | null => (v == null ? null : Number(v));

// ── Access helpers ───────────────────────────────────────────────────────────

/** Section ids the actor may score / award in; null = every section (managers). */
export async function allowedSectionIds(ctx: CharacterCtx): Promise<Set<string> | null> {
  if (isManager(ctx)) return null;
  if (isTeacher(ctx)) return teacherSectionIds(ctx.institutionId, ctx.userId);
  return new Set();
}

async function assertSectionAccess(ctx: CharacterCtx, sectionId: string) {
  const section = await prisma.section.findFirst({
    where: { id: sectionId, class: { branch: { institutionId: ctx.institutionId } } },
    select: { id: true, name: true, class: { select: { id: true, name: true } } },
  });
  if (!section) throw new NotFoundError('Section not found');
  const allowed = await allowedSectionIds(ctx);
  if (allowed && !allowed.has(section.id)) throw new ForbiddenError('You can only assess sections you teach');
  return section;
}

/** Throws unless every student is in this school and (for teachers) in their sections. */
async function assertStudentsAccess(ctx: CharacterCtx, studentIds: string[]) {
  const ids = [...new Set(studentIds)];
  const students = await prisma.student.findMany({
    where: { institutionId: ctx.institutionId, id: { in: ids } },
    select: { id: true, sectionId: true, firstName: true, lastName: true, userId: true },
  });
  if (students.length !== ids.length) throw new NotFoundError('Student not found');
  const allowed = await allowedSectionIds(ctx);
  if (allowed && students.some((s) => !s.sectionId || !allowed.has(s.sectionId))) {
    throw new ForbiddenError('You can only award students in sections you teach');
  }
  return students;
}

/** Read access to one student's character record. */
async function assertCanViewStudent(ctx: CharacterCtx, studentId: string) {
  const student = await prisma.student.findFirst({
    where: { id: studentId, institutionId: ctx.institutionId },
    select: { id: true, sectionId: true, userId: true },
  });
  if (!student) throw new NotFoundError('Student not found');
  if (isManager(ctx) || ctx.role === 'ACCOUNTANT') return student;
  if (isTeacher(ctx)) {
    const allowed = await teacherSectionIds(ctx.institutionId, ctx.userId);
    if (student.sectionId && allowed.has(student.sectionId)) return student;
    throw new NotFoundError('Student not found');
  }
  if (ctx.role === 'STUDENT' && student.userId === ctx.userId) return student;
  if (ctx.role === 'GUARDIAN') {
    const linked = await guardianRepository.findLinkedStudentIdsByUserId(ctx.institutionId, ctx.userId);
    if (linked.includes(studentId)) return student;
  }
  throw new NotFoundError('Student not found');
}

// ── Settings ─────────────────────────────────────────────────────────────────

export async function getSettings(institutionId: string) {
  const row = await prisma.characterSettings.findUnique({ where: { institutionId } });
  return {
    leaderboardEnabled: row?.leaderboardEnabled ?? false,
    leaderboardPublic: row?.leaderboardPublic ?? false,
    notifyGuardians: row?.notifyGuardians ?? true,
  };
}

export async function updateSettings(ctx: CharacterCtx, input: UpdateSettingsDtoType) {
  await prisma.characterSettings.upsert({
    where: { institutionId: ctx.institutionId },
    create: { institutionId: ctx.institutionId, ...input },
    update: input,
  });
  return getSettings(ctx.institutionId);
}

// ── Traits ───────────────────────────────────────────────────────────────────

const traitOut = (t: { weight: Prisma.Decimal } & Record<string, unknown>) => ({ ...t, weight: Number(t.weight) });

export async function listTraits(ctx: CharacterCtx, includeInactive = true) {
  const rows = await prisma.characterTrait.findMany({
    where: { institutionId: ctx.institutionId, ...(includeInactive ? {} : { active: true }) },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
  });
  return rows.map(traitOut);
}

/** Adds the seven default traits when the school has none yet. Idempotent. */
export async function seedDefaultTraits(ctx: CharacterCtx) {
  const count = await prisma.characterTrait.count({ where: { institutionId: ctx.institutionId } });
  if (count === 0) {
    await prisma.characterTrait.createMany({
      data: DEFAULT_TRAITS.map((t, i) => ({ institutionId: ctx.institutionId, ...t, scaleMin: 1, scaleMax: 5, weight: dec(1), sortOrder: i })),
    });
  }
  return listTraits(ctx);
}

export async function createTrait(ctx: CharacterCtx, input: CreateTraitDtoType) {
  const t = await prisma.characterTrait.create({
    data: { ...input, weight: dec(input.weight), institutionId: ctx.institutionId },
  });
  return traitOut(t);
}

async function traitOrThrow(institutionId: string, id: string) {
  const t = await prisma.characterTrait.findFirst({ where: { id, institutionId } });
  if (!t) throw new NotFoundError('Trait not found');
  return t;
}

export async function updateTrait(ctx: CharacterCtx, id: string, input: UpdateTraitDtoType) {
  const t = await traitOrThrow(ctx.institutionId, id);
  const scaleMin = input.scaleMin ?? t.scaleMin;
  const scaleMax = input.scaleMax ?? t.scaleMax;
  if (scaleMax <= scaleMin) throw new ValidationError('The highest score must be above the lowest');
  if (scaleMin !== t.scaleMin || scaleMax !== t.scaleMax) {
    // Existing scores outside the new scale would become meaningless.
    const outside = await prisma.characterScore.count({
      where: { institutionId: ctx.institutionId, traitId: id, OR: [{ score: { lt: scaleMin } }, { score: { gt: scaleMax } }] },
    });
    if (outside > 0) throw new ConflictError(`${outside} existing scores are outside the new scale — keep the old scale or add a new trait`);
  }
  const updated = await prisma.characterTrait.update({
    where: { id },
    data: { ...input, ...(input.weight != null ? { weight: dec(input.weight) } : {}) },
  });
  return traitOut(updated);
}

export async function deleteTrait(ctx: CharacterCtx, id: string) {
  await traitOrThrow(ctx.institutionId, id);
  const used = await prisma.characterScore.count({ where: { institutionId: ctx.institutionId, traitId: id } });
  if (used > 0) throw new ConflictError('This trait has scores — switch it off (inactive) instead of deleting it');
  await prisma.characterTrait.delete({ where: { id } });
  return { id };
}

export async function reorderTraits(ctx: CharacterCtx, ids: string[]) {
  const owned = await prisma.characterTrait.findMany({ where: { institutionId: ctx.institutionId, id: { in: ids } }, select: { id: true } });
  if (owned.length !== new Set(ids).size) throw new NotFoundError('Trait not found');
  await prisma.$transaction(ids.map((id, i) => prisma.characterTrait.update({ where: { id }, data: { sortOrder: i } })));
  return listTraits(ctx);
}

// ── Periods ──────────────────────────────────────────────────────────────────

async function periodOrThrow(institutionId: string, id: string) {
  const p = await prisma.characterPeriod.findFirst({ where: { id, institutionId } });
  if (!p) throw new NotFoundError('Assessment period not found');
  return p;
}

async function assertAcademicYear(institutionId: string, academicYearId: string | null | undefined) {
  if (!academicYearId) return;
  const y = await prisma.academicYear.findFirst({ where: { id: academicYearId, institutionId }, select: { id: true } });
  if (!y) throw new NotFoundError('Session year not found');
}

export async function listPeriods(ctx: CharacterCtx, q: { academicYearId?: string; kind?: 'WEEKLY' | 'MONTHLY' | 'TERM' }) {
  const rows = await prisma.characterPeriod.findMany({
    where: { institutionId: ctx.institutionId, ...(q.academicYearId ? { academicYearId: q.academicYearId } : {}), ...(q.kind ? { kind: q.kind } : {}) },
    include: { academicYear: { select: { id: true, label: true } }, _count: { select: { scores: true, awards: true } } },
    orderBy: { startDate: 'desc' },
    take: 200,
  });
  return rows;
}

export async function createPeriod(ctx: CharacterCtx, input: CreatePeriodDtoType) {
  const problem = periodRangeProblem(input.startDate, input.endDate);
  if (problem) throw new ValidationError(problem);
  await assertAcademicYear(ctx.institutionId, input.academicYearId);
  return prisma.characterPeriod.create({
    data: { ...input, academicYearId: input.academicYearId ?? null, institutionId: ctx.institutionId, createdById: ctx.userId },
  });
}

export async function updatePeriod(ctx: CharacterCtx, id: string, input: UpdatePeriodDtoType) {
  const p = await periodOrThrow(ctx.institutionId, id);
  const problem = periodRangeProblem(input.startDate ?? p.startDate, input.endDate ?? p.endDate);
  if (problem) throw new ValidationError(problem);
  await assertAcademicYear(ctx.institutionId, input.academicYearId);
  return prisma.characterPeriod.update({ where: { id }, data: input });
}

export async function deletePeriod(ctx: CharacterCtx, id: string) {
  await periodOrThrow(ctx.institutionId, id);
  const [scores, awards] = await Promise.all([
    prisma.characterScore.count({ where: { periodId: id } }),
    prisma.characterAward.count({ where: { periodId: id } }),
  ]);
  if (scores + awards > 0) throw new ConflictError('This period already has scores or badges — lock it instead of deleting it');
  await prisma.characterPeriod.delete({ where: { id } });
  return { id };
}

// ── Sections the actor can assess ────────────────────────────────────────────

export async function listMySections(ctx: CharacterCtx) {
  const allowed = await allowedSectionIds(ctx);
  const rows = await prisma.section.findMany({
    where: { class: { branch: { institutionId: ctx.institutionId } }, ...(allowed ? { id: { in: [...allowed] } } : {}) },
    select: { id: true, name: true, class: { select: { id: true, name: true, level: true } }, _count: { select: { students: true } } },
    orderBy: [{ class: { level: 'asc' } }, { class: { name: 'asc' } }, { name: 'asc' }],
  });
  return rows.map((s) => ({ id: s.id, name: s.name, classId: s.class.id, className: s.class.name, studentCount: s._count.students }));
}

// ── Grid ─────────────────────────────────────────────────────────────────────

const traitLike = (t: { id: string; scaleMin: number; scaleMax: number; weight: Prisma.Decimal | number }): TraitLike => ({
  id: t.id,
  scaleMin: t.scaleMin,
  scaleMax: t.scaleMax,
  weight: Number(t.weight),
});

export async function getGrid(ctx: CharacterCtx, q: GridQueryDtoType) {
  const [period, section] = await Promise.all([periodOrThrow(ctx.institutionId, q.periodId), assertSectionAccess(ctx, q.sectionId)]);
  const [traits, students] = await Promise.all([
    prisma.characterTrait.findMany({ where: { institutionId: ctx.institutionId, active: true }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] }),
    prisma.student.findMany({
      where: { institutionId: ctx.institutionId, sectionId: section.id, status: 'ACTIVE' },
      select: { id: true, firstName: true, lastName: true, rollNumber: true, avatarUrl: true, studentId: true },
      orderBy: [{ rollNumber: 'asc' }, { firstName: 'asc' }],
    }),
  ]);
  const ids = students.map((s) => s.id);
  const [scores, comments, awards] = await Promise.all([
    prisma.characterScore.findMany({ where: { periodId: period.id, studentId: { in: ids } }, select: { studentId: true, traitId: true, score: true } }),
    prisma.characterComment.findMany({ where: { periodId: period.id, studentId: { in: ids } }, select: { studentId: true, comment: true } }),
    prisma.characterAward.groupBy({ by: ['studentId'], where: { periodId: period.id, studentId: { in: ids }, revokedAt: null }, _count: { _all: true } }),
  ]);
  const tl = traits.map(traitLike);
  const scoresBy: Record<string, Record<string, number>> = {};
  for (const s of scores) (scoresBy[s.studentId] ??= {})[s.traitId] = s.score;
  const commentBy = Object.fromEntries(comments.map((c) => [c.studentId, c.comment]));
  const awardsBy = Object.fromEntries(awards.map((a) => [a.studentId, a._count._all]));
  return {
    period,
    section: { id: section.id, name: section.name, classId: section.class.id, className: section.class.name },
    traits: traits.map(traitOut),
    students: students.map((s) => {
      const row = scoresBy[s.id] ?? {};
      const overall = overallPercent(Object.entries(row).map(([traitId, score]) => ({ traitId, score })), tl);
      return { ...s, scores: row, comment: commentBy[s.id] ?? null, overall, band: characterBand(overall), badgesThisPeriod: awardsBy[s.id] ?? 0 };
    }),
    canEdit: !period.locked,
  };
}

export async function saveGrid(ctx: CharacterCtx, input: SaveGridDtoType) {
  const [period, section] = await Promise.all([periodOrThrow(ctx.institutionId, input.periodId), assertSectionAccess(ctx, input.sectionId)]);
  if (period.locked) throw new BadRequestError('This period is locked — unlock it to change scores');

  const studentIds = [...new Set([...input.scores.map((s) => s.studentId), ...input.comments.map((c) => c.studentId)])];
  const traitIds = [...new Set(input.scores.map((s) => s.traitId))];
  const [students, traits] = await Promise.all([
    prisma.student.findMany({ where: { institutionId: ctx.institutionId, id: { in: studentIds }, sectionId: section.id }, select: { id: true } }),
    prisma.characterTrait.findMany({ where: { institutionId: ctx.institutionId, id: { in: traitIds }, active: true } }),
  ]);
  if (students.length !== studentIds.length) throw new ForbiddenError('Every student must belong to this section');
  if (traits.length !== traitIds.length) throw new NotFoundError('Trait not found or inactive');
  const traitById = new Map(traits.map((t) => [t.id, t]));

  // Last write wins for a repeated cell.
  const cells = new Map<string, { studentId: string; traitId: string; score: number | null }>();
  for (const c of input.scores) cells.set(`${c.studentId}:${c.traitId}`, c);
  const bad = [...cells.values()].filter((c) => c.score != null && !isValidScore(c.score, traitById.get(c.traitId)!));
  if (bad.length) {
    const t = traitById.get(bad[0].traitId)!;
    throw new ValidationError(`Scores for ${t.name} must be whole numbers from ${t.scaleMin} to ${t.scaleMax}`);
  }

  // Group the touched traits per student → one deleteMany + one createMany.
  const touched = new Map<string, string[]>();
  for (const c of cells.values()) touched.set(c.studentId, [...(touched.get(c.studentId) ?? []), c.traitId]);
  const toCreate = [...cells.values()]
    .filter((c) => c.score != null)
    .map((c) => ({
      institutionId: ctx.institutionId,
      periodId: period.id,
      studentId: c.studentId,
      traitId: c.traitId,
      score: c.score as number,
      sectionId: section.id,
      scoredById: ctx.userId,
    }));

  const commentUpserts = input.comments.filter((c) => c.comment);
  const commentDeletes = input.comments.filter((c) => !c.comment).map((c) => c.studentId);

  await prisma.$transaction(async (tx) => {
    if (touched.size) {
      await tx.characterScore.deleteMany({
        where: { periodId: period.id, OR: [...touched.entries()].map(([studentId, ts]) => ({ studentId, traitId: { in: ts } })) },
      });
    }
    if (toCreate.length) await tx.characterScore.createMany({ data: toCreate });
    if (commentDeletes.length) await tx.characterComment.deleteMany({ where: { periodId: period.id, studentId: { in: commentDeletes } } });
    for (const c of commentUpserts) {
      await tx.characterComment.upsert({
        where: { periodId_studentId: { periodId: period.id, studentId: c.studentId } },
        create: { institutionId: ctx.institutionId, periodId: period.id, studentId: c.studentId, comment: c.comment as string, authorId: ctx.userId },
        update: { comment: c.comment as string, authorId: ctx.userId },
      });
    }
  });
  return { saved: toCreate.length, cleared: [...cells.values()].length - toCreate.length, comments: input.comments.length };
}

// ── Badges ───────────────────────────────────────────────────────────────────

const badgeOut = <T extends { ruleThreshold: Prisma.Decimal | null }>(b: T) => ({ ...b, ruleThreshold: num(b.ruleThreshold) });

async function badgeOrThrow(institutionId: string, id: string) {
  const b = await prisma.characterBadge.findFirst({ where: { id, institutionId } });
  if (!b) throw new NotFoundError('Badge not found');
  return b;
}

async function validateRule(institutionId: string, def: { rule: BadgeRule; ruleTraitId?: string | null; ruleThreshold?: number | null; ruleStreakDays?: number | null }) {
  const trait = def.ruleTraitId ? await prisma.characterTrait.findFirst({ where: { id: def.ruleTraitId, institutionId } }) : null;
  const problem = badgeRuleProblem(
    { rule: def.rule, ruleTraitId: def.ruleTraitId ?? null, ruleThreshold: def.ruleThreshold ?? null, ruleStreakDays: def.ruleStreakDays ?? null },
    trait,
  );
  if (problem) throw new ValidationError(problem);
}

/** Only the fields a rule uses are kept, so a switched rule never leaves stale values. */
function ruleData(def: { rule: BadgeRule; ruleTraitId?: string | null; ruleThreshold?: number | null; ruleStreakDays?: number | null }) {
  return {
    rule: def.rule,
    ruleTraitId: def.rule === 'TRAIT_AVERAGE' ? def.ruleTraitId ?? null : null,
    ruleThreshold: def.rule === 'TRAIT_AVERAGE' || def.rule === 'OVERALL_AVERAGE' ? (def.ruleThreshold != null ? dec(def.ruleThreshold) : null) : null,
    ruleStreakDays: def.rule === 'ATTENDANCE_STREAK' ? def.ruleStreakDays ?? null : null,
  };
}

export async function listBadges(ctx: CharacterCtx) {
  const rows = await prisma.characterBadge.findMany({
    where: { institutionId: ctx.institutionId },
    include: { ruleTrait: { select: { id: true, name: true, nameBn: true } }, _count: { select: { awards: { where: { revokedAt: null } } } } },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
  });
  return rows.map(badgeOut);
}

export async function seedDefaultBadges(ctx: CharacterCtx) {
  const count = await prisma.characterBadge.count({ where: { institutionId: ctx.institutionId } });
  if (count === 0) {
    await prisma.characterBadge.createMany({
      data: DEFAULT_BADGES.map((b, i) => ({
        institutionId: ctx.institutionId,
        name: b.name,
        nameBn: b.nameBn,
        description: b.description,
        icon: b.icon,
        color: b.color,
        points: b.points,
        sortOrder: i,
        ...ruleData({ rule: b.rule, ruleThreshold: b.ruleThreshold ?? null, ruleStreakDays: b.ruleStreakDays ?? null }),
      })),
    });
  }
  return listBadges(ctx);
}

export async function createBadge(ctx: CharacterCtx, input: CreateBadgeDtoType) {
  await validateRule(ctx.institutionId, input);
  const { rule: _r, ruleTraitId: _t, ruleThreshold: _th, ruleStreakDays: _s, ...rest } = input;
  const b = await prisma.characterBadge.create({ data: { ...rest, ...ruleData(input), institutionId: ctx.institutionId } });
  return badgeOut(b);
}

export async function updateBadge(ctx: CharacterCtx, id: string, input: UpdateBadgeDtoType) {
  const b = await badgeOrThrow(ctx.institutionId, id);
  const merged = {
    rule: input.rule ?? b.rule,
    ruleTraitId: input.ruleTraitId !== undefined ? input.ruleTraitId : b.ruleTraitId,
    ruleThreshold: input.ruleThreshold !== undefined ? input.ruleThreshold : num(b.ruleThreshold),
    ruleStreakDays: input.ruleStreakDays !== undefined ? input.ruleStreakDays : b.ruleStreakDays,
  };
  await validateRule(ctx.institutionId, merged);
  const { rule: _r, ruleTraitId: _t, ruleThreshold: _th, ruleStreakDays: _s, ...rest } = input;
  const updated = await prisma.characterBadge.update({ where: { id }, data: { ...rest, ...ruleData(merged) } });
  return badgeOut(updated);
}

export async function deleteBadge(ctx: CharacterCtx, id: string) {
  await badgeOrThrow(ctx.institutionId, id);
  const used = await prisma.characterAward.count({ where: { badgeId: id } });
  if (used > 0) throw new ConflictError('This badge has been awarded — switch it off (inactive) instead of deleting it');
  await prisma.characterBadge.delete({ where: { id } });
  return { id };
}

// ── Awards + points ledger ───────────────────────────────────────────────────

async function institutionName(institutionId: string): Promise<string> {
  const i = await prisma.institution.findUnique({ where: { id: institutionId }, select: { name: true } });
  return i?.name ?? '';
}

/** Guardian + student user ids per student (for BADGE_AWARDED). */
async function recipientsByStudent(institutionId: string, studentIds: string[]): Promise<Map<string, string[]>> {
  const rows = await prisma.student.findMany({
    where: { institutionId, id: { in: studentIds } },
    select: { id: true, userId: true, guardians: { select: { guardian: { select: { userId: true } } } } },
  });
  const out = new Map<string, string[]>();
  for (const r of rows) {
    out.set(r.id, [r.userId, ...r.guardians.map((g) => g.guardian.userId)].filter((x): x is string => Boolean(x)));
  }
  return out;
}

async function notifyAwards(
  institutionId: string,
  awards: Array<{ id: string; studentId: string; points: number; reason: string | null }>,
  badge: { name: string; nameBn: string | null },
) {
  if (awards.length === 0) return;
  const settings = await getSettings(institutionId);
  if (!settings.notifyGuardians) return;
  const [recipients, students, instName] = await Promise.all([
    recipientsByStudent(institutionId, awards.map((a) => a.studentId)),
    prisma.student.findMany({ where: { institutionId, id: { in: awards.map((a) => a.studentId) } }, select: { id: true, firstName: true, lastName: true } }),
    institutionName(institutionId),
  ]);
  const nameOf = new Map(students.map((s) => [s.id, `${s.firstName} ${s.lastName}`.trim()]));
  for (const a of awards) {
    const to = recipients.get(a.studentId) ?? [];
    if (to.length === 0) continue;
    notifySafe({
      institutionId,
      type: 'BADGE_AWARDED',
      recipientUserIds: to,
      contextId: a.id,
      data: { link: '/character/mine', studentId: a.studentId },
      vars: {
        studentName: nameOf.get(a.studentId) ?? '',
        badgeName: badge.name,
        badgeNameBn: badge.nameBn || badge.name,
        points: String(a.points),
        reason: a.reason || '-',
        institutionName: instName,
      },
    });
  }
}

export async function awardBadge(ctx: CharacterCtx, input: AwardBadgeDtoType) {
  const badge = await badgeOrThrow(ctx.institutionId, input.badgeId);
  if (!badge.active) throw new BadRequestError('This badge is switched off');
  if (input.periodId) await periodOrThrow(ctx.institutionId, input.periodId);
  await assertStudentsAccess(ctx, input.studentIds);

  const now = new Date();
  const rows = [...new Set(input.studentIds)].map((studentId) => ({
    id: randomUUID(),
    institutionId: ctx.institutionId,
    badgeId: badge.id,
    studentId,
    periodId: input.periodId ?? null,
    source: 'MANUAL' as const,
    points: badge.points,
    reason: input.reason,
    awardedById: ctx.userId,
    awardedAt: now,
  }));
  await prisma.$transaction([
    prisma.characterAward.createMany({ data: rows }),
    prisma.characterPointEntry.createMany({
      data: rows
        .filter((r) => r.points !== 0)
        .map((r) => ({ institutionId: ctx.institutionId, studentId: r.studentId, points: r.points, reason: `Badge: ${badge.name}`, awardId: r.id, createdById: ctx.userId })),
    }),
  ]);
  await notifyAwards(ctx.institutionId, rows, badge);
  return { awarded: rows.length, awardIds: rows.map((r) => r.id) };
}

export async function revokeAward(ctx: CharacterCtx, id: string, reason: string) {
  const award = await prisma.characterAward.findFirst({ where: { id, institutionId: ctx.institutionId }, include: { badge: { select: { name: true } } } });
  if (!award) throw new NotFoundError('Award not found');
  if (!isManager(ctx) && award.awardedById !== ctx.userId) throw new ForbiddenError('Only an admin or the teacher who gave this badge can revoke it');
  if (award.revokedAt) return { id, alreadyRevoked: true };
  await prisma.$transaction(async (tx) => {
    const claim = await tx.characterAward.updateMany({
      where: { id, revokedAt: null },
      data: { revokedAt: new Date(), revokedById: ctx.userId, revokeReason: reason },
    });
    if (claim.count !== 1 || award.points === 0) return;
    await tx.characterPointEntry.create({
      data: { institutionId: ctx.institutionId, studentId: award.studentId, points: -award.points, reason: `Revoked: ${award.badge.name} (${reason})`, awardId: id, createdById: ctx.userId },
    });
  });
  return { id, revoked: true };
}

export async function listAwards(ctx: CharacterCtx, q: AwardQueryDtoType) {
  const allowed = await allowedSectionIds(ctx);
  if (q.sectionId && allowed && !allowed.has(q.sectionId)) throw new ForbiddenError('You can only view sections you teach');
  const where: Prisma.CharacterAwardWhereInput = {
    institutionId: ctx.institutionId,
    ...(q.studentId ? { studentId: q.studentId } : {}),
    ...(q.badgeId ? { badgeId: q.badgeId } : {}),
    ...(q.sectionId ? { student: { sectionId: q.sectionId } } : allowed ? { student: { sectionId: { in: [...allowed] } } } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.characterAward.findMany({
      where,
      include: {
        badge: { select: { id: true, name: true, nameBn: true, icon: true, color: true } },
        student: { select: { id: true, firstName: true, lastName: true, class: { select: { name: true } }, section: { select: { name: true } } } },
        period: { select: { id: true, name: true } },
      },
      orderBy: { awardedAt: 'desc' },
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
    }),
    prisma.characterAward.count({ where }),
  ]);
  return { items, total };
}

export async function adjustPoints(ctx: CharacterCtx, input: AdjustPointsDtoType) {
  await assertStudentsAccess(ctx, [input.studentId]);
  return prisma.characterPointEntry.create({
    data: { institutionId: ctx.institutionId, studentId: input.studentId, points: input.points, reason: input.reason, createdById: ctx.userId },
  });
}

export async function listPoints(ctx: CharacterCtx, studentId: string) {
  await assertCanViewStudent(ctx, studentId);
  const [entries, sum] = await Promise.all([
    prisma.characterPointEntry.findMany({ where: { institutionId: ctx.institutionId, studentId }, orderBy: { createdAt: 'desc' }, take: 200 }),
    prisma.characterPointEntry.aggregate({ where: { institutionId: ctx.institutionId, studentId }, _sum: { points: true } }),
  ]);
  return { balance: sum._sum.points ?? 0, entries };
}

// ── Auto-award (evaluates the documented rules for one period) ───────────────

export async function runAutoAwards(ctx: CharacterCtx, input: { periodId: string; sectionId?: string }) {
  const period = await periodOrThrow(ctx.institutionId, input.periodId);
  if (!isManager(ctx) && !input.sectionId) throw new BadRequestError('Choose a section');
  if (input.sectionId) await assertSectionAccess(ctx, input.sectionId);

  const badges = await prisma.characterBadge.findMany({ where: { institutionId: ctx.institutionId, active: true, rule: { not: 'NONE' } } });
  if (badges.length === 0) return { awarded: 0, checkedStudents: 0, badges: 0 };

  const students = await prisma.student.findMany({
    where: { institutionId: ctx.institutionId, status: 'ACTIVE', ...(input.sectionId ? { sectionId: input.sectionId } : {}) },
    select: { id: true },
  });
  const ids = students.map((s) => s.id);
  if (ids.length === 0) return { awarded: 0, checkedStudents: 0, badges: badges.length };

  const needsStreak = badges.some((b) => b.rule === 'ATTENDANCE_STREAK');
  const [traits, scores, attendance] = await Promise.all([
    prisma.characterTrait.findMany({ where: { institutionId: ctx.institutionId, active: true } }),
    prisma.characterScore.findMany({ where: { periodId: period.id, studentId: { in: ids } }, select: { studentId: true, traitId: true, score: true } }),
    needsStreak
      ? prisma.attendance.findMany({
          where: { institutionId: ctx.institutionId, studentId: { in: ids }, date: { gte: period.startDate, lte: period.endDate } },
          select: { studentId: true, date: true, status: true },
        })
      : Promise.resolve([] as Array<{ studentId: string; date: Date; status: string }>),
  ]);
  const tl = traits.map(traitLike);
  const scoresBy = new Map<string, Array<{ traitId: string; score: number }>>();
  for (const s of scores) scoresBy.set(s.studentId, [...(scoresBy.get(s.studentId) ?? []), s]);
  const attBy = new Map<string, Array<{ date: Date; status: string }>>();
  for (const a of attendance) attBy.set(a.studentId, [...(attBy.get(a.studentId) ?? []), a]);

  const candidates: Array<{ badge: (typeof badges)[number]; studentId: string; key: string }> = [];
  for (const studentId of ids) {
    const rows = scoresBy.get(studentId) ?? [];
    const facts = {
      traitScores: Object.fromEntries(rows.map((r) => [r.traitId, r.score])),
      overallPercent: overallPercent(rows, tl),
      streak: needsStreak ? longestOnTimeStreak(attBy.get(studentId) ?? []) : 0,
    };
    for (const b of badges) {
      const def = { rule: b.rule as BadgeRule, ruleTraitId: b.ruleTraitId, ruleThreshold: num(b.ruleThreshold), ruleStreakDays: b.ruleStreakDays };
      if (meetsBadgeRule(def, facts)) candidates.push({ badge: b, studentId, key: autoDedupeKey(b.id, studentId, period.id) });
    }
  }
  if (candidates.length === 0) return { awarded: 0, checkedStudents: ids.length, badges: badges.length };

  // Idempotent: dedupeKey is unique, so a re-run (or a concurrent run) never
  // awards the same badge twice for the same student and period.
  const existing = new Set(
    (await prisma.characterAward.findMany({ where: { dedupeKey: { in: candidates.map((c) => c.key) } }, select: { dedupeKey: true } })).map((a) => a.dedupeKey),
  );
  const fresh = candidates.filter((c) => !existing.has(c.key));
  const now = new Date();
  const rows = fresh.map((c) => ({
    id: randomUUID(),
    institutionId: ctx.institutionId,
    badgeId: c.badge.id,
    studentId: c.studentId,
    periodId: period.id,
    source: 'AUTO' as const,
    points: c.badge.points,
    reason: `Auto: ${c.badge.name}`,
    dedupeKey: c.key,
    awardedById: ctx.userId,
    awardedAt: now,
  }));
  await prisma.characterAward.createMany({ data: rows, skipDuplicates: true });
  // Only the rows that actually landed (a concurrent run may have won some).
  const landed = await prisma.characterAward.findMany({ where: { id: { in: rows.map((r) => r.id) } }, select: { id: true, studentId: true, points: true, reason: true, badgeId: true } });
  if (landed.length) {
    await prisma.characterPointEntry.createMany({
      data: landed
        .filter((a) => a.points !== 0)
        .map((a) => ({ institutionId: ctx.institutionId, studentId: a.studentId, points: a.points, reason: a.reason ?? 'Badge', awardId: a.id, createdById: ctx.userId })),
    });
  }
  for (const b of badges) {
    await notifyAwards(ctx.institutionId, landed.filter((a) => a.badgeId === b.id), b);
  }
  logger.info('Character auto-awards run', { institutionId: ctx.institutionId, periodId: period.id, awarded: landed.length });
  return { awarded: landed.length, checkedStudents: ids.length, badges: badges.length };
}

// ── Student summary (profile tab, dashboards, report card) ───────────────────

async function buildSummaries(institutionId: string, studentIds: string[]) {
  if (studentIds.length === 0) return [];
  const [students, traits, periods, awards, points, settings] = await Promise.all([
    prisma.student.findMany({
      where: { institutionId, id: { in: studentIds } },
      select: { id: true, firstName: true, lastName: true, avatarUrl: true, class: { select: { id: true, name: true } }, section: { select: { id: true, name: true } } },
    }),
    prisma.characterTrait.findMany({ where: { institutionId, active: true }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] }),
    prisma.characterPeriod.findMany({
      where: { institutionId, scores: { some: { studentId: { in: studentIds } } } },
      orderBy: { startDate: 'desc' },
      take: 6,
      select: { id: true, name: true, kind: true, startDate: true, endDate: true },
    }),
    prisma.characterAward.findMany({
      where: { institutionId, studentId: { in: studentIds }, revokedAt: null },
      include: { badge: { select: { id: true, name: true, nameBn: true, icon: true, color: true } }, period: { select: { name: true } } },
      orderBy: { awardedAt: 'desc' },
      take: 50 * studentIds.length,
    }),
    prisma.characterPointEntry.groupBy({ by: ['studentId'], where: { institutionId, studentId: { in: studentIds } }, _sum: { points: true } }),
    getSettings(institutionId),
  ]);
  const periodIds = periods.map((p) => p.id);
  const [scores, comments] = await Promise.all([
    prisma.characterScore.findMany({ where: { periodId: { in: periodIds }, studentId: { in: studentIds } }, select: { periodId: true, studentId: true, traitId: true, score: true } }),
    prisma.characterComment.findMany({ where: { periodId: { in: periodIds }, studentId: { in: studentIds } }, select: { periodId: true, studentId: true, comment: true } }),
  ]);
  const tl = traits.map(traitLike);
  const pointsBy = new Map(points.map((p) => [p.studentId, p._sum.points ?? 0]));

  return students.map((s) => {
    const mine = scores.filter((x) => x.studentId === s.id);
    const history = periods
      .map((p) => {
        const rows = mine.filter((x) => x.periodId === p.id);
        const overall = overallPercent(rows, tl);
        return rows.length ? { period: p, overall, band: characterBand(overall) } : null;
      })
      .filter((x): x is NonNullable<typeof x> => Boolean(x));
    const latest = history[0] ?? null;
    const latestRows = latest ? mine.filter((x) => x.periodId === latest.period.id) : [];
    const byTrait = averageByTrait(latestRows);
    return {
      student: s,
      points: pointsBy.get(s.id) ?? 0,
      latest: latest
        ? {
            period: latest.period,
            overall: latest.overall,
            band: latest.band,
            comment: comments.find((c) => c.studentId === s.id && c.periodId === latest.period.id)?.comment ?? null,
            traits: traits
              .filter((t) => byTrait[t.id] != null)
              .map((t) => ({ id: t.id, name: t.name, nameBn: t.nameBn, score: byTrait[t.id], scaleMin: t.scaleMin, scaleMax: t.scaleMax })),
          }
        : null,
      history: history.map((h) => ({ periodId: h.period.id, name: h.period.name, startDate: h.period.startDate, overall: h.overall })),
      badges: awards.filter((a) => a.studentId === s.id).slice(0, 50),
      leaderboardVisible: settings.leaderboardEnabled && settings.leaderboardPublic,
    };
  });
}

export async function studentSummary(ctx: CharacterCtx, studentId: string) {
  await assertCanViewStudent(ctx, studentId);
  const [summary] = await buildSummaries(ctx.institutionId, [studentId]);
  return summary;
}

/**
 * T3 family profile: per-child character summary. The caller has already
 * checked access to the family; returns [] while the module is off.
 */
export async function familyCharacterSummaries(institutionId: string, studentIds: string[]) {
  if (studentIds.length === 0 || !(await isModuleEnabled(institutionId, MODULE_KEY))) return [];
  return buildSummaries(institutionId, studentIds);
}

/** Student: own card. Guardian: one card per linked child. */
export async function mySummaries(ctx: CharacterCtx) {
  let ids: string[] = [];
  if (ctx.role === 'STUDENT') {
    const own = await studentRepository.findByUserId(ctx.institutionId, ctx.userId);
    ids = own ? [own.id] : [];
  } else if (ctx.role === 'GUARDIAN') {
    ids = await guardianRepository.findLinkedStudentIdsByUserId(ctx.institutionId, ctx.userId);
  }
  return { children: await buildSummaries(ctx.institutionId, ids) };
}

/**
 * For the report card PDF: the most recent period that started on or before
 * `at` and has scores for the student. Null when the module is off or there
 * is nothing to print. Never throws (report cards must not break).
 */
export async function reportCardCharacter(institutionId: string, studentId: string, at: Date) {
  try {
    if (!(await isModuleEnabled(institutionId, MODULE_KEY))) return null;
    const period = await prisma.characterPeriod.findFirst({
      where: { institutionId, startDate: { lte: at }, scores: { some: { studentId } } },
      orderBy: { startDate: 'desc' },
    });
    if (!period) return null;
    const [traits, scores, comment, badges, pts] = await Promise.all([
      prisma.characterTrait.findMany({ where: { institutionId }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] }),
      prisma.characterScore.findMany({ where: { periodId: period.id, studentId }, select: { traitId: true, score: true } }),
      prisma.characterComment.findFirst({ where: { periodId: period.id, studentId }, select: { comment: true } }),
      prisma.characterAward.findMany({ where: { institutionId, studentId, revokedAt: null, periodId: period.id }, select: { badge: { select: { name: true } } } }),
      prisma.characterPointEntry.aggregate({ where: { institutionId, studentId }, _sum: { points: true } }),
    ]);
    const overall = overallPercent(scores, traits.map(traitLike));
    const scoreBy = new Map(scores.map((s) => [s.traitId, s.score]));
    return {
      periodName: period.name,
      overall,
      band: characterBand(overall),
      traits: traits.filter((t) => scoreBy.has(t.id)).map((t) => ({ name: t.name, nameBn: t.nameBn, score: scoreBy.get(t.id) as number, max: t.scaleMax })),
      badges: badges.map((b) => b.badge.name),
      points: pts._sum.points ?? 0,
      comment: comment?.comment ?? null,
    };
  } catch (err) {
    logger.warn('Failed to load character summary for report card', { studentId, error: (err as Error).message });
    return null;
  }
}

// ── Leaderboard (first name + class only) ────────────────────────────────────

export async function leaderboard(ctx: CharacterCtx, q: LeaderboardQueryDtoType) {
  const settings = await getSettings(ctx.institutionId);
  if (!settings.leaderboardEnabled) throw new ForbiddenError('Leaderboards are switched off for this school');
  const staff = isManager(ctx) || isTeacher(ctx) || ctx.role === 'ACCOUNTANT';
  if (!staff && !settings.leaderboardPublic) throw new ForbiddenError('Leaderboards are visible to staff only');

  let classId = q.classId ?? null;
  let sectionId = q.sectionId ?? null;
  let mine: string[] = [];
  if (!staff) {
    // Students and guardians: only their own (child's) class.
    if (ctx.role === 'STUDENT') {
      const own = await prisma.student.findFirst({ where: { institutionId: ctx.institutionId, userId: ctx.userId }, select: { id: true, classId: true } });
      mine = own ? [own.id] : [];
      classId = own?.classId ?? null;
    } else {
      mine = await guardianRepository.findLinkedStudentIdsByUserId(ctx.institutionId, ctx.userId);
      const child = mine.length
        ? await prisma.student.findFirst({ where: { institutionId: ctx.institutionId, id: { in: mine }, ...(q.classId ? { classId: q.classId } : {}) }, select: { classId: true } })
        : null;
      classId = child?.classId ?? null;
    }
    sectionId = null;
    if (!classId) return { className: null, rows: [] };
  } else if (isTeacher(ctx) && sectionId) {
    await assertSectionAccess(ctx, sectionId);
  }
  if (!classId && !sectionId) throw new BadRequestError('Choose a class or section');

  const cls = classId
    ? await prisma.class.findFirst({ where: { id: classId, branch: { institutionId: ctx.institutionId } }, select: { id: true, name: true } })
    : null;
  if (classId && !cls) throw new NotFoundError('Class not found');

  let dateFilter: Prisma.DateTimeFilter | undefined;
  if (q.periodId) {
    const p = await periodOrThrow(ctx.institutionId, q.periodId);
    dateFilter = { gte: p.startDate, lte: new Date(p.endDate.getTime() + 86_399_999) };
  }
  const studentWhere: Prisma.StudentWhereInput = { institutionId: ctx.institutionId, status: 'ACTIVE', ...(classId ? { classId } : {}), ...(sectionId ? { sectionId } : {}) };
  const grouped = await prisma.characterPointEntry.groupBy({
    by: ['studentId'],
    where: { institutionId: ctx.institutionId, student: studentWhere, ...(dateFilter ? { createdAt: dateFilter } : {}) },
    _sum: { points: true },
  });
  const positive = grouped.filter((g) => (g._sum.points ?? 0) > 0);
  const students = await prisma.student.findMany({
    where: { institutionId: ctx.institutionId, id: { in: positive.map((g) => g.studentId) } },
    select: { id: true, firstName: true, class: { select: { name: true } } },
  });
  const byId = new Map(students.map((s) => [s.id, s]));
  const ranked = rankRows(
    positive.map((g) => ({ studentId: g.studentId, points: g._sum.points ?? 0 })),
  ).slice(0, q.limit);
  return {
    className: cls?.name ?? null,
    rows: ranked.map((r) => ({
      rank: r.rank,
      name: leaderboardName(byId.get(r.studentId)?.firstName),
      className: byId.get(r.studentId)?.class?.name ?? cls?.name ?? '',
      points: r.points,
      isMine: mine.includes(r.studentId),
    })),
  };
}

// ── Staff overview (dashboard widget) ────────────────────────────────────────

export async function overview(ctx: CharacterCtx) {
  const allowed = await allowedSectionIds(ctx);
  const studentFilter: Prisma.StudentWhereInput | undefined = allowed ? { sectionId: { in: [...allowed] } } : undefined;
  const since = new Date(Date.now() - 30 * 86_400_000);
  const [traits, badges, latestPeriod, awards30, recent] = await Promise.all([
    prisma.characterTrait.count({ where: { institutionId: ctx.institutionId, active: true } }),
    prisma.characterBadge.count({ where: { institutionId: ctx.institutionId, active: true } }),
    prisma.characterPeriod.findFirst({ where: { institutionId: ctx.institutionId }, orderBy: { startDate: 'desc' }, select: { id: true, name: true, locked: true, startDate: true, endDate: true } }),
    prisma.characterAward.count({ where: { institutionId: ctx.institutionId, revokedAt: null, awardedAt: { gte: since }, ...(studentFilter ? { student: studentFilter } : {}) } }),
    prisma.characterAward.findMany({
      where: { institutionId: ctx.institutionId, revokedAt: null, ...(studentFilter ? { student: studentFilter } : {}) },
      include: { badge: { select: { name: true, nameBn: true, icon: true, color: true } }, student: { select: { firstName: true, lastName: true, class: { select: { name: true } } } } },
      orderBy: { awardedAt: 'desc' },
      take: 5,
    }),
  ]);
  return { traits, badges, latestPeriod, awardsLast30Days: awards30, recent };
}
