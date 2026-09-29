import { env } from '../../config/env';
import { sendDirectMail } from '../../utils/mailer';

// =============================================================================
// Auth email templates
// =============================================================================
// Deliberately NOT in notifications/templates.defaults.ts. Those are
// institution-scoped and admin-editable; these are security mail whose wording
// and links must not be tenant-overridable — an editable password-reset
// template is a phishing vector.
//
// Every message ships both text and HTML: some institution mail servers strip
// HTML, and a verification link that arrives unclickable is a dead signup.

const BRAND = 'PeopleNIT SMS';

/** Minimal, inline-styled shell — email clients ignore <style> blocks. */
function wrap(heading: string, bodyHtml: string): string {
  return `<!doctype html>
<html>
  <body style="margin:0;padding:24px;background:#f4f5f7;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1f2937;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:12px;padding:32px;">
      <tr><td>
        <p style="margin:0 0 4px;font-size:13px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:#6b7280;">${BRAND}</p>
        <h1 style="margin:0 0 16px;font-size:21px;line-height:1.3;color:#111827;">${heading}</h1>
        ${bodyHtml}
        <hr style="border:none;border-top:1px solid #e5e7eb;margin:28px 0 16px;" />
        <p style="margin:0;font-size:12px;line-height:1.6;color:#9ca3af;">
          This is an automated security message from ${BRAND}. Please do not reply.
        </p>
      </td></tr>
    </table>
  </body>
</html>`;
}

function button(href: string, label: string): string {
  return `<p style="margin:0 0 20px;">
    <a href="${href}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:600;font-size:15px;">${label}</a>
  </p>
  <p style="margin:0 0 4px;font-size:13px;color:#6b7280;">If the button does not work, paste this into your browser:</p>
  <p style="margin:0 0 8px;font-size:13px;word-break:break-all;"><a href="${href}" style="color:#2563eb;">${href}</a></p>`;
}

/** Big, spaced digits — codes get read off a screen and mistyped otherwise. */
function codeBlock(code: string): string {
  return `<p style="margin:0 0 20px;font-size:32px;font-weight:700;letter-spacing:.32em;color:#111827;background:#f3f4f6;border-radius:8px;padding:16px;text-align:center;">${code}</p>`;
}

// ── Email verification ───────────────────────────────────────────────────────

export async function sendVerificationEmail(opts: {
  to: string;
  firstName: string;
  token: string;
  expiresInMinutes: number;
}): Promise<void> {
  const url = `${env.FRONTEND_URL}/verify-email?token=${encodeURIComponent(opts.token)}`;

  await sendDirectMail({
    to: opts.to,
    subject: `Confirm your email address`,
    text: [
      `Hi ${opts.firstName},`,
      ``,
      `Confirm your email address to finish setting up your ${BRAND} account:`,
      url,
      ``,
      `This link expires in ${opts.expiresInMinutes} minutes.`,
      `If you did not create an account, you can ignore this email.`,
    ].join('\n'),
    html: wrap(
      'Confirm your email address',
      `<p style="margin:0 0 20px;font-size:15px;line-height:1.6;">Hi ${opts.firstName}, confirm your email address to finish setting up your account.</p>
       ${button(url, 'Confirm email address')}
       <p style="margin:16px 0 0;font-size:13px;color:#6b7280;">This link expires in ${opts.expiresInMinutes} minutes. If you did not create an account, you can safely ignore this email.</p>`,
    ),
  });
}

// ── Password reset ───────────────────────────────────────────────────────────

export async function sendPasswordResetEmail(opts: {
  to: string;
  firstName: string;
  token: string;
  expiresInMinutes: number;
}): Promise<void> {
  const url = `${env.FRONTEND_URL}/reset-password?token=${encodeURIComponent(opts.token)}`;

  await sendDirectMail({
    to: opts.to,
    subject: `Reset your password`,
    text: [
      `Hi ${opts.firstName},`,
      ``,
      `We received a request to reset your ${BRAND} password. Use the link below:`,
      url,
      ``,
      `This link expires in ${opts.expiresInMinutes} minutes and can only be used once.`,
      `If you did not request this, no action is needed — your password has not changed.`,
    ].join('\n'),
    html: wrap(
      'Reset your password',
      `<p style="margin:0 0 20px;font-size:15px;line-height:1.6;">Hi ${opts.firstName}, we received a request to reset your password.</p>
       ${button(url, 'Reset password')}
       <p style="margin:16px 0 0;font-size:13px;color:#6b7280;">This link expires in ${opts.expiresInMinutes} minutes and can only be used once. If you did not request this, no action is needed — your password has not changed.</p>`,
    ),
  });
}

// ── Two-step verification code ───────────────────────────────────────────────

export async function sendTwoFactorCodeEmail(opts: {
  to: string;
  firstName: string;
  code: string;
  expiresInMinutes: number;
}): Promise<void> {
  await sendDirectMail({
    to: opts.to,
    subject: `${opts.code} is your sign-in code`,
    text: [
      `Hi ${opts.firstName},`,
      ``,
      `Your ${BRAND} sign-in code is: ${opts.code}`,
      ``,
      `It expires in ${opts.expiresInMinutes} minutes.`,
      `If you did not try to sign in, change your password immediately — someone else may know it.`,
    ].join('\n'),
    html: wrap(
      'Your sign-in code',
      `<p style="margin:0 0 20px;font-size:15px;line-height:1.6;">Hi ${opts.firstName}, enter this code to finish signing in.</p>
       ${codeBlock(opts.code)}
       <p style="margin:0;font-size:13px;color:#6b7280;">It expires in ${opts.expiresInMinutes} minutes. If you did not try to sign in, change your password immediately — someone else may know it.</p>`,
    ),
  });
}

// ── Account approved (self-registered users) ─────────────────────────────────

export async function sendAccountApprovedEmail(opts: {
  to: string;
  firstName: string;
  institutionName: string;
}): Promise<void> {
  const url = `${env.FRONTEND_URL}/login`;

  await sendDirectMail({
    to: opts.to,
    subject: `Your account has been approved`,
    text: [
      `Hi ${opts.firstName},`,
      ``,
      `Your account at ${opts.institutionName} has been approved. You can now sign in:`,
      url,
    ].join('\n'),
    html: wrap(
      'Your account has been approved',
      `<p style="margin:0 0 20px;font-size:15px;line-height:1.6;">Hi ${opts.firstName}, your account at <strong>${opts.institutionName}</strong> has been approved. You can sign in now.</p>
       ${button(url, 'Sign in')}`,
    ),
  });
}
