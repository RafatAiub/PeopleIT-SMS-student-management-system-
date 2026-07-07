const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const branchId = 'clbranch00000000000000000';
  
  // Verify branch exists
  const branch = await prisma.branch.findUnique({
    where: { id: branchId }
  });

  if (!branch) {
    console.error(`❌ Branch ${branchId} does not exist. Please seed the main DB first.`);
    return;
  }

  const classesToSeed = ['Class 7', 'Class 8', 'Class 9', 'Class 10'];
  const sectionsToSeed = ['A', 'B', 'C'];

  console.log('Seeding Classes and Sections...');

  for (const className of classesToSeed) {
    // Upsert class
    let classObj = await prisma.class.findFirst({
      where: { name: className, branchId }
    });

    if (!classObj) {
      classObj = await prisma.class.create({
        data: {
          name: className,
          branchId,
          level: parseInt(className.replace(/\D/g, ''), 10) || 1
        }
      });
      console.log(`✅ Created Class: ${className}`);
    } else {
      console.log(`ℹ️ Class already exists: ${className}`);
    }

    // Seed sections for this class
    for (const sectionName of sectionsToSeed) {
      let sectionObj = await prisma.section.findFirst({
        where: { name: sectionName, classId: classObj.id }
      });

      if (!sectionObj) {
        sectionObj = await prisma.section.create({
          data: {
            name: sectionName,
            classId: classObj.id
          }
        });
        console.log(`   └─ ✅ Created Section: ${sectionName}`);
      }
    }
  }

  console.log('Class and Section seeding completed successfully!');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
