import { HolidayType, Holiday } from '@prisma/client';
import { prisma } from '../../config/prisma';
import * as holidayRepository from './holiday.repository';
import { toDbDate, HolidayRow } from './holiday.repository';
import { NotFoundError, ConflictError } from '../../utils/AppError';
import { logger } from '../../utils/logger';
import { fetchHolidayFeed } from './holiday.feed';
import {
  DEFAULT_WEEKLY_OFF_DAYS,
  DefaultHoliday,
  GovernmentSource,
  buildGovernmentHolidays,
  getWeeklyHolidays,
} from './holiday.defaults';
import type {
  CreateHolidayDtoType,
  UpdateHolidayDtoType,
  UpdateHolidaySettingsDtoType,
  RestoreHolidayDefaultsDtoType,
} from './holiday.dto';

const UNIQUE_CONSTRAINT_CODE = 'P2002';

function isUniqueConstraintError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: string }).code === UNIQUE_CONSTRAINT_CODE;
}

function formatDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function toRow(h: DefaultHoliday): HolidayRow {
  return {
    date: toDbDate(h.date),
    title: h.title,
    description: h.description,
    type: h.type,
    isTentative: h.isTentative,
    sourceKey: h.sourceKey,
  };
}

// Every day from startDate to endDate inclusive, as YYYY-MM-DD strings.
export function expandDateRange(startDate: string, endDate?: string): string[] {
  const dates: string[] = [];
  const d = toDbDate(startDate);
  const end = toDbDate(endDate ?? startDate);
  while (d <= end) {
    dates.push(formatDate(d));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return dates;
}

export interface GovernmentSyncPlan {
  insert: DefaultHoliday[];
  // Rows whose feed values changed (e.g. Eid moved by a day): replaced in place.
  replace: { id: string; holiday: DefaultHoliday }[];
  // Auto rows the source no longer lists (e.g. fallback rows once the feed covers the year).
  remove: string[];
}

// Works out how to bring a year's auto-generated government rows in line with
// the source. Rows an admin edited or deleted are never touched, so a sync
// can't undo the school's own changes.
export function planGovernmentSync(
  defaults: DefaultHoliday[],
  existing: Pick<Holiday, 'id' | 'sourceKey' | 'date' | 'title' | 'description' | 'isTentative' | 'isCustomized' | 'deletedAt'>[],
): GovernmentSyncPlan {
  const byKey = new Map(existing.map((row) => [row.sourceKey, row]));
  const wanted = new Set(defaults.map((h) => h.sourceKey));
  const plan: GovernmentSyncPlan = { insert: [], replace: [], remove: [] };

  for (const holiday of defaults) {
    const row = byKey.get(holiday.sourceKey);
    if (!row) {
      plan.insert.push(holiday);
    } else if (!row.isCustomized && !row.deletedAt) {
      const changed =
        formatDate(row.date) !== holiday.date ||
        row.title !== holiday.title ||
        row.description !== holiday.description ||
        row.isTentative !== holiday.isTentative;
      if (changed) plan.replace.push({ id: row.id, holiday });
    }
  }
  for (const row of existing) {
    if (!row.isCustomized && row.sourceKey && !wanted.has(row.sourceKey)) plan.remove.push(row.id);
  }
  return plan;
}

async function loadGovernmentHolidays(year: number, forceRefresh = false) {
  const feed = await fetchHolidayFeed(forceRefresh ? { maxAgeMs: 10 * 60 * 1000 } : {});
  return buildGovernmentHolidays(year, feed);
}

async function applyGovernmentSync(
  institutionId: string,
  year: number,
  source: GovernmentSource,
  defaults: DefaultHoliday[],
) {
  return prisma.$transaction(async (tx) => {
    // Never downgrade a year that already came from the feed to the
    // fixed-date fallback (feed briefly down, or it stopped listing the year).
    const calendar = await tx.holidayCalendar.findUnique({ where: { institutionId_year: { institutionId, year } } });
    if (source === 'FALLBACK' && calendar?.governmentSource === 'FEED') {
      return { source: 'FEED' as GovernmentSource, added: 0, updated: 0, removed: 0 };
    }
    const existing = await holidayRepository.findKeyedHolidays(tx, institutionId, `gov:${year}:`);
    const plan = planGovernmentSync(defaults, existing);
    // Changed rows are deleted and re-inserted with the same key, so a
    // holiday moving onto a sibling's old date never trips the unique index.
    await holidayRepository.deleteHolidaysByIds(tx, institutionId, [...plan.remove, ...plan.replace.map((r) => r.id)]);
    const { count } = await holidayRepository.createHolidays(tx, institutionId, [
      ...plan.insert.map(toRow),
      ...plan.replace.map((r) => toRow(r.holiday)),
    ]);
    await holidayRepository.updateCalendar(tx, institutionId, year, {
      governmentSource: source,
      governmentSyncedAt: new Date(),
    });
    return {
      source,
      added: Math.max(0, count - plan.replace.length),
      updated: plan.replace.length,
      removed: plan.remove.length,
    };
  });
}

export async function syncGovernmentHolidays(institutionId: string, year: number, forceRefresh = false) {
  const { source, holidays } = await loadGovernmentHolidays(year, forceRefresh);
  const result = await applyGovernmentSync(institutionId, year, source, holidays);
  logger.info('Government holidays synced', { institutionId, year, ...result });
  return result;
}

// Auto-fills a session year the first time it's opened: weekly off days plus
// Bangladesh government holidays. The HolidayCalendar row doubles as the
// "already seeded" marker; concurrent first visits race on its unique key and
// the loser just reads the winner's row.
export async function ensureYearSeeded(institutionId: string, year: number) {
  const existing = await holidayRepository.findCalendar(institutionId, year);
  if (existing) {
    if (!existing.governmentSource) {
      await syncGovernmentHolidays(institutionId, year);
      return (await holidayRepository.findCalendar(institutionId, year))!;
    }
    return existing;
  }

  // Fetch before the transaction — no network calls while holding it open.
  const government = await loadGovernmentHolidays(year);
  try {
    await prisma.$transaction(async (tx) => {
      await holidayRepository.createCalendar(tx, institutionId, year, DEFAULT_WEEKLY_OFF_DAYS);
      await holidayRepository.createHolidays(tx, institutionId, [
        ...getWeeklyHolidays(year, DEFAULT_WEEKLY_OFF_DAYS).map(toRow),
        ...government.holidays.map(toRow),
      ]);
      await holidayRepository.updateCalendar(tx, institutionId, year, {
        governmentSource: government.source,
        governmentSyncedAt: new Date(),
      });
    });
    logger.info('Holiday calendar seeded', { institutionId, year, governmentSource: government.source });
  } catch (error) {
    if (!isUniqueConstraintError(error)) throw error;
  }
  return (await holidayRepository.findCalendar(institutionId, year))!;
}

export async function listHolidays(institutionId: string, year: number) {
  const calendar = await ensureYearSeeded(institutionId, year);
  const holidays = await holidayRepository.findHolidaysForYear(institutionId, year);
  return {
    year,
    weeklyOffDays: calendar.weeklyOffDays,
    governmentSource: calendar.governmentSource,
    governmentSyncedAt: calendar.governmentSyncedAt,
    holidays,
  };
}

export async function createHoliday(institutionId: string, data: CreateHolidayDtoType) {
  const year = Number(data.date.slice(0, 4));
  await ensureYearSeeded(institutionId, year);

  const dates = expandDateRange(data.date, data.endDate).map(toDbDate);
  const clashing = await holidayRepository.findHolidaysByDatesAndTitle(institutionId, dates, data.title);
  const live = clashing.filter((h) => !h.deletedAt);
  if (dates.length === 1 && live.length > 0) {
    throw new ConflictError(`'${data.title}' is already on the list for ${formatDate(dates[0])}`);
  }
  // A deleted default with the same date and title still holds the unique
  // slot — clear it so the school's own holiday can take its place.
  await holidayRepository.deleteHolidaysByIds(
    prisma,
    institutionId,
    clashing.filter((h) => h.deletedAt).map((h) => h.id),
  );

  const { count } = await holidayRepository.createHolidays(
    prisma,
    institutionId,
    dates.map((date) => ({
      date,
      title: data.title,
      description: data.description || null,
      type: data.type as HolidayType,
      isTentative: false,
    })),
  );
  logger.info('Holiday created', { institutionId, title: data.title, days: count });
  return { created: count };
}

export async function updateHoliday(institutionId: string, id: string, data: UpdateHolidayDtoType) {
  const holiday = await holidayRepository.findHolidayById(institutionId, id);
  if (!holiday) {
    throw new NotFoundError(`Holiday with ID '${id}' not found`);
  }

  const date = data.date ? toDbDate(data.date) : undefined;
  const dateChanged = !!date && date.getTime() !== holiday.date.getTime();

  try {
    const updated = await holidayRepository.updateHoliday(institutionId, id, {
      ...(date ? { date } : {}),
      ...(data.title !== undefined ? { title: data.title } : {}),
      ...(data.description !== undefined ? { description: data.description || null } : {}),
      ...(data.type !== undefined ? { type: data.type as HolidayType } : {}),
      // An admin moving a moon-sighting holiday to its announced date confirms it.
      ...(dateChanged ? { isTentative: false } : {}),
      // The sync stops managing an auto-generated row once the school edits it.
      ...(holiday.sourceKey ? { isCustomized: true } : {}),
    });
    logger.info('Holiday updated', { holidayId: id, institutionId });
    return updated;
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw new ConflictError('A holiday with this title already exists on that date');
    }
    throw error;
  }
}

// Auto-generated rows are soft-deleted so neither a revisit nor a feed sync
// brings them back ("Restore Defaults" does). School-added rows are removed.
export async function deleteHoliday(institutionId: string, id: string) {
  const holiday = await holidayRepository.findHolidayById(institutionId, id);
  if (!holiday) {
    throw new NotFoundError(`Holiday with ID '${id}' not found`);
  }
  if (holiday.sourceKey) {
    await holidayRepository.softDeleteHoliday(institutionId, id);
  } else {
    await holidayRepository.deleteHolidaysByIds(prisma, institutionId, [id]);
  }
  logger.info('Holiday deleted', { holidayId: id, institutionId });
}

// Changes which weekdays are weekly off days for a year: untouched weekly rows
// for dropped weekdays are removed, rows for newly added weekdays generated.
export async function updateHolidaySettings(institutionId: string, year: number, data: UpdateHolidaySettingsDtoType) {
  await ensureYearSeeded(institutionId, year);
  const weeklyOffDays = [...new Set(data.weeklyOffDays)].sort();
  const weekly = getWeeklyHolidays(year, weeklyOffDays);
  const wanted = new Set(weekly.map((h) => h.sourceKey));

  await prisma.$transaction(async (tx) => {
    await holidayRepository.updateCalendar(tx, institutionId, year, { weeklyOffDays });
    const existing = await holidayRepository.findKeyedHolidays(tx, institutionId, `weekly:${year}-`);
    await holidayRepository.deleteHolidaysByIds(
      tx,
      institutionId,
      existing.filter((row) => !row.isCustomized && !wanted.has(row.sourceKey!)).map((row) => row.id),
    );
    await holidayRepository.createHolidays(tx, institutionId, weekly.map(toRow));
  });
  logger.info('Holiday weekly off days updated', { institutionId, year, weeklyOffDays });
  return listHolidays(institutionId, year);
}

// Brings back deleted default holidays and re-syncs government holidays.
// Holidays the school edited stay as they are.
export async function restoreHolidayDefaults(
  institutionId: string,
  year: number,
  data: RestoreHolidayDefaultsDtoType,
) {
  const calendar = await ensureYearSeeded(institutionId, year);
  const { count: revived } = await holidayRepository.restoreDeletedDefaults(prisma, institutionId, year);
  const { count: weeklyAdded } = data.includeWeekly
    ? await holidayRepository.createHolidays(
        prisma,
        institutionId,
        getWeeklyHolidays(year, calendar.weeklyOffDays).map(toRow),
      )
    : { count: 0 };
  const government = data.includeGovernment
    ? await syncGovernmentHolidays(institutionId, year, true)
    : { added: 0 };
  const added = revived + weeklyAdded + government.added;
  logger.info('Holiday defaults restored', { institutionId, year, added });
  return { added };
}

// Daily job: keeps every institution's current and future years in step with
// the holiday feed — picks up next year's list once it's published and moves
// moon-sighting holidays to their announced dates.
export async function syncAllGovernmentHolidays() {
  const thisYear = new Date().getUTCFullYear();
  const calendars = await holidayRepository.findCalendarsFromYear(thisYear);
  if (calendars.length === 0) return;

  const feed = await fetchHolidayFeed({ maxAgeMs: 60 * 60 * 1000 });
  for (const { institutionId, year } of calendars) {
    try {
      const { source, holidays } = buildGovernmentHolidays(year, feed);
      await applyGovernmentSync(institutionId, year, source, holidays);
    } catch (error) {
      logger.error('Government holiday sync failed', {
        institutionId,
        year,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  logger.info('Government holiday daily sync finished', { calendars: calendars.length, feedAvailable: feed !== null });
}
