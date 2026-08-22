import * as assignmentRepository from './assignment.repository';
import * as studentRepository from '../students/student.repository';
import * as guardianRepository from '../guardians/guardian.repository';
import { prisma } from '../../config/prisma';
import { NotFoundError, ForbiddenError, BadRequestError } from '../../utils/AppError';
import { UserRole } from '@prisma/client';
import type {
  CreateAssignmentInput,
  UpdateAssignmentInput,
  AssignmentQueryDtoType,
} from './assignment.dto';

export type RequestingUser = { sub: string; role: string };

// Mirrors lecture.service.ts's resolveScope: a TEACHER explicitly picks the
// class/section/branch an assignment is for, but a STUDENT's own
// class/section/branch is resolved server-side from their profile — never
// trust client-supplied values for a student's own scope.
async function resolveScope(
  institutionId: string,
  requester: RequestingUser,
  data: { branchId?: string; className?: string; sectionName?: string },
): Promise<{ branchId: string; className: string; sectionName: string }> {
  if (requester.role === UserRole.STUDENT) {
    const own = await studentRepository.findByUserId(institutionId, requester.sub);
    if (!own) throw new NotFoundError('Student profile not found for this account');
    const student = await studentRepository.findById(institutionId, own.id);
    if (!student?.branch?.id || !student?.class?.name || !student?.section?.name) {
      throw new BadRequestError('Your class/section is not set up yet — contact your school administrator');
    }
    return { branchId: student.branch.id, className: student.class.name, sectionName: student.section.name };
  }

  // TEACHER
  if (!data.branchId || !data.className || !data.sectionName) {
    throw new BadRequestError('branchId, className, and sectionName are required');
  }
  const branch = await prisma.branch.findFirst({ where: { id: data.branchId, institutionId } });
  if (!branch) throw new NotFoundError(`Branch with ID '${data.branchId}' not found under this institution`);
  return { branchId: data.branchId, className: data.className, sectionName: data.sectionName };
}

export async function createAssignment(
  institutionId: string,
  requester: RequestingUser,
  data: CreateAssignmentInput,
) {
  const scope = await resolveScope(institutionId, requester, data);
  const { branchId: _b, className: _c, sectionName: _s, ...rest } = data;

  return assignmentRepository.create(institutionId, requester.sub, { ...rest, ...scope });
}

export async function updateAssignment(
  institutionId: string,
  requester: RequestingUser,
  id: string,
  data: UpdateAssignmentInput,
) {
  const existing = await assignmentRepository.findById(institutionId, id);
  if (!existing) throw new NotFoundError(`Assignment with ID '${id}' not found`);

  // Only the person who created it may edit it — no admin override, since
  // Admin has read-only access to Classwork by design.
  if (existing.createdByUserId !== requester.sub) {
    throw new ForbiddenError('You can only edit assignments you created');
  }

  let scope: { branchId?: string; className?: string; sectionName?: string } = {};
  if (data.branchId || data.className || data.sectionName) {
    scope = await resolveScope(institutionId, requester, {
      branchId: data.branchId ?? (requester.role === UserRole.TEACHER ? existing.branchId : undefined),
      className: data.className ?? (requester.role === UserRole.TEACHER ? existing.className : undefined),
      sectionName: data.sectionName ?? (requester.role === UserRole.TEACHER ? existing.sectionName : undefined),
    });
  }

  const { branchId: _b, className: _c, sectionName: _s, ...rest } = data;

  return assignmentRepository.update(institutionId, id, { ...rest, ...scope });
}

export async function deleteAssignment(institutionId: string, requester: RequestingUser, id: string) {
  const existing = await assignmentRepository.findById(institutionId, id);
  if (!existing) throw new NotFoundError(`Assignment with ID '${id}' not found`);

  if (existing.createdByUserId !== requester.sub) {
    throw new ForbiddenError('You can only delete assignments you created');
  }

  await assignmentRepository.remove(institutionId, id);
}

export async function getAssignment(institutionId: string, id: string) {
  const assignment = await assignmentRepository.findById(institutionId, id);
  if (!assignment) throw new NotFoundError(`Assignment with ID '${id}' not found`);
  return assignment;
}

// Institution/Admin browse — read-only by design.
export async function listAssignments(institutionId: string, query: AssignmentQueryDtoType) {
  return assignmentRepository.findAll(institutionId, query);
}

// Self-service for STUDENT/GUARDIAN — never trust a client-supplied
// class/section; resolve the caller's (or their linked child's) own
// class/section server-side, mirroring lecture.service.ts.
export async function getMyAssignments(
  institutionId: string,
  requester: RequestingUser,
  query: { page?: number; pageSize?: number; subject?: string; studentId?: string } = {},
) {
  const { page, pageSize, subject } = query;

  if (requester.role === UserRole.STUDENT) {
    return assignmentRepository.findAll(institutionId, {
      page: page ?? 1,
      pageSize: pageSize ?? 20,
      subject,
      studentUserId: requester.sub,
    } as any);
  }

  if (requester.role === UserRole.GUARDIAN) {
    const linkedStudentIds = await guardianRepository.findLinkedStudentIdsByUserId(institutionId, requester.sub);
    if (!query.studentId || !linkedStudentIds.includes(query.studentId)) {
      return { assignments: [], total: 0 };
    }
    const student = await studentRepository.findById(institutionId, query.studentId);
    if (!student?.class?.name || !student?.section?.name) {
      return { assignments: [], total: 0 };
    }
    return assignmentRepository.findAll(institutionId, {
      page: page ?? 1,
      pageSize: pageSize ?? 20,
      subject,
      className: student.class.name,
      sectionName: student.section.name,
    } as any);
  }

  return { assignments: [], total: 0 };
}
