import { prisma } from '../../config/prisma';
import { EventAudience, EventCategory, EventType, Prisma, UserRole } from '@prisma/client';

export function toDbDate(isoDate: string): Date {
  return new Date(`${isoDate}T00:00:00.000Z`);
}

const EVENT_INCLUDE = {
  academicYear: { select: { id: true, label: true } },
} as const;

export interface EventData {
  academicYearId: string;
  title: string;
  description: string | null;
  category: EventCategory;
  type: EventType;
  startDate: Date;
  endDate: Date;
  startTime: string | null;
  endTime: string | null;
  venue: string | null;
  audience: EventAudience[];
  imageUrl: string | null;
}

export async function findEvents(
  institutionId: string,
  filters: {
    academicYearId?: string;
    category?: EventCategory;
    audience?: EventAudience; // undefined = every audience (admins)
    endingFrom?: Date; // upcoming: still running on/after this day
    endedBefore?: Date; // past: finished before this day
  },
  options: { take?: number; order?: Prisma.SortOrder } = {},
) {
  return prisma.event.findMany({
    where: {
      institutionId,
      ...(filters.academicYearId ? { academicYearId: filters.academicYearId } : {}),
      ...(filters.category ? { category: filters.category } : {}),
      ...(filters.audience ? { audience: { has: filters.audience } } : {}),
      ...(filters.endingFrom ? { endDate: { gte: filters.endingFrom } } : {}),
      ...(filters.endedBefore ? { endDate: { lt: filters.endedBefore } } : {}),
    },
    include: EVENT_INCLUDE,
    orderBy: [{ startDate: options.order ?? 'asc' }, { startTime: 'asc' }],
    ...(options.take ? { take: options.take } : {}),
  });
}

export async function findEventById(institutionId: string, id: string) {
  return prisma.event.findFirst({ where: { id, institutionId }, include: EVENT_INCLUDE });
}

export async function createEvent(institutionId: string, createdByUserId: string, data: EventData) {
  return prisma.event.create({
    data: { ...data, institutionId, createdByUserId },
    include: EVENT_INCLUDE,
  });
}

export async function updateEvent(institutionId: string, id: string, data: EventData) {
  return prisma.event.update({ where: { id, institutionId }, data, include: EVENT_INCLUDE });
}

export async function deleteEvent(institutionId: string, id: string) {
  return prisma.event.delete({ where: { id, institutionId } });
}

export async function findAcademicYear(institutionId: string, id: string) {
  return prisma.academicYear.findFirst({ where: { id, institutionId } });
}

export async function findActiveUserIdsByRoles(institutionId: string, roles: UserRole[]) {
  const users = await prisma.user.findMany({
    where: { institutionId, role: { in: roles }, isActive: true },
    select: { id: true },
  });
  return users.map((u) => u.id);
}
