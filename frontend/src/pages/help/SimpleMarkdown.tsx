import React from 'react';
import { Link } from 'react-router-dom';

// =============================================================================
// Tiny, safe markdown renderer for the in-repo help articles. Builds React
// elements (never dangerouslySetInnerHTML), so article text can never inject
// markup. Supported: ## / ### headings, paragraphs, "- " and "1. " lists,
// "> " callouts, **bold**, `code`, and [label](/internal-path) links.
// =============================================================================

type Block =
  | { kind: 'h2' | 'h3' | 'p' | 'quote'; text: string }
  | { kind: 'ul' | 'ol'; items: string[] };

function parseBlocks(src: string): Block[] {
  const lines = src.replace(/\r\n/g, '\n').split('\n');
  const blocks: Block[] = [];
  let para: string[] = [];
  const flush = () => {
    if (para.length) blocks.push({ kind: 'p', text: para.join(' ') });
    para = [];
  };
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      flush();
      continue;
    }
    const h = /^(#{2,3})\s+(.*)$/.exec(line);
    if (h) {
      flush();
      blocks.push({ kind: h[1].length === 2 ? 'h2' : 'h3', text: h[2] });
      continue;
    }
    const ul = /^[-*]\s+(.*)$/.exec(line);
    const ol = /^\d+\.\s+(.*)$/.exec(line);
    if (ul || ol) {
      flush();
      const kind = ul ? 'ul' : 'ol';
      const text = (ul ?? ol)![1];
      const last = blocks[blocks.length - 1];
      if (last && last.kind === kind) last.items.push(text);
      else blocks.push({ kind, items: [text] });
      continue;
    }
    const q = /^>\s?(.*)$/.exec(line);
    if (q) {
      flush();
      const last = blocks[blocks.length - 1];
      if (last && last.kind === 'quote') last.text += ` ${q[1]}`;
      else blocks.push({ kind: 'quote', text: q[1] });
      continue;
    }
    para.push(line);
  }
  flush();
  return blocks;
}

function inline(text: string, keyBase: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\(\/[^)\s]*\))/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const tok = m[0];
    const key = `${keyBase}-${i++}`;
    if (tok.startsWith('**')) out.push(<strong key={key} className="font-semibold text-slate-900 dark:text-slate-100">{tok.slice(2, -2)}</strong>);
    else if (tok.startsWith('`')) out.push(<code key={key} className="rounded bg-slate-100 dark:bg-white/10 px-1 py-0.5 text-[0.85em] font-mono">{tok.slice(1, -1)}</code>);
    else {
      const lm = /^\[([^\]]+)\]\((\/[^)\s]*)\)$/.exec(tok)!;
      out.push(
        <Link key={key} to={lm[2]} className="link">
          {lm[1]}
        </Link>,
      );
    }
    last = m.index + tok.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export const SimpleMarkdown: React.FC<{ source: string }> = ({ source }) => {
  const blocks = parseBlocks(source);
  return (
    <div className="space-y-3 text-sm leading-relaxed text-slate-700 dark:text-slate-300">
      {blocks.map((b, i) => {
        const k = `b${i}`;
        switch (b.kind) {
          case 'h2':
            return <h2 key={k} className="pt-2 text-base font-semibold text-slate-900 dark:text-slate-100">{inline(b.text, k)}</h2>;
          case 'h3':
            return <h3 key={k} className="pt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">{inline(b.text, k)}</h3>;
          case 'quote':
            return (
              <div key={k} className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-blue-900 dark:border-blue-400/20 dark:bg-blue-500/10 dark:text-blue-100">
                {inline(b.text, k)}
              </div>
            );
          case 'ul':
            return (
              <ul key={k} className="list-disc space-y-1 pl-5">
                {b.items.map((it, j) => <li key={j}>{inline(it, `${k}-${j}`)}</li>)}
              </ul>
            );
          case 'ol':
            return (
              <ol key={k} className="list-decimal space-y-1 pl-5">
                {b.items.map((it, j) => <li key={j}>{inline(it, `${k}-${j}`)}</li>)}
              </ol>
            );
          default:
            return <p key={k}>{inline(b.text, k)}</p>;
        }
      })}
    </div>
  );
};
