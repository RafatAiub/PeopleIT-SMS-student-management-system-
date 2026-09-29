import { env } from '../../config/env';
import { prisma } from '../../config/prisma';
import { sendDirectMail } from '../../utils/mailer';
import {
  accountApprovedEmail,
  passwordResetEmail,
  twoFactorCodeEmail,
  verificationEmail,
  type MailLang,
} from '../email/templates/auth.templates';

// =============================================================================
// Auth email senders — thin wrappers around modules/email/templates/auth.templates.ts
// =============================================================================
// Deliberately NOT wired through the tenant notification pipeline
// (modules/notifications). Those templates are institution-scoped and
// admin-editable; these are security mail whose wording and links must not be
// tenant-overridable — an editable password-reset template is a phishing
// vector. Every message ships both text and HTML: some institution mail
// servers strip HTML, and a verification link that arrives unclickable is a
// dead signup.

/**
 * Resolves which language to send auth mail in: the user's institution's
 * `defaultLanguage` (Institution.defaultLanguage, e.g. "bn") when known,
 * otherwise English. There is no per-user language preference in the schema
 * today — institution default is the best signal available. A missing/
 * unrecognised institutionId (SUPER_ADMIN accounts, or the split second
 * before an institution row is fully committed) safely falls back to 'en'.
 */
async function resolveLang(institutionId: string | null | undefined): Promise<MailLang> {
  if (!institutionId) return 'en';
  try {
    const institution = await prisma.institution.findUnique({ where: { id: institutionId }, select: { defaultLanguage: true } });
    return institution?.defaultLanguage === 'bn' ? 'bn' : 'en';
  } catch {
    return 'en';
  }
}

// ── Email verification ───────────────────────────────────────────────────────

export async function sendVerificationEmail(opts: {
  to: string;
  firstName: string;
  token: string;
  expiresInMinutes: number;
  institutionId?: string | null;
}): Promise<void> {
  const url = `${env.FRONTEND_URL}/verify-email?token=${encodeURIComponent(opts.token)}`;
  const lang = await resolveLang(opts.institutionId);
  const mail = verificationEmail({ to: opts.to, firstName: opts.firstName, url, expiresInMinutes: opts.expiresInMinutes, lang });
  await sendDirectMail({ to: opts.to, subject: mail.subject, text: mail.text, html: mail.html, template: 'auth.verify-email', institutionId: opts.institutionId });
}

// ── Password reset ───────────────────────────────────────────────────────────

export async function sendPasswordResetEmail(opts: {
  to: string;
  firstName: string;
  token: string;
  expiresInMinutes: number;
  institutionId?: string | null;
}): Promise<void> {
  const url = `${env.FRONTEND_URL}/reset-password?token=${encodeURIComponent(opts.token)}`;
  const lang = await resolveLang(opts.institutionId);
  const mail = passwordResetEmail({ to: opts.to, firstName: opts.firstName, url, expiresInMinutes: opts.expiresInMinutes, lang });
  await sendDirectMail({ to: opts.to, subject: mail.subject, text: mail.text, html: mail.html, template: 'auth.password-reset', institutionId: opts.institutionId });
}

// ── Two-step verification code ───────────────────────────────────────────────

export async function sendTwoFactorCodeEmail(opts: {
  to: string;
  firstName: string;
  code: string;
  expiresInMinutes: number;
  institutionId?: string | null;
}): Promise<void> {
  const lang = await resolveLang(opts.institutionId);
  const mail = twoFactorCodeEmail({ ...opts, lang });
  await sendDirectMail({ to: opts.to, subject: mail.subject, text: mail.text, html: mail.html, template: 'auth.two-factor-code', institutionId: opts.institutionId });
}

// ── Account approved (self-registered users) ─────────────────────────────────

export async function sendAccountApprovedEmail(opts: {
  to: string;
  firstName: string;
  institutionName: string;
  institutionId?: string | null;
}): Promise<void> {
  const loginUrl = `${env.FRONTEND_URL}/login`;
  const lang = await resolveLang(opts.institutionId);
  const mail = accountApprovedEmail({ ...opts, loginUrl, lang });
  await sendDirectMail({ to: opts.to, subject: mail.subject, text: mail.text, html: mail.html, template: 'auth.account-approved', institutionId: opts.institutionId });
}
