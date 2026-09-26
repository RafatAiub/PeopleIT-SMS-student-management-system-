import * as transportRepository from './transport.repository';
import * as studentRepository from '../students/student.repository';
import * as guardianRepository from '../guardians/guardian.repository';
import {
  CreateVehicleInput,
  CreateRouteInput,
  CreateAssignmentInput,
  UpdateVehicleInput,
  UpdateRouteInput,
} from './transport.dto';
import { AppError, NotFoundError, ConflictError, BadRequestError } from '../../utils/AppError';
import { UserRole } from '@prisma/client';

export type RequestingUser = { sub: string; role: string };

export async function createVehicle(institutionId: string, data: CreateVehicleInput) {
  return transportRepository.createVehicle(institutionId, data);
}

export async function getVehicles(institutionId: string, query: any = {}) {
  return transportRepository.getVehicles(institutionId, query);
}

export async function updateVehicle(institutionId: string, vehicleId: string, data: UpdateVehicleInput) {
  const result = await transportRepository.updateVehicle(institutionId, vehicleId, data);
  if (result.count === 0) throw new NotFoundError('Vehicle not found');
  return transportRepository.findVehicleById(institutionId, vehicleId);
}

export async function deleteVehicle(institutionId: string, vehicleId: string) {
  const vehicle = await transportRepository.findVehicleById(institutionId, vehicleId);
  if (!vehicle) throw new NotFoundError('Vehicle not found');

  const assignmentCount = await transportRepository.countAssignmentsForVehicle(institutionId, vehicleId);
  if (assignmentCount > 0) {
    throw new ConflictError('This vehicle has active assignments and cannot be deleted');
  }

  const result = await transportRepository.deleteVehicle(institutionId, vehicleId);
  if (result.count === 0) throw new NotFoundError('Vehicle not found');
  return { id: vehicleId };
}

export async function createRoute(institutionId: string, data: CreateRouteInput) {
  return transportRepository.createRoute(institutionId, data);
}

export async function getRoutes(institutionId: string, query: any = {}) {
  return transportRepository.getRoutes(institutionId, query);
}

export async function updateRoute(institutionId: string, routeId: string, data: UpdateRouteInput) {
  const result = await transportRepository.updateRoute(institutionId, routeId, data);
  if (result.count === 0) throw new NotFoundError('Route not found');
  return transportRepository.findRouteById(institutionId, routeId);
}

export async function deleteRoute(institutionId: string, routeId: string) {
  const route = await transportRepository.findRouteById(institutionId, routeId);
  if (!route) throw new NotFoundError('Route not found');

  const assignmentCount = await transportRepository.countAssignmentsForRoute(institutionId, routeId);
  if (assignmentCount > 0) {
    throw new ConflictError('This route has active assignments and cannot be deleted');
  }

  const result = await transportRepository.deleteRoute(institutionId, routeId);
  if (result.count === 0) throw new NotFoundError('Route not found');
  return { id: routeId };
}

export async function createAssignment(institutionId: string, data: CreateAssignmentInput) {
  // F4: studentId, routeId, vehicleId are all client-supplied and must
  // belong to this tenant before an assignment is created linking them.
  const [student, route, vehicle] = await Promise.all([
    studentRepository.findById(institutionId, data.studentId),
    transportRepository.findRouteById(institutionId, data.routeId),
    transportRepository.findVehicleById(institutionId, data.vehicleId),
  ]);
  if (!student) throw new BadRequestError('Student not found in your institution');
  if (!route) throw new BadRequestError('Route not found in your institution');
  if (!vehicle) throw new BadRequestError('Vehicle not found in your institution');

  try {
    return await transportRepository.createAssignment(institutionId, data);
  } catch (error: any) {
    if (error.code === 'P2002') {
      throw new AppError('Student is already assigned to a transport route', 400);
    }
    throw new AppError(error.message || 'Failed to create assignment', 400);
  }
}

export async function getAssignments(institutionId: string, query: any = {}) {
  return transportRepository.getAssignments(institutionId, query);
}

// Self-service scoping for STUDENT/GUARDIAN callers — never trust a
// client-supplied studentId for these roles; resolve ownership server-side.
// @@unique([institutionId, studentId]) on TransportAssignment guarantees at
// most one row per student, so this never needs pagination.
export async function getMyAssignment(
  institutionId: string,
  requester: RequestingUser,
  query: { studentId?: string } = {},
) {
  if (requester.role === UserRole.STUDENT) {
    const student = await studentRepository.findByUserId(institutionId, requester.sub);
    const { assignments } = await transportRepository.getAssignments(institutionId, {
      studentId: student?.id ?? '__no-match__',
    });
    return assignments[0] ?? null;
  }

  if (requester.role === UserRole.GUARDIAN) {
    const linkedStudentIds = await guardianRepository.findLinkedStudentIdsByUserId(institutionId, requester.sub);

    if (query.studentId) {
      if (!linkedStudentIds.includes(query.studentId)) {
        return null;
      }
      const { assignments } = await transportRepository.getAssignments(institutionId, {
        studentId: query.studentId,
      });
      return assignments[0] ?? null;
    }

    const { assignments } = await transportRepository.getAssignments(institutionId, {
      studentIdIn: linkedStudentIds.length > 0 ? linkedStudentIds : ['__no-match__'],
      pageSize: linkedStudentIds.length > 0 ? linkedStudentIds.length : 1,
    });
    return assignments;
  }

  // Non-student/guardian roles have no self-service concept here.
  return null;
}
