import { EmailPriority } from '@prisma/client';
import { getRedis } from '../../config/redis';
import { logger } from '../../utils/logger';
import type { SendEmailInput } from './sender';

// =============================================================================
// Re-send payload for a DEFERRED EmailLog row.
//
// EmailLog deliberately stores no message content or plain address (privacy —
// see repository.ts). But the deferred-retry job (scheduler.ts) needs the
// exact original input to try again once the next UTC day's budget opens up.
// That transient, retry-only payload lives in Redis, keyed by EmailLog id,
// with a TTL — never in Postgres. Losing it (Redis flushed, TTL elapsed) just
// means that one deferred send fails permanently instead of retrying; it is
// never the only record that a send was attempted (EmailLog still has that).
// =============================================================================

const TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days — generously outlives a same-day repeat deferral

function key(logId: string): string {
  return `email:deferred:${logId}`;
}

interface StoredPayload extends Omit<SendEmailInput, 'attachments' | 'priority'> {
  priority: EmailPriority;
  attachments?: { filename: string; content: string; contentType?: string }[];
}

export async function stashDeferred(logId: string, input: SendEmailInput): Promise<void> {
  try {
    const stored: StoredPayload = {
      ...input,
      attachments: input.attachments?.map((a) => ({
        filename: a.filename,
        content: a.content.toString('base64'),
        contentType: a.contentType,
      })),
    };
    await getRedis().set(key(logId), JSON.stringify(stored), 'EX', TTL_SECONDS);
  } catch (error) {
    logger.warn('Could not stash deferred email payload — this send will not auto-retry', {
      logId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function loadDeferred(logId: string): Promise<SendEmailInput | null> {
  try {
    const raw = await getRedis().get(key(logId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredPayload;
    return {
      ...parsed,
      attachments: parsed.attachments?.map((a) => ({
        filename: a.filename,
        content: Buffer.from(a.content, 'base64'),
        contentType: a.contentType,
      })),
    };
  } catch (error) {
    logger.warn('Failed to load deferred email payload', { logId, error: error instanceof Error ? error.message : String(error) });
    return null;
  }
}

export async function clearDeferred(logId: string): Promise<void> {
  await getRedis().del(key(logId)).catch(() => undefined);
}
