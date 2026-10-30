import { randomUUID } from 'crypto';
import { EmailPriority } from '@prisma/client';
import { sendEmail } from '../modules/email/sender';

// =============================================================================
// Back-compat shim + auth-mail entry point.
// =============================================================================
// The actual SMTP transport now lives in modules/email/transport.ts (moved
// there to avoid a require cycle: this file -> sender.ts -> transport.ts ->
// (would-be) back to this file). Re-exported here so existing imports of
// getTransport/resetTransport from 'utils/mailer' keep working unchanged.
export { getTransport, resetTransport } from '../modules/email/transport';

export interface DirectMail {
  to: string;
  subject: string;
  text: string;
  html?: string;
  /** Defaults to P0_SECURITY — this function is still only called by auth flows and a couple of one-off staff notices. */
  priority?: EmailPriority;
  template?: string;
  institutionId?: string | null;
}

/**
 * Send to an arbitrary address, bypassing the tenant-scoped notification
 * pipeline. Auth flows need to know immediately whether the mail went out —
 * this throws on any non-SENT outcome (FAILED, SUPPRESSED, DEFERRED) so the
 * caller can tell the user to retry rather than silently stranding them
 * mid-signup. SKIPPED (honest demo mode) does NOT throw: that is expected,
 * intentional local-dev behaviour, not an error.
 */
export async function sendDirectMail(mail: DirectMail): Promise<void> {
  const template = mail.template ?? 'direct-mail';
  const result = await sendEmail({
    to: mail.to,
    subject: mail.subject,
    text: mail.text,
    html: mail.html ?? `<pre>${mail.text}</pre>`,
    template,
    priority: mail.priority ?? EmailPriority.P0_SECURITY,
    institutionId: mail.institutionId ?? null,
    // P0: every direct (auth) mail is its own send. A second password reset,
    // 2FA code or verification email to the same address must go out — never
    // be deduped against the first. Sent synchronously, never via the queue,
    // so it works with BACKGROUND_JOBS=false too. Budget (P0 reserve) and
    // suppression checks inside sendEmail() still apply.
    idempotencyKey: `direct:${template}:${randomUUID()}`,
  });

  if (result.status === 'SKIPPED') return;
  if (!result.ok) {
    throw new Error(`Email delivery did not complete (${result.status}): ${result.error ?? 'unknown reason'}`);
  }
}
