import { NotificationChannel } from '@prisma/client';
import { RenderedMessage } from '../renderer';

export interface RecipientContact {
  userId: string;
  name: string;
  email?: string | null;
  phone?: string | null;
}

export interface SendResult {
  ok: boolean;
  /** Provider-side message id, when the channel returns one. */
  providerRef?: string;
  error?: string;
}

export interface SendContext {
  institutionId: string;
  templateKey: string;
  /** Deep-link payload persisted on the in-app record. */
  data?: Record<string, unknown>;
}

/**
 * Every delivery channel implements this. Adapters must:
 *   - return a structured SendResult rather than throwing on a provider error
 *     (the worker decides what is retryable);
 *   - be safe to call twice — the worker guards idempotency, but an adapter
 *     must never assume it is called exactly once;
 *   - never log credentials or full message bodies containing PII.
 */
export interface NotificationChannelAdapter {
  readonly channel: NotificationChannel;
  /** False when the channel lacks credentials/config — delivery is SKIPPED, not FAILED. */
  isConfigured(): boolean;
  /** The address this channel delivers to; null means "cannot reach this user here". */
  addressFor(to: RecipientContact): string | null;
  send(to: RecipientContact, message: RenderedMessage, ctx: SendContext): Promise<SendResult>;
}
