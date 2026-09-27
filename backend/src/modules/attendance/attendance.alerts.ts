import { prisma } from '../../config/prisma';
import { logger } from '../../utils/logger';
import { notifySafe } from '../notifications/notifications.service';
import { absenceAlertContextId } from './attendance.logic';

/**
 * Sends ABSENCE_ALERT through the notifications `notify()` path (instead of
 * the old feeReminders queue job).
 *
 * Recipients: every linked guardian that has a login (IN_APP + SMS). When a
 * student has no guardian account, the alert falls back to the student's own
 * account over SMS — exactly what the old queue worker did.
 *
 * Dedupe: contextId = `${studentId}:${date ISO}` (same format the old worker
 * used), so NotificationDelivery.dedupeKey makes a second alert for the same
 * student/day/recipient/channel a no-op even if the sheet is re-submitted.
 * Fire-and-forget: never fails or delays the attendance save.
 */
export async function sendAbsenceAlerts(
  institutionId: string,
  normalizedDate: Date,
  studentIds: string[],
): Promise<void> {
  if (studentIds.length === 0) return;
  try {
    const students = await prisma.student.findMany({
      where: { institutionId, id: { in: studentIds } },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        userId: true,
        guardians: { select: { guardian: { select: { userId: true } } } },
      },
    });

    const dateLabel = normalizedDate.toDateString();
    for (const s of students) {
      const guardianUserIds = s.guardians
        .map((g) => g.guardian?.userId)
        .filter((id): id is string => Boolean(id));
      const vars = { studentName: `${s.firstName} ${s.lastName}`.trim(), date: dateLabel };
      const contextId = absenceAlertContextId(s.id, normalizedDate);

      if (guardianUserIds.length > 0) {
        notifySafe({
          institutionId,
          type: 'ABSENCE_ALERT',
          recipientUserIds: guardianUserIds,
          contextId,
          channels: ['IN_APP', 'SMS'],
          data: { link: '/attendance', studentId: s.id },
          vars,
        });
      } else if (s.userId) {
        notifySafe({
          institutionId,
          type: 'ABSENCE_ALERT',
          recipientUserIds: [s.userId],
          contextId,
          channels: ['SMS'],
          data: { link: '/attendance' },
          vars,
        });
      } else {
        logger.warn('Absence alert skipped: no guardian or student account', { studentId: s.id });
      }
    }
  } catch (error) {
    logger.error('Failed to send absence alerts', {
      institutionId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
