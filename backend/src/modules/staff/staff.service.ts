import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { env } from '../../config/env';
import { logger } from '../../utils/logger';
import { NotFoundError, ConflictError } from '../../utils/AppError';
import type {
  StaffRoleDtoType,
  ListQueryDtoType,
  CreateStaffMemberDtoType,
  UpdateStaffMemberDtoType,
} from './staff.dto';

// ── Roles ────────────────────────────────────────────────────────────────────

export async function listRoles(institutionId: string, search?: string) {
  const roles = await prisma.staffRole.findMany({
    where: {
      institutionId,
      ...(search ? { name: { contains: search, mode: 'insensitive' as const } } : {}),
    },
    select: {
      id: true,
      name: true,
      permissions: true,
      createdAt: true,
      _count: { select: { staff: { where: { status: 'ACTIVE' } } } },
    },
    orderBy: { createdAt: 'asc' },
  });
  return roles.map(({ _count, ...r }) => ({ ...r, staffCount: _count.staff }));
}

async function findRole(institutionId: string, id: string) {
  const role = await prisma.staffRole.findFirst({ where: { id, institutionId } });
  if (!role) throw new NotFoundError(`Role with ID '${id}' not found`);
  return role;
}

export async function getRole(institutionId: string, id: string) {
  return findRole(institutionId, id);
}

async function assertRoleNameFree(institutionId: string, name: string, exceptId?: string) {
  const clash = await prisma.staffRole.findFirst({
    where: { institutionId, name: { equals: name, mode: 'insensitive' }, ...(exceptId ? { NOT: { id: exceptId } } : {}) },
    select: { id: true },
  });
  if (clash) throw new ConflictError(`A role named '${name}' already exists`);
}

export async function createRole(institutionId: string, data: StaffRoleDtoType) {
  await assertRoleNameFree(institutionId, data.name);
  return prisma.staffRole.create({
    data: { institutionId, name: data.name, permissions: Array.from(new Set(data.permissions)) },
  });
}

export async function updateRole(institutionId: string, id: string, data: StaffRoleDtoType) {
  await findRole(institutionId, id);
  await assertRoleNameFree(institutionId, data.name, id);
  const role = await prisma.staffRole.update({
    where: { id },
    data: { name: data.name, permissions: Array.from(new Set(data.permissions)) },
  });
  // Keep the designation shown elsewhere (HR, ID cards) in sync with the role name.
  await prisma.staffProfile.updateMany({ where: { institutionId, staffRoleId: id }, data: { designation: data.name } });
  return role;
}

export async function deleteRole(institutionId: string, id: string) {
  await findRole(institutionId, id);
  const assigned = await prisma.staffProfile.count({ where: { institutionId, staffRoleId: id, status: 'ACTIVE' } });
  if (assigned > 0) {
    throw new ConflictError(`This role is assigned to ${assigned} staff member(s) — reassign them before deleting it`);
  }
  await prisma.$transaction([
    prisma.staffProfile.updateMany({ where: { institutionId, staffRoleId: id }, data: { staffRoleId: null } }),
    prisma.staffRole.delete({ where: { id } }),
  ]);
}

// ── Staff ────────────────────────────────────────────────────────────────────

const staffSelect = {
  id: true,
  gender: true,
  dateOfBirth: true,
  address: true,
  designation: true,
  status: true,
  staffRole: { select: { id: true, name: true } },
  user: { select: { id: true, firstName: true, lastName: true, email: true, phone: true, avatarUrl: true } },
} satisfies Prisma.StaffProfileSelect;

export async function listStaff(institutionId: string, query: ListQueryDtoType) {
  const { page, pageSize, search } = query;
  const where: Prisma.StaffProfileWhereInput = {
    institutionId,
    status: 'ACTIVE',
    staffRoleId: { not: null },
    ...(search
      ? {
          user: {
            OR: [
              { firstName: { contains: search, mode: 'insensitive' } },
              { lastName: { contains: search, mode: 'insensitive' } },
              { email: { contains: search, mode: 'insensitive' } },
              { phone: { contains: search, mode: 'insensitive' } },
            ],
          },
        }
      : {}),
  };
  const [staff, total] = await prisma.$transaction([
    prisma.staffProfile.findMany({ where, select: staffSelect, skip: (page - 1) * pageSize, take: pageSize, orderBy: { createdAt: 'desc' } }),
    prisma.staffProfile.count({ where }),
  ]);
  return { staff, total };
}

function generatePassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%';
  const bytes = crypto.randomBytes(12);
  let pwd = '';
  for (let i = 0; i < 12; i++) pwd += chars[bytes[i] % chars.length];
  return pwd;
}

/**
 * Creates the staff member's login (base role MANAGEMENT) plus their
 * StaffProfile. The password is generated server-side and returned once so
 * it never travels in the request body (and so never reaches the audit log).
 */
export async function createStaff(institutionId: string, data: CreateStaffMemberDtoType) {
  const role = await findRole(institutionId, data.staffRoleId);

  const existingUser = await prisma.user.findUnique({ where: { email: data.email } });
  if (existingUser) throw new ConflictError(`Email '${data.email}' is already in use`);

  const password = generatePassword();
  const passwordHash = await bcrypt.hash(password, env.BCRYPT_ROUNDS ?? 12);

  const staff = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        institutionId,
        email: data.email,
        passwordHash,
        role: 'MANAGEMENT',
        firstName: data.firstName,
        lastName: data.lastName,
        phone: data.phone,
        avatarUrl: data.avatarUrl || undefined,
      },
    });
    return tx.staffProfile.create({
      data: {
        institutionId,
        userId: user.id,
        employeeId: `STF-${Date.now()}`,
        designation: role.name,
        department: 'General',
        joiningDate: new Date(),
        baseSalary: 0,
        staffRoleId: role.id,
        gender: data.gender,
        dateOfBirth: data.dateOfBirth ?? undefined,
        address: data.address || undefined,
      },
      select: staffSelect,
    });
  });

  logger.info('Staff member created', { staffId: staff.id, institutionId });
  return { staff, email: data.email, password };
}

async function findStaff(institutionId: string, id: string) {
  const staff = await prisma.staffProfile.findFirst({ where: { id, institutionId, status: 'ACTIVE' }, select: { id: true, userId: true } });
  if (!staff) throw new NotFoundError(`Staff member with ID '${id}' not found`);
  return staff;
}

export async function updateStaff(institutionId: string, id: string, data: UpdateStaffMemberDtoType) {
  const staff = await findStaff(institutionId, id);
  const role = data.staffRoleId ? await findRole(institutionId, data.staffRoleId) : null;

  await prisma.$transaction([
    prisma.user.update({
      where: { id: staff.userId },
      data: {
        firstName: data.firstName,
        lastName: data.lastName,
        phone: data.phone,
        ...(data.avatarUrl !== undefined ? { avatarUrl: data.avatarUrl || null } : {}),
      },
    }),
    prisma.staffProfile.update({
      where: { id },
      data: {
        ...(role ? { staffRoleId: role.id, designation: role.name } : {}),
        gender: data.gender,
        ...(data.dateOfBirth !== undefined ? { dateOfBirth: data.dateOfBirth } : {}),
        ...(data.address !== undefined ? { address: data.address || null } : {}),
      },
    }),
  ]);

  return prisma.staffProfile.findUnique({ where: { id }, select: staffSelect });
}

/**
 * Deactivates rather than hard-deletes — the staff member may already have
 * payroll, ID card and audit history that must stay intact.
 */
export async function deleteStaff(institutionId: string, id: string) {
  const staff = await findStaff(institutionId, id);
  await prisma.$transaction([
    prisma.staffProfile.update({ where: { id }, data: { status: 'INACTIVE' } }),
    prisma.user.update({ where: { id: staff.userId }, data: { isActive: false } }),
  ]);
  logger.info('Staff member deactivated', { staffId: id, institutionId });
}
