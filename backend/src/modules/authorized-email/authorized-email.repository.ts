import { prisma } from '../../config/prisma';

export async function findByEmail(email: string) {
  return prisma.authorizedEmail.findUnique({ where: { email } });
}

export async function findById(id: string) {
  return prisma.authorizedEmail.findUnique({ where: { id } });
}

export async function create(email: string, note: string | undefined, addedByUserId: string) {
  return prisma.authorizedEmail.create({
    data: { email, note: note || null, addedByUserId },
  });
}

export async function list() {
  return prisma.authorizedEmail.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      addedBy: { select: { firstName: true, lastName: true, email: true } },
    },
  });
}

export async function remove(id: string) {
  return prisma.authorizedEmail.delete({ where: { id } });
}
