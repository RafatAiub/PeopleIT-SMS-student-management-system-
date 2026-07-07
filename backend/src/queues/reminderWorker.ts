import { Worker, Job } from 'bullmq';
import { env } from '../config/env';
import { logger } from '../utils/logger';

// Worker processing fee reminder tasks
export const feeReminderWorker = new Worker(
  'feeReminders',
  async (job: Job) => {
    logger.info(`Processing fee reminder job ${job.id}`, { data: job.data });
    
    const { studentId, invoiceNo, dueAmount, dueDate } = job.data;
    
    // In Phase 2, we will integrate the Greenweb / Mobireach SMS gateways here.
    // For Phase 1, we just mock the notification/SMS trigger:
    logger.info(`[MOCK NOTIFICATION] Sent fee reminder for invoice ${invoiceNo} to student ${studentId}. Due amount: ৳ ${dueAmount}, Due date: ${dueDate}`);
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
