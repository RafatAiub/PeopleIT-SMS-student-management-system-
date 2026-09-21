import nodemailer, { Transporter } from 'nodemailer';
import { env } from '../config/env';
import { logger } from './logger';

// =============================================================================
// Shared SMTP transport + direct send
// =============================================================================
// The notification pipeline (notify()) can only reach a User inside an
// institution. Auth mail cannot live there: a verification link goes out
// *before* the account is usable, and a password-reset link may go to someone
// who is locked out. So auth sends directly, through the same transport.

let cachedTransport: Transporter | null = null;

/**
 * A real SMTP transport when EMAIL_ENABLED=true, otherwise nodemailer's
 * jsonTransport — which renders the message and returns it as JSON without
 * opening a socket. That keeps tests hermetic and lets the whole pipeline be
 * exercised end-to-end before any provider credentials exist.
 */
export function getTransport(): Transporter {
  if (cachedTransport) return cachedTransport;

  cachedTransport =
    env.EMAIL_ENABLED && env.SMTP_HOST
      ? nodemailer.createTransport({
          host: env.SMTP_HOST,
          port: env.SMTP_PORT,
          secure: env.SMTP_SECURE,
          auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
        })
      : nodemailer.createTransport({ jsonTransport: true });

  return cachedTransport;
}

/** Exposed for tests, which flip env between cases. */
export function resetTransport(): void {
  cachedTransport = null;
}

export interface DirectMail {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

/**
 * Send to an arbitrary address, bypassing the tenant-scoped notification
 * pipeline. Throws on failure — unlike the notification channel, auth flows
 * need to know immediately whether the mail went out, so the caller can tell
 * the user to retry rather than silently stranding them mid-signup.
 */
export async function sendDirectMail(mail: DirectMail): Promise<void> {
  try {
    await getTransport().sendMail({
      from: env.EMAIL_FROM,
      to: mail.to,
      subject: mail.subject,
      text: mail.text,
      ...(mail.html ? { html: mail.html } : {}),
    });

    if (!env.EMAIL_ENABLED) {
      // Subject only — auth bodies carry live tokens and codes, which must
      // never reach the log files.
      logger.info('[EMAIL disabled] auth mail rendered but not transmitted', {
        to: mail.to,
        subject: mail.subject,
      });

      // Outside production, print the body to the console as well. Without a
      // mail server there is otherwise no way to reach a verification link or
      // a sign-in code, which makes the whole flow untestable locally. The
      // NODE_ENV guard is what keeps live tokens out of real logs — do not
      // relax it to a mere EMAIL_ENABLED check.
      if (env.NODE_ENV !== 'production') {
        // eslint-disable-next-line no-console
        console.log(
          `\n${'─'.repeat(64)}\n  DEV MAIL → ${mail.to}\n  ${mail.subject}\n${'─'.repeat(64)}\n${mail.text}\n${'─'.repeat(64)}\n`,
        );
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('Auth mail delivery failed', { to: mail.to, subject: mail.subject, error: message });
    throw error;
  }
}
