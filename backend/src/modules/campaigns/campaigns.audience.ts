import { CampaignChannel, Prisma, UserRole } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { ForbiddenError, NotFoundError, ValidationError } from '../../utils/AppError';
import { digitsOf, normalizeBdMobile } from '../../utils/phone';
import type { AudienceDtoType } from './campaigns.dto';

// =============================================================================
// Audience resolution — turns a stored audience definition into people, and
// people into one deliverable address per channel.
// =============================================================================

export interface CampaignRecipient {
  /** Login account, when one exists (required for IN_APP). */
  userId: string | null;
  studentId?: string;
  guardianId?: string;
  name: string;
  role: string;
  phone: string | null;
  email: string | null;
}

export interface AddressedRecipient extends CampaignRecipient {
  /** Canonical delivery address for the campaign's channel (phone / email / userId). */
  address: string;
}

const STUDENT_GUARDIAN = new Set<string>(['STUDENT', 'GUARDIAN']);

/** Teachers may only reach students and guardians of sections they are class teacher of. */
export interface TeacherScope {
  sectionIds: Set<string>;
  studentIds: Set<string>;
  guardianIds: Set<string>;
  userIds: Set<string>;
}

export function normalizeAudience(raw: unknown): AudienceDtoType {
  const a = (raw && typeof raw === 'object' ? raw : {}) as Partial<AudienceDtoType>;
  const list = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && !!x) : []);
  return {
    roles: list(a.roles) as AudienceDtoType['roles'],
    classIds: list(a.classIds),
    sectionIds: list(a.sectionIds),
    userIds: list(a.userIds),
    groupIds: list(a.groupIds),
  };
}

export function isAudienceEmpty(a: AudienceDtoType): boolean {
  return !a.roles.length && !a.classIds.length && !a.sectionIds.length && !a.userIds.length && !a.groupIds.length;
}

/** Canonical address for a channel, or null when this person can't be reached there. */
export function addressFor(channel: CampaignChannel, r: CampaignRecipient): string | null {
  if (channel === 'IN_APP') return r.userId;
  if (channel === 'EMAIL') {
    const email = r.email?.trim().toLowerCase();
    return email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
  }
  // SMS — prefer the canonical BD form so "017..." and "+88017..." collapse
  // into one recipient; fall back to plain digits for other valid-looking numbers.
  if (!r.phone) return null;
  const bd = normalizeBdMobile(r.phone);
  if (bd) return bd;
  const digits = digitsOf(r.phone);
  return digits.length >= 10 && digits.length <= 15 ? digits : null;
}

/**
 * One entry per distinct address. The first person seen for an address wins —
 * a guardian with two children, or a student also picked by name, gets the
 * message exactly once.
 */
export function addressRecipients(
  channel: CampaignChannel,
  recipients: CampaignRecipient[],
): { addressed: AddressedRecipient[]; unreachable: number } {
  const seen = new Set<string>();
  const addressed: AddressedRecipient[] = [];
  const unreachablePeople = new Set<string>();

  for (const r of recipients) {
    const address = addressFor(channel, r);
    if (!address) {
      unreachablePeople.add(r.studentId ? `s:${r.studentId}` : r.guardianId ? `g:${r.guardianId}` : `u:${r.userId}`);
      continue;
    }
    if (seen.has(address)) continue;
    seen.add(address);
    addressed.push({ ...r, address });
  }
  return { addressed, unreachable: unreachablePeople.size };
}

// ── Tenant ownership checks ────────────────────────────────────────────────

async function assertAllFound(
  label: string,
  ids: string[],
  found: { id: string }[],
): Promise<void> {
  if (found.length === new Set(ids).size) return;
  const have = new Set(found.map((f) => f.id));
  const missing = ids.filter((id) => !have.has(id));
  throw new NotFoundError(`${label} not found in this institution: ${missing.slice(0, 5).join(', ')}`);
}

/** Every client-supplied id in an audience must belong to the tenant. */
export async function assertAudienceBelongsToTenant(
  institutionId: string,
  audience: AudienceDtoType,
  opts: { groupOwnerUserId?: string } = {},
): Promise<void> {
  if (audience.classIds.length) {
    const found = await prisma.class.findMany({
      where: { id: { in: audience.classIds }, branch: { institutionId } },
      select: { id: true },
    });
    await assertAllFound('Class(es)', audience.classIds, found);
  }
  if (audience.sectionIds.length) {
    const found = await prisma.section.findMany({
      where: { id: { in: audience.sectionIds }, class: { branch: { institutionId } } },
      select: { id: true },
    });
    await assertAllFound('Section(s)', audience.sectionIds, found);
  }
  if (audience.userIds.length) {
    const found = await prisma.user.findMany({
      where: { id: { in: audience.userIds }, institutionId },
      select: { id: true },
    });
    await assertAllFound('User(s)', audience.userIds, found);
  }
  if (audience.groupIds.length) {
    const found = await prisma.messageGroup.findMany({
      where: {
        id: { in: audience.groupIds },
        institutionId,
        ...(opts.groupOwnerUserId ? { createdByUserId: opts.groupOwnerUserId } : {}),
      },
      select: { id: true },
    });
    await assertAllFound('Message group(s)', audience.groupIds, found);
  }
}

// ── Teacher scoping ─────────────────────────────────────────────────────────

export async function loadTeacherScope(institutionId: string, teacherUserId: string): Promise<TeacherScope> {
  const sections = await prisma.section.findMany({
    where: { classTeacher: { userId: teacherUserId }, class: { branch: { institutionId } } },
    select: { id: true },
  });
  const sectionIds = new Set(sections.map((s) => s.id));
  if (sectionIds.size === 0) {
    return { sectionIds, studentIds: new Set(), guardianIds: new Set(), userIds: new Set() };
  }

  const students = await prisma.student.findMany({
    where: { institutionId, sectionId: { in: [...sectionIds] } },
    select: {
      id: true,
      userId: true,
      guardians: { select: { guardian: { select: { id: true, userId: true } } } },
    },
  });

  const studentIds = new Set<string>();
  const guardianIds = new Set<string>();
  const userIds = new Set<string>();
  for (const s of students) {
    studentIds.add(s.id);
    if (s.userId) userIds.add(s.userId);
    for (const link of s.guardians) {
      guardianIds.add(link.guardian.id);
      if (link.guardian.userId) userIds.add(link.guardian.userId);
    }
  }
  return { sectionIds, studentIds, guardianIds, userIds };
}

/**
 * A teacher's audience may only name their own class-teacher sections, their
 * own groups, the STUDENT/GUARDIAN roles and people inside that scope.
 * Anything wider is a 403, not a silent narrowing, so the teacher sees why.
 */
export function assertTeacherAudience(audience: AudienceDtoType, scope: TeacherScope): void {
  if (scope.sectionIds.size === 0) {
    throw new ForbiddenError('Only class teachers can send campaigns, to the sections they are class teacher of');
  }
  const badRole = audience.roles.find((r) => !STUDENT_GUARDIAN.has(r));
  if (badRole) throw new ForbiddenError(`Teachers can only message students and guardians (not ${badRole})`);
  if (audience.classIds.length) {
    throw new ForbiddenError('Teachers target their own sections, not whole classes');
  }
  const foreignSection = audience.sectionIds.find((id) => !scope.sectionIds.has(id));
  if (foreignSection) throw new ForbiddenError('You can only message sections you are class teacher of');
  const foreignUser = audience.userIds.find((id) => !scope.userIds.has(id));
  if (foreignUser) throw new ForbiddenError('You can only message students and guardians of your own sections');
  if (!audience.sectionIds.length && !audience.userIds.length && !audience.groupIds.length) {
    throw new ValidationError('Pick at least one of your sections, a group or specific people');
  }
}

function inTeacherScope(r: CampaignRecipient, scope: TeacherScope): boolean {
  return (
    (!!r.studentId && scope.studentIds.has(r.studentId)) ||
    (!!r.guardianId && scope.guardianIds.has(r.guardianId)) ||
    (!!r.userId && scope.userIds.has(r.userId))
  );
}

// ── Resolution ─────────────────────────────────────────────────────────────

const fullName = (first?: string | null, last?: string | null) => `${first ?? ''} ${last ?? ''}`.trim();

/**
 * Resolves an audience to people. Staff roles are institution-wide; the
 * STUDENT/GUARDIAN roles are narrowed by classIds/sectionIds when given.
 * Only ACTIVE students and active login accounts are included.
 */
export async function resolveRecipients(
  institutionId: string,
  audience: AudienceDtoType,
  teacherScope?: TeacherScope,
): Promise<CampaignRecipient[]> {
  const out: CampaignRecipient[] = [];
  const hasPlacement = audience.classIds.length > 0 || audience.sectionIds.length > 0;
  const roles = new Set<string>(audience.roles);

  // Picking only classes/sections, with no role, means "their students and guardians".
  const wantStudents = roles.has('STUDENT') || (hasPlacement && !roles.has('GUARDIAN'));
  const wantGuardians = roles.has('GUARDIAN') || (hasPlacement && !roles.has('STUDENT'));

  const placement: Prisma.StudentWhereInput = hasPlacement
    ? {
        OR: [
          ...(audience.classIds.length ? [{ classId: { in: audience.classIds } }] : []),
          ...(audience.sectionIds.length ? [{ sectionId: { in: audience.sectionIds } }] : []),
        ],
      }
    : {};
  const studentWhere: Prisma.StudentWhereInput = { institutionId, status: 'ACTIVE', ...placement };

  if (wantStudents) {
    const students = await prisma.student.findMany({
      where: studentWhere,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        phone: true,
        email: true,
        userId: true,
        user: { select: { phone: true, email: true, isActive: true } },
      },
    });
    for (const s of students) {
      out.push({
        userId: s.userId && s.user?.isActive ? s.userId : null,
        studentId: s.id,
        name: fullName(s.firstName, s.lastName),
        role: 'STUDENT',
        phone: s.phone || s.user?.phone || null,
        email: s.email || s.user?.email || null,
      });
    }
  }

  if (wantGuardians) {
    const guardians = await prisma.guardian.findMany({
      where: { institutionId, students: { some: { student: studentWhere } } },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        phone: true,
        email: true,
        userId: true,
        user: { select: { isActive: true } },
      },
    });
    for (const g of guardians) {
      out.push({
        userId: g.userId && g.user?.isActive ? g.userId : null,
        guardianId: g.id,
        name: fullName(g.firstName, g.lastName),
        role: 'GUARDIAN',
        phone: g.phone || null,
        email: g.email || null,
      });
    }
  }

  const staffRoles = [...roles].filter((r) => !STUDENT_GUARDIAN.has(r)) as UserRole[];
  if (staffRoles.length) {
    const staff = await prisma.user.findMany({
      where: { institutionId, role: { in: staffRoles }, isActive: true },
      select: { id: true, firstName: true, lastName: true, phone: true, email: true, role: true },
    });
    for (const u of staff) {
      out.push({ userId: u.id, name: fullName(u.firstName, u.lastName), role: u.role, phone: u.phone, email: u.email });
    }
  }

  // Specific people + message-group members.
  const userIds = new Set(audience.userIds);
  if (audience.groupIds.length) {
    const members = await prisma.messageGroupMember.findMany({
      where: { groupId: { in: audience.groupIds }, group: { institutionId } },
      select: { userId: true },
    });
    for (const m of members) userIds.add(m.userId);
  }
  if (userIds.size) {
    const users = await prisma.user.findMany({
      where: { id: { in: [...userIds] }, institutionId, isActive: true },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        phone: true,
        email: true,
        role: true,
        studentProfile: { select: { id: true, phone: true } },
        guardianProfile: { select: { id: true, phone: true } },
      },
    });
    for (const u of users) {
      out.push({
        userId: u.id,
        studentId: u.studentProfile?.id,
        guardianId: u.guardianProfile?.id,
        name: fullName(u.firstName, u.lastName),
        role: u.role,
        phone: u.phone || u.studentProfile?.phone || u.guardianProfile?.phone || null,
        email: u.email,
      });
    }
  }

  return teacherScope ? out.filter((r) => inTeacherScope(r, teacherScope)) : out;
}
