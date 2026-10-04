// Pure planning logic for promotion / year rollover and its undo. No prisma
// imports — the service loads state, these functions decide, the service
// writes. Unit-tested DB-free (idempotency, eligibility, undo conflicts).

export type PromotionStatusValue = 'PROMOTED' | 'RETAINED' | 'GRADUATED' | 'TRANSFERRED';

export interface StudentPlacement {
  classId: string | null;
  sectionId: string | null;
  academicYearId: string | null;
}

export interface CandidateStudent extends StudentPlacement {
  id: string;
  status: string;
}

export interface PromotionDecision {
  studentId: string;
  status: PromotionStatusValue;
  toClassId?: string | null;
  toSectionId?: string | null;
  note?: string | null;
}

export interface BatchTarget {
  toAcademicYearId: string;
  /** Default destination class for PROMOTED students. */
  toClassId?: string | null;
  /** Default destination section (of toClassId) for PROMOTED students. */
  toSectionId?: string | null;
  note?: string | null;
}

export interface PlannedAction {
  studentId: string;
  status: PromotionStatusValue;
  from: StudentPlacement;
  to: StudentPlacement;
  /** Fields written to Student. */
  studentUpdate: StudentPlacement & { status?: string };
  note: string | null;
}

export interface SkippedDecision {
  studentId: string;
  reason: string;
}

export interface PromotionPlan {
  actions: PlannedAction[];
  skipped: SkippedDecision[];
}

/** Statuses after which the student leaves the active roll. */
export const LEAVING_STATUSES: ReadonlySet<PromotionStatusValue> = new Set(['GRADUATED', 'TRANSFERRED']);

/**
 * Builds the write plan for a batch.
 *
 * - `eligible`: students currently in the source class/section/session and
 *   ACTIVE (anything else is skipped — a promotion only ever moves students
 *   who are where the admin said they are).
 * - `alreadyProcessed`: student ids that already have a PromotionRecord for
 *   the target session. Those are skipped, which makes re-running the same
 *   batch (double click, retry after a timeout) a no-op per student.
 */
export function planPromotion(params: {
  eligible: CandidateStudent[];
  alreadyProcessed: ReadonlySet<string>;
  decisions: PromotionDecision[];
  target: BatchTarget;
}): PromotionPlan {
  const { eligible, alreadyProcessed, decisions, target } = params;
  const byId = new Map(eligible.map((s) => [s.id, s]));
  const seen = new Set<string>();
  const actions: PlannedAction[] = [];
  const skipped: SkippedDecision[] = [];

  for (const d of decisions) {
    if (seen.has(d.studentId)) {
      skipped.push({ studentId: d.studentId, reason: 'Duplicate decision for this student in the batch' });
      continue;
    }
    seen.add(d.studentId);

    const student = byId.get(d.studentId);
    if (!student || student.status !== 'ACTIVE') {
      skipped.push({ studentId: d.studentId, reason: 'Student is not an active member of the selected class/session' });
      continue;
    }
    if (alreadyProcessed.has(d.studentId)) {
      skipped.push({ studentId: d.studentId, reason: 'Already processed for the target session' });
      continue;
    }

    const from: StudentPlacement = {
      classId: student.classId,
      sectionId: student.sectionId,
      academicYearId: student.academicYearId,
    };
    const note = d.note?.trim() || target.note?.trim() || null;

    if (d.status === 'PROMOTED') {
      const toClassId = d.toClassId ?? target.toClassId ?? null;
      if (!toClassId) {
        skipped.push({ studentId: d.studentId, reason: 'No destination class selected' });
        continue;
      }
      // A per-student class override without a section must not inherit the
      // batch section (which belongs to the batch's class).
      const toSectionId =
        d.toSectionId !== undefined && d.toSectionId !== null
          ? d.toSectionId
          : d.toClassId && d.toClassId !== target.toClassId
            ? null
            : target.toSectionId ?? null;
      const to = { classId: toClassId, sectionId: toSectionId, academicYearId: target.toAcademicYearId };
      actions.push({ studentId: d.studentId, status: d.status, from, to, studentUpdate: { ...to }, note });
    } else if (d.status === 'RETAINED') {
      const to = {
        classId: student.classId,
        sectionId: d.toSectionId ?? student.sectionId,
        academicYearId: target.toAcademicYearId,
      };
      actions.push({ studentId: d.studentId, status: d.status, from, to, studentUpdate: { ...to }, note });
    } else {
      // GRADUATED / TRANSFERRED: the student leaves the roll; placement is
      // kept as-is (their last class stays on record), only status changes.
      actions.push({
        studentId: d.studentId,
        status: d.status,
        from,
        to: { ...from },
        studentUpdate: { ...from, status: d.status },
        note,
      });
    }
  }

  return { actions, skipped };
}

export function countByStatus(actions: Array<{ status: PromotionStatusValue }>): Record<PromotionStatusValue, number> {
  const counts: Record<PromotionStatusValue, number> = { PROMOTED: 0, RETAINED: 0, GRADUATED: 0, TRANSFERRED: 0 };
  for (const a of actions) counts[a.status] += 1;
  return counts;
}

// ── Batches + undo ─────────────────────────────────────────────────────────

/**
 * A batch = every PromotionRecord written by one execute call. They share an
 * explicit createdAt and promotedByUserId (the schema has no batch column),
 * so the id encodes both.
 */
export function encodeBatchId(createdAt: Date, userId: string): string {
  return `${createdAt.getTime()}_${userId}`;
}

export function decodeBatchId(batchId: string): { createdAt: Date; userId: string } | null {
  const idx = batchId.indexOf('_');
  if (idx <= 0) return null;
  const ms = Number(batchId.slice(0, idx));
  const userId = batchId.slice(idx + 1);
  if (!Number.isFinite(ms) || !userId) return null;
  return { createdAt: new Date(ms), userId };
}

export const UNDO_WINDOW_MS = 24 * 60 * 60 * 1000;

export function isWithinUndoWindow(createdAt: Date, now: Date = new Date()): boolean {
  return now.getTime() - createdAt.getTime() <= UNDO_WINDOW_MS;
}

export interface PromotionRecordLike {
  id: string;
  studentId: string;
  status: PromotionStatusValue;
  fromAcademicYearId: string | null;
  toAcademicYearId: string | null;
  fromClassId: string | null;
  toClassId: string | null;
  fromSectionId: string | null;
  toSectionId: string | null;
}

export interface CurrentStudentState extends StudentPlacement {
  id: string;
  status: string;
}

/** Where (and in what status) the student should be if nothing changed since the batch. */
export function expectedStateAfter(record: PromotionRecordLike): StudentPlacement & { status: string } {
  const leaving = LEAVING_STATUSES.has(record.status);
  return {
    classId: record.toClassId,
    sectionId: record.toSectionId,
    academicYearId: leaving ? record.fromAcademicYearId : record.toAcademicYearId,
    status: leaving ? record.status : 'ACTIVE',
  };
}

export interface UndoPlan {
  reverts: Array<{ recordId: string; studentId: string; restore: StudentPlacement & { status: string } }>;
  conflicts: Array<{ recordId: string; studentId: string; reason: string }>;
}

/**
 * Reverts each student to the placement stored on their PromotionRecord —
 * but only if they are still exactly where the batch put them. A student
 * who was edited, moved or promoted again since is reported as a conflict
 * and left untouched (their record is kept, so history stays truthful).
 * Promotion only ever acts on ACTIVE students, so the restored status is
 * always ACTIVE.
 */
export function planUndo(records: PromotionRecordLike[], current: CurrentStudentState[]): UndoPlan {
  const byId = new Map(current.map((s) => [s.id, s]));
  const plan: UndoPlan = { reverts: [], conflicts: [] };
  for (const r of records) {
    const s = byId.get(r.studentId);
    if (!s) {
      plan.conflicts.push({ recordId: r.id, studentId: r.studentId, reason: 'Student no longer exists' });
      continue;
    }
    const expected = expectedStateAfter(r);
    const unchanged =
      s.classId === expected.classId &&
      s.sectionId === expected.sectionId &&
      s.academicYearId === expected.academicYearId &&
      s.status === expected.status;
    if (!unchanged) {
      plan.conflicts.push({ recordId: r.id, studentId: r.studentId, reason: 'Student was changed after this promotion' });
      continue;
    }
    plan.reverts.push({
      recordId: r.id,
      studentId: r.studentId,
      restore: {
        classId: r.fromClassId,
        sectionId: r.fromSectionId,
        academicYearId: r.fromAcademicYearId,
        status: 'ACTIVE',
      },
    });
  }
  return plan;
}

/** Suggested decision from an exam result summary (null when no result). */
export function suggestStatus(summary: { passed: boolean } | null): PromotionStatusValue | null {
  if (!summary) return null;
  return summary.passed ? 'PROMOTED' : 'RETAINED';
}
