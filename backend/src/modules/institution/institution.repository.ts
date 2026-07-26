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

export async function listPaginated(params: {
  page?: number;
  pageSize?: number;
  q?: string;
  status?: string;
  hideTest?: boolean;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}) {
  const page = Math.max(1, Number(params.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(params.pageSize) || 10));
  const skip = (page - 1) * pageSize;
  const q = params.q?.trim();
  const status = params.status;
  const hideTest = params.hideTest ?? true;
  const sortBy = params.sortBy || 'createdAt';
  const sortOrder = params.sortOrder === 'asc' ? 'asc' : 'desc';

  const whereConditions: any[] = [];

  if (status === 'ACTIVE') {
    whereConditions.push({ isActive: true });
  } else if (status === 'SUSPENDED') {
    whereConditions.push({ isActive: false });
  }

  if (hideTest) {
    whereConditions.push({
      AND: [
        { name: { not: { contains: 'demo' } } },
        { name: { not: { contains: 'test' } } },
        { slug: { not: { contains: 'demo' } } },
        { slug: { not: { contains: 'test' } } },
      ],
    });
  }

  if (q) {
    whereConditions.push({
      OR: [
        { name: { contains: q } },
        { slug: { contains: q } },
        {
          users: {
            some: {
              OR: [
                { email: { contains: q } },
                { firstName: { contains: q } },
                { lastName: { contains: q } },
              ],
            },
          },
        },
      ],
    });
  }

  const where = whereConditions.length > 0 ? { AND: whereConditions } : {};

  const [total, data] = await Promise.all([
    prisma.institution.count({ where }),
    prisma.institution.findMany({
      where,
      skip,
      take: pageSize,
      orderBy: { [sortBy]: sortOrder },
      select: {
        id: true,
        name: true,
        slug: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        users: {
          where: { role: 'ADMIN' },
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            phone: true,
            isActive: true,
            lastLoginAt: true,
          },
        },
        _count: {
          select: {
            users: true,
            students: true,
            branches: true,
            invoices: true,
          },
        },
      },
    }),
  ]);

  return {
    data,
    meta: {
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    },
  };
}

export async function getGlobalMetrics() {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const [
    totalInstitutions,
    activeInstitutions,
    suspendedInstitutions,
    totalUsers,
    totalStudents,
    recentRegistrations,
    recentAuditLogs,
  ] = await Promise.all([
    prisma.institution.count(),
    prisma.institution.count({ where: { isActive: true } }),
    prisma.institution.count({ where: { isActive: false } }),
    prisma.user.count(),
    prisma.student.count(),
    prisma.institution.count({ where: { createdAt: { gte: thirtyDaysAgo } } }),
    prisma.auditLog.findMany({
      take: 10,
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { firstName: true, lastName: true, email: true, role: true } },
        institution: { select: { name: true, slug: true } },
      },
    }),
  ]);

  // Check system alerts: suspended institutions, high failed logins, etc.
  const systemAlerts: any[] = [];
  if (suspendedInstitutions > 0) {
    systemAlerts.push({
      type: 'WARNING',
      message: `${suspendedInstitutions} institution(s) currently suspended.`,
    });
  }

  return {
    totalInstitutions,
    activeInstitutions,
    suspendedInstitutions,
    totalUsers,
    totalStudents,
    recentRegistrations,
    recentAuditLogs,
    systemAlerts,
  };
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

