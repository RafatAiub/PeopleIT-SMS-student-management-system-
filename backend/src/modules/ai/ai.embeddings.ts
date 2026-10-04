// =============================================================================
// Semantic ranking of KnowledgeDocuments with Voyage embeddings.
//
// VOYAGE_API_KEY set → embed the question (input_type "query") and the
// documents (input_type "document", cached in memory by id+updatedAt — no
// schema change) and rank by cosine similarity. Unset, or on ANY error or
// timeout → the keyword (BM25) ranking in ai.retrieval.ts.
// =============================================================================

import { logger } from '../../utils/logger';
import { rankDocuments, bestExcerpt, tokenize, type RankedDoc, type RetrievableDoc } from './ai.retrieval';

export const DEFAULT_VOYAGE_MODEL = 'voyage-3-lite';
const VOYAGE_URL = 'https://api.voyageai.com/v1/embeddings';
const TIMEOUT_MS = 10_000;
const BATCH = 64;
const MAX_DOC_CHARS = 16_000;
/** Minimum cosine similarity for a document to count as relevant. */
export const SEMANTIC_MIN_SIMILARITY = 0.35;

export function embeddingsConfigured(): boolean {
  return Boolean(process.env.VOYAGE_API_KEY?.trim());
}

const voyageModel = () => process.env.VOYAGE_MODEL?.trim() || DEFAULT_VOYAGE_MODEL;

// id|updatedAt|model → vector. Bounded so a large knowledge base can't grow memory forever.
const docCache = new Map<string, number[]>();
const MAX_CACHE = 5000;

async function embed(inputs: string[], inputType: 'query' | 'document'): Promise<number[][]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(VOYAGE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.VOYAGE_API_KEY!.trim()}` },
      body: JSON.stringify({ input: inputs, model: voyageModel(), input_type: inputType }),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`Voyage embeddings failed (${res.status})`);
    const json = (await res.json()) as { data?: { embedding: number[]; index: number }[] };
    const data = json.data ?? [];
    if (data.length !== inputs.length) throw new Error('Voyage returned an unexpected number of embeddings');
    return [...data].sort((a, b) => a.index - b.index).map((d) => d.embedding);
  } finally {
    clearTimeout(timer);
  }
}

export function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na && nb ? dot / (Math.sqrt(na) * Math.sqrt(nb)) : 0;
}

export type SemanticDoc = RetrievableDoc & { updatedAt?: Date | null };

/**
 * Top-k documents for a question. Returns the ranking plus which method ran.
 */
export async function rankDocumentsSmart<T extends SemanticDoc>(
  question: string,
  docs: T[],
  k = 3,
): Promise<{ ranked: RankedDoc<T>[]; method: 'semantic' | 'keyword' }> {
  if (!embeddingsConfigured() || docs.length === 0) return { ranked: rankDocuments(question, docs, k), method: 'keyword' };
  try {
    const model = voyageModel();
    const keyOf = (d: T) => `${d.id}|${d.updatedAt ? new Date(d.updatedAt).getTime() : 0}|${model}`;
    const missing = docs.filter((d) => !docCache.has(keyOf(d)));
    for (let i = 0; i < missing.length; i += BATCH) {
      const chunk = missing.slice(i, i + BATCH);
      const vectors = await embed(chunk.map((d) => `${d.title}\n\n${d.content.slice(0, MAX_DOC_CHARS)}`), 'document');
      chunk.forEach((d, j) => docCache.set(keyOf(d), vectors[j]));
    }
    while (docCache.size > MAX_CACHE) docCache.delete(docCache.keys().next().value as string);

    const [q] = await embed([question], 'query');
    const terms = tokenize(question);
    const ranked = docs
      .map((doc) => ({ doc, score: cosine(q, docCache.get(keyOf(doc))!) }))
      .filter((r) => r.score >= SEMANTIC_MIN_SIMILARITY)
      .sort((a, b) => b.score - a.score)
      .slice(0, k)
      .map((r) => ({
        doc: r.doc,
        score: Math.round(r.score * 1000) / 1000,
        excerpt: bestExcerpt(r.doc.content, terms),
        matchedTerms: terms.filter((t) => `${r.doc.title} ${r.doc.content}`.toLowerCase().includes(t)),
      }));
    return { ranked, method: 'semantic' };
  } catch (error) {
    logger.warn('AI: semantic ranking unavailable — using keyword ranking', { error: (error as Error).message });
    return { ranked: rankDocuments(question, docs, k), method: 'keyword' };
  }
}
