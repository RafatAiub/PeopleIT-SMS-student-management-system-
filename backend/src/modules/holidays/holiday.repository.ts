import { prisma } from '../../config/prisma';
import { HolidayType, Prisma } from '@prisma/client';

type Client = Prisma.TransactionClient;

export function toDbDate(isoDate: string): Date {
  return new Date(`${isoDate}T00:00:00.000Z`);
}

function yearRange(year: number) {
  return { gte: toDbDate(`${year}-01-01`), lte: toDbDate(`${year}-12-31`) };
}

export interface HolidayRow {
  date: Date;
  title: string;
  description?: string | null;
  type: HolidayType;
  isTentative: boolean;
  sourceKey?: string | null;
}

// --- Holiday Calendar (per session year) ---

export async function findCalendar(institutionId: string, year: number) {
  return prisma.holidayCalendar.findUnique({
    where: { institutionId_year: { institutionId, year } },
  });
}

export async function findCalendarsFromYear(fromYear: number) {
  return prisma.holidayCalendar.findMany({
    where: { year: { gte: fromYear } },
    select: { institutionId: true, year: true },
  });
}

export async function createCalendar(
  client: Client,
  institutionId: string,
  year: number,
  weeklyOffDays: number[],
) {
  return client.holidayCalendar.create({ data: { institutionId, year, weeklyOffDays } });
}

export async function updateCalendar(
  client: Client,
  institutionId: string,
  year: number,
  data: { weeklyOffDays?: number[]; governmentSource?: string; governmentSyncedAt?: Date },
) {
  return client.holidayCalendar.update({
    where: { institutionId_year: { institutionId, year } },
    data,
  });
}

// --- Holidays ---

export async function findHolidaysForYear(institutionId: string, year: number) {
  return prisma.holiday.findMany({
    where: { institutionId, date: yearRange(year), deletedAt: null },
    orderBy: [{ date: 'asc' }, { type: 'asc' }, { title: 'asc' }],
  });
}

export async function findHolidayById(institutionId: string, id: string) {
  return prisma.holiday.findFirst({ where: { id, institutionId, deletedAt: null } });
}

// Includes soft-deleted rows — they still hold the (date, title) unique slot.
export async function findHolidaysByDatesAndTitle(institutionId: string, dates: Date[], title: string) {
  return prisma.holiday.findMany({ where: { institutionId, date: { in: dates }, title } });
}

// Auto-generated rows whose sourceKey starts with the prefix, soft-deleted included.
export async function findKeyedHolidays(client: Client, institutionId: string, keyPrefix: string) {
  return client.holiday.findMany({
    where: { institutionId, sourceKey: { startsWith: keyPrefix } },
  });
}

export async function createHolidays(client: Client, institutionId: string, rows: HolidayRow[]) {
  if (rows.length === 0) return { count: 0 };
  return client.holiday.createMany({
    data: rows.map((r) => ({ ...r, institutionId })),
    skipDuplicates: true,
  });
}

export async function updateHoliday(
  institutionId: string,
  id: string,
  data: {
    date?: Date;
    title?: string;
    description?: string | null;
    type?: HolidayType;
    isTentative?: boolean;
    isCustomized?: boolean;
  },
) {
  return prisma.holiday.update({ where: { id, institutionId }, data });
}

export async function softDeleteHoliday(institutionId: string, id: string) {
  return prisma.holiday.update({ where: { id, institutionId }, data: { deletedAt: new Date() } });
}

export async function deleteHolidaysByIds(client: Client, institutionId: string, ids: string[]) {
  if (ids.length === 0) return { count: 0 };
  return client.holiday.deleteMany({ where: { institutionId, id: { in: ids } } });
}

// Brings back soft-deleted auto-generated rows for a year.
export async function restoreDeletedDefaults(client: Client, institutionId: string, year: number) {
  return client.holiday.updateMany({
    where: {
      institutionId,
      deletedAt: { not: null },
      OR: [{ sourceKey: { startsWith: `gov:${year}:` } }, { sourceKey: { startsWith: `weekly:${year}-` } }],
    },
    data: { deletedAt: null },
  });
}
