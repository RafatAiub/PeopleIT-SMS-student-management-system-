import { ConflictError, NotFoundError, UnauthorizedError } from '../../utils/AppError';
import { logger } from '../../utils/logger';
import * as authorizedEmailRepository from './authorized-email.repository';
import type { AddAuthorizedEmailDtoType } from './authorized-email.dto';

/**
 * Gate for any self-service registration entry point: throws 401 if the
 * given email has not been pre-approved by a Super Admin. Callers must
 * invoke this (and let it throw) *before* creating any record tied to the
 * email, so an unauthorized attempt never leaves a row behind.
 */
export async function checkEmailAuthorized(email: string): Promise<void> {
  const normalized = email.trim().toLowerCase();
  const authorized = await authorizedEmailRepository.findByEmail(normalized);
  if (!authorized) {
    throw new UnauthorizedError(
      'This email is not authorized to register. Contact the platform administrator to request access.',
    );
  }
}

export async function addAuthorizedEmail(data: AddAuthorizedEmailDtoType, actorUserId: string) {
  const existing = await authorizedEmailRepository.findByEmail(data.email);
  if (existing) {
    throw new ConflictError(`Email '${data.email}' is already authorized`);
  }

  const created = await authorizedEmailRepository.create(data.email, data.note, actorUserId);
  logger.info('Email added to authorized allowlist', { email: data.email, actorUserId });
  return created;
}

export async function listAuthorizedEmails() {
  return authorizedEmailRepository.list();
}

export async function removeAuthorizedEmail(id: string) {
  const existing = await authorizedEmailRepository.findById(id);
  if (!existing) {
    throw new NotFoundError(`Authorized email with ID '${id}' not found`);
  }
  await authorizedEmailRepository.remove(id);
  logger.info('Email removed from authorized allowlist', { email: existing.email });
}
