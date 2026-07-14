import { PrismaClient, UserRole } from '@prisma/client';
import { faker } from '@faker-js/faker';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const institutions = await prisma.institution.findMany();
  if (institutions.length === 0) {
    console.log('No institutions found. Create one first.');
    return;
  }

  const passwordHash = await bcrypt.hash('admin123', 10);

  for (const inst of institutions) {
    console.log(`Seeding demo data for institution: ${inst.name} (${inst.id})`);

    // 1. Ensure a Branch
    let branch = await prisma.branch.findFirst({ where: { institutionId: inst.id } });
    if (!branch) {
      branch = await prisma.branch.create({
        data: { institutionId: inst.id, name: 'Main Campus', address: faker.location.streetAddress() }
      });
    }

    // 2. Ensure Academic Year
    let acYear = await prisma.academicYear.findFirst({ where: { institutionId: inst.id } });
    if (!acYear) {
      acYear = await prisma.academicYear.create({
        data: {
          institutionId: inst.id,
          label: '2025',
          startDate: new Date('2025-01-01'),
          endDate: new Date('2025-12-31'),
          isCurrent: true
        }
      });
    }

    // 3. Create Classes & Sections
    const classNames = ['Class 1', 'Class 2', 'Class 3', 'Class 4', 'Class 5', 'Class 6', 'Class 7', 'Class 8'];
    const sectionNames = ['A', 'B', 'C'];
    const classes = [];
    const sections = [];
    
    for (let i = 0; i < classNames.length; i++) {
      let cls = await prisma.class.findFirst({ where: { branchId: branch.id, name: classNames[i] } });
      if (!cls) {
        cls = await prisma.class.create({ data: { branchId: branch.id, name: classNames[i], level: i + 1 } });
      }
      classes.push(cls);
      
      for (const sName of sectionNames) {
        let sec = await prisma.section.findFirst({ where: { classId: cls.id, name: sName } });
        if (!sec) {
          sec = await prisma.section.create({ data: { classId: cls.id, name: sName } });
        }
        sections.push(sec);
      }
    }

    // 4. Create Teachers
    const teachers = [];
    for (let i = 0; i < 15; i++) {
      const email = faker.internet.email();
      const user = await prisma.user.create({
        data: {
          institutionId: inst.id,
          firstName: faker.person.firstName(),
          lastName: faker.person.lastName(),
          email,
          passwordHash,
          plainPassword: 'admin123',
          role: UserRole.TEACHER,
          phone: faker.phone.number(),
          avatarUrl: faker.image.avatar(),
        }
      });
      const teacher = await prisma.teacher.create({
        data: {
          userId: user.id,
          employeeId: `TCH-${faker.number.int({ min: 1000, max: 9999 })}`,
          qualification: 'M.Sc, B.Ed',
          subjectExpertise: faker.helpers.arrayElement(['Math', 'Science', 'English', 'History', 'Physics']),
          joiningDate: faker.date.past({ years: 5 }),
        }
      });
      teachers.push(teacher);
    }

    // 5. Create Students & Guardians
    console.log('Seeding 50 students...');
    for (let i = 0; i < 50; i++) {
      const gEmail = faker.internet.email();
      const gUser = await prisma.user.create({
        data: {
          institutionId: inst.id,
          firstName: faker.person.firstName(),
          lastName: faker.person.lastName(),
          email: gEmail,
          passwordHash,
          plainPassword: 'admin123',
          role: UserRole.GUARDIAN,
          phone: faker.phone.number(),
          avatarUrl: faker.image.avatar(),
        }
      });
      const guardian = await prisma.guardian.create({
        data: {
          institutionId: inst.id,
          userId: gUser.id,
          firstName: gUser.firstName,
          lastName: gUser.lastName,
          email: gEmail,
          phone: gUser.phone!,
          relationship: faker.helpers.arrayElement(['FATHER', 'MOTHER']),
          occupation: faker.person.jobTitle(),
        }
      });

      const sEmail = faker.internet.email();
      const sUser = await prisma.user.create({
        data: {
          institutionId: inst.id,
          firstName: faker.person.firstName(),
          lastName: faker.person.lastName(),
          email: sEmail,
          passwordHash,
          plainPassword: 'admin123',
          role: UserRole.STUDENT,
          phone: faker.phone.number(),
          avatarUrl: faker.image.avatar(),
        }
      });
      
      const randomClass = faker.helpers.arrayElement(classes);
      const randomSection = faker.helpers.arrayElement(sections.filter(s => s.classId === randomClass.id));

      const student = await prisma.student.create({
        data: {
          institutionId: inst.id,
          branchId: branch.id,
          academicYearId: acYear.id,
          classId: randomClass.id,
          sectionId: randomSection.id,
          userId: sUser.id,
          firstName: sUser.firstName,
          lastName: sUser.lastName,
          studentId: `STU-${faker.number.int({ min: 10000, max: 99999 })}`,
          rollNumber: `${faker.number.int({ min: 1, max: 60 })}`,
          gender: faker.helpers.arrayElement(['Male', 'Female']),
          dateOfBirth: faker.date.birthdate({ min: 5, max: 15, mode: 'age' }),
          bloodGroup: faker.helpers.arrayElement(['A+', 'B+', 'O+', 'AB+', 'A-', 'B-', 'O-', 'AB-']),
          address: faker.location.streetAddress(),
          email: sEmail,
          phone: sUser.phone,
          avatarUrl: sUser.avatarUrl,
        }
      });

      await prisma.guardianStudent.create({
        data: {
          guardianId: guardian.id,
          studentId: student.id,
          isPrimary: true,
          relationship: guardian.relationship,
        }
      });
    }

    // 6. Create Library Books
    console.log('Seeding library books...');
    for (let i = 0; i < 20; i++) {
      await prisma.libraryBook.create({
        data: {
          institutionId: inst.id,
          title: faker.music.songName() + ' - ' + faker.word.words(2),
          author: faker.person.fullName(),
          isbn: faker.commerce.isbn(),
          publisher: faker.company.name(),
          totalCopies: faker.number.int({ min: 5, max: 20 }),
          availableCopies: faker.number.int({ min: 1, max: 5 }),
        }
      });
    }

    // 7. Transport Vehicles & Routes
    console.log('Seeding transport...');
    for (let i = 0; i < 5; i++) {
      await prisma.transportVehicle.create({
        data: {
          institutionId: inst.id,
          registrationNumber: `BUS-${faker.number.int({ min: 1000, max: 9999 })}`,
          capacity: faker.number.int({ min: 30, max: 60 }),
          driverName: faker.person.fullName(),
          driverPhone: faker.phone.number(),
        }
      });
    }
    for (let i = 0; i < 3; i++) {
      await prisma.transportRoute.create({
        data: {
          institutionId: inst.id,
          name: `Route ${faker.location.city()}`,
          stops: `${faker.location.street()}, ${faker.location.street()}`,
          routeFare: faker.number.int({ min: 500, max: 2000 }),
        }
      });
    }

    // 8. Fee Categories & Invoices
    console.log('Seeding invoices...');
    const feeCat = await prisma.feeCategory.create({
      data: {
        institutionId: inst.id,
        name: 'Monthly Tuition Fee',
        amount: 2500,
        frequency: 'MONTHLY'
      }
    });

    const allStudents = await prisma.student.findMany({ where: { institutionId: inst.id } });
    for (let i = 0; i < Math.min(allStudents.length, 30); i++) {
      const student = allStudents[i];
      const inv = await prisma.invoice.create({
        data: {
          institutionId: inst.id,
          studentId: student.id,
          invoiceNo: `INV-${faker.string.alphanumeric(6).toUpperCase()}`,
          totalAmount: 2500,
          dueAmount: faker.helpers.arrayElement([0, 2500]),
          paidAmount: faker.helpers.arrayElement([0, 2500]),
          dueDate: faker.date.future(),
          status: faker.helpers.arrayElement(['PAID', 'UNPAID', 'OVERDUE']),
        }
      });
      await prisma.invoiceItem.create({
        data: {
          invoiceId: inv.id,
          feeCategoryId: feeCat.id,
          description: 'Tuition Fee - Current Month',
          amount: 2500,
          discount: 0,
          netAmount: 2500,
        }
      });
    }

    // 9. Notices
    console.log('Seeding notices...');
    for (let i = 0; i < 10; i++) {
      await prisma.notice.create({
        data: {
          institutionId: inst.id,
          title: faker.company.catchPhrase(),
          content: faker.lorem.paragraphs(2),
          audience: faker.helpers.arrayElement(['ALL', 'TEACHERS', 'STUDENTS', 'GUARDIANS']),
        }
      });
    }

    console.log(`Finished seeding institution: ${inst.name}`);
  }
}

main().catch(e => {
  console.error(e);
  process.exit(1);
}).finally(async () => {
  await prisma.$disconnect();
});
