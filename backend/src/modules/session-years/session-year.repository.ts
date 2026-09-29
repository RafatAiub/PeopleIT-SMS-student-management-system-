import { prisma } from '../../config/prisma';
import { Prisma } from '@prisma/client';

type Client = Prisma.TransactionClient;

export function toDbDate(isoDate: string): Date {
  return new Date(`${isoDate}T00:00:00.000Z`);
}

export async function findAll(institutionId: string) {
  return prisma.academicYear.findMany({
    where: { institutionId },
    orderBy: { startDate: 'desc' },
    include: { _count: { select: { students: true, events: true } } },
  });
}

export async function findById(institutionId: string, id: string) {
  return prisma.academicYear.findFirst({ where: { id, institutionId } });
}

export async function findByLabel(institutionId: string, label: string) {
  return prisma.academicYear.findFirst({
    where: { institutionId, label: { equals: label, mode: 'insensitive' } },
  });
}

// Another session year whose date range overlaps [startDate, endDate].
export async function findOverlapping(institutionId: string, startDate: Date, endDate: Date, excludeId?: string) {
  return prisma.academicYear.findFirst({
    where: {
      institutionId,
      ...(excludeId ? { id: { not: excludeId } } : {}),
      startDate: { lte: endDate },
      endDate: { gte: startDate },
    },
  });
}

// The default session year. If old data left several flagged, the latest wins.
export async function findDefault(institutionId: string) {
  return prisma.academicYear.findFirst({
    where: { institutionId, isCurrent: true },
    orderBy: { startDate: 'desc' },
  });
}

export async function count(institutionId: string) {
  return prisma.academicYear.count({ where: { institutionId } });
}

export async function create(
  client: Client,
  institutionId: string,
  data: { label: string; startDate: Date; endDate: Date; isCurrent: boolean },
) {
  return client.academicYear.create({ data: { institutionId, ...data } });
}

export async function update(
  institutionId: string,
  id: string,
  data: { label?: string; startDate?: Date; endDate?: Date },
) {
  return prisma.academicYear.update({ where: { id, institutionId }, data });
}

export async function clearDefault(client: Client, institutionId: string) {
  return client.academicYear.updateMany({ where: { institutionId, isCurrent: true }, data: { isCurrent: false } });
}

export async function markDefault(client: Client, institutionId: string, id: string) {
  return client.academicYear.update({ where: { id, institutionId }, data: { isCurrent: true } });
}

export async function remove(institutionId: string, id: string) {
  return prisma.academicYear.delete({ where: { id, institutionId } });
}

export async function countStudents(id: string) {
  return prisma.student.count({ where: { academicYearId: id } });
}

export async function countEvents(id: string) {
  return prisma.event.count({ where: { academicYearId: id } });
}

// Events that would fall outside a session year's new date range.
export async function countEventsOutside(id: string, startDate: Date, endDate: Date) {
  return prisma.event.count({
    where: { academicYearId: id, OR: [{ startDate: { lt: startDate } }, { endDate: { gt: endDate } }] },
  });
}
