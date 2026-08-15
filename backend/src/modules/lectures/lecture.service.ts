import * as lectureRepository from './lecture.repository';
import * as studentRepository from '../students/student.repository';
import * as guardianRepository from '../guardians/guardian.repository';
import { prisma } from '../../config/prisma';
import { NotFoundError, ForbiddenError, BadRequestError } from '../../utils/AppError';
import { UserRole } from '@prisma/client';
import type {
  CreateLectureMaterialInput,
  UpdateLectureMaterialInput,
  LectureMaterialQueryDtoType,
} from './lecture.dto';

export type RequestingUser = { sub: string; role: string };

// Resolves where a new/updated material is scoped: a TEACHER explicitly
// picks the class/section/branch they're posting to, but a STUDENT's own
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

export async function createMaterial(
  institutionId: string,
  requester: RequestingUser,
  data: CreateLectureMaterialInput,
) {
  const scope = await resolveScope(institutionId, requester, data);
  const { branchId: _b, className: _c, sectionName: _s, ...rest } = data;

  return lectureRepository.create(institutionId, requester.sub, { ...rest, ...scope });
}

export async function updateMaterial(
  institutionId: string,
  requester: RequestingUser,
  id: string,
  data: UpdateLectureMaterialInput,
) {
  const existing = await lectureRepository.findById(institutionId, id);
  if (!existing) throw new NotFoundError(`Lecture material with ID '${id}' not found`);

  // Only the person who uploaded it may edit it — no admin override, since
  // Admin has read-only access to this module by design.
  if (existing.uploadedByUserId !== requester.sub) {
    throw new ForbiddenError('You can only edit lecture materials you uploaded');
  }

  let scope: { branchId?: string; className?: string; sectionName?: string } = {};
  if (data.branchId || data.className || data.sectionName) {
    // A STUDENT can never move a material to a different class/section (it's
    // always re-resolved to their own); a TEACHER may only if they supply a
    // complete new scope, validated the same way as on create.
    scope = await resolveScope(institutionId, requester, {
      branchId: data.branchId ?? (requester.role === UserRole.TEACHER ? existing.branchId : undefined),
      className: data.className ?? (requester.role === UserRole.TEACHER ? existing.className : undefined),
      sectionName: data.sectionName ?? (requester.role === UserRole.TEACHER ? existing.sectionName : undefined),
    });
  }

  const { branchId: _b, className: _c, sectionName: _s, ...rest } = data;

  return lectureRepository.update(institutionId, id, { ...rest, ...scope });
}

export async function deleteMaterial(institutionId: string, requester: RequestingUser, id: string) {
  const existing = await lectureRepository.findById(institutionId, id);
  if (!existing) throw new NotFoundError(`Lecture material with ID '${id}' not found`);

  if (existing.uploadedByUserId !== requester.sub) {
    throw new ForbiddenError('You can only delete lecture materials you uploaded');
  }

  await lectureRepository.remove(institutionId, id);
}

export async function getMaterial(institutionId: string, id: string) {
  const material = await lectureRepository.findById(institutionId, id);
  if (!material) throw new NotFoundError(`Lecture material with ID '${id}' not found`);
  return material;
}

// Institution/Admin browse — read-only by design (no create/update/delete
// route is reachable by ADMIN; see lecture.routes.ts).
export async function listMaterials(institutionId: string, query: LectureMaterialQueryDtoType) {
  return lectureRepository.findAll(institutionId, query);
}

// Self-service for STUDENT/GUARDIAN — never trust a client-supplied
// class/section; resolve the caller's (or their linked child's) own
// class/section server-side, mirroring library.getMyIssues.
export async function getMyMaterials(
  institutionId: string,
  requester: RequestingUser,
  query: { page?: number; pageSize?: number; subject?: string; studentId?: string } = {},
) {
  const { page, pageSize, subject } = query;

  if (requester.role === UserRole.STUDENT) {
    return lectureRepository.findAll(institutionId, {
      page: page ?? 1,
      pageSize: pageSize ?? 20,
      subject,
      studentUserId: requester.sub,
    } as any);
  }

  if (requester.role === UserRole.GUARDIAN) {
    const linkedStudentIds = await guardianRepository.findLinkedStudentIdsByUserId(institutionId, requester.sub);
    if (!query.studentId || !linkedStudentIds.includes(query.studentId)) {
      return { materials: [], total: 0 };
    }
    const student = await studentRepository.findById(institutionId, query.studentId);
    if (!student?.class?.name || !student?.section?.name) {
      return { materials: [], total: 0 };
    }
    return lectureRepository.findAll(institutionId, {
      page: page ?? 1,
      pageSize: pageSize ?? 20,
      subject,
      className: student.class.name,
      sectionName: student.section.name,
    } as any);
  }

  return { materials: [], total: 0 };
}
