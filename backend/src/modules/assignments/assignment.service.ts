import * as assignmentRepository from './assignment.repository';
import * as studentRepository from '../students/student.repository';
import * as guardianRepository from '../guardians/guardian.repository';
import { prisma } from '../../config/prisma';
import { NotFoundError, ForbiddenError, BadRequestError, ConflictError } from '../../utils/AppError';
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

// A TEACHER is assigning a task and must give a due date; a STUDENT is
// submitting their own work and never has one — forced to null regardless
// of what's sent, mirroring resolveScope's "never trust client input" rule.
function resolveDueDate(
  requester: RequestingUser,
  dueDate: CreateAssignmentInput['dueDate'],
): Date | null {
  if (requester.role === UserRole.STUDENT) return null;

  if (dueDate === undefined || dueDate === null) {
    throw new BadRequestError('Due date is required');
  }
  return new Date(dueDate);
}

// A Student's submission must answer a specific Teacher-created assignment;
// a Teacher's assignment is always top-level. Validates the parent exists,
// is itself top-level (no submitting to a submission), belongs to the
// student's own resolved class/section, and that the student hasn't already
// submitted to it (one submission per student per assignment — resubmitting
// means editing the existing row via updateAssignment instead).
async function resolveParentAssignment(
  institutionId: string,
  requester: RequestingUser,
  parentAssignmentId: string | null | undefined,
  scope: { className: string; sectionName: string },
): Promise<string | null> {
  if (requester.role === UserRole.TEACHER) {
    if (parentAssignmentId) {
      throw new BadRequestError('A Teacher assignment cannot be a submission to another assignment');
    }
    return null;
  }

  // STUDENT
  if (!parentAssignmentId) {
    throw new BadRequestError('parentAssignmentId is required — a submission must answer a specific assignment');
  }
  const parent = await assignmentRepository.findById(institutionId, parentAssignmentId);
  if (!parent) throw new NotFoundError(`Assignment with ID '${parentAssignmentId}' not found`);
  if (parent.parentAssignmentId) {
    throw new BadRequestError('Cannot submit to a submission — parentAssignmentId must reference a Teacher assignment');
  }
  if (parent.className !== scope.className || parent.sectionName !== scope.sectionName) {
    throw new ForbiddenError('This assignment is not for your class');
  }
  const existing = await assignmentRepository.findSubmission(institutionId, parentAssignmentId, requester.sub);
  if (existing) {
    throw new ConflictError('You have already submitted this assignment — edit your existing submission instead');
  }
  return parentAssignmentId;
}

export async function createAssignment(
  institutionId: string,
  requester: RequestingUser,
  data: CreateAssignmentInput,
) {
  const scope = await resolveScope(institutionId, requester, data);
  const dueDate = resolveDueDate(requester, data.dueDate);
  const parentAssignmentId = await resolveParentAssignment(institutionId, requester, data.parentAssignmentId, scope);
  const { branchId: _b, className: _c, sectionName: _s, dueDate: _d, parentAssignmentId: _p, ...rest } = data;

  return assignmentRepository.create(institutionId, requester.sub, { ...rest, ...scope, dueDate, parentAssignmentId });
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

  // A Student's assignment never has a due date, regardless of payload; a
  // Teacher's is only touched if they actually supplied one in this update.
  let dueDateUpdate: { dueDate?: Date | null } = {};
  if (requester.role === UserRole.STUDENT) {
    dueDateUpdate = { dueDate: null };
  } else if (data.dueDate !== undefined) {
    dueDateUpdate = { dueDate: data.dueDate === null ? null : new Date(data.dueDate) };
  }

  // parentAssignmentId is immutable after creation — never move a
  // submission to answer a different assignment.
  const { branchId: _b, className: _c, sectionName: _s, dueDate: _d, parentAssignmentId: _p, ...rest } = data;

  return assignmentRepository.update(institutionId, id, { ...rest, ...scope, ...dueDateUpdate });
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

// Attaches "mySubmission" (or null) onto each top-level assignment for the
// given author (the Student themselves, or a Guardian's linked child) — one
// extra query for the whole batch rather than N+1 per assignment.
async function withSubmissionStatus(institutionId: string, assignments: any[], authorUserId: string) {
  const submissions = await assignmentRepository.findSubmissionsByAuthor(
    institutionId,
    assignments.map((a) => a.id),
    authorUserId,
  );
  const byParentId = new Map(submissions.map((s) => [s.parentAssignmentId as string, s]));
  return assignments.map((a) => ({ ...a, mySubmission: byParentId.get(a.id) ?? null }));
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
    const { assignments, total } = await assignmentRepository.findAll(institutionId, {
      page: page ?? 1,
      pageSize: pageSize ?? 20,
      subject,
      studentUserId: requester.sub,
    } as any);
    return { assignments: await withSubmissionStatus(institutionId, assignments, requester.sub), total };
  }

  if (requester.role === UserRole.GUARDIAN) {
    const linkedStudentIds = await guardianRepository.findLinkedStudentIdsByUserId(institutionId, requester.sub);
    if (!query.studentId || !linkedStudentIds.includes(query.studentId)) {
      return { assignments: [], total: 0 };
    }
    const student = await prisma.student.findFirst({
      where: { id: query.studentId, institutionId },
      select: { userId: true, class: { select: { name: true } }, section: { select: { name: true } } },
    });
    if (!student?.class?.name || !student?.section?.name) {
      return { assignments: [], total: 0 };
    }
    const { assignments, total } = await assignmentRepository.findAll(institutionId, {
      page: page ?? 1,
      pageSize: pageSize ?? 20,
      subject,
      className: student.class.name,
      sectionName: student.section.name,
    } as any);
    if (!student.userId) {
      return { assignments: assignments.map((a) => ({ ...a, mySubmission: null })), total };
    }
    return { assignments: await withSubmissionStatus(institutionId, assignments, student.userId), total };
  }

  return { assignments: [], total: 0 };
}
