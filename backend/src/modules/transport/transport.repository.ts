import { Prisma } from '@prisma/client';
import prisma from '../../config/prisma';
import {
  CreateVehicleInput,
  CreateRouteInput,
  CreateAssignmentInput,
  UpdateVehicleInput,
  UpdateRouteInput,
  UpdateAssignmentInput,
} from './transport.dto';

export async function createVehicle(institutionId: string, data: CreateVehicleInput) {
  return prisma.transportVehicle.create({
    data: {
      institutionId,
      ...data,
    },
  });
}

export async function getVehicles(
  institutionId: string,
  query: { page?: number; pageSize?: number; search?: string }
) {
  const page = Number(query.page) || 1;
  const pageSize = Number(query.pageSize) || 20;
  const skip = (page - 1) * pageSize;

  const where = {
    institutionId,
    ...(query.search
      ? {
          OR: [
            { registrationNumber: { contains: query.search, mode: 'insensitive' as const } },
            { driverName: { contains: query.search, mode: 'insensitive' as const } },
          ],
        }
      : {}),
  };

  const [vehicles, total] = await prisma.$transaction([
    prisma.transportVehicle.findMany({
      where,
      skip,
      take: pageSize,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.transportVehicle.count({ where }),
  ]);

  return { vehicles, total };
}

export async function findVehicleById(institutionId: string, vehicleId: string) {
  return prisma.transportVehicle.findFirst({ where: { id: vehicleId, institutionId } });
}

export async function updateVehicle(institutionId: string, vehicleId: string, data: UpdateVehicleInput) {
  return prisma.transportVehicle.updateMany({ where: { id: vehicleId, institutionId }, data });
}

export async function countAssignmentsForVehicle(institutionId: string, vehicleId: string) {
  return prisma.transportAssignment.count({ where: { institutionId, vehicleId } });
}

export async function deleteVehicle(institutionId: string, vehicleId: string) {
  return prisma.transportVehicle.deleteMany({ where: { id: vehicleId, institutionId } });
}

export async function createRoute(institutionId: string, data: CreateRouteInput) {
  return prisma.transportRoute.create({
    data: {
      institutionId,
      ...data,
    },
  });
}

export async function getRoutes(
  institutionId: string,
  query: { page?: number; pageSize?: number; search?: string }
) {
  const page = Number(query.page) || 1;
  const pageSize = Number(query.pageSize) || 20;
  const skip = (page - 1) * pageSize;

  const where = {
    institutionId,
    ...(query.search
      ? {
          OR: [
            { name: { contains: query.search, mode: 'insensitive' as const } },
          ],
        }
      : {}),
  };

  const [routes, total] = await prisma.$transaction([
    prisma.transportRoute.findMany({
      where,
      skip,
      take: pageSize,
      orderBy: { createdAt: 'desc' },
      // Wave C — additive: structured stop / assignment counts for the UI.
      include: { _count: { select: { stopPoints: true, assignments: true } } },
    }),
    prisma.transportRoute.count({ where }),
  ]);

  return { routes, total };
}

export async function findRouteById(institutionId: string, routeId: string) {
  return prisma.transportRoute.findFirst({ where: { id: routeId, institutionId } });
}

export async function updateRoute(institutionId: string, routeId: string, data: UpdateRouteInput) {
  return prisma.transportRoute.updateMany({ where: { id: routeId, institutionId }, data });
}

export async function countAssignmentsForRoute(institutionId: string, routeId: string) {
  return prisma.transportAssignment.count({ where: { institutionId, routeId } });
}

export async function deleteRoute(institutionId: string, routeId: string) {
  return prisma.transportRoute.deleteMany({ where: { id: routeId, institutionId } });
}

export async function createAssignment(institutionId: string, data: CreateAssignmentInput) {
  return prisma.transportAssignment.create({
    data: {
      institutionId,
      ...data,
    },
  });
}

export async function getAssignments(
  institutionId: string,
  query: {
    page?: number;
    pageSize?: number;
    search?: string;
    studentId?: string;
    studentIdIn?: string[];
  }
) {
  const page = Number(query.page) || 1;
  const pageSize = Number(query.pageSize) || 20;
  const skip = (page - 1) * pageSize;

  const where = {
    institutionId,
    ...(query.studentId ? { studentId: query.studentId } : {}),
    ...(query.studentIdIn ? { studentId: { in: query.studentIdIn } } : {}),
    ...(query.search
      ? {
          OR: [
            {
              student: {
                OR: [
                  { firstName: { contains: query.search, mode: 'insensitive' as const } },
                  { lastName: { contains: query.search, mode: 'insensitive' as const } },
                ],
              },
            },
            {
              route: {
                name: { contains: query.search, mode: 'insensitive' as const },
              },
            },
          ],
        }
      : {}),
  };

  const [assignments, total] = await prisma.$transaction([
    prisma.transportAssignment.findMany({
      where,
      skip,
      take: pageSize,
      include: {
        student: true,
        route: true,
        vehicle: true,
        // Wave C — additive: the structured stop, when one was picked.
        stop: { select: { id: true, name: true, sequence: true, pickupTime: true, dropTime: true } },
      },
    }),
    prisma.transportAssignment.count({ where }),
  ]);

  return { assignments, total };
}

// ── Wave C: assignments ─────────────────────────────────────────────────────
const assignmentInclude = {
  student: true,
  route: true,
  vehicle: true,
  stop: { select: { id: true, name: true, sequence: true, pickupTime: true, dropTime: true } },
} satisfies Prisma.TransportAssignmentInclude;

export async function findAssignmentById(institutionId: string, id: string) {
  return prisma.transportAssignment.findFirst({ where: { id, institutionId } });
}

export async function updateAssignment(id: string, data: UpdateAssignmentInput) {
  return prisma.transportAssignment.update({ where: { id }, data, include: assignmentInclude });
}

export async function deleteAssignment(institutionId: string, id: string) {
  return prisma.transportAssignment.deleteMany({ where: { id, institutionId } });
}

// ── Wave C: stops ───────────────────────────────────────────────────────────
export async function listStops(institutionId: string, routeId: string) {
  return prisma.transportStop.findMany({
    where: { institutionId, routeId },
    orderBy: [{ sequence: 'asc' }, { createdAt: 'asc' }],
    include: { _count: { select: { assignments: true } } },
  });
}

export async function findStopById(institutionId: string, stopId: string) {
  return prisma.transportStop.findFirst({ where: { id: stopId, institutionId } });
}

export async function createStop(data: Prisma.TransportStopUncheckedCreateInput) {
  return prisma.transportStop.create({ data, include: { _count: { select: { assignments: true } } } });
}

export async function updateStop(id: string, data: Prisma.TransportStopUncheckedUpdateInput) {
  return prisma.transportStop.update({ where: { id }, data, include: { _count: { select: { assignments: true } } } });
}

/** Writes new 1-based sequences for the given stops in one transaction. */
export async function applyStopSequences(institutionId: string, routeId: string, order: { id: string; sequence: number }[]) {
  await prisma.$transaction(
    order.map((o) =>
      prisma.transportStop.updateMany({ where: { id: o.id, institutionId, routeId }, data: { sequence: o.sequence } }),
    ),
  );
  return listStops(institutionId, routeId);
}

/**
 * Deletes a stop without losing assignments: any assignment pointing at it
 * has stopId cleared first, then the remaining stops are re-sequenced.
 */
export async function deleteStop(institutionId: string, stop: { id: string; routeId: string }) {
  return prisma.$transaction(async (tx) => {
    const cleared = await tx.transportAssignment.updateMany({
      where: { institutionId, stopId: stop.id },
      data: { stopId: null },
    });
    await tx.transportStop.deleteMany({ where: { id: stop.id, institutionId } });
    const rest = await tx.transportStop.findMany({
      where: { institutionId, routeId: stop.routeId },
      orderBy: [{ sequence: 'asc' }, { createdAt: 'asc' }],
      select: { id: true },
    });
    for (let i = 0; i < rest.length; i++) {
      await tx.transportStop.update({ where: { id: rest[i].id }, data: { sequence: i + 1 } });
    }
    return { clearedAssignments: cleared.count };
  });
}

// ── Wave C: vehicle location ────────────────────────────────────────────────
export async function updateVehicleLocation(institutionId: string, vehicleId: string, lat: number, lng: number, at: Date) {
  return prisma.transportVehicle.updateMany({
    where: { id: vehicleId, institutionId },
    data: { lastLat: lat, lastLng: lng, lastLocationAt: at },
  });
}

export async function liveVehiclePositions(institutionId: string) {
  return prisma.transportVehicle.findMany({
    where: { institutionId },
    select: {
      id: true,
      registrationNumber: true,
      driverName: true,
      driverPhone: true,
      capacity: true,
      isActive: true,
      lastLat: true,
      lastLng: true,
      lastLocationAt: true,
    },
    orderBy: { registrationNumber: 'asc' },
    take: 500,
  });
}

// ── Wave C: route report ────────────────────────────────────────────────────
export async function routeReportData(institutionId: string) {
  return Promise.all([
    prisma.transportRoute.findMany({
      where: { institutionId },
      select: {
        id: true,
        name: true,
        isActive: true,
        routeFare: true,
        stopPoints: { select: { id: true, name: true, sequence: true }, orderBy: { sequence: 'asc' } },
      },
      orderBy: { name: 'asc' },
    }),
    prisma.transportVehicle.findMany({
      where: { institutionId },
      select: { id: true, registrationNumber: true, capacity: true, isActive: true },
    }),
    prisma.transportAssignment.groupBy({
      by: ['routeId', 'vehicleId', 'stopId'],
      where: { institutionId },
      _count: { _all: true },
    }),
  ]);
}

// ── Wave C: fee billing ─────────────────────────────────────────────────────
export async function assignmentsForBilling(institutionId: string, routeId?: string | null) {
  return prisma.transportAssignment.findMany({
    where: { institutionId, ...(routeId ? { routeId } : {}) },
    select: {
      studentId: true,
      student: { select: { id: true, studentId: true, firstName: true, lastName: true, status: true } },
      route: { select: { id: true, name: true, routeFare: true } },
      stop: { select: { name: true } },
    },
    orderBy: { assignedAt: 'asc' },
    take: 5000,
  });
}

/** Lines on non-cancelled invoices for these students carrying the period tag. */
export async function periodTaggedLines(institutionId: string, studentIds: string[], period: string) {
  if (studentIds.length === 0) return [];
  const rows = await prisma.invoiceItem.findMany({
    where: {
      description: { contains: `[${period}]`, mode: 'insensitive' },
      invoice: { institutionId, studentId: { in: studentIds }, status: { not: 'CANCELLED' } },
    },
    select: { description: true, invoice: { select: { studentId: true } } },
  });
  return rows.map((r) => ({ studentId: r.invoice.studentId, description: r.description }));
}

export async function findFeeCategory(institutionId: string, id: string) {
  return prisma.feeCategory.findFirst({ where: { id, institutionId }, select: { id: true, name: true, isActive: true } });
}

export async function findTransportFeeCategory(institutionId: string) {
  return prisma.feeCategory.findFirst({
    where: { institutionId, isActive: true, name: { startsWith: 'Transport', mode: 'insensitive' } },
    orderBy: { createdAt: 'asc' },
    select: { id: true, name: true, isActive: true },
  });
}
