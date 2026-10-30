// P0 — fee reminders: skip when paid/cancelled/deleted, SMS to the primary
// guardian's phone (fallback: student's phone), bulk/single scheduling share
// one helper. sendSms and notifySafe are mocked — nothing is ever sent.
const mockSendSms = jest.fn();
jest.mock('../src/utils/sms.service', () => {
  const actual = jest.requireActual('../src/utils/sms.service');
  return { __esModule: true, ...actual, sendSms: (...a: unknown[]) => mockSendSms(...a) };
});
const mockNotifySafe = jest.fn();
jest.mock('../src/modules/notifications/notifications.service', () => {
  const actual = jest.requireActual('../src/modules/notifications/notifications.service');
  return { __esModule: true, ...actual, notifySafe: (...a: unknown[]) => mockNotifySafe(...a) };
});
const mockSchedule = jest.fn();
jest.mock('../src/queues/reminderQueue', () => ({
  __esModule: true,
  feeReminderQueue: { add: jest.fn(), addBulk: jest.fn() },
  scheduleFeeDueReminders: (...a: unknown[]) => mockSchedule(...a),
}));
jest.mock('../src/queues/notificationQueue', () => ({
  __esModule: true,
  notificationQueue: { add: jest.fn() },
  enqueueNotification: jest.fn().mockResolvedValue(undefined),
}));

import { Prisma, UserRole } from '@prisma/client';
import { processFeeDueReminder } from '../src/queues/reminderProcessor';
import { FeeService } from '../src/modules/fees/fee.service';
import { prisma, createTestInstitution, cleanupInstitution, disconnectFixtures, InstitutionFixture } from './helpers/fixtures';

jest.setTimeout(120000);

describe('P0 fee-due reminders', () => {
  let fx: InstitutionFixture;
  let n = 0;

  beforeAll(async () => {
    fx = await createTestInstitution(`p0-rem-${Date.now()}`);
  }, 60000);

  afterAll(async () => {
    await cleanupInstitution(fx);
    await disconnectFixtures();
  }, 60000);

  beforeEach(async () => {
    mockSendSms.mockReset();
    mockSendSms.mockResolvedValue({ success: true, status: 'SENT', message: 'Ok: sent', to: '8801712345678' });
    mockNotifySafe.mockReset();
    mockSchedule.mockReset();
    await prisma.notificationDelivery.deleteMany({ where: { institutionId: fx.institutionId } });
    await prisma.guardian.update({ where: { id: fx.guardianId }, data: { phone: '01712345678' } });
    await prisma.student.update({ where: { id: fx.studentId }, data: { phone: '01812345678' } });
  });

  async function makeInvoice(status = 'UNPAID', due = 500) {
    n++;
    return prisma.invoice.create({
      data: {
        institutionId: fx.institutionId,
        studentId: fx.studentId,
        invoiceNo: `P0R-${fx.slug}-${n}`,
        totalAmount: new Prisma.Decimal(500),
        dueAmount: new Prisma.Decimal(due),
        dueDate: new Date(),
        status,
      },
    });
  }

  const job = (inv: { id: string; invoiceNo: string }, withId = true) => ({
    type: 'fee-due' as const,
    institutionId: fx.institutionId,
    ...(withId ? { invoiceId: inv.id } : {}),
    studentId: fx.studentId,
    invoiceNo: inv.invoiceNo,
    dueAmount: 500,
    dueDate: new Date().toISOString(),
  });

  it('sends the SMS to the primary guardian phone (normalised) and email to student + guardian logins', async () => {
    const inv = await makeInvoice('PARTIAL', 200);
    const out = await processFeeDueReminder(job(inv));
    expect(out).toMatchObject({ status: 'PROCESSED', sms: 'SENT' });
    expect(mockSendSms).toHaveBeenCalledTimes(1);
    expect(mockSendSms.mock.calls[0][0]).toBe('8801712345678');
    // The reminder quotes the CURRENT outstanding amount.
    expect(mockSendSms.mock.calls[0][1]).toContain('200.00');

    expect(mockNotifySafe).toHaveBeenCalledTimes(1);
    const call = mockNotifySafe.mock.calls[0][0];
    expect(call.channels).toEqual(['EMAIL']);
    expect(call.contextId).toBe(inv.id);
    expect(new Set(call.recipientUserIds)).toEqual(new Set([fx.studentUserId, fx.usersByRole[UserRole.GUARDIAN].userId]));

    const delivery = await prisma.notificationDelivery.findFirstOrThrow({ where: { institutionId: fx.institutionId, channel: 'SMS' } });
    expect(delivery.status).toBe('SENT');
    expect(delivery.recipient).toBe('8801712345678');

    // A replayed job never sends the SMS twice.
    await processFeeDueReminder(job(inv));
    expect(mockSendSms).toHaveBeenCalledTimes(1);
  });

  it('falls back to the student phone when the guardian number is invalid', async () => {
    await prisma.guardian.update({ where: { id: fx.guardianId }, data: { phone: '0000000000' } });
    const inv = await makeInvoice();
    await processFeeDueReminder(job(inv));
    expect(mockSendSms.mock.calls[0][0]).toBe('8801812345678');
  });

  it.each(['PAID', 'CANCELLED'])('skips an invoice that is %s by the time the job runs', async (status) => {
    const inv = await makeInvoice(status, status === 'PAID' ? 0 : 500);
    const out = await processFeeDueReminder(job(inv));
    expect(out.status).toBe('SKIPPED');
    expect(mockSendSms).not.toHaveBeenCalled();
    expect(mockNotifySafe).not.toHaveBeenCalled();
  });

  it('skips a deleted (trashed) invoice', async () => {
    const inv = await makeInvoice();
    await prisma.invoice.update({ where: { id: inv.id }, data: { deletedAt: new Date() } });
    const out = await processFeeDueReminder(job(inv));
    expect(out.status).toBe('SKIPPED');
    expect(mockSendSms).not.toHaveBeenCalled();
  });

  it('still handles jobs scheduled before P0 (invoiceNo only)', async () => {
    const inv = await makeInvoice();
    const out = await processFeeDueReminder(job(inv, false));
    expect(out).toMatchObject({ status: 'PROCESSED', sms: 'SENT' });
  });

  it('records a disabled SMS gateway as SKIPPED, not SENT', async () => {
    mockSendSms.mockResolvedValue({ success: false, status: 'SKIPPED', message: 'SMS sending is disabled' });
    const inv = await makeInvoice();
    const out = await processFeeDueReminder(job(inv));
    expect(out).toMatchObject({ status: 'PROCESSED', sms: 'SKIPPED' });
    const delivery = await prisma.notificationDelivery.findFirstOrThrow({ where: { institutionId: fx.institutionId, channel: 'SMS' } });
    expect(delivery.status).toBe('SKIPPED');
  });

  it('single invoice creation schedules the reminder with the invoice id (same helper as bulk)', async () => {
    const category = await prisma.feeCategory.create({
      data: { institutionId: fx.institutionId, name: 'Tuition', amount: new Prisma.Decimal(500), frequency: 'MONTHLY' },
    });
    const inv = await FeeService.createInvoice(fx.institutionId, {
      studentId: fx.studentId,
      dueDate: new Date(Date.now() + 86400000).toISOString(),
      applyConcessions: false,
      items: [{ feeCategoryId: category.id, description: 'Tuition', amount: 500, discount: 0 }],
    });
    expect(mockSchedule).toHaveBeenCalledTimes(1);
    expect(mockSchedule.mock.calls[0][0]).toEqual([
      expect.objectContaining({ institutionId: fx.institutionId, invoiceId: inv!.id, studentId: fx.studentId }),
    ]);
  });
});
