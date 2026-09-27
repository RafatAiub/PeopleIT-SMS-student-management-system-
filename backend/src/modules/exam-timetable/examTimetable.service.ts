import { Prisma, UserRole } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { BadRequestError, ConflictError, NotFoundError } from '../../utils/AppError';
import { logger } from '../../utils/logger';
import * as guardianRepository from '../guardians/guardian.repository';
import * as repo from './examTimetable.repository';
import { findConflicts, toDateKey, type SlotLike } from './examTimetable.logic';
import type { CheckConflictsDtoType, CreateSlotDtoType, SlotQueryDtoType, UpdateSlotDtoType } from './examTimetable.dto';

export type Requester = { sub: string; role: string };

type Scope = { className: string; sectionName: string | null };

const STAFF_ALL = new Set<string>([UserRole.SUPER_ADMIN, UserRole.ADMIN]);

type SlotRow = NonNullable<Awaited<ReturnType<typeof repo.findSlotById>>>;
const serialize = (s: SlotRow) => ({ ...s, date: toDateKey(s.date) });

/**
 * The (className, sectionName) pairs a non-admin may see:
 * STUDENT → own class/section; GUARDIAN → linked children's (optionally one);
 * TEACHER → sections they are class teacher of + classes they teach in the
 * weekly timetable.
 */
async function visibleScopes(institutionId: string, requester: Requester, studentId?: string): Promise<Scope[]> {
  const studentScope = async (where: Prisma.StudentWhereInput) => {
    const students = await prisma.student.findMany({
      where: { institutionId, ...where },
      select: { class: { select: { name: true } }, section: { select: { name: true } } },
    });
    return students.filter((s) => s.class).map((s) => ({ className: s.class!.name, sectionName: s.section?.name ?? null }));
  };

  if (requester.role === UserRole.STUDENT) {
    return studentScope({ userId: requester.sub });
  }
  if (requester.role === UserRole.GUARDIAN) {
    const linked = await guardianRepository.findLinkedStudentIdsByUserId(institutionId, requester.sub);
    const ids = studentId ? linked.filter((id) => id === studentId) : linked;
    if (ids.length === 0) return [];
    return studentScope({ id: { in: ids } });
  }
  if (requester.role === UserRole.TEACHER) {
    const [sections, slots] = await Promise.all([
      prisma.section.findMany({
        where: { classTeacher: { userId: requester.sub }, class: { branch: { institutionId } } },
        select: { name: true, class: { select: { name: true } } },
      }),
      prisma.timetableSlot.findMany({
        where: { institutionId, teacher: { userId: requester.sub } },
        select: { className: true, sectionName: true },
        distinct: ['className', 'sectionName'],
      }),
    ]);
    return [
      ...sections.map((s) => ({ className: s.class.name, sectionName: s.name })),
      ...slots.map((s) => ({ className: s.className, sectionName: s.sectionName || null })),
    ];
  }
  return [];
}

export async function listSlots(institutionId: string, requester: Requester, q: SlotQueryDtoType) {
  const where: Prisma.ExamTimetableSlotWhereInput = {
    institutionId,
    ...(q.examId ? { examId: q.examId } : {}),
    ...(q.className ? { className: q.className } : {}),
    ...(q.sectionName ? { OR: [{ sectionName: q.sectionName }, { sectionName: null }] } : {}),
  };

  if (!STAFF_ALL.has(requester.role)) {
    const scopes = await visibleScopes(institutionId, requester, q.studentId);
    if (scopes.length === 0) {
      return { items: [], meta: { total: 0, page: q.page, pageSize: q.pageSize } };
    }
    where.AND = [
      {
        OR: scopes.map((s) => ({
          className: s.className,
          // A slot with no section is for the whole class. A viewer with no
          // section (e.g. unsectioned student) sees every section's slots.
          ...(s.sectionName ? { OR: [{ sectionName: null }, { sectionName: '' }, { sectionName: s.sectionName }] } : {}),
        })),
      },
    ];
  }

  const { items, total } = await repo.findSlots(where, q.page, q.pageSize);
  return { items: items.map(serialize), meta: { total, page: q.page, pageSize: q.pageSize } };
}

async function assertExam(institutionId: string, examId: string) {
  const exam = await prisma.exam.findFirst({ where: { id: examId, institutionId }, select: { id: true } });
  if (!exam) throw new NotFoundError('Exam not found');
}

async function conflictsFor(institutionId: string, candidate: SlotLike) {
  const sameDay = await repo.findSlotsOnDate(institutionId, new Date(`${candidate.date}T00:00:00.000Z`));
  return findConflicts(
    candidate,
    sameDay.map((s) => ({ ...s, date: toDateKey(s.date) })),
  );
}

export async function checkConflicts(institutionId: string, data: CheckConflictsDtoType) {
  await assertExam(institutionId, data.examId);
  const conflicts = await conflictsFor(institutionId, data);
  return { conflicts, hasConflicts: conflicts.length > 0 };
}

function conflictError(conflicts: Awaited<ReturnType<typeof conflictsFor>>) {
  return new ConflictError(`Timetable conflict: ${conflicts.map((c) => c.message).join('; ')}`);
}

export async function createSlot(institutionId: string, data: CreateSlotDtoType) {
  await assertExam(institutionId, data.examId);
  const conflicts = await conflictsFor(institutionId, data);
  if (conflicts.length > 0) throw conflictError(conflicts);
  const slot = await repo.createSlot({
    institutionId,
    examId: data.examId,
    className: data.className,
    sectionName: data.sectionName || null,
    subjectName: data.subjectName,
    date: new Date(`${data.date}T00:00:00.000Z`),
    startTime: data.startTime,
    endTime: data.endTime,
    room: data.room || null,
  });
  logger.info('Exam timetable slot created', { institutionId, slotId: slot.id });
  return serialize(slot);
}

export async function updateSlot(institutionId: string, id: string, data: UpdateSlotDtoType) {
  const existing = await repo.findSlotById(institutionId, id);
  if (!existing) throw new NotFoundError('Timetable slot not found');
  if (data.examId) await assertExam(institutionId, data.examId);

  const merged: SlotLike = {
    id,
    examId: data.examId ?? existing.examId,
    className: data.className ?? existing.className,
    sectionName: data.sectionName !== undefined ? data.sectionName : existing.sectionName,
    subjectName: data.subjectName ?? existing.subjectName,
    date: data.date ?? toDateKey(existing.date),
    startTime: data.startTime ?? existing.startTime,
    endTime: data.endTime ?? existing.endTime,
    room: data.room !== undefined ? data.room : existing.room,
  };
  if (merged.endTime <= merged.startTime) {
    throw new BadRequestError('End time must be after start time');
  }
  const conflicts = await conflictsFor(institutionId, merged);
  if (conflicts.length > 0) throw conflictError(conflicts);

  const updated = await repo.updateSlot(institutionId, id, {
    examId: merged.examId,
    className: merged.className,
    sectionName: merged.sectionName || null,
    subjectName: merged.subjectName,
    date: new Date(`${merged.date}T00:00:00.000Z`),
    startTime: merged.startTime,
    endTime: merged.endTime,
    room: merged.room || null,
  });
  if (!updated) throw new NotFoundError('Timetable slot not found');
  return serialize(updated);
}

export async function deleteSlot(institutionId: string, id: string) {
  const existing = await repo.findSlotById(institutionId, id);
  if (!existing) throw new NotFoundError('Timetable slot not found');
  await repo.deleteSlot(institutionId, id);
  logger.info('Exam timetable slot deleted', { institutionId, slotId: id });
}
