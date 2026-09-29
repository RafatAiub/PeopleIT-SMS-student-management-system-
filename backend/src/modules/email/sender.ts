import crypto from 'crypto';
import { EmailPriority } from '@prisma/client';
import { env } from '../../config/env';
import { logger } from '../../utils/logger';
import { hashEmail, maskEmail, normalizeEmail } from './mask';
import * as repo from './repository';
import { checkSuppressed } from './suppression';
import { reserveBudgetSlot } from './budget';
import { currentTransportMode, dispatch, type Attachment, type Address } from './transport';
import { clearDeferred, stashDeferred } from './deferredStore';

// =============================================================================
// The one function every outbound email in the system must call. Owns:
//   - suppression check (ALL always, BULK for P2_BULK sends)
//   - daily budget / priority (P0 always, P1/P2 share the non-reserved pool)
//   - transport selection (Brevo API / SMTP / demo) via transport.ts
//   - EmailLog on every attempt (queued -> sent/failed/skipped/suppressed/deferred)
//   - idempotency (idempotencyKey unique on EmailLog — a repeat is a no-op,
//     not a second send)
// =============================================================================

export interface SendEmailInput {
  to: string;
  toName?: string;
  subject: string;
  html: string;
  text: string;
  /** Template key — becomes an EmailLog column and a Brevo tag. */
  template: string;
  priority: EmailPriority;
  institutionId?: string | null;
  /** Per-school display name (falls back to PLATFORM_BRAND.name via callers). */
  fromName?: string;
  /** Per-school reply-to (falls back to EMAIL_REPLY_TO / no reply-to). */
  replyTo?: string;
  tags?: string[];
  /** Stable across retries of the "same" logical send — dedupes at the EmailLog level. Auto-derived when omitted. */
  idempotencyKey?: string;
  attachments?: Attachment[];
  /** RFC 8058 List-Unsubscribe — campaigns only. */
  listUnsubscribe?: { mailto?: string; url?: string };
}

export interface SendEmailResult {
  ok: boolean;
  status: 'SENT' | 'SKIPPED' | 'SUPPRESSED' | 'DEFERRED' | 'FAILED';
  logId: string;
  error?: string;
}

function parseFrom(): Address {
  // env.EMAIL_FROM is "Name <email>" or a bare email.
  const match = env.EMAIL_FROM.match(/^(.*?)\s*<([^>]+)>\s*$/);
  if (match) return { name: match[1].replace(/^"|"$/g, '').trim() || undefined, email: match[2].trim() };
  return { email: env.EMAIL_FROM.trim() };
}

function defaultIdempotencyKey(input: SendEmailInput): string {
  return crypto
    .createHash('sha256')
    .update([input.template, normalizeEmail(input.to), input.subject].join('|'))
    .digest('hex');
}

/**
 * Sends one email. Never throws — every outcome (including a hard transport
 * failure) is reported in the returned result AND persisted to EmailLog.
 * Callers that must react to failure (e.g. auth flows) should check `.ok`.
 */
export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const to = normalizeEmail(input.to);
  const toHash = hashEmail(to);
  const toMasked = maskEmail(to);
  const idempotencyKey = input.idempotencyKey ?? defaultIdempotencyKey(input);
  const isBulk = input.priority === EmailPriority.P2_BULK;

  // Idempotency: a prior SENT attempt with the same key is a no-op replay.
  const existing = await repo.findByIdempotencyKey(idempotencyKey).catch(() => null);
  if (existing && existing.status === 'SENT') {
    return { ok: true, status: 'SENT', logId: existing.id };
  }

  const log =
    existing ??
    (await repo.createQueuedLog({
      institutionId: input.institutionId,
      template: input.template,
      priority: input.priority,
      toHash,
      toMasked,
      subject: input.subject,
      idempotencyKey,
      tags: input.tags ?? [],
    }));

  // 1. Suppression — checked before spending any budget.
  const suppression = await checkSuppressed(to, { isBulk });
  if (suppression.suppressed) {
    await clearDeferred(log.id);
    await repo.markSuppressed(log.id, `${suppression.scope} suppression: ${suppression.reason}`);
    logger.info('Email suppressed', { template: input.template, toMasked, scope: suppression.scope, reason: suppression.reason });
    return { ok: false, status: 'SUPPRESSED', logId: log.id, error: `suppressed (${suppression.reason})` };
  }

  // 2. Transport mode — honest demo mode records SKIPPED, never SENT.
  const mode = currentTransportMode();
  if (mode === 'demo') {
    await repo.markSkipped(log.id, 'demo mode — EMAIL_ENABLED/BREVO_API_KEY not configured');
    if (env.NODE_ENV !== 'production') {
      console.log(
        `\n${'─'.repeat(64)}\n  DEV MAIL (demo) → ${to}\n  ${input.subject}\n${'─'.repeat(64)}\n${input.text}\n${'─'.repeat(64)}\n`,
      );
    }
    logger.info('[EMAIL demo] rendered but not transmitted', { template: input.template, toMasked, subject: input.subject });
    return { ok: false, status: 'SKIPPED', logId: log.id };
  }

  // 3. Daily budget / priority.
  const budget = await reserveBudgetSlot(input.priority);
  if (!budget.allowed) {
    await repo.markDeferred(log.id, budget.notBefore!, 'daily email budget spent — deferred to next UTC day');
    // Stashed with the idempotencyKey baked back in so a retry lands on this
    // same EmailLog row instead of creating a new one.
    await stashDeferred(log.id, { ...input, idempotencyKey });
    logger.warn('Email deferred (daily budget spent)', { template: input.template, priority: input.priority, toMasked });
    return { ok: false, status: 'DEFERRED', logId: log.id, error: 'daily budget spent' };
  }

  // 4. Actually send.
  const from = parseFrom();
  const fromName = input.fromName?.trim() || from.name;
  const outcome = await dispatch({
    from: { email: from.email, name: fromName },
    to: { email: to, name: input.toName },
    replyTo: input.replyTo ? { email: input.replyTo } : env.EMAIL_REPLY_TO ? { email: env.EMAIL_REPLY_TO } : undefined,
    subject: input.subject,
    html: input.html,
    text: input.text,
    tags: [input.template, ...(input.tags ?? [])].filter(Boolean),
    emailLogId: log.id,
    attachments: input.attachments,
    listUnsubscribe: input.listUnsubscribe,
  });

  if (outcome.ok) {
    await repo.markSent(log.id, outcome.provider, outcome.messageId);
    await clearDeferred(log.id);
    logger.info('Email sent', { template: input.template, provider: outcome.provider, toMasked, priority: input.priority });
    return { ok: true, status: 'SENT', logId: log.id };
  }

  await clearDeferred(log.id);
  await repo.markFailed(log.id, outcome.provider, outcome.error ?? 'unknown transport error');
  logger.error('Email send failed', { template: input.template, provider: outcome.provider, toMasked, error: outcome.error });
  return { ok: false, status: 'FAILED', logId: log.id, error: outcome.error };
}
