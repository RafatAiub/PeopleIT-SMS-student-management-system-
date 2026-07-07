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

export async function getVehicles(institutionId: string) {
  return prisma.transportVehicle.findMany({
    where: { institutionId },
  });
}

export async function createRoute(institutionId: string, data: CreateRouteInput) {
  return prisma.transportRoute.create({
    data: {
      institutionId,
      ...data,
    },
  });
}

export async function getRoutes(institutionId: string) {
  return prisma.transportRoute.findMany({
    where: { institutionId },
  });
}

export async function createAssignment(institutionId: string, data: CreateAssignmentInput) {
  return prisma.transportAssignment.create({
    data: {
      institutionId,
      ...data,
    },
  });
}

export async function getAssignments(institutionId: string) {
  return prisma.transportAssignment.findMany({
    where: { institutionId },
    include: {
      student: true,
      route: true,
      vehicle: true,
    }
  });
}
