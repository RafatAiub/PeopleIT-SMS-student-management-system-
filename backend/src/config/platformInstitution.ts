import { prisma } from './prisma';

// Notification, NotificationDelivery, NotificationTemplate and
// NotificationPreference all require a real institutionId FK, but a Lead is
// captured before any institution exists. Rather than loosen those
// (tenant-scoped) tables to nullable, LEAD_SUBMITTED notifications are
// anchored to one designated, non-tenant Institution row seeded by
// backend/scripts/seed-platform-institution.ts. It is excluded from every
// Super Admin institution list/metric query in institution.repository.ts —
// see PLATFORM_INSTITUTION_SLUG usage there — so it never appears as a real
// tenant in the dashboard.
export const PLATFORM_INSTITUTION_SLUG = 'platform-internal';

let cachedId: string | null = null;

export async function getPlatformInstitutionId(): Promise<string> {
  if (cachedId) return cachedId;

  const institution = await prisma.institution.findUnique({
    where: { slug: PLATFORM_INSTITUTION_SLUG },
    select: { id: true },
  });

  if (!institution) {
    throw new Error(
      `Platform institution (slug '${PLATFORM_INSTITUTION_SLUG}') not found. ` +
        'Run: npx ts-node backend/scripts/seed-platform-institution.ts',
    );
  }

  cachedId = institution.id;
  return cachedId;
}
