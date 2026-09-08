import { Queue } from 'bullmq';
import { getBullQueueConnection } from '../config/redis';

// BullMQ Queue for fee reminders
export const feeReminderQueue = new Queue('feeReminders', {
  connection: getBullQueueConnection(),
});
