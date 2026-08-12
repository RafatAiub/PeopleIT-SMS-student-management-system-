import crypto from 'crypto';
import { prisma } from '../../config/prisma';
import { NotFoundError, ConflictError, BadRequestError } from '../../utils/AppError';
import { logger } from '../../utils/logger';
import * as applicationRepository from './institution-application.repository';
import { provisionInstitutionAndAdmin } from '../institution/institution.service';
import type { SubmitApplicationDtoType } from './institution-application.dto';

export async function submitApplication(data: SubmitApplicationDtoType) {
  const existingInstitution = await prisma.institution.findUnique({ where: { slug: data.slug } });
  if (existingInstitution) {
    throw new ConflictError(`Institution Code / EIIN '${data.slug}' is already registered`);
  }

  // TOCTOU: two concurrent submissions for the same slug can both pass this
  // check and both land as PENDING; accepted for MVP since approveApplication
  // re-validates before provisioning and only one can win there. Not adding
  // DB-level locking/unique-partial-index for this.
  const existingPending = await applicationRepository.findPendingBySlug(data.slug);
  if (existingPending) {
    throw new ConflictError(`An application for Institution Code / EIIN '${data.slug}' is already pending review`);
  }

  // Intentionally not checking applicantEmail for an existing account here —
  // doing so would let an anonymous caller enumerate which emails already
  // have accounts. Collision is checked at approval time instead, behind
  // SUPER_ADMIN auth.
  const application = await applicationRepository.create(data);
  logger.info('New institution application submitted', { applicationId: application.id, slug: application.slug });
  return application;
}

export async function listApplications(status?: string) {
  return applicationRepository.list(status);
}

export async function getApplication(id: string) {
  const application = await applicationRepository.findById(id);
  if (!application) {
    throw new NotFoundError(`Application with ID '${id}' not found`);
  }
  return application;
}

function generatePassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%';
  const bytes = crypto.randomBytes(12);
  let pwd = '';
  for (let i = 0; i < 12; i++) {
    pwd += chars[bytes[i] % chars.length];
  }
  return pwd;
}

export async function approveApplication(id: string, actorUserId: string) {
  const application = await applicationRepository.findById(id);
  if (!application) {
    throw new NotFoundError(`Application with ID '${id}' not found`);
  }
  if (application.status !== 'PENDING') {
    throw new BadRequestError(`Application has already been ${application.status.toLowerCase()}`);
  }

  const adminPassword = generatePassword();

  // TODO: provisionInstitutionAndAdmin returns/handles the admin password the
  // same way institution.service.createInstitution already did (plaintext
  // alongside the bcrypt hash for the one-time reveal) — pre-existing pattern
  // from that module, not introduced here.
  const result = await provisionInstitutionAndAdmin({
    name: application.institutionName,
    slug: application.slug,
    adminEmail: application.applicantEmail,
    adminPassword,
    adminFirstName: application.applicantFirstName,
    adminLastName: application.applicantLastName,
  });

  await applicationRepository.markApproved(id, actorUserId, result.institution.id);

  await prisma.auditLog
    .create({
      data: {
        institutionId: result.institution.id,
        userId: actorUserId,
        action: 'APPROVE',
        resource: 'InstitutionApplication',
        resourceId: id,
        metadata: { slug: result.institution.slug, adminEmail: result.admin.email },
      },
    })
    .catch((err: Error) => {
      logger.error('Failed to write audit log for application approval', {
        error: err.message,
        applicationId: id,
      });
    });

  return { institution: result.institution, admin: result.admin, adminPassword };
}

export async function rejectApplication(id: string, reason: string, actorUserId: string) {
  const application = await applicationRepository.findById(id);
  if (!application) {
    throw new NotFoundError(`Application with ID '${id}' not found`);
  }
  if (application.status !== 'PENDING') {
    throw new BadRequestError(`Application has already been ${application.status.toLowerCase()}`);
  }

  const updated = await applicationRepository.markRejected(id, actorUserId, reason);

  // AuditLog.institutionId is a required FK — a rejected application never
  // creates an Institution, so there's no tenant row to attach a DB audit
  // entry to. Structured log only, unlike the approve path.
  logger.info('Institution application rejected', {
    applicationId: id,
    slug: application.slug,
    actorUserId,
    reason,
  });

  return updated;
}
