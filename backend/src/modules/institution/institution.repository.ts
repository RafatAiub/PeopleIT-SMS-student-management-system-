import { prisma } from '../../config/prisma';
import type { UpdateWebsiteConfigDtoType } from './institution.dto';

export async function findById(id: string) {
  return prisma.institution.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      slug: true,
      logoUrl: true,
      phone: true,
      email: true,
      address: true,
      isActive: true,
      themeColor: true,
      heroTitle: true,
      heroSubtitle: true,
      aboutText: true,
      contactEmail: true,
      contactPhone: true,
    },
  });
}

export async function updateWebsiteConfig(id: string, data: UpdateWebsiteConfigDtoType) {
  // Clean undefined keys to keep existing database values
  const updateData: Record<string, any> = {};
  for (const [key, value] of Object.entries(data)) {
    if (value !== undefined) {
      updateData[key] = value;
    }
  }

  return prisma.institution.update({
    where: { id },
    data: updateData,
    select: {
      id: true,
      name: true,
      slug: true,
      logoUrl: true,
      phone: true,
      email: true,
      address: true,
      isActive: true,
      themeColor: true,
      heroTitle: true,
      heroSubtitle: true,
      aboutText: true,
      contactEmail: true,
      contactPhone: true,
    },
  });
}

export async function listAll() {
  return prisma.institution.findMany({
    select: {
      id: true,
      name: true,
      slug: true,
      isActive: true,
      createdAt: true,
      users: {
        where: { role: 'ADMIN' },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          phone: true,
          isActive: true,
        },
      },
      _count: {
        select: {
          users: true,
          students: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });
}

export async function listPublic() {
  return prisma.institution.findMany({
    where: { isActive: true },
    select: {
      name: true,
      slug: true,
    },
    orderBy: { name: 'asc' },
  });
}
