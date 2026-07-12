import { prisma } from '../../config/prisma';
import { UserRole } from '@prisma/client';

const userSelect = {
  id: true,
  email: true,
  role: true,
  firstName: true,
  lastName: true,
  phone: true,
  avatarUrl: true,
  isActive: true,
  lastLoginAt: true,
  createdAt: true,
  studentProfile: {
    select: {
      id: true,
      rollNumber: true,
      admissionDate: true,
      dateOfBirth: true,
      gender: true,
      bloodGroup: true,
      religion: true,
      nationality: true,
      address: true,
    }
  },
  teacherProfile: {
    select: {
      id: true,
      qualification: true,
      subjectExpertise: true,
      joiningDate: true,
    }
  }
} as const;

export class UserRepository {
  static async createUser(tenantId: string | undefined, data: {
    email: string;
    passwordHash: string;
    role: UserRole;
    firstName: string;
    lastName: string;
    phone?: string;
  }) {
    return prisma.user.create({
      data: {
        ...data,
        institutionId: tenantId || null,
      },
      select: userSelect,
    });
  }

  static async getUserById(tenantId: string | undefined, id: string) {
    const where: any = { id };
    if (tenantId) where.institutionId = tenantId;
    
    return prisma.user.findFirst({
      where,
      select: {
        ...userSelect,
        passwordHash: true, // needed internally for password check
      },
    });
  }

  static async getUserByEmail(email: string) {
    return prisma.user.findUnique({
      where: { email },
    });
  }

  static async listUsers(
    tenantId: string | undefined,
    filters: {
      role?: UserRole;
      page: number;
      pageSize: number;
    }
  ) {
    const where: any = {};
    if (tenantId) where.institutionId = tenantId;
    if (filters.role) where.role = filters.role;

    const [total, users] = await prisma.$transaction([
      prisma.user.count({ where }),
      prisma.user.findMany({
        where,
        select: userSelect,
        orderBy: { createdAt: 'desc' },
        skip: (filters.page - 1) * filters.pageSize,
        take: filters.pageSize,
      }),
    ]);

    return { total, users };
  }

  static async updateUser(tenantId: string | undefined, id: string, data: {
    firstName?: string;
    lastName?: string;
    phone?: string;
    avatarUrl?: string;
    isActive?: boolean;
    role?: UserRole;
  }) {
    const where: any = { id };
    if (tenantId) where.institutionId = tenantId;

    return prisma.user.update({
      where: where as any,
      data,
      select: userSelect,
    });
  }

  static async updatePasswordHash(tenantId: string | undefined, id: string, passwordHash: string) {
    const where: any = { id };
    if (tenantId) where.institutionId = tenantId;

    return prisma.user.update({
      where: where as any,
      data: { passwordHash },
      select: { id: true },
    });
  }

  static async deleteUser(tenantId: string | undefined, id: string) {
    const where: any = { id };
    if (tenantId) where.institutionId = tenantId;

    return prisma.user.delete({
      where: where as any,
      select: { id: true },
    });
  }
}
