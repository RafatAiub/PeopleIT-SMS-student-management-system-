// =============================================================================
// T4 Admissions CRM — pure UI helpers (no React, no I/O). Tested by
// __tests__/crm-logic.test.ts (self-running, see the header there).
// =============================================================================

import type { Enquiry, StageRef } from './enquiries.types';

export interface BoardColumnData {
  stage: StageRef;
  total: number;
  items: Enquiry[];
}

/** Stage name in the UI language (falls back to English). */
export function stageLabel(stage: Pick<StageRef, 'name' | 'nameBn'> | null | undefined, lang: 'en' | 'bn'): string {
  if (!stage) return '—';
  return lang === 'bn' && stage.nameBn ? stage.nameBn : stage.name;
}

/** Optimistic board move: take the card out of its column and put it on top of the target. */
export function moveCardToStage(
  columns: BoardColumnData[],
  enquiryId: string,
  targetStageId: string,
): BoardColumnData[] {
  let card: Enquiry | undefined;
  let fromStageId: string | undefined;
  for (const col of columns) {
    const found = col.items.find((i) => i.id === enquiryId);
    if (found) {
      card = found;
      fromStageId = col.stage.id;
      break;
    }
  }
  if (!card || fromStageId === targetStageId) return columns;
  const target = columns.find((c) => c.stage.id === targetStageId);
  if (!target) return columns;
  const moved: Enquiry = { ...card, stageId: targetStageId, stage: target.stage };
  return columns.map((col) => {
    if (col.stage.id === fromStageId) return { ...col, total: Math.max(0, col.total - 1), items: col.items.filter((i) => i.id !== enquiryId) };
    if (col.stage.id === targetStageId) return { ...col, total: col.total + 1, items: [moved, ...col.items] };
    return col;
  });
}

export type DueState = 'overdue' | 'today' | 'upcoming' | 'none';

/** Due state in the viewer's local day (the server's digest uses Asia/Dhaka; same day for BD users). */
export function dueStateOf(dueAt: string | null | undefined, now = new Date()): DueState {
  if (!dueAt) return 'none';
  const d = new Date(dueAt);
  if (Number.isNaN(d.getTime())) return 'none';
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  if (d < start) return 'overdue';
  if (d < end) return 'today';
  return 'upcoming';
}

// ── Stage editor ────────────────────────────────────────────────────────────

export interface StageDraft {
  /** Missing for a stage added in the editor. */
  id?: string;
  key: string;
  name: string;
  nameBn: string;
  color: string;
  isWon: boolean;
  isLost: boolean;
  status?: string;
  enquiryCount: number;
}

export function moveItem<T>(list: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return list;
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

/** Same rules as the server (crm.logic validateStageSet), so the editor can explain before saving. */
export function stageSetProblem(stages: Array<Pick<StageDraft, 'name' | 'isWon' | 'isLost'>>): string | null {
  if (stages.length < 3) return 'Keep at least three stages';
  if (stages.some((s) => !s.name.trim())) return 'Every stage needs a name';
  const names = stages.map((s) => s.name.trim().toLowerCase());
  if (new Set(names).size !== names.length) return 'Stage names must be unique';
  if (stages.some((s) => s.isWon && s.isLost)) return 'A stage cannot be both won and lost';
  if (!stages.some((s) => s.isWon)) return 'Keep at least one "won" (admitted) stage';
  if (!stages.some((s) => s.isLost)) return 'Keep at least one "lost" stage';
  if (!stages.some((s) => !s.isWon && !s.isLost)) return 'Keep at least one open stage';
  return null;
}

/** Original stages (with enquiries) that the draft removes — the editor must ask where they go. */
export function removedWithEnquiries(original: StageDraft[], draft: StageDraft[]): StageDraft[] {
  const kept = new Set(draft.filter((d) => d.id).map((d) => d.id));
  return original.filter((o) => o.id && !kept.has(o.id) && o.enquiryCount > 0);
}

// ── Report ──────────────────────────────────────────────────────────────────

/** Bar width (0–100) for a funnel step, never 0 for a non-zero count so it stays visible. */
export function barWidth(value: number, max: number): number {
  if (max <= 0 || value <= 0) return 0;
  return Math.max(2, Math.round((value / max) * 100));
}

export const ACTIVITY_LABELS: Record<string, string> = {
  CREATED: 'Enquiry created',
  STAGE_CHANGE: 'Stage changed',
  NOTE: 'Note',
  CALL: 'Call',
  SMS: 'SMS',
  EMAIL: 'Email',
  MEETING: 'Meeting',
  ASSIGNED: 'Owner',
  NEXT_STEP: 'Next step',
  TASK_CREATED: 'Task added',
  TASK_DONE: 'Task done',
  TASK_REOPENED: 'Task reopened',
  CONVERTED: 'Converted to application',
  MERGED: 'Merged',
  UPDATED: 'Edited',
};
