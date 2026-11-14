// P2 test fixtures: a school with one class, monthly categories and class fees.
import { Prisma, UserRole } from '@prisma/client';
import { prisma, createTestInstitution, cleanupInstitution, type InstitutionFixture } from './fixtures';
import type { FeeCtx } from '../../src/modules/fees/student-fees/studentFees.shared';

export interface P2Fixture {
  fx: InstitutionFixture;
  classId: string;
  tuitionId: string;
  transportId: string;
  admissionId: string;
  admin: FeeCtx;
  accountant: FeeCtx;
}

export async function p2Setup(label: string): Promise<P2Fixture> {
  const fx = await createTestInstitution(label);
  const institutionId = fx.institutionId;
  const branch = await prisma.branch.create({ data: { institutionId, name: 'Main' } });
  const klass = await prisma.class.create({ data: { branchId: branch.id, name: 'Class 5' } });
  const cat = (name: string, amount: number, frequency: string) =>
    prisma.feeCategory.create({ data: { institutionId, name, amount: new Prisma.Decimal(amount), frequency } });
  const tuition = await cat('Tuition', 1000, 'MONTHLY');
  const transport = await cat('Transport', 300, 'MONTHLY');
  const admission = await cat('Admission', 5000, 'ONE_TIME');
  for (const [c, amount] of [[tuition.id, 1000], [transport.id, 300], [admission.id, 5000]] as const) {
    await prisma.classFee.create({ data: { institutionId, classId: klass.id, feeCategoryId: c, amount: new Prisma.Decimal(amount) } });
  }
  await prisma.student.update({ where: { id: fx.studentId }, data: { classId: klass.id, branchId: branch.id } });
  return {
    fx,
    classId: klass.id,
    tuitionId: tuition.id,
    transportId: transport.id,
    admissionId: admission.id,
    admin: { institutionId, userId: fx.usersByRole[UserRole.ADMIN].userId, role: 'ADMIN' },
    accountant: { institutionId, userId: fx.usersByRole[UserRole.ACCOUNTANT].userId, role: 'ACCOUNTANT' },
  };
}

let seq = 0;
export async function makeStudent(p: P2Fixture, data: Partial<Prisma.StudentUncheckedCreateInput> = {}) {
  seq++;
  return prisma.student.create({
    data: { institutionId: p.fx.institutionId, studentId: `P2-${p.fx.slug}-${seq}`, firstName: `Kid${seq}`, lastName: 'Test', classId: p.classId, ...data },
  });
}

export async function makeInvoice(p: P2Fixture, studentId: string, total: number, opts: { dueDate?: Date; status?: string; categoryId?: string } = {}) {
  seq++;
  return prisma.invoice.create({
    data: {
      institutionId: p.fx.institutionId,
      studentId,
      invoiceNo: `P2-${p.fx.slug}-INV-${seq}`,
      totalAmount: new Prisma.Decimal(total),
      dueAmount: new Prisma.Decimal(total),
      dueDate: opts.dueDate ?? new Date(),
      status: opts.status ?? 'UNPAID',
      items: {
        create: [{ feeCategoryId: opts.categoryId ?? p.tuitionId, description: 'Tuition', amount: new Prisma.Decimal(total), discount: new Prisma.Decimal(0), netAmount: new Prisma.Decimal(total) }],
      },
    },
  });
}

export async function p2Cleanup(p: P2Fixture) {
  const institutionId = p.fx.institutionId;
  const steps: Array<() => Promise<unknown>> = [
    () => prisma.guardianStudent.deleteMany({ where: { student: { institutionId } } }),
    () => prisma.invoiceBatch.deleteMany({ where: { institutionId } }),
    () => prisma.studentConcession.deleteMany({ where: { institutionId } }),
    () => prisma.concession.deleteMany({ where: { institutionId } }),
    () => prisma.classFee.deleteMany({ where: { institutionId } }),
    () => prisma.feeSchedule.deleteMany({ where: { institutionId } }),
    () => prisma.feePaymentTransaction.deleteMany({ where: { institutionId } }),
    () => prisma.lateFineRule.deleteMany({ where: { institutionId } }),
    () => prisma.studentFeeSettings.deleteMany({ where: { institutionId } }),
  ];
  for (const s of steps) await s().catch(() => undefined);
  await cleanupInstitution(p.fx);
}
