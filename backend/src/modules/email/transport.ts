import nodemailer, { Transporter } from 'nodemailer';
import { env } from '../../config/env';

// =============================================================================
// Low-level transport: Brevo REST API when BREVO_API_KEY is set, otherwise a
// cached nodemailer SMTP transport, otherwise "demo" (caller never reaches
// this file in demo mode; see sender.ts).
//
// The SMTP transport is owned HERE (not utils/mailer.ts) specifically to
// avoid a require cycle: utils/mailer.ts's sendDirectMail() calls into
// sender.ts, which calls into this file — if this file called back into
// utils/mailer.ts too, that would close the loop. utils/mailer.ts re-exports
// getTransport/resetTransport from here for the modules that still import
// them from their historical location.
// =============================================================================

let cachedTransport: Transporter | null = null;

/**
 * A real SMTP transport when EMAIL_ENABLED=true, otherwise nodemailer's
 * jsonTransport — which renders the message and returns it as JSON without
 * opening a socket. Kept even though sender.ts never calls sendMail in demo
 * mode, so tests that reach for a transport directly still get a hermetic one.
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

export type TransportMode = 'brevo-api' | 'smtp' | 'demo';

/** What's actually configured right now — used by both send-time selection and the admin status screen. */
export function currentTransportMode(): TransportMode {
  if (env.BREVO_API_KEY) return 'brevo-api';
  if (env.EMAIL_ENABLED && env.SMTP_HOST) return 'smtp';
  return 'demo';
}

export interface Address {
  email: string;
  name?: string;
}

export interface Attachment {
  filename: string;
  /** Raw bytes — encoded to base64 for the Brevo API, passed through as-is to nodemailer. */
  content: Buffer;
  contentType?: string;
}

export interface SendPayload {
  from: Address;
  to: Address;
  replyTo?: Address;
  subject: string;
  html: string;
  text: string;
  tags?: string[];
  /** Surfaced back on the Brevo webhook payload so events can be matched to our own EmailLog row. */
  emailLogId: string;
  attachments?: Attachment[];
  /** RFC 8058 one-click unsubscribe headers — campaigns only. */
  listUnsubscribe?: { mailto?: string; url?: string };
}

export interface SendOutcome {
  ok: boolean;
  messageId?: string;
  error?: string;
}

const BREVO_ENDPOINT = 'https://api.brevo.com/v3/smtp/email';

function extraHeaders(payload: SendPayload): Record<string, string> {
  const headers: Record<string, string> = { 'X-Mailin-custom': payload.emailLogId };
  if (payload.listUnsubscribe) {
    const parts: string[] = [];
    if (payload.listUnsubscribe.mailto) parts.push(`<mailto:${payload.listUnsubscribe.mailto}>`);
    if (payload.listUnsubscribe.url) parts.push(`<${payload.listUnsubscribe.url}>`);
    if (parts.length) {
      headers['List-Unsubscribe'] = parts.join(', ');
      if (payload.listUnsubscribe.url) {
        headers['List-Unsubscribe-Post'] = 'List-Unsubscribe=One-Click';
      }
    }
  }
  return headers;
}

async function sendViaBrevoApi(payload: SendPayload): Promise<SendOutcome> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), env.EMAIL_TIMEOUT_MS);
  try {
    const res = await fetch(BREVO_ENDPOINT, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'api-key': env.BREVO_API_KEY as string,
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify({
        sender: { name: payload.from.name, email: payload.from.email },
        to: [{ email: payload.to.email, name: payload.to.name }],
        ...(payload.replyTo ? { replyTo: { email: payload.replyTo.email, name: payload.replyTo.name } } : {}),
        subject: payload.subject,
        htmlContent: payload.html,
        textContent: payload.text,
        tags: payload.tags?.slice(0, 10),
        headers: extraHeaders(payload),
        ...(payload.attachments?.length
          ? {
              attachment: payload.attachments.map((a) => ({
                name: a.filename,
                content: a.content.toString('base64'),
              })),
            }
          : {}),
      }),
    });

    const body = (await res.json().catch(() => ({}))) as { messageId?: string; message?: string };
    if (!res.ok) {
      return { ok: false, error: `Brevo API ${res.status}: ${body.message ?? JSON.stringify(body)}` };
    }
    return { ok: true, messageId: body.messageId };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, error: `Brevo API request failed: ${message}` };
  } finally {
    clearTimeout(timer);
  }
}

async function sendViaSmtp(payload: SendPayload): Promise<SendOutcome> {
  try {
    const info = await withTimeout(
      getTransport().sendMail({
        from: payload.from.name ? `${payload.from.name} <${payload.from.email}>` : payload.from.email,
        to: payload.to.name ? `${payload.to.name} <${payload.to.email}>` : payload.to.email,
        ...(payload.replyTo ? { replyTo: payload.replyTo.name ? `${payload.replyTo.name} <${payload.replyTo.email}>` : payload.replyTo.email } : {}),
        subject: payload.subject,
        html: payload.html,
        text: payload.text,
        headers: extraHeaders(payload),
        ...(payload.attachments?.length
          ? { attachments: payload.attachments.map((a) => ({ filename: a.filename, content: a.content, contentType: a.contentType })) }
          : {}),
      }),
      env.EMAIL_TIMEOUT_MS,
    );
    return { ok: true, messageId: info.messageId };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, error: `SMTP send failed: ${message}` };
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`SMTP send timed out after ${ms}ms`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

/** Dispatches through whichever transport is configured. Never throws — always resolves to a SendOutcome. */
export async function dispatch(payload: SendPayload): Promise<{ provider: 'brevo-api' | 'smtp' } & SendOutcome> {
  const mode = currentTransportMode();
  if (mode === 'brevo-api') {
    return { provider: 'brevo-api', ...(await sendViaBrevoApi(payload)) };
  }
  return { provider: 'smtp', ...(await sendViaSmtp(payload)) };
}
