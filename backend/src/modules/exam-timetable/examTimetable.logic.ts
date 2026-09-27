// Pure conflict detection for exam timetable slots. No prisma imports.

export interface SlotLike {
  id?: string;
  examId?: string;
  className: string;
  sectionName?: string | null;
  subjectName: string;
  /** YYYY-MM-DD */
  date: string;
  startTime: string;
  endTime: string;
  room?: string | null;
}

export interface SlotConflict {
  type: 'CLASS' | 'ROOM';
  slotId: string | null;
  className: string;
  sectionName: string | null;
  subjectName: string;
  date: string;
  startTime: string;
  endTime: string;
  room: string | null;
  message: string;
}

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function isValidTime(t: string): boolean {
  return TIME_RE.test(t);
}

export function toMinutes(t: string): number {
  const m = TIME_RE.exec(t);
  if (!m) return NaN;
  return Number(m[1]) * 60 + Number(m[2]);
}

/** Half-open intervals: 09:00–10:00 and 10:00–11:00 do NOT overlap. */
export function timesOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return toMinutes(aStart) < toMinutes(bEnd) && toMinutes(bStart) < toMinutes(aEnd);
}

const norm = (s: string | null | undefined) => (s ?? '').trim().toLowerCase();

/**
 * Sections collide when they are the same section, or when either slot is
 * for the whole class (no section) — a whole-class sitting occupies every
 * section of that class.
 */
export function sectionsCollide(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!norm(a) || !norm(b)) return true;
  return norm(a) === norm(b);
}

/**
 * Conflicts of `candidate` against `existing` slots (any exam of the tenant)
 * on the same date with overlapping times:
 *  - CLASS: same class and colliding section,
 *  - ROOM: same (non-empty) room, case/whitespace-insensitive.
 * The candidate's own id is ignored so edits don't conflict with themselves.
 */
export function findConflicts(candidate: SlotLike, existing: SlotLike[]): SlotConflict[] {
  const conflicts: SlotConflict[] = [];
  for (const other of existing) {
    if (candidate.id && other.id === candidate.id) continue;
    if (other.date !== candidate.date) continue;
    if (!timesOverlap(candidate.startTime, candidate.endTime, other.startTime, other.endTime)) continue;

    const base = {
      slotId: other.id ?? null,
      className: other.className,
      sectionName: other.sectionName ?? null,
      subjectName: other.subjectName,
      date: other.date,
      startTime: other.startTime,
      endTime: other.endTime,
      room: other.room ?? null,
    };
    const label = `${other.subjectName} (${other.className}${other.sectionName ? ` ${other.sectionName}` : ''}, ${other.startTime}–${other.endTime})`;

    if (norm(other.className) === norm(candidate.className) && sectionsCollide(candidate.sectionName, other.sectionName)) {
      conflicts.push({ ...base, type: 'CLASS', message: `Class already sits ${label}` });
    }
    if (norm(candidate.room) && norm(other.room) === norm(candidate.room)) {
      conflicts.push({ ...base, type: 'ROOM', message: `Room ${other.room} is already booked for ${label}` });
    }
  }
  return conflicts;
}

export function toDateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}
