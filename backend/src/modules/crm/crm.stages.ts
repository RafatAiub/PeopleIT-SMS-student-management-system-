import crypto from 'crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { ConflictError, NotFoundError, ValidationError } from '../../utils/AppError';
import { DEFAULT_STAGES, statusForStage, stageForStatus, validateStageSet, type EnquiryStatus } from './crm.logic';
import type { SaveStagesDtoType } from './crm.dto';

// =============================================================================
// T4 pipeline stages + the enquiry stage transition + activity logging.
// Stages are per institution; the six defaults are seeded lazily for schools
// created after the T4 migration, with the same deterministic ids it uses.
// =============================================================================

type Db = Prisma.TransactionClient | typeof prisma;

export const stageSelect = { id: true, name: true, nameBn: true, color: true, order: true, isWon: true, isLost: true, status: true } as const;
export type StageRow = Prisma.CrmStageGetPayload<{ select: typeof stageSelect }>;

/** Same id formula as the migration seed ('crmst_' || md5(institutionId || ':' || status)). */
export function defaultStageId(institutionId: string, status: string): string {
  return `crmst_${crypto.createHash('md5').update(`${institutionId}:${status}`).digest('hex')}`;
}

/** The institution's stages in order, seeding the defaults when it has none. */
export async function listStages(institutionId: string, db: Db = prisma): Promise<StageRow[]> {
  const stages = await db.crmStage.findMany({ where: { institutionId }, select: stageSelect, orderBy: [{ order: 'asc' }, { id: 'asc' }] });
  if (stages.length) return stages;
  await db.crmStage.createMany({
    data: DEFAULT_STAGES.map((s) => ({ id: defaultStageId(institutionId, s.status), institutionId, ...s })),
    skipDuplicates: true,
  });
  return db.crmStage.findMany({ where: { institutionId }, select: stageSelect, orderBy: [{ order: 'asc' }, { id: 'asc' }] });
}

export async function getStage(institutionId: string, stageId: string, db: Db = prisma): Promise<StageRow> {
  const stage = await db.crmStage.findFirst({ where: { id: stageId, institutionId }, select: stageSelect });
  if (!stage) throw new NotFoundError('Stage not found');
  return stage;
}

export async function stageIdForStatus(institutionId: string, status: string, currentStageId?: string | null, db: Db = prisma) {
  const stages = await listStages(institutionId, db);
  return stageForStatus(stages, status, currentStageId) ?? null;
}

/**
 * The column patch for moving an enquiry into `stage`: status follows the
 * stage, stageChangedAt is stamped, wonAt is set the first time it is won,
 * and lostReason is cleared when it leaves a lost stage.
 */
export function stageTransitionPatch(
  existing: { stageId: string | null; wonAt: Date | null; lostReason?: string | null },
  stage: StageRow,
  opts: { lostReason?: string | null; now?: Date } = {},
): Prisma.AdmissionEnquiryUncheckedUpdateManyInput {
  const now = opts.now ?? new Date();
  const patch: Prisma.AdmissionEnquiryUncheckedUpdateManyInput = {
    stageId: stage.id,
    status: statusForStage(stage) as EnquiryStatus,
  };
  if (existing.stageId !== stage.id) patch.stageChangedAt = now;
  if (stage.isWon && !existing.wonAt) patch.wonAt = now;
  if (stage.isLost) {
    if (opts.lostReason !== undefined) patch.lostReason = opts.lostReason;
  } else if (existing.lostReason) {
    patch.lostReason = null;
  }
  return patch;
}

// ── Activities ──────────────────────────────────────────────────────────────

export interface Actor {
  userId?: string | null;
  /** For system/public entries ("Website form", "System"). */
  name?: string | null;
}

export function logActivity(
  db: Db,
  row: { institutionId: string; enquiryId: string; type: string; body?: string | null; metadata?: Prisma.InputJsonValue; at?: Date; actor?: Actor },
) {
  return db.crmActivity.create({
    data: {
      institutionId: row.institutionId,
      enquiryId: row.enquiryId,
      type: row.type,
      body: row.body ?? null,
      metadata: row.metadata,
      actorUserId: row.actor?.userId ?? null,
      actorName: row.actor?.name ?? null,
      ...(row.at ? { createdAt: row.at } : {}),
    },
    select: { id: true },
  });
}

export function stageChangeMetadata(from: StageRow | undefined | null, to: StageRow): Prisma.InputJsonValue {
  return { fromStageId: from?.id ?? null, fromName: from?.name ?? null, toStageId: to.id, toName: to.name, toNameBn: to.nameBn ?? null };
}

// ── Stage editor ────────────────────────────────────────────────────────────

/**
 * Replaces the institution's stage set with `input.stages` (in that order).
 * Existing stages keep their id (so enquiries stay put); stages left out are
 * deleted after their enquiries move to `reassign[id]`. Enquiry statuses are
 * re-synced to the (possibly re-flagged) stages.
 */
export async function saveStages(institutionId: string, input: SaveStagesDtoType) {
  const invalid = validateStageSet(input.stages);
  if (invalid) throw new ValidationError(invalid);

  return prisma.$transaction(async (tx) => {
    const current = await listStages(institutionId, tx);
    const currentIds = new Set(current.map((s) => s.id));
    for (const s of input.stages) {
      if (s.id && !currentIds.has(s.id)) throw new NotFoundError('Stage not found');
    }
    const keptIds = new Set(input.stages.filter((s) => s.id).map((s) => s.id as string));
    const removed = current.filter((s) => !keptIds.has(s.id));

    // Upsert in order. Open stages without an explicit status inherit the
    // previous open stage's status (or NEW), so "Interview" after "Contacted"
    // still counts as CONTACTED in the legacy funnel.
    let prevOpen: EnquiryStatus = 'NEW';
    const saved: StageRow[] = [];
    for (let i = 0; i < input.stages.length; i++) {
      const s = input.stages[i];
      // Existing stages keep their status unless one is sent; new ones inherit.
      const before = s.id ? current.find((c) => c.id === s.id) : undefined;
      const status = statusForStage({ isWon: s.isWon, isLost: s.isLost, status: s.status ?? before?.status ?? prevOpen }, prevOpen);
      if (!s.isWon && !s.isLost) prevOpen = status;
      const data = { name: s.name, nameBn: s.nameBn ?? null, color: s.color, order: i + 1, isWon: s.isWon, isLost: s.isLost, status };
      const row = s.id
        ? await tx.crmStage.update({ where: { id: s.id }, data, select: stageSelect })
        : await tx.crmStage.create({ data: { institutionId, ...data }, select: stageSelect });
      saved.push(row);
    }

    const savedIds = new Set(saved.map((s) => s.id));
    for (const gone of removed) {
      const count = await tx.admissionEnquiry.count({ where: { institutionId, stageId: gone.id } });
      if (count > 0) {
        const target = input.reassign?.[gone.id];
        if (!target || !savedIds.has(target)) {
          throw new ConflictError(`Stage "${gone.name}" still has ${count} enquiries — choose a stage to move them to`);
        }
        const to = saved.find((s) => s.id === target)!;
        await tx.admissionEnquiry.updateMany({
          where: { institutionId, stageId: gone.id },
          data: { stageId: to.id, status: to.status, stageChangedAt: new Date() },
        });
      }
      await tx.crmStage.delete({ where: { id: gone.id } });
    }

    // Re-sync status for every stage whose flags/status changed.
    for (const s of saved) {
      await tx.admissionEnquiry.updateMany({ where: { institutionId, stageId: s.id, status: { not: s.status } }, data: { status: s.status } });
      if (s.isWon) {
        await tx.admissionEnquiry.updateMany({ where: { institutionId, stageId: s.id, wonAt: null }, data: { wonAt: new Date() } });
      }
    }
    return saved;
  });
}
