import { Queue } from 'bullmq';
import { BULL_PREFIX, getBullQueueConnection } from '../config/redis';
import { logger } from '../utils/logger';
import { toJobId } from './jobId';

// BullMQ Queue for fee reminders
export const feeReminderQueue = new Queue('feeReminders', {
  connection: getBullQueueConnection(),
  prefix: BULL_PREFIX,
});

export interface FeeDueReminderInput {
  institutionId: string;
  invoiceId: string;
  studentId: string;
  invoiceNo: string;
  dueAmount: number | string;
  dueDate: Date | string;
}

/**
 * P0: the ONE way to schedule a fee-due reminder, used by single AND bulk
 * invoice creation. Fires on the due date via BullMQ's delay. The job id is
 * derived from the invoice id, so scheduling the same invoice twice is a no-op.
 *
 * Never awaited by callers' critical path and never throws: a slow or
 * unreachable Redis must not delay or fail invoice creation. The worker
 * re-reads the invoice when the job runs and skips paid/cancelled/deleted ones.
 */
export function scheduleFeeDueReminders(invoices: FeeDueReminderInput[]): void {
  if (invoices.length === 0) return;
  // Jest shares the dev Redis and never runs the worker (same rule as
  // enqueueNotification) — a real job would outlive the test's fixtures.
  if (process.env.NODE_ENV === 'test') return;

  try {
    const now = Date.now();
    feeReminderQueue
      .addBulk(
        invoices.map((inv) => {
          const dueIso = new Date(inv.dueDate).toISOString();
          return {
            name: 'fee-due',
            data: {
              type: 'fee-due' as const,
              institutionId: inv.institutionId,
              invoiceId: inv.invoiceId,
              studentId: inv.studentId,
              invoiceNo: inv.invoiceNo,
              dueAmount: inv.dueAmount,
              dueDate: dueIso,
            },
            opts: {
              jobId: toJobId(`fee-due:${inv.invoiceId}`),
              delay: Math.max(new Date(dueIso).getTime() - now, 0),
              removeOnComplete: 1000,
              removeOnFail: 5000,
            },
          };
        }),
      )
      .catch((err: Error) => {
        logger.error('Failed to schedule fee-due reminders', { error: err.message, count: invoices.length });
      });
  } catch (err) {
    logger.error('Failed to schedule fee-due reminders', {
      error: err instanceof Error ? err.message : String(err),
      count: invoices.length,
    });
  }
}
