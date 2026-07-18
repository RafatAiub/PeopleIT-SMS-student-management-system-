import * as transportRepository from './transport.repository';
import * as studentRepository from '../students/student.repository';
import * as guardianRepository from '../guardians/guardian.repository';
import { CreateVehicleInput, CreateRouteInput, CreateAssignmentInput } from './transport.dto';
import { AppError } from '../../utils/AppError';
import { UserRole } from '@prisma/client';

export type RequestingUser = { sub: string; role: string };

export async function createVehicle(institutionId: string, data: CreateVehicleInput) {
  return transportRepository.createVehicle(institutionId, data);
}

export async function getVehicles(institutionId: string, query: any = {}) {
  return transportRepository.getVehicles(institutionId, query);
}

export async function createRoute(institutionId: string, data: CreateRouteInput) {
  return transportRepository.createRoute(institutionId, data);
}

export async function getRoutes(institutionId: string, query: any = {}) {
  return transportRepository.getRoutes(institutionId, query);
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
