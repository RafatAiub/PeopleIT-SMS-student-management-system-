const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('Searching for users with role STUDENT that have no Student profile...');
  
  const studentUsers = await prisma.user.findMany({
    where: {
      role: 'STUDENT',
      studentProfile: null
    }
  });

  console.log(`Found ${studentUsers.length} student users without a profile.`);

  for (const user of studentUsers) {
    try {
      await prisma.student.create({
        data: {
          institutionId: user.institutionId,
          userId: user.id,
          studentId: `STU-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          phone: user.phone,
        }
      });
      console.log(`✅ Created Student profile for user: ${user.email} (${user.firstName} ${user.lastName})`);
    } catch (err) {
      console.error(`❌ Failed to create profile for user ${user.email}:`, err.message);
    }
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
