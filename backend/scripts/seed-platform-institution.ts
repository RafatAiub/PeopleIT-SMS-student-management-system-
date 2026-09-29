import { prisma } from '../src/config/prisma';
import { PLATFORM_INSTITUTION_SLUG } from '../src/config/platformInstitution';

// One-time seed for the internal, non-tenant Institution row that
// LEAD_SUBMITTED notifications are anchored to (Notification/NotificationDelivery/
// NotificationTemplate/NotificationPreference all require a real institutionId FK,
// but a Lead is captured before any real institution exists). Excluded from every
// Super Admin institution list/metric query — see institution.repository.ts.
// Idempotent: safe to run more than once.
async function seedPlatformInstitution() {
  try {
    const existing = await prisma.institution.findUnique({
      where: { slug: PLATFORM_INSTITUTION_SLUG },
    });

    if (existing) {
      console.log(`✅ Platform institution already exists (id: ${existing.id})`);
      process.exit(0);
    }

    const created = await prisma.institution.create({
      data: {
        name: 'Platform (Internal)',
        slug: PLATFORM_INSTITUTION_SLUG,
        isActive: true,
      },
    });

    console.log(`✅ Created platform institution (id: ${created.id}, slug: ${created.slug})`);
    process.exit(0);
  } catch (error) {
    console.error('❌ Failed to seed platform institution:', error);
    process.exit(1);
  }
}

seedPlatformInstitution();
