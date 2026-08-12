import { prisma } from '../../config/prisma';
import type { SubmitApplicationDtoType } from './institution-application.dto';

export async function create(data: SubmitApplicationDtoType) {
  return prisma.institutionApplication.create({ data });
}

export async function findPendingBySlug(slug: string) {
  return prisma.institutionApplication.findFirst({
    where: { slug, status: 'PENDING' },
  });
}

export async function findById(id: string) {
  return prisma.institutionApplication.findUnique({ where: { id } });
}

export async function list(status?: string) {
  return prisma.institutionApplication.findMany({
    where: status ? { status: status as any } : undefined,
    orderBy: { createdAt: 'desc' },
    include: {
      reviewedBy: { select: { firstName: true, lastName: true, email: true } },
    },
  });
}

export async function markApproved(id: string, actorUserId: string, createdInstitutionId: string) {
  return prisma.institutionApplication.update({
    where: { id },
    data: {
      status: 'APPROVED',
      reviewedByUserId: actorUserId,
      reviewedAt: new Date(),
      createdInstitutionId,
    },
  });
}

export async function markRejected(id: string, actorUserId: string, reason: string) {
  return prisma.institutionApplication.update({
    where: { id },
    data: {
      status: 'REJECTED',
      reviewedByUserId: actorUserId,
      reviewedAt: new Date(),
      rejectionReason: reason,
    },
  });
}
