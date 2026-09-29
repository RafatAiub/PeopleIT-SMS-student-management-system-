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
  const result = await sendEmail({
    to: mail.to,
    subject: mail.subject,
    text: mail.text,
    html: mail.html ?? `<pre>${mail.text}</pre>`,
    template: mail.template ?? 'direct-mail',
    priority: mail.priority ?? EmailPriority.P0_SECURITY,
    institutionId: mail.institutionId ?? null,
  });

  if (result.status === 'SKIPPED') return;
  if (!result.ok) {
    throw new Error(`Email delivery did not complete (${result.status}): ${result.error ?? 'unknown reason'}`);
  }
}
