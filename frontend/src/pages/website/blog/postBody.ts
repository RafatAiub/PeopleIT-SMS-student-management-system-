import type { PuckData } from '../sites.types';

// Blog/news bodies are stored as Puck data holding one `RichText` block
// (`body` / `bodyBn` HTML), so the public renderer shows them with the same
// block library as pages. The admin editor edits plain paragraphs; any other
// blocks already in the body (added by a future richer editor) are kept.

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function textToHtml(text: string): string {
  return text
    .trim()
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`)
    .join('');
}

export function htmlToText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|li|blockquote)>/gi, '\n\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function asPuck(body: unknown): PuckData | null {
  if (body && typeof body === 'object' && Array.isArray((body as PuckData).content)) return body as PuckData;
  return null;
}

/** Plain text (English, Bangla) from whatever body the post has. */
export function readPostBody(body: unknown): { text: string; textBn: string } {
  if (typeof body === 'string') return { text: htmlToText(body), textBn: '' };
  const puck = asPuck(body);
  const block = puck?.content.find((c) => c.type === 'RichText');
  const str = (v: unknown) => (typeof v === 'string' ? v : '');
  if (block) return { text: htmlToText(str(block.props.body)), textBn: htmlToText(str(block.props.bodyBn)) };
  const o = body as { text?: unknown; textBn?: unknown } | null;
  return { text: str(o?.text), textBn: str(o?.textBn) };
}

let seq = 0;
const newId = () => `RichText-${Date.now().toString(36)}-${(seq++).toString(36)}`;

export function writePostBody(previous: unknown, text: string, textBn: string): PuckData {
  const puck = asPuck(previous);
  const props = { body: textToHtml(text), bodyBn: textToHtml(textBn) };
  if (puck) {
    const idx = puck.content.findIndex((c) => c.type === 'RichText');
    if (idx >= 0) {
      const content = puck.content.map((c, i) => (i === idx ? { ...c, props: { ...c.props, ...props } } : c));
      return { ...puck, content };
    }
    return { ...puck, content: [{ type: 'RichText', props: { id: newId(), align: 'left', tone: 'default', pad: 'sm', width: 'narrow', anchor: '', ...props } }, ...puck.content] };
  }
  return {
    root: { props: {} },
    content: [{ type: 'RichText', props: { id: newId(), align: 'left', tone: 'default', pad: 'sm', width: 'narrow', anchor: '', ...props } }],
  };
}
