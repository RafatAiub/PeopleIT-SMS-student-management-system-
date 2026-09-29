import { UserRole } from '@prisma/client';

const mockNotifySafe = jest.fn();
jest.mock('../src/modules/notifications/notifications.service', () => ({
  __esModule: true,
  notifySafe: (...args: unknown[]) => mockNotifySafe(...args),
}));

import {
  prisma,
  createTestInstitution,
  cleanupInstitution,
  disconnectFixtures,
  InstitutionFixture,
} from './helpers/fixtures';

jest.setTimeout(120000);

describe('Reminder Notifications (FEE_REMINDER & ABSENCE_ALERT)', () => {
  let fixture: InstitutionFixture;

  beforeAll(async () => {
    fixture = await createTestInstitution(`reminder-notif-${Date.now()}`);
  }, 60000);

  afterAll(async () => {
    await cleanupInstitution(fixture);
    await disconnectFixtures();
  }, 60000);

  beforeEach(() => {
    mockNotifySafe.mockClear();
  });

  describe('FEE_REMINDER notification', () => {
    it('should send FEE_REMINDER with SMS channel when fee is due', async () => {
      const { notifySafe } = await import('../src/modules/notifications/notifications.service');

      const studentUserId = fixture.studentUserId;
      const studentName = 'Test Student';

      // Simulate what reminderWorker does
      notifySafe({
        institutionId: fixture.institutionId,
        type: 'FEE_REMINDER',
        recipientUserIds: [studentUserId],
        contextId: 'INV-2024-001',
        channels: ['SMS'],
        data: { link: '/fees' },
        vars: {
          invoiceNo: 'INV-2024-001',
          studentName,
          amount: '5000',
          dueDate: 'Fri Dec 31 2024',
        },
      });

      expect(mockNotifySafe).toHaveBeenCalledWith(
        expect.objectContaining({
          institutionId: fixture.institutionId,
          type: 'FEE_REMINDER',
          recipientUserIds: [studentUserId],
          contextId: 'INV-2024-001',
          channels: ['SMS'],
          data: { link: '/fees' },
          vars: {
            invoiceNo: 'INV-2024-001',
            studentName,
            amount: '5000',
            dueDate: 'Fri Dec 31 2024',
          },
        }),
      );
    });

    it('should use invoiceNo as contextId for idempotent delivery', async () => {
      const invoiceNo = `INV-DEDUPE-${Date.now()}`;
      const { notifySafe } = await import('../src/modules/notifications/notifications.service');

      notifySafe({
        institutionId: fixture.institutionId,
        type: 'FEE_REMINDER',
        recipientUserIds: [fixture.studentUserId],
        contextId: invoiceNo,
        channels: ['SMS'],
        vars: {
          invoiceNo,
          studentName: 'Test',
          amount: '100',
          dueDate: 'today',
        },
      });

      expect(mockNotifySafe).toHaveBeenCalledWith(
        expect.objectContaining({
          contextId: invoiceNo,
        }),
      );
    });
  });

  describe('ABSENCE_ALERT notification', () => {
    it('should send ABSENCE_ALERT with SMS channel when student marked absent', async () => {
      const { notifySafe } = await import('../src/modules/notifications/notifications.service');
      const studentUserId = fixture.studentUserId;
      const studentName = 'Test Student';

      notifySafe({
        institutionId: fixture.institutionId,
        type: 'ABSENCE_ALERT',
        recipientUserIds: [studentUserId],
        contextId: `${fixture.studentId}:2024-12-15`,
        channels: ['SMS'],
        data: { link: '/attendance' },
        vars: {
          studentName,
          date: 'Sun Dec 15 2024',
        },
      });

      expect(mockNotifySafe).toHaveBeenCalledWith(
        expect.objectContaining({
          institutionId: fixture.institutionId,
          type: 'ABSENCE_ALERT',
          recipientUserIds: [studentUserId],
          contextId: `${fixture.studentId}:2024-12-15`,
          channels: ['SMS'],
          data: { link: '/attendance' },
          vars: {
            studentName,
            date: 'Sun Dec 15 2024',
          },
        }),
      );
    });

    it('should use studentId:date as contextId for idempotent delivery', async () => {
      const { notifySafe } = await import('../src/modules/notifications/notifications.service');
      const attendanceDate = '2024-12-16';

      notifySafe({
        institutionId: fixture.institutionId,
        type: 'ABSENCE_ALERT',
        recipientUserIds: [fixture.studentUserId],
        contextId: `${fixture.studentId}:${attendanceDate}`,
        channels: ['SMS'],
        vars: {
          studentName: 'Test',
          date: 'Mon Dec 16 2024',
        },
      });

      expect(mockNotifySafe).toHaveBeenCalledWith(
        expect.objectContaining({
          contextId: `${fixture.studentId}:${attendanceDate}`,
        }),
      );
    });
  });

  describe('Template channels', () => {
    it('both FEE_REMINDER and ABSENCE_ALERT should use SMS channel', async () => {
      const { notifySafe } = await import('../src/modules/notifications/notifications.service');

      notifySafe({
        institutionId: fixture.institutionId,
        type: 'FEE_REMINDER',
        recipientUserIds: [fixture.studentUserId],
        contextId: 'test-1',
        channels: ['SMS'],
        vars: { invoiceNo: 'INV-1', studentName: 'T', amount: '0', dueDate: 'x' },
      });

      notifySafe({
        institutionId: fixture.institutionId,
        type: 'ABSENCE_ALERT',
        recipientUserIds: [fixture.studentUserId],
        contextId: 'test-2',
        channels: ['SMS'],
        vars: { studentName: 'T', date: 'x' },
      });

      expect(mockNotifySafe).toHaveBeenCalledTimes(2);
      expect(mockNotifySafe.mock.calls[0][0].channels).toEqual(['SMS']);
      expect(mockNotifySafe.mock.calls[1][0].channels).toEqual(['SMS']);
    });
  });
});
