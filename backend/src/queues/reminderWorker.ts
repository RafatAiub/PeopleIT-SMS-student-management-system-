import { Worker, Job } from 'bullmq';
import { env } from '../config/env';
import { logger } from '../utils/logger';
import { sendSms } from '../utils/sms.service';
import { prisma } from '../config/prisma';

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

/** Resolves the best contact phone for a student: primary guardian first, then the student's own phone. */
async function resolveContactPhone(institutionId: string, studentId: string): Promise<{ phone: string | null; recipientName: string }> {
  const student = await prisma.student.findFirst({
    where: { id: studentId, institutionId },
    select: {
      firstName: true,
      lastName: true,
      phone: true,
      guardians: {
        select: { guardian: { select: { phone: true, firstName: true, lastName: true } }, isPrimary: true },
        orderBy: { isPrimary: 'desc' },
      },
    },
  });
  if (!student) return { phone: null, recipientName: '' };

  const primaryGuardian = student.guardians[0]?.guardian;
  if (primaryGuardian?.phone) {
    return { phone: primaryGuardian.phone, recipientName: `${primaryGuardian.firstName} ${primaryGuardian.lastName}` };
  }
  return { phone: student.phone, recipientName: `${student.firstName} ${student.lastName}` };
}

// Worker processing fee-due and absence reminder SMS jobs.
export const feeReminderWorker = new Worker(
  'feeReminders',
  async (job: Job<ReminderJobData>) => {
    logger.info(`Processing reminder job ${job.id}`, { data: job.data });
    const { institutionId, studentId } = job.data;

    const { phone, recipientName } = await resolveContactPhone(institutionId, studentId);
    if (!phone) {
      logger.warn('Reminder job skipped: no contact phone on file', { studentId });
      return;
    }

    let message: string;
    if (job.data.type === 'fee-due') {
      const { invoiceNo, dueAmount, dueDate } = job.data;
      message = `Dear ${recipientName}, invoice ${invoiceNo} (Tk ${dueAmount}) is due on ${new Date(dueDate).toDateString()}. Please pay at your earliest convenience. - PeopleIT SMS`;
    } else {
      message = `Dear ${recipientName}, your child was marked ABSENT on ${new Date(job.data.date).toDateString()}. Please contact the school if this is unexpected. - PeopleIT SMS`;
    }

    const result = await sendSms(phone, message);
    if (!result.success) {
      throw new Error(`SMS send failed: ${result.message}`);
    }
  },
  {
    connection: {
      url: env.REDIS_URL,
      maxRetriesPerRequest: null,
    } as any,
  }
);

feeReminderWorker.on('completed', (job) => {
  logger.info(`Job ${job.id} completed successfully`);
});

feeReminderWorker.on('failed', (job, err) => {
  logger.error(`Job ${job?.id} failed`, { error: err.message });
});
