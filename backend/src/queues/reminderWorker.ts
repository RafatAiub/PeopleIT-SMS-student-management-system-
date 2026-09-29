import { Worker, Job } from 'bullmq';
import { logger } from '../utils/logger';
import { prisma } from '../config/prisma';
import { createBullWorkerConnection } from '../config/redis';
import { notifySafe } from '../modules/notifications/notifications.service';

interface FeeDueJobData {
  type: 'fee-due';
  institutionId: string;
  studentId: string;
  invoiceNo: string;
  dueAmount: string | number;
  dueDate: string;
}

interface AbsenceJobData {
  type: 'absence';
  institutionId: string;
  studentId: string;
  date: string;
}

type ReminderJobData = FeeDueJobData | AbsenceJobData;

/** Resolves the best contact phone and user ID for a student: primary guardian first, then the student's own phone. */
async function resolveContactAndUser(institutionId: string, studentId: string): Promise<{
  phone: string | null;
  recipientName: string;
  studentName: string;
  studentUserId: string | null;
}> {
  const student = await prisma.student.findFirst({
    where: { id: studentId, institutionId },
    select: {
      firstName: true,
      lastName: true,
      phone: true,
      userId: true,
      guardians: {
        select: { guardian: { select: { phone: true, firstName: true, lastName: true } }, isPrimary: true },
        orderBy: { isPrimary: 'desc' },
      },
    },
  });
  if (!student) return { phone: null, recipientName: '', studentName: '', studentUserId: null };

  const studentName = `${student.firstName} ${student.lastName}`;
  const primaryGuardian = student.guardians[0]?.guardian;
  if (primaryGuardian?.phone) {
    return {
      phone: primaryGuardian.phone,
      recipientName: `${primaryGuardian.firstName} ${primaryGuardian.lastName}`,
      studentName,
      studentUserId: student.userId,
    };
  }
  return {
    phone: student.phone,
    recipientName: `${student.firstName} ${student.lastName}`,
    studentName,
    studentUserId: student.userId,
  };
}

// Worker processing fee-due and absence reminder notifications.
// Sends reminders via the notification service, which handles SMS + any other
// enabled channels (IN_APP, EMAIL). The SMS will be queued and delivered by
// the notificationWorker.
export const feeReminderWorker = new Worker(
  'feeReminders',
  async (job: Job<ReminderJobData>) => {
    logger.info(`Processing reminder job ${job.id}`, { data: job.data });
    const { institutionId, studentId } = job.data;

    const { studentUserId, studentName } = await resolveContactAndUser(institutionId, studentId);

    if (job.data.type === 'fee-due') {
      const { invoiceNo, dueAmount, dueDate } = job.data;
      if (!studentUserId) {
        logger.warn('Fee reminder skipped: student has no user account', { studentId });
        return;
      }
      notifySafe({
        institutionId,
        type: 'FEE_REMINDER',
        recipientUserIds: [studentUserId],
        contextId: invoiceNo,
        channels: ['SMS'],
        data: { link: '/fees' },
        vars: {
          invoiceNo,
          studentName,
          amount: String(dueAmount),
          dueDate: new Date(dueDate).toDateString(),
        },
      });
    } else {
      if (!studentUserId) {
        logger.warn('Absence alert skipped: student has no user account', { studentId });
        return;
      }
      notifySafe({
        institutionId,
        type: 'ABSENCE_ALERT',
        recipientUserIds: [studentUserId],
        contextId: `${studentId}:${job.data.date}`,
        channels: ['SMS'],
        data: { link: '/attendance' },
        vars: {
          studentName,
          date: new Date(job.data.date).toDateString(),
        },
      });
    }
  },
  { connection: createBullWorkerConnection('feeReminders') },
);

feeReminderWorker.on('completed', (job) => {
  logger.info(`Job ${job.id} completed successfully`);
});

feeReminderWorker.on('failed', (job, err) => {
  logger.error(`Job ${job?.id} failed`, { error: err.message });
});
