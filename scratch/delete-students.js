const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const studentIds = [
    'STU-TEST-1783269824821',
    'STU-TEST-1783269639402',
    'STU-TEST-1783269554131',
    'STU-TEST-1783269488470',
    'STU-TEST-1783269468893',
    'ST-2026-001'
  ];

  console.log(`Starting manual deletion of students: ${studentIds.join(', ')}`);

  for (const studentId of studentIds) {
    try {
      const student = await prisma.student.findFirst({
        where: { studentId }
      });

      if (student) {
        // Cascade delete all relationships safely
        await prisma.attendance.deleteMany({
          where: { studentId: student.id }
        });

        await prisma.examResult.deleteMany({
          where: { studentId: student.id }
        });

        // Delete Invoice Items first due to FK constraints
        await prisma.invoiceItem.deleteMany({
          where: { invoice: { studentId: student.id } }
        });

        // Delete Payments first
        await prisma.payment.deleteMany({
          where: { invoice: { studentId: student.id } }
        });

        await prisma.invoice.deleteMany({
          where: { studentId: student.id }
        });

        await prisma.studentDocument.deleteMany({
          where: { studentId: student.id }
        });

        await prisma.guardianStudent.deleteMany({
          where: { studentId: student.id }
        });

        await prisma.libraryIssue.deleteMany({
          where: { studentId: student.id }
        });

        await prisma.transportAssignment.deleteMany({
          where: { studentId: student.id }
        });

        await prisma.student.delete({
          where: { id: student.id }
        });

        console.log(`✅ Deleted student: ${studentId} (${student.firstName} ${student.lastName})`);
      } else {
        console.log(`ℹ️ Student not found: ${studentId}`);
      }
    } catch (err) {
      console.error(`❌ Failed to delete student ${studentId}:`, err.message);
    }
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
