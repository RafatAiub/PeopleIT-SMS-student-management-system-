import { Worker, Job } from 'bullmq';
import { logger } from '../utils/logger';
import { BULL_PREFIX, createBullWorkerConnection } from '../config/redis';
import { processReminderJob, type ReminderJobData } from './reminderProcessor';

// Worker for fee-due and absence reminders. The logic lives in
// reminderProcessor.ts (testable without Redis). P0: a fee-due job re-reads
// the invoice and skips it if it is PAID/CANCELLED/deleted; the SMS goes to the
// primary guardian's phone (falling back to the student's), and the email copy
// to the student's and primary guardian's logins.
export const feeReminderWorker = new Worker(
  'feeReminders',
  async (job: Job<ReminderJobData>) => {
    logger.info(`Processing reminder job ${job.id}`, { type: job.data.type, institutionId: job.data.institutionId });
    return processReminderJob(job.data);
  },
  { connection: createBullWorkerConnection('feeReminders'), prefix: BULL_PREFIX },
);

feeReminderWorker.on('completed', (job) => {
  logger.info(`Job ${job.id} completed successfully`);
});

feeReminderWorker.on('failed', (job, err) => {
  logger.error(`Job ${job?.id} failed`, { error: err.message });
});
