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

export async function createInstitution(data: any, actorUserId: string) {
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

  // Super-admin actions run before the tenant/audit middleware chain (there is
  // no tenant yet at request time), so log explicitly here instead.
  await prisma.auditLog
    .create({
      data: {
        institutionId: result.institution.id,
        userId: actorUserId,
        action: 'CREATE',
        resource: 'Institution',
        resourceId: result.institution.id,
        metadata: { slug: result.institution.slug, adminEmail: result.admin.email },
      },
    })
    .catch((err: Error) => {
      logger.error('Failed to write audit log for institution creation', {
        error: err.message,
        institutionId: result.institution.id,
      });
    });

  return result;
}

export async function updateInstitutionAdmin(institutionId: string, data: any, actorUserId: string) {
  const { prisma } = require('../../config/prisma');
  const bcrypt = require('bcryptjs');
  const { NotFoundError } = require('../../utils/AppError');

  const admin = await prisma.user.findFirst({
    where: { institutionId, role: 'ADMIN' },
  });

  if (!admin) {
    throw new NotFoundError('Administrator for this institution was not found');
  }

  if (data.institutionName && data.institutionName.trim() !== '') {
    await prisma.institution.update({
      where: { id: institutionId },
      data: { name: data.institutionName }
    });
  }

  const updateData: any = {
    email: data.adminEmail,
    firstName: data.adminFirstName,
    lastName: data.adminLastName,
    phone: data.phone && data.phone.trim() !== '' ? data.phone : null,
  };

  if (data.adminPassword && data.adminPassword.trim() !== '') {
    const rounds = 12;
    updateData.passwordHash = await bcrypt.hash(data.adminPassword, rounds);
  }

  const updatedAdmin = await prisma.user.update({
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

  // Super-admin actions run before the tenant/audit middleware chain, so log
  // explicitly here. Never record the new password in metadata.
  await prisma.auditLog
    .create({
      data: {
        institutionId,
        userId: actorUserId,
        action: 'UPDATE',
        resource: 'InstitutionAdmin',
        resourceId: admin.id,
        metadata: {
          institutionNameChanged: Boolean(data.institutionName && data.institutionName.trim() !== ''),
          passwordChanged: Boolean(data.adminPassword && data.adminPassword.trim() !== ''),
          adminEmail: updatedAdmin.email,
        },
      },
    })
    .catch((err: Error) => {
      logger.error('Failed to write audit log for admin credential update', {
        error: err.message,
        institutionId,
        adminId: admin.id,
      });
    });

  return updatedAdmin;
}

export async function listPublicInstitutions() {
  return institutionRepository.listPublic();
}

export async function deleteInstitution(institutionId: string, actorUserId: string) {
  const { prisma } = require('../../config/prisma');

  const institution = await prisma.institution.findUnique({ where: { id: institutionId } });
  if (!institution) {
    throw new NotFoundError(`Institution with ID '${institutionId}' not found`);
  }

  // Institution has no cascading deletes configured in the schema, so every
  // dependent row across ~25 tables must be removed in dependency order
  // (children before parents) inside one transaction before the institution
  // itself can be deleted.
  await prisma.$transaction(async (tx: any) => {
    const students = await tx.student.findMany({ where: { institutionId }, select: { id: true } });
    const studentIds = students.map((s: any) => s.id);
    const invoices = await tx.invoice.findMany({ where: { institutionId }, select: { id: true } });
    const invoiceIds = invoices.map((i: any) => i.id);
    const guardians = await tx.guardian.findMany({ where: { institutionId }, select: { id: true } });
    const guardianIds = guardians.map((g: any) => g.id);
    const users = await tx.user.findMany({ where: { institutionId }, select: { id: true } });
    const userIds = users.map((u: any) => u.id);
    const branches = await tx.branch.findMany({ where: { institutionId }, select: { id: true } });
    const branchIds = branches.map((b: any) => b.id);
    const classes = await tx.class.findMany({ where: { branchId: { in: branchIds } }, select: { id: true } });
    const classIds = classes.map((c: any) => c.id);

    await tx.payment.deleteMany({ where: { invoiceId: { in: invoiceIds } } });
    await tx.invoiceItem.deleteMany({ where: { invoiceId: { in: invoiceIds } } });
    await tx.invoice.deleteMany({ where: { institutionId } });
    await tx.feeCategory.deleteMany({ where: { institutionId } });
    await tx.studentDocument.deleteMany({ where: { institutionId } });
    await tx.guardianStudent.deleteMany({ where: { guardianId: { in: guardianIds } } });
    await tx.libraryIssue.deleteMany({ where: { institutionId } });
    await tx.transportAssignment.deleteMany({ where: { institutionId } });
    await tx.attendance.deleteMany({ where: { institutionId } });
    await tx.examResult.deleteMany({ where: { institutionId } });
    await tx.exam.deleteMany({ where: { institutionId } });
    await tx.timetableSlot.deleteMany({ where: { institutionId } });
    await tx.notice.deleteMany({ where: { institutionId } });
    await tx.libraryBook.deleteMany({ where: { institutionId } });
    await tx.transportVehicle.deleteMany({ where: { institutionId } });
    await tx.transportRoute.deleteMany({ where: { institutionId } });
    await tx.payrollRecord.deleteMany({ where: { institutionId } });
    await tx.staffProfile.deleteMany({ where: { institutionId } });
    await tx.message.deleteMany({ where: { institutionId } });
    await tx.auditLog.deleteMany({ where: { institutionId } });
    await tx.refreshToken.deleteMany({ where: { userId: { in: userIds } } });
    await tx.guardian.deleteMany({ where: { institutionId } });
    // Section.classTeacherId references Teacher — clear it before deleting Teachers.
    await tx.section.updateMany({ where: { classId: { in: classIds } }, data: { classTeacherId: null } });
    await tx.teacher.deleteMany({ where: { userId: { in: userIds } } });
    await tx.student.deleteMany({ where: { institutionId } });
    await tx.permission.deleteMany({ where: { institutionId } });
    await tx.section.deleteMany({ where: { classId: { in: classIds } } });
    await tx.class.deleteMany({ where: { branchId: { in: branchIds } } });
    await tx.branch.deleteMany({ where: { institutionId } });
    await tx.user.deleteMany({ where: { institutionId } });
    await tx.academicYear.deleteMany({ where: { institutionId } });
    await tx.institution.delete({ where: { id: institutionId } });

    void studentIds;
  });

  logger.warn('Institution permanently deleted', {
    institutionId,
    slug: institution.slug,
    name: institution.name,
    actorUserId,
  });
}

