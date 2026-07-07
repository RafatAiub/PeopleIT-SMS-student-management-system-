import { Queue } from 'bullmq';
import { env } from '../config/env';

// BullMQ Queue for fee reminders
export const feeReminderQueue = new Queue('feeReminders', {
  connection: {
    url: env.REDIS_URL,
    maxRetriesPerRequest: null,
  } as any,
});
