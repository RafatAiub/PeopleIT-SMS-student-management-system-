import { prisma } from '../../config/prisma';
import * as sessionYearRepository from './session-year.repository';
import { toDbDate } from './session-year.repository';
import { NotFoundError, ConflictError, ValidationError } from '../../utils/AppError';
import { logger } from '../../utils/logger';
import type { CreateSessionYearDtoType, UpdateSessionYearDtoType } from './session-year.dto';

export type SessionYearStatus = 'CURRENT' | 'UPCOMING' | 'COMPLETED';

function formatDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function sessionStatus(startDate: Date, endDate: Date, today: string = formatDate(new Date())): SessionYearStatus {
  if (today < formatDate(startDate)) return 'UPCOMING';
  if (today > formatDate(endDate)) return 'COMPLETED';
  return 'CURRENT';
}

async function assertNoConflicts(
  institutionId: string,
  data: { label: string; startDate: Date; endDate: Date },
  excludeId?: string,
) {
  const sameName = await sessionYearRepository.findByLabel(institutionId, data.label);
  if (sameName && sameName.id !== excludeId) {
    throw new ConflictError(`A session year named '${data.label}' already exists`);
  }
  const overlapping = await sessionYearRepository.findOverlapping(institutionId, data.startDate, data.endDate, excludeId);
  if (overlapping) {
    throw new ConflictError(
      `These dates overlap session year '${overlapping.label}' (${formatDate(overlapping.startDate)} to ${formatDate(overlapping.endDate)})`,
    );
  }
}

export async function listSessionYears(institutionId: string) {
  const years = await sessionYearRepository.findAll(institutionId);
  return years.map(({ _count, ...year }) => ({
    ...year,
    status: sessionStatus(year.startDate, year.endDate),
    studentCount: _count.students,
    eventCount: _count.events,
  }));
}

export async function getDefaultSessionYear(institutionId: string) {
  return sessionYearRepository.findDefault(institutionId);
}

export async function createSessionYear(institutionId: string, data: CreateSessionYearDtoType) {
  const fields = { label: data.label, startDate: toDbDate(data.startDate), endDate: toDbDate(data.endDate) };
  await assertNoConflicts(institutionId, fields);

  // The very first session year becomes the default automatically.
  const makeDefault = data.isDefault || (await sessionYearRepository.count(institutionId)) === 0;
  const sessionYear = await prisma.$transaction(async (tx) => {
    if (makeDefault) await sessionYearRepository.clearDefault(tx, institutionId);
    return sessionYearRepository.create(tx, institutionId, { ...fields, isCurrent: makeDefault });
  });
  logger.info('Session year created', { sessionYearId: sessionYear.id, institutionId });
  return sessionYear;
}

export async function updateSessionYear(institutionId: string, id: string, data: UpdateSessionYearDtoType) {
  const existing = await sessionYearRepository.findById(institutionId, id);
  if (!existing) {
    throw new NotFoundError(`Session year with ID '${id}' not found`);
  }

  const merged = {
    label: data.label ?? existing.label,
    startDate: data.startDate ? toDbDate(data.startDate) : existing.startDate,
    endDate: data.endDate ? toDbDate(data.endDate) : existing.endDate,
  };
  if (merged.endDate <= merged.startDate) {
    throw new ValidationError('End date must be after the start date');
  }
  await assertNoConflicts(institutionId, merged, id);

  const outside = await sessionYearRepository.countEventsOutside(id, merged.startDate, merged.endDate);
  if (outside > 0) {
    throw new ConflictError(
      `${outside} event${outside === 1 ? '' : 's'} in this session would fall outside the new dates — move or delete ${outside === 1 ? 'it' : 'them'} first`,
    );
  }

  const updated = await sessionYearRepository.update(institutionId, id, merged);
  logger.info('Session year updated', { sessionYearId: id, institutionId });
  return updated;
}

export async function setDefaultSessionYear(institutionId: string, id: string) {
  const existing = await sessionYearRepository.findById(institutionId, id);
  if (!existing) {
    throw new NotFoundError(`Session year with ID '${id}' not found`);
  }
  const updated = await prisma.$transaction(async (tx) => {
    await sessionYearRepository.clearDefault(tx, institutionId);
    return sessionYearRepository.markDefault(tx, institutionId, id);
  });
  logger.info('Default session year changed', { sessionYearId: id, institutionId });
  return updated;
}

export async function deleteSessionYear(institutionId: string, id: string) {
  const existing = await sessionYearRepository.findById(institutionId, id);
  if (!existing) {
    throw new NotFoundError(`Session year with ID '${id}' not found`);
  }
  if (existing.isCurrent) {
    throw new ConflictError('The default session year can’t be deleted — set another session as default first');
  }
  const [students, events] = await Promise.all([
    sessionYearRepository.countStudents(id),
    sessionYearRepository.countEvents(id),
  ]);
  if (students > 0 || events > 0) {
    const parts = [
      students > 0 ? `${students} student${students === 1 ? '' : 's'}` : null,
      events > 0 ? `${events} event${events === 1 ? '' : 's'}` : null,
    ].filter(Boolean);
    throw new ConflictError(`'${existing.label}' is used by ${parts.join(' and ')} and can’t be deleted`);
  }
  await sessionYearRepository.remove(institutionId, id);
  logger.info('Session year deleted', { sessionYearId: id, institutionId });
}
