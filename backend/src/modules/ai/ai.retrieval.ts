// =============================================================================
// Knowledge retrieval — simple keyword ranking (BM25-style), pure & DB-free.
//
// The knowledge assistant, guardian chatbot and admission assistant answer
// ONLY from an institution's KnowledgeDocuments. This ranks the documents for
// a question; the top-k are passed to the model as context (or, in demo mode,
// their best-matching excerpts are returned as-is).
// =============================================================================

export interface RetrievableDoc {
  id: string;
  title: string;
  content: string;
  category?: string | null;
}

export interface RankedDoc<T extends RetrievableDoc = RetrievableDoc> {
  doc: T;
  score: number;
  excerpt: string;
  matchedTerms: string[];
}

const STOPWORDS = new Set(
  (
    'a an the and or but if then of to in on at for from by with about as is are was were be been being do does did ' +
    'have has had i me my we our you your he she it its they them their this that these those what which who whom ' +
    'when where how can could would should will shall may might must there here please tell know any some all not no ' +
    'yes so than too very just also into out up down over under again more most such only own same other ' +
    'কি কী কে কোন কোথায় কখন কিভাবে কীভাবে এবং ও আর এই সেই একটি আমি আমার আমাদের আপনি আপনার তার হয় হবে করে করা আছে না'
  ).split(/\s+/),
);

/** Lowercased word tokens (Latin + Bangla letters/digits), stopwords removed, light plural stripping. */
export function tokenize(text: string): string[] {
  const words = text.toLowerCase().match(/[\p{L}\p{M}\p{N}]+/gu) ?? [];
  return words
    .filter((w) => w.length > 1 && !STOPWORDS.has(w))
    .map((w) => (/^[a-z]+$/.test(w) && w.length > 4 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w));
}

/**
 * BM25 ranking over title + content (title terms count double). Returns the
 * docs with a positive score, best first, at most `k`. `minScore` drops
 * incidental single-word matches.
 */
export function rankDocuments<T extends RetrievableDoc>(
  question: string,
  docs: T[],
  k = 3,
  minScore = 0.3,
): RankedDoc<T>[] {
  const qTerms = Array.from(new Set(tokenize(question)));
  if (qTerms.length === 0 || docs.length === 0) return [];

  const docTokens = docs.map((d) => {
    const titleTokens = tokenize(d.title);
    return [...titleTokens, ...titleTokens, ...tokenize(d.content)];
  });
  const N = docs.length;
  const avgLen = docTokens.reduce((s, t) => s + t.length, 0) / N || 1;
  const df = new Map<string, number>();
  for (const term of qTerms) {
    df.set(term, docTokens.filter((toks) => toks.includes(term)).length);
  }

  const k1 = 1.2;
  const b = 0.75;
  const results: RankedDoc<T>[] = [];
  docs.forEach((doc, idx) => {
    const toks = docTokens[idx];
    const tf = new Map<string, number>();
    for (const t of toks) tf.set(t, (tf.get(t) ?? 0) + 1);
    let score = 0;
    const matched: string[] = [];
    for (const term of qTerms) {
      const f = tf.get(term) ?? 0;
      if (!f) continue;
      matched.push(term);
      const n = df.get(term) ?? 0;
      const idf = Math.log(1 + (N - n + 0.5) / (n + 0.5));
      score += idf * ((f * (k1 + 1)) / (f + k1 * (1 - b + (b * toks.length) / avgLen)));
    }
    if (score >= minScore) {
      results.push({ doc, score: Math.round(score * 1000) / 1000, excerpt: bestExcerpt(doc.content, matched), matchedTerms: matched });
    }
  });

  return results.sort((a, b2) => b2.score - a.score).slice(0, k);
}

/**
 * The ~`size`-character window of `content` containing the most query terms,
 * trimmed to word boundaries. Falls back to the opening of the document.
 */
export function bestExcerpt(content: string, terms: string[], size = 320): string {
  const text = content.replace(/\s+/g, ' ').trim();
  if (text.length <= size) return text;
  const lower = text.toLowerCase();
  let bestStart = 0;
  let bestHits = -1;
  const step = Math.max(40, Math.floor(size / 4));
  for (let start = 0; start < text.length; start += step) {
    const window = lower.slice(start, start + size);
    const hits = terms.reduce((s, t) => s + (window.includes(t) ? 1 : 0), 0);
    if (hits > bestHits) {
      bestHits = hits;
      bestStart = start;
    }
  }
  let start = bestStart;
  if (start > 0) {
    const sp = text.indexOf(' ', start);
    start = sp === -1 ? start : sp + 1;
  }
  let end = Math.min(text.length, start + size);
  if (end < text.length) {
    const sp = text.lastIndexOf(' ', end);
    end = sp > start ? sp : end;
  }
  return `${start > 0 ? '… ' : ''}${text.slice(start, end)}${end < text.length ? ' …' : ''}`;
}

/** Documents formatted as model context, each tagged with its title for citation. */
export function formatDocsForPrompt(ranked: RankedDoc[], maxCharsPerDoc = 6000): string {
  return ranked
    .map(
      (r, i) =>
        `<document index="${i + 1}" title="${r.doc.title.replace(/"/g, "'")}">\n${r.doc.content.slice(0, maxCharsPerDoc)}\n</document>`,
    )
    .join('\n');
}

export const NO_INFO_ANSWER = "I don't have that information.";
