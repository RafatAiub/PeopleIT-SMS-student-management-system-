/**
 * Live end-to-end check of the notification system against a running dev server.
 *
 *   npx ts-node --transpile-only scripts/live-verify.ts [recipient-email]
 *
 * Flow:
 *   1. seed a guardian WITH a login, linked to a real student (direct DB — the
 *      public API has no endpoint that attaches a login to a guardian)
 *   2. admin logs in and creates an invoice  -> fires notify('INVOICE_ISSUED')
 *   3. the real BullMQ worker (local Redis) delivers it
 *   4. the guardian logs in and reads their notifications  <- this is the bell
 *   5. the NotificationDelivery log is printed (IN_APP + EMAIL rows)
 *   6. the same invoice email is sent through a throwaway Ethereal inbox so you
 *      can open the exact rendered mail in a browser
 */
import bcrypt from 'bcryptjs';
import nodemailer from 'nodemailer';
import { PrismaClient } from '@prisma/client';
import { renderTemplate } from '../src/modules/notifications/renderer';

const BASE = process.env.API_BASE || 'http://localhost:3001/api/v1';
const INSTITUTION_CODE = '102030';
const RECIPIENT_EMAIL = process.argv[2] || 'guardian@example.com';
const GUARDIAN_PASSWORD = 'guardian123';

const prisma = new PrismaClient();
const stamp = Date.now();
const log = (...a: unknown[]) => console.log(...a);
const section = (t: string) => log(`\n=== ${t} ===`);

async function api(path: string, opts: { method?: string; token?: string; body?: unknown } = {}) {
  const { method = 'GET', token, body } = opts;
  const res = await fetch(BASE + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : {};
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}\n${JSON.stringify(json, null, 2)}`);
  return json;
}

async function main() {
  section('1. seed a guardian with a login, linked to a real student');
  const institution = await prisma.institution.findFirstOrThrow({ where: { slug: INSTITUTION_CODE } });
  const student = await prisma.student.findFirstOrThrow({ where: { institutionId: institution.id } });

  const guardianEmail = `guardian.verify.${stamp}@example.com`;
  const guardianUser = await prisma.user.create({
    data: {
      institutionId: institution.id,
      email: guardianEmail,
      passwordHash: await bcrypt.hash(GUARDIAN_PASSWORD, 12),
      role: 'GUARDIAN',
      firstName: 'Verify',
      lastName: 'Guardian',
      phone: '+8801700000000',
    },
  });
  const guardian = await prisma.guardian.create({
    data: {
      institutionId: institution.id,
      userId: guardianUser.id,
      relationship: 'GUARDIAN',
      firstName: 'Verify',
      lastName: 'Guardian',
      phone: '+8801700000000',
      email: guardianEmail,
    },
  });
  await prisma.guardianStudent.create({
    data: { guardianId: guardian.id, studentId: student.id, isPrimary: true },
  });
  log(`   guardian ${guardianEmail} (user ${guardianUser.id}) linked to ${student.firstName} ${student.lastName}`);

  section('2. admin creates an invoice  (fires notify INVOICE_ISSUED)');
  const admin = await api('/auth/login', {
    method: 'POST',
    body: { email: 'schooladmin@peopleit.com', password: 'admin123', institutionCode: INSTITUTION_CODE },
  });
  const adminToken = admin.data.tokens.accessToken;

  let categoryId = (await api('/fees/categories', { token: adminToken })).data?.[0]?.id;
  if (!categoryId) {
    categoryId = (
      await api('/fees/categories', {
        method: 'POST',
        token: adminToken,
        body: { name: `Verify Fee ${stamp}`, amount: 1500, frequency: 'ONE_TIME' },
      })
    ).data.id;
  }

  const dueDate = new Date(Date.now() + 7 * 864e5);
  const invoice = await api('/fees/invoices', {
    method: 'POST',
    token: adminToken,
    body: {
      studentId: student.id,
      dueDate: dueDate.toISOString(),
      items: [{ feeCategoryId: categoryId, description: 'Live verification invoice', amount: 1500, discount: 0 }],
    },
  });
  log(`   invoice ${invoice.data.invoiceNo} created`);

  section('3. wait for the BullMQ worker to deliver');
  let deliveries: Array<{ channel: string; status: string; attempts: number; providerRef: string | null; error: string | null }> = [];
  for (let i = 0; i < 25; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    deliveries = await prisma.notificationDelivery.findMany({
      where: { institutionId: institution.id, templateKey: 'INVOICE_ISSUED', createdAt: { gte: new Date(stamp) } },
      orderBy: { channel: 'asc' },
    });
    if (deliveries.filter((d) => d.status !== 'QUEUED').length >= 2) break;
  }
  if (deliveries.length === 0) log('   (no delivery rows yet — worker may still be starting)');
  for (const d of deliveries) {
    log(`   [${d.channel.padEnd(6)}] ${d.status.padEnd(7)} attempts=${d.attempts}  ref=${(d.providerRef ?? '-').slice(0, 40)}  ${d.error ?? ''}`);
  }

  section('4. guardian logs in and reads the bell');
  const guardianLogin = await api('/auth/login', {
    method: 'POST',
    body: { email: guardianEmail, password: GUARDIAN_PASSWORD, institutionCode: INSTITUTION_CODE },
  });
  const inbox = await api('/notifications', { token: guardianLogin.data.tokens.accessToken });
  log(`   GET /notifications  ->  unreadCount = ${inbox.unreadCount}`);
  for (const n of inbox.data) {
    log(`   - "${n.title}"`);
    log(`     ${n.body}`);
    log(`     link=${n.data?.link ?? '(none)'}  read=${n.readAt ? 'yes' : 'NO'}`);
  }

  section('5. the exact invoice email, via a throwaway Ethereal inbox');
  const rendered = await renderTemplate(institution.id, 'INVOICE_ISSUED', 'EMAIL', {
    institutionName: institution.name,
    invoiceNo: invoice.data.invoiceNo,
    studentName: `${student.firstName} ${student.lastName}`,
    amount: '1,500.00',
    dueDate: dueDate.toDateString(),
  });
  const ethereal = await nodemailer.createTestAccount();
  const transport = nodemailer.createTransport({
    host: ethereal.smtp.host,
    port: ethereal.smtp.port,
    secure: ethereal.smtp.secure,
    auth: { user: ethereal.user, pass: ethereal.pass },
  });
  const info = await transport.sendMail({
    from: 'PeopleIT SMS <noreply@peopleit.com>',
    to: RECIPIENT_EMAIL,
    subject: rendered.subject,
    text: rendered.body,
  });
  log(`   To      : ${RECIPIENT_EMAIL}`);
  log(`   Subject : ${rendered.subject}`);
  log(`   PREVIEW : ${nodemailer.getTestMessageUrl(info)}`);
  log('   (Ethereal is a sandbox: this does NOT land in the real Gmail inbox.)');

  section('SUMMARY');
  const inApp = deliveries.find((d) => d.channel === 'IN_APP');
  const email = deliveries.find((d) => d.channel === 'EMAIL');
  log(`   in-app delivery : ${inApp ? inApp.status : 'MISSING'}`);
  log(`   email delivery  : ${email ? email.status : 'MISSING'} (jsonTransport — EMAIL_ENABLED is false)`);
  log(`   guardian bell   : ${inbox.unreadCount} unread`);
  log(`   email preview   : open the PREVIEW url above`);
}

main()
  .catch((e) => {
    console.error('\nFAILED:\n', e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
