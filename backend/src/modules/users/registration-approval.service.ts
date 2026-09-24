import { UserRole, UserStatus } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { logger } from '../../utils/logger';
import { NotFoundError, BadRequestError } from '../../utils/AppError';
import { sendAccountApprovedEmail } from '../auth/auth.mail';

// =============================================================================
// Approval queue for self-registered users
// =============================================================================
// An institution code is not a secret — it appears on letterheads and in URLs.
// So confirming an email address proves only that the address is real, not
// that the person belongs at the institution. This queue is the second gate.

export interface PendingRegistration {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  /** The role they asked for; the approver may override it. */
  requestedRole: UserRole;
  emailVerified: boolean;
  createdAt: Date;
}

export async function listPending(institutionId: string): Promise<PendingRegistration[]> {
  const rows = await prisma.user.findMany({
    where: { institutionId, status: UserStatus.PENDING_APPROVAL },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
      role: true,
      emailVerifiedAt: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'asc' },
  });

  return rows.map((r) => ({
    id: r.id,
    firstName: r.firstName,
    lastName: r.lastName,
    email: r.email,
    phone: r.phone,
    requestedRole: r.role,
    emailVerified: Boolean(r.emailVerifiedAt),
    createdAt: r.createdAt,
  }));
}

/**
 * Approve a pending registration, optionally correcting the role they asked
 * for. Scoped by institutionId so an admin at one institution can never
 * approve a stranger into another.
 */
export async function approve(
  institutionId: string,
  userId: string,
  role?: UserRole,
): Promise<{ message: string }> {
  const user = await prisma.user.findFirst({
    where: { id: userId, institutionId, status: UserStatus.PENDING_APPROVAL },
    select: {
      id: true,
      email: true,
      firstName: true,
      emailVerifiedAt: true,
      institution: { select: { name: true } },
    },
  });

  if (!user) {
    throw new NotFoundError('No pending registration found for that user.');
  }

  // Both gates must pass. Approving an unconfirmed address would let someone
  // claim an account on an email they do not control.
  if (!user.emailVerifiedAt) {
    throw new BadRequestError(
      'This person has not confirmed their email address yet. They must do that before the account can be approved.',
    );
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      status: UserStatus.ACTIVE,
      isActive: true,
      ...(role ? { role } : {}),
    },
  });

  logger.info('Registration approved', { userId: user.id, institutionId, role });

  // Non-fatal: the account is live either way, and a failed notification
  // should not roll back the approval.
  try {
    await sendAccountApprovedEmail({
      to: user.email,
      firstName: user.firstName,
      institutionName: user.institution?.name ?? 'your institution',
    });
  } catch {
    logger.warn('Approval email could not be sent', { userId: user.id });
  }

  return { message: 'Registration approved. The account can now sign in.' };
}

export async function reject(institutionId: string, userId: string): Promise<{ message: string }> {
  const user = await prisma.user.findFirst({
    where: { id: userId, institutionId, status: UserStatus.PENDING_APPROVAL },
    select: { id: true },
  });

  if (!user) {
    throw new NotFoundError('No pending registration found for that user.');
  }

  // Marked REJECTED rather than deleted: the row holds the email and phone,
  // so keeping it stops the same person re-registering in a loop, and leaves
  // an auditable record of the decision.
  await prisma.user.update({
    where: { id: user.id },
    data: { status: UserStatus.REJECTED, isActive: false },
  });

  logger.info('Registration rejected', { userId: user.id, institutionId });
  return { message: 'Registration rejected.' };
}
