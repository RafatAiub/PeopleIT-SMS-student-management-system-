import { prisma } from '../src/config/prisma';

const newEmail = 'peoplenitsolution@gmail.com';

async function updateSuperAdminEmail() {
  try {
    const superAdmin = await prisma.user.findFirst({
      where: {
        role: 'SUPER_ADMIN',
        institutionId: null,
      },
    });

    if (!superAdmin) {
      console.log('❌ No super admin found');
      process.exit(1);
    }

    console.log(`Found super admin: ${superAdmin.firstName} ${superAdmin.lastName} (${superAdmin.email})`);

    const updated = await prisma.user.update({
      where: { id: superAdmin.id },
      data: { email: newEmail },
    });

    console.log(`✅ Updated super admin email to: ${updated.email}`);
    process.exit(0);
  } catch (error) {
    console.error('❌ Failed to update super admin email:', error);
    process.exit(1);
  }
}

updateSuperAdminEmail();
