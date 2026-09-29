// =============================================================================
// aiClient — the single server-side gateway to a language model.
//
// Provider order for every generation:
//   1. Anthropic Claude  (ANTHROPIC_API_KEY; model AI_MODEL / AI_MODEL_ADVANCED)
//   2. Google Gemini     (GEMINI_API_KEY; model GEMINI_MODEL)
//   3. Demo mode         — the caller's deterministic template, built from the
//                          institution's real data, returned with demo: true.
//
// An Anthropic auth failure (401/403) puts Anthropic in a 10-minute cooldown
// (logged once, never the key) so requests go straight to Gemini meanwhile.
// Any other Anthropic failure falls through to Gemini for that request. If
// every configured provider fails, the template is returned (demo: true) with
// `aiError` explaining why — a provider hiccup never breaks the screen.
//
// Every generation is logged to AiInteraction + UsageRecord(AI_CALL), with
// the provider+model actually used (e.g. "gemini:gemini-flash-lite-latest").
// Those tables arrive with the (not-yet-applied) Wave C migration, so logging
// failures are swallowed and never affect the response.
// =============================================================================

import Anthropic from '@anthropic-ai/sdk';
import { UsageMetric } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { logger } from '../../utils/logger';

export const DEFAULT_MODEL = 'claude-haiku-4-5';
export const DEFAULT_ADVANCED_MODEL = 'claude-sonnet-5';
export const DEFAULT_GEMINI_MODEL = 'gemini-flash-lite-latest';

export type AiProvider = 'anthropic' | 'gemini';

export interface AiConfig {
  /** At least one provider has a key. */
  configured: boolean;
  anthropicConfigured: boolean;
  geminiConfigured: boolean;
  /** Anthropic is configured but cooling down after an auth failure. */
  anthropicCoolingDown: boolean;
  model: string;
  advancedModel: string;
  geminiModel: string;
  timeoutMs: number;
  maxRetries: number;
}

const ANTHROPIC_COOLDOWN_MS = 10 * 60 * 1000;
let anthropicUnavailableUntil = 0;

export function getAiConfig(): AiConfig {
  const timeout = Number(process.env.AI_TIMEOUT_MS);
  const retries = Number(process.env.AI_MAX_RETRIES);
  const anthropicConfigured = Boolean(process.env.ANTHROPIC_API_KEY?.trim());
  const geminiConfigured = Boolean(process.env.GEMINI_API_KEY?.trim());
  return {
    configured: anthropicConfigured || geminiConfigured,
    anthropicConfigured,
    geminiConfigured,
    anthropicCoolingDown: anthropicConfigured && Date.now() < anthropicUnavailableUntil,
    model: process.env.AI_MODEL?.trim() || DEFAULT_MODEL,
    advancedModel: process.env.AI_MODEL_ADVANCED?.trim() || DEFAULT_ADVANCED_MODEL,
    geminiModel: process.env.GEMINI_MODEL?.trim() || DEFAULT_GEMINI_MODEL,
    timeoutMs: Number.isFinite(timeout) && timeout > 0 ? timeout : 30_000,
    maxRetries: Number.isFinite(retries) && retries >= 0 ? Math.min(retries, 5) : 2,
  };
}

/** Which provider a request would try first right now (for the status banner). */
export function activeProvider(cfg = getAiConfig()): { provider: AiProvider; model: string } | null {
  if (cfg.anthropicConfigured && !cfg.anthropicCoolingDown) return { provider: 'anthropic', model: cfg.model };
  if (cfg.geminiConfigured) return { provider: 'gemini', model: cfg.geminiModel };
  return null;
}

let cachedClient: { key: string; client: Anthropic } | null = null;

function getAnthropicClient(cfg: AiConfig): Anthropic {
  const key = process.env.ANTHROPIC_API_KEY!.trim();
  if (!cachedClient || cachedClient.key !== key) {
    cachedClient = { key, client: new Anthropic({ apiKey: key, timeout: cfg.timeoutMs, maxRetries: cfg.maxRetries }) };
  }
  return cachedClient.client;
}

export class AiProviderError extends Error {
  constructor(
    message: string,
    public readonly code: 'RATE_LIMITED' | 'AUTH' | 'BAD_REQUEST' | 'TIMEOUT' | 'CONNECTION' | 'REFUSED' | 'EMPTY' | 'API' | 'NOT_CONFIGURED',
  ) {
    super(message);
    this.name = 'AiProviderError';
  }
}

export interface CompletionResult {
  text: string;
  provider: AiProvider;
  /** Provider-qualified model id, e.g. "anthropic:claude-haiku-4-5". */
  model: string;
  inputTokens: number;
  outputTokens: number;
}

interface CompletionRequest {
  system: string;
  prompt: string;
  maxTokens?: number;
  advanced?: boolean;
}

/**
 * Claude via the official SDK. The system prompt is a cacheable block (stable
 * instructions first, volatile data in the user turn) so repeated calls can
 * reuse the prompt cache once prompts exceed the model's minimum cacheable length.
 */
async function completeAnthropic(cfg: AiConfig, opts: CompletionRequest): Promise<CompletionResult> {
  const model = opts.advanced ? cfg.advancedModel : cfg.model;
  // Models other than Haiku run adaptive thinking by default, which shares the
  // max_tokens budget — give them headroom so short answers aren't cut off.
  const base = opts.maxTokens ?? 800;
  const maxTokens = /haiku/.test(model) ? base : Math.max(base * 4, 4000);

  let response: Anthropic.Message;
  try {
    response = await getAnthropicClient(cfg).messages.create({
      model,
      max_tokens: maxTokens,
      system: [{ type: 'text', text: opts.system, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: opts.prompt }],
    });
  } catch (error) {
    if (error instanceof Anthropic.RateLimitError) throw new AiProviderError('Anthropic rate limit reached', 'RATE_LIMITED');
    if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) {
      throw new AiProviderError('Anthropic rejected the API key', 'AUTH');
    }
    if (error instanceof Anthropic.BadRequestError || error instanceof Anthropic.NotFoundError) {
      throw new AiProviderError(`Anthropic rejected the request: ${error.message}`, 'BAD_REQUEST');
    }
    if (error instanceof Anthropic.APIConnectionTimeoutError) throw new AiProviderError('Anthropic timed out', 'TIMEOUT');
    if (error instanceof Anthropic.APIConnectionError) throw new AiProviderError('Could not reach Anthropic', 'CONNECTION');
    if (error instanceof Anthropic.APIError) throw new AiProviderError(`Anthropic error (${error.status ?? 'unknown'})`, 'API');
    throw error;
  }

  if (response.stop_reason === 'refusal') throw new AiProviderError('The Claude model declined this request', 'REFUSED');
  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('')
    .trim();
  if (!text) throw new AiProviderError('Claude returned no text', 'EMPTY');

  return {
    text,
    provider: 'anthropic',
    model: `anthropic:${response.model}`,
    inputTokens:
      response.usage.input_tokens + (response.usage.cache_read_input_tokens ?? 0) + (response.usage.cache_creation_input_tokens ?? 0),
    outputTokens: response.usage.output_tokens,
  };
}

interface GeminiResponse {
  candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
  promptFeedback?: { blockReason?: string };
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
  error?: { message?: string };
}

/** Gemini via the REST generateContent endpoint (key in the x-goog-api-key header, never the URL). */
async function completeGemini(cfg: AiConfig, opts: CompletionRequest): Promise<CompletionResult> {
  const model = cfg.geminiModel;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  const body = JSON.stringify({
    systemInstruction: { parts: [{ text: opts.system }] },
    contents: [{ role: 'user', parts: [{ text: opts.prompt }] }],
    generationConfig: { maxOutputTokens: Math.max(opts.maxTokens ?? 800, 256) * 2 },
  });

  let lastError: AiProviderError | null = null;
  for (let attempt = 0; attempt <= cfg.maxRetries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), cfg.timeoutMs);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY!.trim() },
        body,
        signal: controller.signal,
      });
      const json = (await res.json().catch(() => ({}))) as GeminiResponse;
      if (!res.ok) {
        if (res.status === 401 || res.status === 403) throw new AiProviderError('Gemini rejected the API key', 'AUTH');
        if (res.status === 400 || res.status === 404) throw new AiProviderError(`Gemini rejected the request (${res.status})`, 'BAD_REQUEST');
        // 429 / 5xx are retryable
        lastError = new AiProviderError(res.status === 429 ? 'Gemini rate limit reached' : `Gemini error (${res.status})`, res.status === 429 ? 'RATE_LIMITED' : 'API');
        if (attempt < cfg.maxRetries) {
          await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
          continue;
        }
        throw lastError;
      }
      if (json.promptFeedback?.blockReason) throw new AiProviderError('The Gemini model declined this request', 'REFUSED');
      const cand = json.candidates?.[0];
      if (cand?.finishReason === 'SAFETY' || cand?.finishReason === 'PROHIBITED_CONTENT') {
        throw new AiProviderError('The Gemini model declined this request', 'REFUSED');
      }
      const text = (cand?.content?.parts ?? []).map((p) => p.text ?? '').join('').trim();
      if (!text) throw new AiProviderError('Gemini returned no text', 'EMPTY');
      return {
        text,
        provider: 'gemini',
        model: `gemini:${model}`,
        inputTokens: json.usageMetadata?.promptTokenCount ?? 0,
        outputTokens: json.usageMetadata?.candidatesTokenCount ?? 0,
      };
    } catch (error) {
      if (error instanceof AiProviderError) throw error;
      if ((error as Error).name === 'AbortError') {
        lastError = new AiProviderError('Gemini timed out', 'TIMEOUT');
      } else {
        lastError = new AiProviderError('Could not reach Gemini', 'CONNECTION');
      }
      if (attempt >= cfg.maxRetries) throw lastError;
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError ?? new AiProviderError('Gemini request failed', 'API');
}

/**
 * One generation, trying Anthropic then Gemini. Throws AiProviderError when
 * no provider is configured or every configured provider failed.
 */
export async function complete(opts: CompletionRequest): Promise<CompletionResult> {
  const cfg = getAiConfig();
  if (!cfg.configured) throw new AiProviderError('AI is not configured', 'NOT_CONFIGURED');
  const errors: AiProviderError[] = [];

  if (cfg.anthropicConfigured && !cfg.anthropicCoolingDown) {
    try {
      return await completeAnthropic(cfg, opts);
    } catch (error) {
      if (!(error instanceof AiProviderError)) throw error;
      errors.push(error);
      if (error.code === 'AUTH') {
        anthropicUnavailableUntil = Date.now() + ANTHROPIC_COOLDOWN_MS;
        logger.warn('AI: Anthropic rejected the configured API key — using the next provider for 10 minutes');
      } else {
        logger.warn('AI: Anthropic call failed — trying the next provider', { code: error.code });
      }
    }
  }

  if (cfg.geminiConfigured) {
    try {
      return await completeGemini(cfg, opts);
    } catch (error) {
      if (!(error instanceof AiProviderError)) throw error;
      errors.push(error);
      logger.warn('AI: Gemini call failed', { code: error.code });
    }
  }

  throw errors[errors.length - 1] ?? new AiProviderError('No AI provider available', 'NOT_CONFIGURED');
}

// ── Logging ─────────────────────────────────────────────────────────────────

export interface AiCallContext {
  institutionId: string;
  /** Null for unauthenticated callers (public admission assistant). */
  userId: string | null;
}

export interface AiLogEntry {
  feature: string;
  prompt?: string | null;
  response?: string | null;
  model?: string | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
  isDemo: boolean;
  status: 'SUCCESS' | 'FALLBACK' | 'FAILED';
}

const MAX_LOG_CHARS = 20_000;
const clip = (s: string | null | undefined) => (s == null ? null : s.length > MAX_LOG_CHARS ? `${s.slice(0, MAX_LOG_CHARS)}…` : s);

/** Writes AiInteraction (when there's a user) + UsageRecord. Returns the interaction id, or null. Never throws. */
export async function logAiCall(ctx: AiCallContext, entry: AiLogEntry): Promise<string | null> {
  let interactionId: string | null = null;
  try {
    if (ctx.userId) {
      const row = await prisma.aiInteraction.create({
        data: {
          institutionId: ctx.institutionId,
          userId: ctx.userId,
          feature: entry.feature,
          prompt: clip(entry.prompt),
          response: clip(entry.response),
          model: entry.model ?? null,
          inputTokens: entry.inputTokens ?? null,
          outputTokens: entry.outputTokens ?? null,
          isDemo: entry.isDemo,
          status: entry.status,
        },
        select: { id: true },
      });
      interactionId = row.id;
    }
  } catch (error) {
    logger.warn('AI: could not write AiInteraction (migration applied?)', { error: (error as Error).message, feature: entry.feature });
  }
  try {
    await prisma.usageRecord.create({
      data: {
        institutionId: ctx.institutionId,
        metric: UsageMetric.AI_CALL,
        quantity: 1,
        meta: {
          feature: entry.feature,
          isDemo: entry.isDemo,
          model: entry.model ?? null,
          inputTokens: entry.inputTokens ?? null,
          outputTokens: entry.outputTokens ?? null,
          status: entry.status,
        },
      },
    });
  } catch (error) {
    logger.warn('AI: could not write UsageRecord (migration applied?)', { error: (error as Error).message, feature: entry.feature });
  }
  return interactionId;
}

// ── The one entry point features use ────────────────────────────────────────

export interface AiRunResult {
  text: string;
  demo: boolean;
  /** Provider that produced the text, or null for template (demo) output. */
  provider: AiProvider | null;
  model: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  /** Set when a key is configured but the real call failed and the template was used. */
  aiError?: string;
  interactionId: string | null;
}

/**
 * Real model call (Anthropic → Gemini) when configured, otherwise (or on failure) the caller's
 * deterministic `demoText`. `postProcess` can tidy/validate model output
 * (e.g. trim to one paragraph); returning '' falls back to the template.
 */
export async function runAi(
  ctx: AiCallContext,
  opts: {
    feature: string;
    system: string;
    prompt: string;
    demoText: string;
    maxTokens?: number;
    advanced?: boolean;
    postProcess?: (text: string) => string;
    /** Skip logging (caller logs itself, e.g. to attach the id to a draft). */
    skipLog?: boolean;
  },
): Promise<AiRunResult> {
  const cfg = getAiConfig();
  let result: AiRunResult;


  if (!cfg.configured) {
    result = { text: opts.demoText, demo: true, provider: null, model: null, inputTokens: null, outputTokens: null, interactionId: null };
    if (!opts.skipLog) {
      result.interactionId = await logAiCall(ctx, { feature: opts.feature, prompt: opts.prompt, response: opts.demoText, isDemo: true, status: 'SUCCESS' });
    }
    return result;
  }

  try {
    const r = await complete({ system: opts.system, prompt: opts.prompt, maxTokens: opts.maxTokens, advanced: opts.advanced });
    const text = opts.postProcess ? opts.postProcess(r.text) : r.text;
    if (!text) throw new AiProviderError('The AI model returned unusable text', 'EMPTY');
    result = { text, demo: false, provider: r.provider, model: r.model, inputTokens: r.inputTokens, outputTokens: r.outputTokens, interactionId: null };
    if (!opts.skipLog) {
      result.interactionId = await logAiCall(ctx, {
        feature: opts.feature,
        prompt: opts.prompt,
        response: text,
        model: r.model,
        inputTokens: r.inputTokens,
        outputTokens: r.outputTokens,
        isDemo: false,
        status: 'SUCCESS',
      });
    }
    return result;
  } catch (error) {
    const message = error instanceof AiProviderError ? error.message : 'Unexpected AI error';
    logger.warn('AI: provider call failed — using template output', { feature: opts.feature, error: (error as Error).message });
    result = {
      text: opts.demoText,
      demo: true,
      provider: null,
      model: null,
      inputTokens: null,
      outputTokens: null,
      aiError: `${message}. Showing template output generated from your data instead.`,
      interactionId: null,
    };
    if (!opts.skipLog) {
      result.interactionId = await logAiCall(ctx, {
        feature: opts.feature,
        prompt: opts.prompt,
        response: opts.demoText,
        model: 'template',
        isDemo: true,
        status: 'FALLBACK',
      });
    }
    return result;
  }
}

/** Shared tail for every system prompt: plain text, no invented facts. */
export const GROUNDING_RULES =
  'Use only the facts provided in the user message. Never invent numbers, names, dates or policies. ' +
  'Write plain text without Markdown headings or tables. Be concise.';
