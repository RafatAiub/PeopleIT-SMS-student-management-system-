import prisma from '../../config/prisma';
import { CreateVehicleInput, CreateRouteInput, CreateAssignmentInput } from './transport.dto';

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
            { vehicleNumber: { contains: query.search, mode: 'insensitive' as const } },
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
