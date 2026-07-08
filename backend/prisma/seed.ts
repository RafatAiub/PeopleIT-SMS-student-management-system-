import { PrismaClient, UserRole } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // 1. Create Institution
  const institution = await prisma.institution.upsert({
    where: { slug: '102030' },
    update: {},
    create: {
      id: 'inst-1',
      name: 'Dhaka City School',
      slug: '102030',
      address: 'Mirpur-10, Dhaka',
      phone: '01711-234567',
      email: 'info@dhakacityschool.edu.bd',
    },
  });
  console.log(`Created institution: ${institution.name}`);

  // 2. Create default Super Admin user (global, not tied to any institution)
  const passwordHash = await bcrypt.hash('admin123', 12);
  const admin = await prisma.user.upsert({
    where: { email: 'admin@peopleit.com' },
    update: {
      institutionId: null,
      role: UserRole.SUPER_ADMIN,
    },
    create: {
      id: 'admin-1',
      institutionId: null,
      email: 'admin@peopleit.com',
      passwordHash,
      role: UserRole.SUPER_ADMIN,
      firstName: 'System',
      lastName: 'Admin',
    },
  });
  console.log(`Created super admin user: ${admin.email}`);

  // Create default sub-institute Admin user (tied to dhaka-city-school)
  const schoolAdmin = await prisma.user.upsert({
    where: { email: 'schooladmin@peopleit.com' },
    update: {
      institutionId: institution.id,
      role: UserRole.ADMIN,
      plainPassword: 'admin123',
    },
    create: {
      id: 'schooladmin-1',
      institutionId: institution.id,
      email: 'schooladmin@peopleit.com',
      passwordHash,
      plainPassword: 'admin123',
      role: UserRole.ADMIN,
      firstName: 'School',
      lastName: 'Admin',
    },
  });
  console.log(`Created school admin user: ${schoolAdmin.email}`);

  // Create default Teacher user
  const teacherUser = await prisma.user.upsert({
    where: { email: 'teacher@peopleit.com' },
    update: {
      institutionId: institution.id,
      role: UserRole.TEACHER,
    },
    create: {
      id: 'teacher-1',
      institutionId: institution.id,
      email: 'teacher@peopleit.com',
      passwordHash,
      role: UserRole.TEACHER,
      firstName: 'Demo',
      lastName: 'Teacher',
    },
  });
  console.log(`Created teacher user: ${teacherUser.email}`);

  // Ensure Teacher profile exists
  await prisma.teacher.upsert({
    where: { userId: teacherUser.id },
    update: {},
    create: {
      userId: teacherUser.id,
      qualification: 'BSc in Education',
      subjectExpertise: 'Mathematics',
    },
  });

  // Create default Student user
  const studentUser = await prisma.user.upsert({
    where: { email: 'student@peopleit.com' },
    update: {
      institutionId: institution.id,
      role: UserRole.STUDENT,
    },
    create: {
      id: 'student-1',
      institutionId: institution.id,
      email: 'student@peopleit.com',
      passwordHash,
      role: UserRole.STUDENT,
      firstName: 'Demo',
      lastName: 'Student',
    },
  });
  console.log(`Created student user: ${studentUser.email}`);

  // 3. Create default Branch
  const branch = await prisma.branch.upsert({
    where: { id: 'clbranch00000000000000000' },
    update: {},
    create: {
      id: 'clbranch00000000000000000',
      institutionId: institution.id,
      name: 'Main Branch',
      address: 'Mirpur-10, Dhaka',
    },
  });
  console.log(`Created branch: ${branch.name}`);

  // 4. Create Academic Year
  const academicYear = await prisma.academicYear.upsert({
    where: { id: 'clacadem00000000000000000' },
    update: {},
    create: {
      id: 'clacadem00000000000000000',
      institutionId: institution.id,
      label: '2026',
      startDate: new Date('2026-01-01'),
      endDate: new Date('2026-12-31'),
      isCurrent: true,
    },
  });
  console.log(`Created academic year: ${academicYear.label}`);

  // 5. Seed Classes and Sections
  const classesToSeed = [
    'KG', 'Nursery', 'Junior One', 
    'Class 1', 'Class 2', 'Class 3', 'Class 4', 'Class 5', 
    'Class 6', 'Class 7', 'Class 8', 'Class 9', 'Class 10'
  ];
  const sectionsToSeed = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];

  for (let i = 0; i < classesToSeed.length; i++) {
    const clsName = classesToSeed[i];
    const clsId = `seed-class-${clsName.toLowerCase().replace(/\s+/g, '-')}`;
    const cls = await prisma.class.upsert({
      where: { id: clsId },
      update: {},
      create: {
        id: clsId,
        branchId: branch.id,
        name: clsName,
        level: i + 1,
      },
    });

    for (const secName of sectionsToSeed) {
      const secId = `seed-sec-${clsId}-${secName.toLowerCase()}`;
      await prisma.section.upsert({
        where: { id: secId },
        update: {},
        create: {
          id: secId,
          classId: cls.id,
          name: secName,
        },
      });
    }
  }
  console.log('Seeded KG, Nursery, Junior One, Classes 1-10, and Sections A-G');

  // Ensure Student profile exists (assign to Class 8, Section A)
  const class8Id = `seed-class-class-8`;
  const sectionAId = `seed-sec-${class8Id}-a`;
  await prisma.student.upsert({
    where: { userId: 'student-1' },
    update: {},
    create: {
      userId: 'student-1',
      institutionId: institution.id,
      branchId: branch.id,
      classId: class8Id,
      sectionId: sectionAId,
      academicYearId: academicYear.id,
      studentId: 'STU-DEMO-001',
      firstName: 'Demo',
      lastName: 'Student',
      email: 'student@peopleit.com',
    },
  });

  console.log('Seeding completed successfully!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
