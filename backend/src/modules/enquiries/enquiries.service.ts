import crypto from 'crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { ConflictError, NotFoundError, ValidationError } from '../../utils/AppError';
import { logger } from '../../utils/logger';
import * as repo from './enquiries.repository';
import { appendNote, computeFunnel, phonesMatch, publicApplicationState } from './enquiries.logic';
import {
  getStage,
  listStages,
  logActivity,
  stageChangeMetadata,
  stageTransitionPatch,
  type Actor,
  type StageRow,
} from '../crm/crm.stages';
import { stageForStatus } from '../crm/crm.logic';
import { moveToTrash } from '../trash/trash.service';
import type {
  ApplicationStatusQueryDtoType,
  BoardQueryDtoType,
  ConvertEnquiryDtoType,
  CreateEnquiryDtoType,
  EnquiryQueryDtoType,
  FunnelQueryDtoType,
  PublicEnquiryDtoType,
  UpdateEnquiryDtoType,
} from './enquiries.dto';

// =============================================================================
// Admission Enquiry service
// =============================================================================

const ASSIGNABLE_ROLES = ['ADMIN', 'TEACHER', 'MANAGEMENT', 'ACCOUNTANT', 'LIBRARIAN', 'TRANSPORT_OFFICER'] as const;

async function assertAssignee(institutionId: string, userId: string | null | undefined) {
  if (!userId) return;
  const user = await prisma.user.findFirst({
    where: { id: userId, institutionId, isActive: true, role: { in: [...ASSIGNABLE_ROLES] } },
    select: { id: true },
  });
  if (!user) throw new NotFoundError('Assignee not found among this institution’s staff');
}

async function getOrThrow(institutionId: string, id: string) {
  const enquiry = await repo.findById(institutionId, id);
  if (!enquiry) throw new NotFoundError('Enquiry not found');
  return enquiry;
}

export function listEnquiries(institutionId: string, query: EnquiryQueryDtoType, actor?: Actor) {
  return repo.list(institutionId, { ...query, ownerUserId: query.mine === 'true' ? actor?.userId ?? undefined : undefined });
}

export async function getBoard(institutionId: string, query: BoardQueryDtoType) {
  const columns = await repo.board(
    institutionId,
    { search: query.search, assignedToUserId: query.assignedToUserId },
    query.limit,
  );
  return { columns };
}

export function getEnquiry(institutionId: string, id: string) {
  return getOrThrow(institutionId, id);
}

/** Resolves the stage a create/update lands in: an explicit stageId wins, else the stage for the (new) status. */
async function resolveStage(
  institutionId: string,
  input: { stageId?: string | null; status?: string },
  current?: { stageId: string | null; status: string },
): Promise<StageRow | null> {
  if (input.stageId) return getStage(institutionId, input.stageId);
  if (input.status && (!current || input.status !== current.status || !current.stageId)) {
    return stageForStatus(await listStages(institutionId), input.status, current?.stageId) ?? null;
  }
  return null;
}

export async function createEnquiry(institutionId: string, data: CreateEnquiryDtoType, actor?: Actor) {
  await assertAssignee(institutionId, data.assignedToUserId);
  const stage = await resolveStage(institutionId, { stageId: data.stageId, status: data.status });
  const stagePatch = stage ? stageTransitionPatch({ stageId: null, wonAt: null }, stage, { lostReason: data.lostReason ?? null }) : {};
  const enquiry = await prisma.$transaction(async (tx) => {
    const created = await tx.admissionEnquiry.create({
      data: {
        institutionId,
        studentName: data.studentName,
        guardianName: data.guardianName ?? null,
        phone: data.phone,
        email: data.email ?? null,
        classInterested: data.classInterested ?? null,
        source: data.source ?? 'WALK_IN',
        status: data.status,
        notes: data.notes ?? null,
        assignedToUserId: data.assignedToUserId ?? null,
        followUpAt: data.followUpAt ?? null,
        nextStep: data.nextStep ?? null,
        priority: data.priority ?? 'NORMAL',
        lostReason: data.lostReason ?? null,
        ...(stagePatch as Record<string, never>),
      },
      select: { id: true },
    });
    await logActivity(tx, {
      institutionId,
      enquiryId: created.id,
      type: 'CREATED',
      body: stage ? `Created in "${stage.name}"` : 'Created',
      metadata: stage ? { toStageId: stage.id, toName: stage.name } : undefined,
      actor,
    });
    return created;
  });
  logger.info('Admission enquiry created', { enquiryId: enquiry.id, institutionId });
  return getOrThrow(institutionId, enquiry.id);
}

const EDIT_LABELS: Record<string, string> = {
  studentName: 'student name',
  guardianName: 'guardian',
  phone: 'phone',
  email: 'email',
  classInterested: 'class',
  source: 'source',
  notes: 'notes',
  priority: 'priority',
};

const sameTime = (a: Date | string | null | undefined, b: Date | string | null | undefined) =>
  (a ? new Date(a).getTime() : null) === (b ? new Date(b).getTime() : null);

export async function updateEnquiry(institutionId: string, id: string, data: UpdateEnquiryDtoType, actor?: Actor) {
  const existing = await getOrThrow(institutionId, id);
  await assertAssignee(institutionId, data.assignedToUserId);

  const patch: Prisma.AdmissionEnquiryUncheckedUpdateManyInput = {};
  const keys = [
    'studentName',
    'guardianName',
    'phone',
    'email',
    'classInterested',
    'source',
    'status',
    'notes',
    'assignedToUserId',
    'followUpAt',
    'nextStep',
    'priority',
    'lostReason',
  ] as const;
  for (const key of keys) {
    if (data[key] !== undefined) (patch as Record<string, unknown>)[key] = data[key];
  }

  const stage = await resolveStage(institutionId, { stageId: data.stageId, status: data.status }, existing);
  const stageMoved = !!stage && stage.id !== existing.stageId;
  if (stage) Object.assign(patch, stageTransitionPatch(existing, stage, { lostReason: data.lostReason }));

  await prisma.$transaction(async (tx) => {
    const res = await tx.admissionEnquiry.updateMany({ where: { id, institutionId }, data: patch });
    if (res.count === 0) throw new NotFoundError('Enquiry not found');
    if (stage && stageMoved) {
      await logActivity(tx, {
        institutionId,
        enquiryId: id,
        type: 'STAGE_CHANGE',
        body: `${existing.stage?.name ?? existing.status} → ${stage.name}${stage.isLost && data.lostReason ? ` (${data.lostReason})` : ''}`,
        metadata: stageChangeMetadata(existing.stage as StageRow | null, stage),
        actor,
      });
    }
    if (data.assignedToUserId !== undefined && (data.assignedToUserId ?? null) !== existing.assignedToUserId) {
      await logActivity(tx, {
        institutionId,
        enquiryId: id,
        type: 'ASSIGNED',
        body: data.assignedToUserId ? 'Owner changed' : 'Owner removed',
        metadata: { fromUserId: existing.assignedToUserId, toUserId: data.assignedToUserId ?? null },
        actor,
      });
    }
    const nextStepChanged = data.nextStep !== undefined && (data.nextStep ?? null) !== (existing.nextStep ?? null);
    const dueChanged = data.followUpAt !== undefined && !sameTime(data.followUpAt, existing.followUpAt);
    if (nextStepChanged || dueChanged) {
      const step = data.nextStep !== undefined ? data.nextStep : existing.nextStep;
      const due = data.followUpAt !== undefined ? data.followUpAt : existing.followUpAt;
      await logActivity(tx, {
        institutionId,
        enquiryId: id,
        type: 'NEXT_STEP',
        body: step || due ? `Next step: ${step || '—'}` : 'Next step cleared',
        metadata: { nextStep: step ?? null, dueAt: due ? new Date(due).toISOString() : null },
        actor,
      });
    }
    const changed = Object.keys(EDIT_LABELS).filter((k) => {
      const v = (data as Record<string, unknown>)[k];
      return v !== undefined && (v ?? null) !== ((existing as Record<string, unknown>)[k] ?? null);
    });
    if (changed.length) {
      await logActivity(tx, { institutionId, enquiryId: id, type: 'UPDATED', body: `Edited ${changed.map((k) => EDIT_LABELS[k]).join(', ')}`, actor });
    }
  });
  return getOrThrow(institutionId, id);
}

/** Legacy status change (kept for old clients): moves to the stage that counts as `status`. */
export async function updateStatus(institutionId: string, id: string, status: string, note?: string, actor?: Actor) {
  const existing = await getOrThrow(institutionId, id);
  const stage = stageForStatus(await listStages(institutionId), status, existing.stageId);
  const patch: Prisma.AdmissionEnquiryUncheckedUpdateManyInput = stage ? stageTransitionPatch(existing, stage) : { status: status as never };
  if (note) patch.notes = appendNote(existing.notes, `${existing.status} → ${status}: ${note}`);
  await prisma.$transaction(async (tx) => {
    const res = await tx.admissionEnquiry.updateMany({ where: { id, institutionId }, data: patch });
    if (res.count === 0) throw new NotFoundError('Enquiry not found');
    if (stage && stage.id !== existing.stageId) {
      await logActivity(tx, {
        institutionId,
        enquiryId: id,
        type: 'STAGE_CHANGE',
        body: `${existing.stage?.name ?? existing.status} → ${stage.name}${note ? `: ${note}` : ''}`,
        metadata: stageChangeMetadata(existing.stage as StageRow | null, stage),
        actor,
      });
    } else if (note) {
      await logActivity(tx, { institutionId, enquiryId: id, type: 'NOTE', body: note, actor });
    }
  });
  return getOrThrow(institutionId, id);
}

/** T4 board move: put the enquiry in `stageId` (status follows), with an optional lost reason and note. */
export async function moveToStage(
  institutionId: string,
  id: string,
  input: { stageId: string; lostReason?: string | null; note?: string | null },
  actor?: Actor,
) {
  const existing = await getOrThrow(institutionId, id);
  const stage = await getStage(institutionId, input.stageId);
  const same = stage.id === existing.stageId;
  if (same && input.lostReason === undefined && !input.note) return existing;
  const patch = stageTransitionPatch(existing, stage, { lostReason: input.lostReason });
  await prisma.$transaction(async (tx) => {
    const res = await tx.admissionEnquiry.updateMany({ where: { id, institutionId }, data: patch });
    if (res.count === 0) throw new NotFoundError('Enquiry not found');
    const reason = stage.isLost && input.lostReason ? ` (${input.lostReason})` : '';
    await logActivity(tx, {
      institutionId,
      enquiryId: id,
      type: same ? 'NOTE' : 'STAGE_CHANGE',
      body: same
        ? input.note || `Lost reason: ${input.lostReason ?? '—'}`
        : `${existing.stage?.name ?? existing.status} → ${stage.name}${reason}${input.note ? `: ${input.note}` : ''}`,
      metadata: same ? undefined : stageChangeMetadata(existing.stage as StageRow | null, stage),
      actor,
    });
  });
  return getOrThrow(institutionId, id);
}

export async function deleteEnquiry(institutionId: string, id: string, actor?: Actor & { role?: string }) {
  await getOrThrow(institutionId, id);
  // T5: to the trash (restorable for 30 days); the timeline and tasks stay with it.
  return moveToTrash({ institutionId, userId: actor?.userId ?? null, role: actor?.role }, 'ENQUIRY', id);
}

export async function listAssignees(institutionId: string) {
  return prisma.user.findMany({
    where: { institutionId, isActive: true, role: { in: [...ASSIGNABLE_ROLES] } },
    select: { id: true, firstName: true, lastName: true, role: true },
    orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
    take: 500,
  });
}

export async function getFunnel(institutionId: string, query: FunnelQueryDtoType) {
  if (query.from && query.to && query.from > query.to) {
    throw new ValidationError('"from" must be before "to"');
  }
  const counts = await repo.funnelCounts(institutionId, query);
  return { range: { from: query.from ?? null, to: query.to ?? null }, ...computeFunnel(counts) };
}

// Same GR-number shape as the public Online Registration form
// (student.service.ts generateNextStudentId) so converted applications are
// indistinguishable from ones submitted directly.
async function generateApplicationStudentId(tx: Prisma.TransactionClient, institutionId: string): Promise<string> {
  const year = new Date().getFullYear();
  for (let attempt = 0; attempt < 5; attempt++) {
    const total = await tx.student.count({ where: { institutionId } });
    const candidate = `${year}-${String(total + 1 + attempt).padStart(4, '0')}`;
    const exists = await tx.student.findFirst({ where: { institutionId, studentId: candidate }, select: { id: true } });
    if (!exists) return candidate;
  }
  return `${year}-${crypto.randomBytes(4).toString('hex')}`;
}

/**
 * Turns an enquiry into a PENDING online application (Student + Guardian +
 * link), exactly what the public registration form creates, so it then
 * appears on the Online Registrations review screen. The enquiry moves to
 * APPLIED and remembers the application it produced.
 */
export async function convertToApplication(institutionId: string, id: string, data: ConvertEnquiryDtoType, actor?: Actor) {
  const enquiry = await getOrThrow(institutionId, id);
  if (enquiry.convertedStudentId) {
    throw new ConflictError('This enquiry has already been converted to an application');
  }
  const appliedStage = stageForStatus(await listStages(institutionId), 'APPLIED', enquiry.stageId) ?? null;
  if (data.classId) {
    const cls = await prisma.class.findFirst({
      where: { id: data.classId, branch: { institutionId } },
      select: { id: true },
    });
    if (!cls) throw new NotFoundError('Class not found');
  }

  const student = await prisma.$transaction(async (tx) => {
    const studentId = await generateApplicationStudentId(tx, institutionId);
    const guardian = await tx.guardian.create({
      data: {
        institutionId,
        firstName: data.guardianFirstName,
        lastName: data.guardianLastName,
        phone: data.guardianPhone,
        email: data.guardianEmail ?? null,
        relationship: 'GUARDIAN',
      },
      select: { id: true },
    });
    const created = await tx.student.create({
      data: {
        institutionId,
        studentId,
        firstName: data.firstName,
        lastName: data.lastName,
        dateOfBirth: data.dateOfBirth ?? undefined,
        gender: data.gender ?? undefined,
        classId: data.classId ?? undefined,
        status: 'PENDING',
        guardians: { create: { guardianId: guardian.id, isPrimary: true, relationship: 'GUARDIAN' } },
      },
      select: { id: true, studentId: true, status: true },
    });
    // Guarded on convertedStudentId: null so a double-click cannot convert twice.
    // T4: the enquiry moves to the stage that counts as APPLIED (unless it is
    // already in one, e.g. a custom "Interview" stage mapped to APPLIED).
    const linked = await tx.admissionEnquiry.updateMany({
      where: { id, institutionId, convertedStudentId: null },
      data: {
        convertedStudentId: created.id,
        status: 'APPLIED',
        notes: appendNote(enquiry.notes, `Converted to online application ${created.studentId}`),
        ...(appliedStage ? stageTransitionPatch(enquiry, appliedStage) : {}),
      },
    });
    if (linked.count === 0) throw new ConflictError('This enquiry has already been converted to an application');
    await logActivity(tx, {
      institutionId,
      enquiryId: id,
      type: 'CONVERTED',
      body: `Converted to online application ${created.studentId}`,
      metadata: {
        studentId: created.id,
        reference: created.studentId,
        ...(appliedStage && appliedStage.id !== enquiry.stageId ? { fromStageId: enquiry.stageId, toStageId: appliedStage.id, toName: appliedStage.name } : {}),
      },
      actor,
    });
    return created;
  });

  logger.info('Enquiry converted to application', { enquiryId: id, studentId: student.id, institutionId });
  return {
    enquiry: await getOrThrow(institutionId, id),
    application: { id: student.id, reference: student.studentId, status: student.status },
  };
}

// ── Public (unauthenticated) ────────────────────────────────────────────────

async function resolveInstitution(slug: string) {
  const institution = await prisma.institution.findFirst({
    where: { slug, isActive: true },
    select: { id: true, name: true },
  });
  if (!institution) throw new NotFoundError('Institution not found');
  return institution;
}

/** Website enquiry form. Admins get an in-app heads-up; failures there never fail the capture. */
export async function capturePublicEnquiry(data: PublicEnquiryDtoType) {
  // Honeypot filled: pretend success so bots learn nothing, store nothing.
  if (data.website) return { received: true };

  const institution = await resolveInstitution(data.institutionSlug);
  const newStage = stageForStatus(await listStages(institution.id), 'NEW') ?? null;
  const enquiry = await prisma.$transaction(async (tx) => {
    const created = await tx.admissionEnquiry.create({
      data: {
        institutionId: institution.id,
        studentName: data.studentName,
        guardianName: data.guardianName ?? null,
        phone: data.phone,
        email: data.email ?? null,
        classInterested: data.classInterested ?? null,
        source: 'WEBSITE',
        status: 'NEW',
        notes: data.message ? appendNote(null, `Website message: ${data.message}`) : null,
        ...(newStage ? { stageId: newStage.id, stageChangedAt: new Date() } : {}),
      },
      select: { id: true },
    });
    await logActivity(tx, {
      institutionId: institution.id,
      enquiryId: created.id,
      type: 'CREATED',
      body: data.message ? `Website enquiry: ${data.message}` : 'Website enquiry',
      actor: { name: 'Website form' },
    });
    return created;
  });

  prisma.user
    .findMany({ where: { institutionId: institution.id, role: 'ADMIN', isActive: true }, select: { id: true } })
    .then((admins) =>
      admins.length
        ? prisma.notification.createMany({
            data: admins.map((a) => ({
              institutionId: institution.id,
              recipientUserId: a.id,
              type: 'ADMISSION_ENQUIRY',
              title: 'New admission enquiry',
              body: `${data.studentName}${data.classInterested ? ` — ${data.classInterested}` : ''} (website)`,
              data: { link: '/admissions/enquiries', enquiryId: enquiry.id },
            })),
          })
        : undefined,
    )
    .catch((error) =>
      logger.error('Failed to notify admins of enquiry', {
        error: error instanceof Error ? error.message : String(error),
      }),
    );

  logger.info('Public admission enquiry captured', { enquiryId: enquiry.id, institutionId: institution.id });
  return { received: true };
}

/**
 * Applicant self-check. Requires the application reference AND a phone
 * number on file (guardian or student). Any mismatch returns the same 404 as
 * an unknown reference, and the answer carries only the status and class —
 * never names, contact details or internal ids.
 */
export async function getApplicationStatus(query: ApplicationStatusQueryDtoType) {
  const institution = await resolveInstitution(query.institutionSlug);
  const student = await prisma.student.findFirst({
    where: { institutionId: institution.id, studentId: query.reference },
    select: {
      studentId: true,
      status: true,
      phone: true,
      createdAt: true,
      updatedAt: true,
      class: { select: { name: true } },
      guardians: { select: { guardian: { select: { phone: true, emergencyPhone: true } } } },
    },
  });

  const matches =
    !!student &&
    (phonesMatch(student.phone, query.phone) ||
      student.guardians.some(
        (g) => phonesMatch(g.guardian.phone, query.phone) || phonesMatch(g.guardian.emergencyPhone, query.phone),
      ));
  if (!student || !matches) {
    throw new NotFoundError('No application matches that reference and phone number');
  }

  const { state, label } = publicApplicationState(student.status);
  return {
    institutionName: institution.name,
    reference: student.studentId,
    state,
    label,
    className: student.class?.name ?? null,
    submittedAt: student.createdAt,
    lastUpdatedAt: student.updatedAt,
  };
}
