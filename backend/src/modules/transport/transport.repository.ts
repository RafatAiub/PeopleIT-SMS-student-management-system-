import prisma from '../../config/prisma';
import {
  CreateVehicleInput,
  CreateRouteInput,
  CreateAssignmentInput,
  UpdateVehicleInput,
  UpdateRouteInput,
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
      },
    }),
    prisma.transportAssignment.count({ where }),
  ]);

  return { assignments, total };
}
