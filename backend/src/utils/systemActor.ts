import { prisma } from '../config/prisma';
import { UserRole } from '@prisma/client';

// =============================================================================
// System Actor Resolver — AuditLog.userId is a required (non-nullable) FK in
// the schema, so background jobs / unauthenticated gateway callbacks that
// need to write an audit entry cannot pass userId: null. This resolves a
// fallback "system actor": the earliest-created SUPER_ADMIN user. If none
// exists, callers should skip the audit write (and log a warning) rather
// than crash — the state transition itself (Subscription.status,
// Institution.isActive) remains the source of truth either way.
// =============================================================================

let cachedSystemActorId: string | null | undefined;

export async function getSystemActorUserId(): Promise<string | null> {
  if (cachedSystemActorId !== undefined) {
    return cachedSystemActorId;
  }

  const admin = await prisma.user.findFirst({
    where: { role: UserRole.SUPER_ADMIN },
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  });

  cachedSystemActorId = admin?.id ?? null;
  return cachedSystemActorId;
}
