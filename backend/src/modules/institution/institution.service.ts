import * as institutionRepository from './institution.repository';
import { NotFoundError } from '../../utils/AppError';
import { logger } from '../../utils/logger';
import type { UpdateWebsiteConfigDtoType } from './institution.dto';

export async function listInstitutions() {
  return institutionRepository.listAll();
}

export async function getWebsiteConfig(institutionId: string) {
  const institution = await institutionRepository.findById(institutionId);
  if (!institution) {
    throw new NotFoundError(`Institution with ID '${institutionId}' not found`);
  }
  return institution;
}

export async function updateWebsiteConfig(
  institutionId: string,
  data: UpdateWebsiteConfigDtoType,
) {
  const existing = await institutionRepository.findById(institutionId);
  if (!existing) {
    throw new NotFoundError(`Institution with ID '${institutionId}' not found`);
  }

  const updated = await institutionRepository.updateWebsiteConfig(institutionId, data);
  logger.info('Institution website config updated', { institutionId });
  return updated;
}

export async function createInstitution(data: any) {
  const { prisma } = require('../../config/prisma');
  const bcrypt = require('bcryptjs');
  const { ConflictError } = require('../../utils/AppError');
  const { UserRole } = require('@prisma/client');

  // 1. Check uniqueness of slug (EIIN)
  const existingInst = await prisma.institution.findUnique({
    where: { slug: data.slug },
  });
  if (existingInst) {
    throw new ConflictError(`Institution Code / EIIN '${data.slug}' is already registered`);
  }

  // 2. Check uniqueness of admin email
  const existingUser = await prisma.user.findUnique({
    where: { email: data.adminEmail },
  });
  if (existingUser) {
    throw new ConflictError(`Admin email '${data.adminEmail}' is already in use`);
  }

  // 3. Create institution and default branch + admin user in transaction
  const rounds = 12;
  const passwordHash = await bcrypt.hash(data.adminPassword, rounds);

  const result = await prisma.$transaction(async (tx: any) => {
    const institution = await tx.institution.create({
      data: {
        name: data.name,
        slug: data.slug,
      },
    });

    const branch = await tx.branch.create({
      data: {
        institutionId: institution.id,
        name: 'Main Branch',
      },
    });

    const user = await tx.user.create({
      data: {
        institutionId: institution.id,
        email: data.adminEmail,
        passwordHash,
        plainPassword: data.adminPassword,
        role: UserRole.ADMIN,
        firstName: data.adminFirstName,
        lastName: data.adminLastName,
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        createdAt: true,
      },
    });

    return { institution, branch, admin: user };
  });

  logger.info('New institution registered successfully', {
    institutionId: result.institution.id,
    slug: result.institution.slug,
  });

  return result;
}

export async function updateInstitutionAdmin(institutionId: string, data: any) {
  const { prisma } = require('../../config/prisma');
  const bcrypt = require('bcryptjs');
  const { NotFoundError } = require('../../utils/AppError');

  const admin = await prisma.user.findFirst({
    where: { institutionId, role: 'ADMIN' },
  });

  if (!admin) {
    throw new NotFoundError('Administrator for this institution was not found');
  }

  const updateData: any = {
    email: data.adminEmail,
    firstName: data.adminFirstName,
    lastName: data.adminLastName,
    phone: data.phone,
  };

  if (data.adminPassword && data.adminPassword.trim() !== '') {
    const rounds = 12;
    updateData.passwordHash = await bcrypt.hash(data.adminPassword, rounds);
    updateData.plainPassword = data.adminPassword;
  }

  return prisma.user.update({
    where: { id: admin.id },
    data: updateData,
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      phone: true,
    },
  });
}

export async function listPublicInstitutions() {
  return institutionRepository.listPublic();
}

