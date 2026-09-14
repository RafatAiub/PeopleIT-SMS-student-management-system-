import { prisma } from '../../config/prisma';
import type { SubmitLeadDtoType, UpdateLeadDtoType } from './lead.dto';

export async function create(data: SubmitLeadDtoType) {
  return prisma.lead.create({
    data: {
      name: data.name,
      phone: data.phone,
      email: data.email || null,
      institutionName: data.institutionName || null,
      institutionType: data.institutionType || null,
      message: data.message || null,
      source: data.source || null,
    },
  });
}

export async function findById(id: string) {
  return prisma.lead.findUnique({ where: { id } });
}

export async function list(status?: string) {
  return prisma.lead.findMany({
    where: status ? { status: status as any } : undefined,
    orderBy: { createdAt: 'desc' },
    include: {
      authorizedEmail: { select: { id: true, email: true } },
    },
  });
}

export async function update(id: string, data: UpdateLeadDtoType) {
  return prisma.lead.update({
    where: { id },
    data,
  });
}
