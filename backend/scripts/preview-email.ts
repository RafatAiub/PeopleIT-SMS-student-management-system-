/**
 * Renders a notification email and sends it through a throwaway Ethereal
 * inbox, then prints a preview URL you can open in a browser.
 *
 * Ethereal accounts are created on demand by nodemailer — no signup, no
 * domain, no credentials to store. This is how you eyeball real rendered
 * output before any production mail provider exists.
 *
 *   npx ts-node scripts/preview-email.ts
 *   npx ts-node scripts/preview-email.ts PAYMENT_RECEIVED
 *
 * Nothing here touches the database or the queue: it renders the BUNDLED
 * default template only, so it is safe to run against any environment.
 */
import nodemailer from 'nodemailer';
import { DEFAULT_TEMPLATES } from '../src/modules/notifications/templates.defaults';
import { interpolate } from '../src/modules/notifications/renderer';

const SAMPLE_VARS = {
  institutionName: 'Dhaka City School',
  invoiceNo: 'INV-2026-000042',
  studentName: 'Ayesha Rahman',
  amount: '4,500.00',
  dueAmount: '0.00',
  dueDate: 'Tue Sep 30 2026',
  date: 'Wed Sep 03 2026',
};

async function main(): Promise<void> {
  const type = process.argv[2] ?? 'INVOICE_ISSUED';
  const templateKey = `${type}:EMAIL`;
  const template = DEFAULT_TEMPLATES[templateKey];

  if (!template) {
    const available = Object.keys(DEFAULT_TEMPLATES)
      .filter((k) => k.endsWith(':EMAIL'))
      .map((k) => k.replace(':EMAIL', ''));
    console.error(`No email template for "${type}". Available: ${available.join(', ')}`);
    process.exit(1);
  }

  const subject = interpolate(template.subject ?? type, SAMPLE_VARS);
  const body = interpolate(template.body, SAMPLE_VARS);

  console.log(`\n--- ${templateKey} ---`);
  console.log(`Subject: ${subject}\n`);
  console.log(body);
  console.log('\n--- sending to Ethereal ---');

  const account = await nodemailer.createTestAccount();
  const transport = nodemailer.createTransport({
    host: account.smtp.host,
    port: account.smtp.port,
    secure: account.smtp.secure,
    auth: { user: account.user, pass: account.pass },
  });

  const info = await transport.sendMail({
    from: 'PeopleIT SMS <noreply@peopleit.com>',
    to: 'guardian@example.com',
    subject,
    text: body,
  });

  console.log(`Message id : ${info.messageId}`);
  console.log(`Preview    : ${nodemailer.getTestMessageUrl(info)}\n`);
}

main().catch((error) => {
  console.error('preview-email failed:', error);
  process.exit(1);
});
