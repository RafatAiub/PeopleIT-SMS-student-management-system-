import https from 'https';
import dns from 'dns';
import type { LookupFunction } from 'net';
import { randomUUID } from 'crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { logger } from '../../utils/logger';
import { isMissingSchemaError } from '../../utils/schemaMissing';
import {
  buildEnvelope,
  checkWebhookUrl,
  computeBackoffMs,
  isPrivateIp,
  MAX_DELIVERY_ATTEMPTS,
  shouldRetry,
  signPayload,
  SIGNATURE_HEADER,
  type WebhookEvent,
} from './webhooks.logic';

// =============================================================================
// Webhook dispatcher — in-process, fire-and-forget.
//
//   emitWebhook(institutionId, event, data)
//     Never throws, never awaits anything on the caller's path. Looks up the
//     tenant's active endpoints subscribed to `event` and delivers to each.
//
// Delivery: HTTPS POST, 10 s timeout, no redirects, HMAC-SHA256 signature.
// Every resolved IP is checked at connect time (custom DNS lookup), so a
// hostname that later re-points at 127.0.0.1 / 10.x / 169.254.169.254 is
// refused (DNS-rebinding safe). Failed transient attempts are retried with
// exponential backoff up to MAX_DELIVERY_ATTEMPTS (5). One WebhookDelivery
// row is written per attempt.
//
// Limitation (documented in OPERATIONS.md): retries are in-memory timers, so
// pending retries are lost if the process restarts. The delivery log shows
// the last attempt and admins can press "Redeliver".
// =============================================================================

export interface DeliveryEnvelope {
  id: string;
  event: string;
  createdAt: string;
  institutionId: string;
  data: unknown;
}

export interface AttemptResult {
  success: boolean;
  statusCode: number | null;
  error: string | null;
  durationMs: number;
  deliveryId: string | null;
}

const REQUEST_TIMEOUT_MS = 10_000;
const MAX_CONCURRENT = 10;
const RESPONSE_SNIPPET_BYTES = 500;

// ── Tiny concurrency limiter so a burst of events can't open hundreds of sockets.
let active = 0;
const waiting: Array<() => void> = [];
async function withSlot<T>(fn: () => Promise<T>): Promise<T> {
  if (active >= MAX_CONCURRENT) await new Promise<void>((resolve) => waiting.push(resolve));
  active++;
  try {
    return await fn();
  } finally {
    active--;
    waiting.shift()?.();
  }
}

/** DNS lookup that refuses any private / loopback / link-local address. */
const safeLookup = ((hostname: string, options: dns.LookupOptions, callback: (...args: unknown[]) => void) => {
  dns.lookup(hostname, { all: true, verbatim: true }, (err, addresses) => {
    if (err) return callback(err);
    const list = addresses as dns.LookupAddress[];
    if (!list.length) return callback(new Error(`No addresses for ${hostname}`));
    const blocked = list.find((a) => isPrivateIp(a.address));
    if (blocked) {
      return callback(Object.assign(new Error(`Refusing to connect to non-public address ${blocked.address}`), { code: 'EBLOCKED' }));
    }
    if (options && options.all) return callback(null, list);
    return callback(null, list[0].address, list[0].family);
  });
}) as unknown as LookupFunction;

function postJson(url: string, body: string, headers: Record<string, string>): Promise<{ statusCode: number | null; error: string | null; snippet: string | null }> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value: { statusCode: number | null; error: string | null; snippet: string | null }) => {
      if (!settled) {
        settled = true;
        resolve(value);
      }
    };
    try {
      const req = https.request(
        url,
        {
          method: 'POST',
          headers: { ...headers, 'Content-Length': Buffer.byteLength(body).toString() },
          timeout: REQUEST_TIMEOUT_MS,
          lookup: safeLookup,
          agent: false,
        },
        (res) => {
          const chunks: Buffer[] = [];
          let size = 0;
          res.on('data', (chunk: Buffer) => {
            if (size < RESPONSE_SNIPPET_BYTES) {
              chunks.push(chunk);
              size += chunk.length;
            }
          });
          const done = () =>
            finish({
              statusCode: res.statusCode ?? null,
              error: null,
              snippet: Buffer.concat(chunks).toString('utf8').slice(0, RESPONSE_SNIPPET_BYTES) || null,
            });
          res.on('end', done);
          res.on('error', done);
          res.on('close', done);
        },
      );
      req.on('timeout', () => {
        req.destroy(new Error(`Timed out after ${REQUEST_TIMEOUT_MS / 1000}s`));
      });
      req.on('error', (err) => finish({ statusCode: null, error: err.message, snippet: null }));
      req.end(body);
    } catch (err) {
      finish({ statusCode: null, error: err instanceof Error ? err.message : String(err), snippet: null });
    }
  });
}

/**
 * One delivery attempt to one endpoint. Re-reads the endpoint so a deleted,
 * disabled or re-pointed endpoint is honoured by pending retries.
 */
export async function attemptDelivery(
  webhookId: string,
  envelope: DeliveryEnvelope,
  attempt: number,
  opts: { allowRetry: boolean; ignoreInactive?: boolean } = { allowRetry: true },
): Promise<AttemptResult> {
  const endpoint = await prisma.webhookEndpoint.findUnique({
    where: { id: webhookId },
    select: { id: true, url: true, secret: true, isActive: true, institutionId: true },
  });
  if (!endpoint || endpoint.institutionId !== envelope.institutionId || (!endpoint.isActive && !opts.ignoreInactive)) {
    return { success: false, statusCode: null, error: 'Endpoint no longer active', durationMs: 0, deliveryId: null };
  }

  const started = Date.now();
  let result: { statusCode: number | null; error: string | null; snippet: string | null };
  const urlCheck = checkWebhookUrl(endpoint.url);
  if (!urlCheck.ok) {
    result = { statusCode: null, error: urlCheck.reason, snippet: null };
  } else {
    const body = JSON.stringify(envelope);
    const timestamp = Math.floor(Date.now() / 1000);
    result = await withSlot(() =>
      postJson(endpoint.url, body, {
        'Content-Type': 'application/json',
        'User-Agent': 'PeopleNIT-Webhooks/1.0',
        'X-PeopleNIT-Event': envelope.event,
        'X-PeopleNIT-Delivery': envelope.id,
        'X-PeopleNIT-Attempt': String(attempt),
        'X-PeopleNIT-Timestamp': String(timestamp),
        [SIGNATURE_HEADER]: signPayload(endpoint.secret, body, timestamp),
      }),
    );
  }
  const durationMs = Date.now() - started;
  const success = result.statusCode !== null && result.statusCode >= 200 && result.statusCode < 300;
  const error = success ? null : result.error ?? `Receiver responded with HTTP ${result.statusCode}`;

  let deliveryId: string | null = null;
  try {
    const row = await prisma.webhookDelivery.create({
      data: {
        webhookId: endpoint.id,
        event: envelope.event,
        attempt,
        success,
        statusCode: result.statusCode,
        payload: {
          envelope: envelope as unknown as Prisma.InputJsonValue,
          error,
          durationMs,
          response: result.snippet,
        } as Prisma.InputJsonObject,
      },
      select: { id: true },
    });
    deliveryId = row.id;
  } catch (err) {
    logger.error('Webhook: failed to write delivery log', { webhookId, error: err instanceof Error ? err.message : String(err) });
  }

  if (!success && opts.allowRetry && shouldRetry(result.statusCode, attempt)) {
    const delay = computeBackoffMs(attempt + 1, Math.random());
    const timer = setTimeout(() => {
      attemptDelivery(webhookId, envelope, attempt + 1, opts).catch((err) =>
        logger.error('Webhook retry crashed', { webhookId, error: err instanceof Error ? err.message : String(err) }),
      );
    }, delay);
    timer.unref();
  } else if (!success && attempt >= MAX_DELIVERY_ATTEMPTS) {
    logger.warn('Webhook delivery gave up after max attempts', { webhookId, event: envelope.event, envelopeId: envelope.id });
  }

  return { success, statusCode: result.statusCode, error, durationMs, deliveryId };
}

export function newEnvelope(institutionId: string, event: string, data: unknown): DeliveryEnvelope {
  return buildEnvelope({ id: `evt_${randomUUID()}`, event, institutionId, data, createdAt: new Date() });
}

async function dispatch(institutionId: string, event: WebhookEvent, data: unknown): Promise<void> {
  let endpoints: { id: string }[];
  try {
    endpoints = await prisma.webhookEndpoint.findMany({
      where: { institutionId, isActive: true, events: { has: event } },
      select: { id: true },
    });
  } catch (err) {
    if (isMissingSchemaError(err)) return; // migration not applied yet — webhooks simply off
    throw err;
  }
  if (!endpoints.length) return;
  const envelope = newEnvelope(institutionId, event, data);
  await Promise.all(endpoints.map((e) => attemptDelivery(e.id, envelope, 1)));
}

/**
 * Fire-and-forget. Safe to call right after a successful write in any
 * controller/service: it returns immediately, never throws and never delays
 * or alters the HTTP response.
 */
export function emitWebhook(institutionId: string | undefined | null, event: WebhookEvent, data: unknown): void {
  if (!institutionId) return;
  try {
    setImmediate(() => {
      dispatch(institutionId, event, data).catch((err) =>
        logger.error('Webhook dispatch failed', { institutionId, event, error: err instanceof Error ? err.message : String(err) }),
      );
    });
  } catch {
    // never let webhook plumbing affect the caller
  }
}
