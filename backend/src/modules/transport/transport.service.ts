import * as transportRepository from './transport.repository';
import { CreateVehicleInput, CreateRouteInput, CreateAssignmentInput } from './transport.dto';
import { AppError } from '../../utils/AppError';

export async function createVehicle(institutionId: string, data: CreateVehicleInput) {
  return transportRepository.createVehicle(institutionId, data);
}

export async function getVehicles(institutionId: string) {
  return transportRepository.getVehicles(institutionId);
}

export async function createRoute(institutionId: string, data: CreateRouteInput) {
  return transportRepository.createRoute(institutionId, data);
}

export async function getRoutes(institutionId: string) {
  return transportRepository.getRoutes(institutionId);
}

export async function createAssignment(institutionId: string, data: CreateAssignmentInput) {
  try {
    return await transportRepository.createAssignment(institutionId, data);
  } catch (error: any) {
    if (error.code === 'P2002') {
      throw new AppError('Student is already assigned to a transport route', 400);
    }
    throw new AppError(error.message || 'Failed to create assignment', 400);
  }
}

export async function getAssignments(institutionId: string) {
  return transportRepository.getAssignments(institutionId);
}
