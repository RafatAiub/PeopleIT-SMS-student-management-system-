import 'dotenv/config';
import { env } from '../src/config/env';
import { getTransport, sendDirectMail } from '../src/utils/mailer';
import { sendVerificationEmail } from '../src/modules/auth/auth.mail';

// =============================================================================
// Mail delivery smoke test
// =============================================================================
//   npx ts-node scripts/test-mail.ts you@example.com
//
// Proves the SMTP credentials actually work *before* anyone tries to sign up.
// Without this, a bad password shows up as "I never got the email", which is
// indistinguishable from a dozen other faults.

async function main(): Promise<void> {
  const to = process.argv[2];

  if (!to) {
    console.error('Usage: npx ts-node scripts/test-mail.ts <recipient@example.com>');
    process.exit(1);
  }

  console.log('\nConfiguration');
  console.log('  EMAIL_ENABLED :', env.EMAIL_ENABLED);
  console.log('  SMTP_HOST     :', env.SMTP_HOST ?? '(unset)');
  console.log('  SMTP_PORT     :', env.SMTP_PORT);
  console.log('  SMTP_SECURE   :', env.SMTP_SECURE);
  console.log('  SMTP_USER     :', env.SMTP_USER ?? '(unset)');
  console.log('  SMTP_PASS     :', env.SMTP_PASS ? `set (${env.SMTP_PASS.length} chars)` : '(unset)');
  console.log('  EMAIL_FROM    :', env.EMAIL_FROM);

  if (!env.EMAIL_ENABLED || !env.SMTP_HOST) {
    console.error(
      '\n✗ Email is disabled. Nothing will be delivered — nodemailer falls back to\n' +
        '  jsonTransport, which renders the message and discards it.\n' +
        '  Set EMAIL_ENABLED=true and SMTP_HOST in backend/.env, then re-run.\n',
    );
    process.exit(1);
  }

  // verify() opens a connection and authenticates without sending anything, so
  // a wrong password fails here with a clear SMTP error rather than silently
  // queueing a message that never arrives.
  console.log('\nVerifying SMTP connection…');
  try {
    await getTransport().verify();
    console.log('  ✓ connected and authenticated');
  } catch (error) {
    console.error('  ✗ could not connect:', error instanceof Error ? error.message : error);
    console.error(
      '\n  Read the SMTP code — it narrows this down a lot:\n' +
        '    535 — bad credentials. On Brevo the SMTP login is NOT your account\n' +
        '          email; it is a generated address ending @smtp-brevo.com,\n' +
        '          shown under SMTP & API → SMTP.\n' +
        '    525 — credentials are CORRECT but the sending IP is not allowed.\n' +
        '          Brevo → SMTP & API → Authorized IPs. Add this machine, or\n' +
        '          turn the restriction off. A home/office IP usually changes,\n' +
        '          so prefer disabling it unless you send from a fixed server.\n' +
        '    550 — sender rejected: the EMAIL_FROM address or its domain is not\n' +
        '          verified under Senders & Domains.\n' +
        '    Connection timeout — port blocked; try 587, 465 (SMTP_SECURE=true)\n' +
        '          or 2525.\n',
    );
    process.exit(1);
  }

  console.log('\nSending a plain test message…');
  await sendDirectMail({
    to,
    subject: 'PeopleNIT SMS — test message',
    text: 'If you are reading this, SMTP is configured correctly.',
    html: '<p>If you are reading this, SMTP is configured correctly.</p>',
  });
  console.log('  ✓ sent');

  // The real template, with a deliberately invalid token — this is what a new
  // user actually receives, so it catches broken links and mangled HTML.
  console.log('\nSending the real verification template…');
  await sendVerificationEmail({
    to,
    firstName: 'Test',
    token: 'this-is-not-a-real-token-just-a-layout-check',
    expiresInMinutes: 60 * 24,
  });
  console.log('  ✓ sent');

  console.log(
    `\nDone. Check ${to} — including the spam folder, which is where a new\n` +
      'sending domain usually lands the first few times.\n',
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('\n✗ Failed:', error instanceof Error ? error.message : error);
    process.exit(1);
  });
