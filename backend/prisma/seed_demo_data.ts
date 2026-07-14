import { PrismaClient, UserRole } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('Starting optimized database seeding...');
  const passwordHash = await bcrypt.hash('admin123', 12);

  // Find all institutions in the DB
  const institutions = await prisma.institution.findMany();
  console.log(`Found ${institutions.length} institutions in database.`);

  for (const inst of institutions) {
    console.log(`Seeding data for institution: ${inst.name} (Slug: ${inst.slug})`);

    // --- CLEANUP STEP ---
    // Delete all existing related data for this institution to ensure a clean slate and avoid duplicate keys
    await prisma.timetableSlot.deleteMany({ where: { institutionId: inst.id } });
    await prisma.examResult.deleteMany({ where: { institutionId: inst.id } });
    await prisma.exam.deleteMany({ where: { institutionId: inst.id } });
    await prisma.payment.deleteMany({ where: { invoice: { institutionId: inst.id } } });
    await prisma.invoiceItem.deleteMany({ where: { invoice: { institutionId: inst.id } } });
    await prisma.invoice.deleteMany({ where: { institutionId: inst.id } });
    await prisma.libraryIssue.deleteMany({ where: { institutionId: inst.id } });
    await prisma.libraryBook.deleteMany({ where: { institutionId: inst.id } });
    await prisma.transportAssignment.deleteMany({ where: { institutionId: inst.id } });
    await prisma.transportRoute.deleteMany({ where: { institutionId: inst.id } });
    await prisma.transportVehicle.deleteMany({ where: { institutionId: inst.id } });
    await prisma.notice.deleteMany({ where: { institutionId: inst.id } });
    await prisma.guardianStudent.deleteMany({ where: { student: { institutionId: inst.id } } });
    await prisma.studentDocument.deleteMany({ where: { institutionId: inst.id } });
    await prisma.student.deleteMany({ where: { institutionId: inst.id } });
    await prisma.guardian.deleteMany({ where: { institutionId: inst.id } });
    await prisma.teacher.deleteMany({ where: { user: { institutionId: inst.id } } });
    
    // Delete users except the root admin users
    await prisma.user.deleteMany({
      where: {
        institutionId: inst.id,
        role: { not: UserRole.ADMIN }
      }
    });

    // Delete sections, classes, academic years, branches
    await prisma.section.deleteMany({ where: { class: { branch: { institutionId: inst.id } } } });
    await prisma.class.deleteMany({ where: { branch: { institutionId: inst.id } } });
    await prisma.academicYear.deleteMany({ where: { institutionId: inst.id } });
    await prisma.branch.deleteMany({ where: { institutionId: inst.id } });

    // --- RECREATE BASIC ANCHORS ---
    const branch = await prisma.branch.create({
      data: {
        id: `branch-${inst.slug}`,
        institutionId: inst.id,
        name: 'Main Campus',
        address: inst.address || 'Dhaka, Bangladesh',
      },
    });

    const academicYear = await prisma.academicYear.create({
      data: {
        id: `ay-${inst.slug}`,
        institutionId: inst.id,
        label: '2026',
        startDate: new Date('2026-01-01'),
        endDate: new Date('2026-12-31'),
        isCurrent: true,
      },
    });

    // --- BATCH SEED CLASSES & SECTIONS ---
    const classesToSeed = [
      'KG', 'Nursery', 'Junior One', 
      'Class 1', 'Class 2', 'Class 3', 'Class 4', 'Class 5', 
      'Class 6', 'Class 7', 'Class 8', 'Class 9', 'Class 10'
    ];
    const sectionsToSeed = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];

    const classData = classesToSeed.map((name, i) => ({
      id: `class-${inst.slug}-${name.toLowerCase().replace(/\s+/g, '-')}`,
      branchId: branch.id,
      name,
      level: i + 1,
    }));
    await prisma.class.createMany({ data: classData });

    const sectionData: any[] = [];
    for (const cls of classData) {
      for (const secName of sectionsToSeed) {
        sectionData.push({
          id: `sec-${cls.id}-${secName.toLowerCase()}`,
          classId: cls.id,
          name: secName,
        });
      }
    }
    await prisma.section.createMany({ data: sectionData });

    // --- BATCH SEED USERS ---
    const usersData: any[] = [];

    // Teachers
    const teacherNames = [
      { first: 'Abdur', last: 'Rahman', subject: 'Mathematics', qual: 'MSc in Mathematics' },
      { first: 'Farhana', last: 'Yasmin', subject: 'English', qual: 'MA in English Literature' },
      { first: 'Kamrul', last: 'Hasan', subject: 'Science', qual: 'BSc in Chemistry' },
      { first: 'Sultana', last: 'Razia', subject: 'Bangla', qual: 'MA in Bangla Language' },
      { first: 'Ziaur', last: 'Rahman', subject: 'History', qual: 'MA in History' }
    ];
    teacherNames.forEach((t, i) => {
      usersData.push({
        id: `user-teacher-${i + 1}-${inst.slug}`,
        institutionId: inst.id,
        email: `teacher${i + 1}.${inst.slug}@peopleit.com`,
        passwordHash,
        plainPassword: 'admin123',
        role: UserRole.TEACHER,
        firstName: t.first,
        lastName: t.last,
      });
    });

    // Guardians
    const guardianNames = [
      { first: 'Mizanur', last: 'Rahman', relation: 'FATHER', phone: '01711000001' },
      { first: 'Jahanara', last: 'Begum', relation: 'MOTHER', phone: '01711000002' },
      { first: 'Tofazzal', last: 'Hossain', relation: 'FATHER', phone: '01711000003' },
      { first: 'Anowara', last: 'Khatun', relation: 'MOTHER', phone: '01711000004' },
      { first: 'Rafiqul', last: 'Islam', relation: 'FATHER', phone: '01711000005' },
      { first: 'Selina', last: 'Akter', relation: 'MOTHER', phone: '01711000006' }
    ];
    guardianNames.forEach((g, i) => {
      usersData.push({
        id: `user-guardian-${i + 1}-${inst.slug}`,
        institutionId: inst.id,
        email: `guardian${i + 1}.${inst.slug}@peopleit.com`,
        passwordHash,
        plainPassword: 'admin123',
        role: UserRole.GUARDIAN,
        firstName: g.first,
        lastName: g.last,
        phone: g.phone,
      });
    });

    // Students
    const studentNames = [
      { first: 'Samiul', last: 'Islam', class: 'Class 8', secIdx: 0, roll: '101', birth: '2012-05-15', gender: 'Male', blood: 'O+' },
      { first: 'Ayesha', last: 'Siddiqua', class: 'Class 8', secIdx: 0, roll: '102', birth: '2012-08-20', gender: 'Female', blood: 'A+' },
      { first: 'Tanvir', last: 'Ahmed', class: 'Class 8', secIdx: 0, roll: '103', birth: '2012-02-10', gender: 'Male', blood: 'B+' },
      { first: 'Sadia', last: 'Rahman', class: 'Class 8', secIdx: 1, roll: '104', birth: '2012-11-05', gender: 'Female', blood: 'AB+' },
      { first: 'Fahim', last: 'Muntasir', class: 'Class 8', secIdx: 1, roll: '105', birth: '2012-04-12', gender: 'Male', blood: 'O-' },
      { first: 'Nusrat', last: 'Jahan', class: 'Class 8', secIdx: 1, roll: '106', birth: '2012-09-18', gender: 'Female', blood: 'A-' },
      { first: 'Mushfiqur', last: 'Rahman', class: 'Class 9', secIdx: 0, roll: '201', birth: '2011-06-25', gender: 'Male', blood: 'O+' },
      { first: 'Sumaiya', last: 'Akter', class: 'Class 9', secIdx: 0, roll: '202', birth: '2011-03-14', gender: 'Female', blood: 'B+' },
      { first: 'Taskin', last: 'Ahmed', class: 'Class 9', secIdx: 0, roll: '203', birth: '2011-09-30', gender: 'Male', blood: 'A+' },
      { first: 'Meher', last: 'Nigar', class: 'Class 9', secIdx: 1, roll: '204', birth: '2011-12-01', gender: 'Female', blood: 'AB+' },
      { first: 'Imran', last: 'Hasan', class: 'Class 9', secIdx: 1, roll: '205', birth: '2011-01-19', gender: 'Male', blood: 'O+' },
      { first: 'Farzana', last: 'Rimi', class: 'Class 9', secIdx: 1, roll: '206', birth: '2011-07-08', gender: 'Female', blood: 'B-' }
    ];
    studentNames.forEach((s, i) => {
      usersData.push({
        id: `user-student-${i + 1}-${inst.slug}`,
        institutionId: inst.id,
        email: `student${i + 1}.${inst.slug}@peopleit.com`,
        passwordHash,
        plainPassword: 'admin123',
        role: UserRole.STUDENT,
        firstName: s.first,
        lastName: s.last,
      });
    });

    await prisma.user.createMany({ data: usersData });

    // --- BATCH SEED PROFILES ---
    // Teachers
    const teachersProfileData = teacherNames.map((t, i) => ({
      id: `teacher-profile-${i + 1}-${inst.slug}`,
      userId: `user-teacher-${i + 1}-${inst.slug}`,
      qualification: t.qual,
      subjectExpertise: t.subject,
    }));
    await prisma.teacher.createMany({ data: teachersProfileData });

    // Class teachers mapping
    await prisma.section.update({
      where: { id: `sec-class-${inst.slug}-class-8-a` },
      data: { classTeacherId: `teacher-profile-1-${inst.slug}` }
    });
    await prisma.section.update({
      where: { id: `sec-class-${inst.slug}-class-8-b` },
      data: { classTeacherId: `teacher-profile-2-${inst.slug}` }
    });
    await prisma.section.update({
      where: { id: `sec-class-${inst.slug}-class-9-a` },
      data: { classTeacherId: `teacher-profile-3-${inst.slug}` }
    });

    // Guardians
    const guardiansProfileData = guardianNames.map((g, i) => ({
      id: `guardian-profile-${i + 1}-${inst.slug}`,
      institutionId: inst.id,
      userId: `user-guardian-${i + 1}-${inst.slug}`,
      firstName: g.first,
      lastName: g.last,
      phone: g.phone,
      email: `guardian${i + 1}.${inst.slug}@peopleit.com`,
      relationship: g.relation,
      occupation: 'Private Service',
    }));
    await prisma.guardian.createMany({ data: guardiansProfileData });

    // Students
    const studentsProfileData = studentNames.map((s, i) => {
      const clsId = `class-${inst.slug}-${s.class.toLowerCase().replace(/\s+/g, '-')}`;
      const secName = s.secIdx === 0 ? 'a' : 'b';
      const sectionId = `sec-${clsId}-${secName}`;

      return {
        id: `student-profile-${i + 1}-${inst.slug}`,
        institutionId: inst.id,
        branchId: branch.id,
        classId: clsId,
        sectionId,
        academicYearId: academicYear.id,
        userId: `user-student-${i + 1}-${inst.slug}`,
        studentId: `REG-2026-${inst.slug}-${String(100 + i + 1)}`,
        rollNumber: s.roll,
        firstName: s.first,
        lastName: s.last,
        dateOfBirth: new Date(s.birth),
        gender: s.gender,
        bloodGroup: s.blood,
        email: `student${i + 1}.${inst.slug}@peopleit.com`,
        address: 'Dhaka City, Bangladesh',
        admissionDate: new Date('2026-01-05'),
      };
    });
    await prisma.student.createMany({ data: studentsProfileData });

    // Link Guardian Student relations
    const gsData: any[] = [];
    for (let i = 0; i < studentNames.length; i++) {
      const guardianIdx = Math.floor(i / 2);
      gsData.push({
        guardianId: `guardian-profile-${guardianIdx + 1}-${inst.slug}`,
        studentId: `student-profile-${i + 1}-${inst.slug}`,
        isPrimary: i % 2 === 0,
        relationship: guardianNames[guardianIdx].relation,
      });
    }
    await prisma.guardianStudent.createMany({ data: gsData });

    // --- BATCH SEED BUSINESS DATA ---
    // Notices
    const noticesData = [
      { institutionId: inst.id, title: 'Parent-Teacher Conference', content: 'There will be a mandatory parent-teacher meeting this Friday at 10 AM to discuss results.', audience: 'GUARDIANS' },
      { institutionId: inst.id, title: 'Summer Vacation Announcement', content: 'The institution will remain closed from June 10th to June 25th for summer holidays.', audience: 'ALL' },
      { institutionId: inst.id, title: 'Academic Schedule Updates', content: 'Mid-term exams syllabus has been published. All students check results board.', audience: 'STUDENTS' }
    ];
    await prisma.notice.createMany({ data: noticesData });

    // Transport Routes & Vehicles
    const route = await prisma.transportRoute.create({
      data: {
        id: `route-${inst.slug}`,
        institutionId: inst.id,
        name: 'Route Alpha (North Line)',
        stops: 'Mirpur, Kazipara, Shewrapara, Farmgate',
        routeFare: 1500.00,
        isActive: true,
      }
    });

    const vehicle = await prisma.transportVehicle.create({
      data: {
        id: `vehicle-${inst.slug}`,
        institutionId: inst.id,
        registrationNumber: `DHAKA-METRO-KA-${1000 + Math.floor(Math.random() * 9000)}`,
        capacity: 40,
        driverName: 'Abul Mia',
        driverPhone: '01712000099',
        isActive: true,
      }
    });

    // Transport assignments
    const taData = [0, 1, 2].map((idx) => ({
      id: `ta-${idx}-${inst.slug}`,
      institutionId: inst.id,
      studentId: `student-profile-${idx + 1}-${inst.slug}`,
      routeId: route.id,
      vehicleId: vehicle.id,
      pickupPoint: 'Mirpur-10 Circle',
    }));
    await prisma.transportAssignment.createMany({ data: taData });

    // Library Books & Issues
    const books = [
      { id: `book-1-${inst.slug}`, institutionId: inst.id, title: 'Introduction to Physics', author: 'Dr. John Miller', isbn: '978-0131495463', totalCopies: 5, availableCopies: 4 },
      { id: `book-2-${inst.slug}`, institutionId: inst.id, title: 'Calculus I: Theory and Practice', author: 'Prof. Alice Green', isbn: '978-0073383187', totalCopies: 3, availableCopies: 2 },
      { id: `book-3-${inst.slug}`, institutionId: inst.id, title: 'World History and Civilizations', author: 'William Davis', isbn: '978-0131926639', totalCopies: 4, availableCopies: 3 }
    ];
    await prisma.libraryBook.createMany({ data: books });

    const issues = books.map((b, i) => ({
      institutionId: inst.id,
      bookId: b.id,
      studentId: `student-profile-${i + 1}-${inst.slug}`,
      dueDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
      status: 'ISSUED',
    }));
    await prisma.libraryIssue.createMany({ data: issues });

    // Fee Categories
    const tFeeCat = await prisma.feeCategory.create({
      data: {
        id: `fee-tuition-${inst.slug}`,
        institutionId: inst.id,
        name: 'Monthly Tuition Fee',
        description: 'Monthly tuition fees for secondary school education.',
        amount: 3000.00,
        frequency: 'MONTHLY',
        isActive: true,
      }
    });

    const transportFeeCat = await prisma.feeCategory.create({
      data: {
        id: `fee-transport-${inst.slug}`,
        institutionId: inst.id,
        name: 'Transport Service Charge',
        description: 'Monthly charges for school bus route service.',
        amount: 1500.00,
        frequency: 'MONTHLY',
        isActive: true,
      }
    });

    // Invoices, InvoiceItems, Payments
    const invoicesData: any[] = [];
    const invoiceItemsData: any[] = [];
    const paymentsData: any[] = [];

    for (let i = 0; i < studentNames.length; i++) {
      const invoiceId = `inv-${i + 1}-${inst.slug}`;
      const totalAmount = i % 3 === 0 ? 4500.00 : 3000.00;
      const paidAmount = i % 3 === 0 ? 4500.00 : (i % 3 === 1 ? 1500.00 : 0.00);
      const dueAmount = totalAmount - paidAmount;
      const status = dueAmount === 0 ? 'PAID' : (paidAmount > 0 ? 'PARTIAL' : 'UNPAID');

      invoicesData.push({
        id: invoiceId,
        institutionId: inst.id,
        studentId: `student-profile-${i + 1}-${inst.slug}`,
        invoiceNo: `INV-2026-${inst.slug}-${String(1000 + i + 1)}`,
        totalAmount,
        paidAmount,
        dueAmount,
        dueDate: new Date('2026-03-10'),
        status,
        notes: 'Regular Academic Period Fees',
      });

      invoiceItemsData.push({
        id: `inv-item-tuition-${i + 1}-${inst.slug}`,
        invoiceId,
        feeCategoryId: tFeeCat.id,
        description: 'Monthly Tuition Fee - March',
        amount: 3000.00,
        discount: 0.00,
        netAmount: 3000.00,
      });

      if (totalAmount > 3000.00) {
        invoiceItemsData.push({
          id: `inv-item-transport-${i + 1}-${inst.slug}`,
          invoiceId,
          feeCategoryId: transportFeeCat.id,
          description: 'Transport Fee - March Route Bus',
          amount: 1500.00,
          discount: 0.00,
          netAmount: 1500.00,
        });
      }

      if (paidAmount > 0) {
        paymentsData.push({
          id: `pay-${i + 1}-${inst.slug}`,
          invoiceId,
          amount: paidAmount,
          method: i % 2 === 0 ? 'BKASH' : 'CASH',
          transactionRef: i % 2 === 0 ? `TRXBK${Date.now() + i}` : 'CASH-PAY',
          status: 'COMPLETED',
          recordedBy: `user-admin-${inst.slug}`,
        });
      }
    }

    await prisma.invoice.createMany({ data: invoicesData });
    await prisma.invoiceItem.createMany({ data: invoiceItemsData });
    await prisma.payment.createMany({ data: paymentsData });

    // Exams & Results
    const exam = await prisma.exam.create({
      data: {
        id: `exam-1-${inst.slug}`,
        institutionId: inst.id,
        name: 'Half Yearly Examination 2026',
        startDate: new Date('2026-06-01'),
        endDate: new Date('2026-06-15'),
        isActive: true,
      }
    });

    const subjects = ['Mathematics', 'Science', 'English', 'Bangla'];
    const examResultsData: any[] = [];

    // Store marks for Class 8 student profiles
    const c8StudentsIds = studentsProfileData.filter(s => s.classId.includes('class-8')).map(s => s.id);
    for (const sId of c8StudentsIds) {
      for (const subject of subjects) {
        const score = 60 + Math.floor(Math.random() * 36); // Random score 60 to 95
        let grade = 'B';
        if (score >= 80) grade = 'A+';
        else if (score >= 70) grade = 'A';

        examResultsData.push({
          institutionId: inst.id,
          examId: exam.id,
          studentId: sId,
          subject,
          marksObtained: score,
          maxMarks: 100.00,
          grade,
          remarks: score >= 80 ? 'Excellent performance!' : 'Satisfactory result.',
        });
      }
    }
    await prisma.examResult.createMany({ data: examResultsData });

    // Timetable Slots
    const periods = [
      { start: '09:00', end: '09:45' },
      { start: '09:45', end: '10:30' },
      { start: '11:00', end: '11:45' },
      { start: '11:45', end: '12:30' }
    ];
    const days = ['MONDAY', 'TUESDAY', 'WEDNESDAY'];
    const timetableData: any[] = [];

    for (let d = 0; d < days.length; d++) {
      const day = days[d];
      for (let p = 0; p < periods.length; p++) {
        const period = periods[p];
        const teacher = teachersProfileData[p % teachersProfileData.length];
        const subject = subjects[p % subjects.length];

        timetableData.push({
          institutionId: inst.id,
          branchId: branch.id,
          dayOfWeek: day,
          startTime: period.start,
          endTime: period.end,
          className: 'Class 8',
          sectionName: 'A',
          subject,
          teacherId: teacher.id,
        });
      }
    }
    await prisma.timetableSlot.createMany({ data: timetableData });
  }

  console.log('Optimized seeding completed successfully!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
