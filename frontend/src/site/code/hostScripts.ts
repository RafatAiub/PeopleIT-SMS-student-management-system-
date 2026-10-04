/**
 * Injects a raw HTML/script snippet into a live element (`document.head` or
 * `document.body`) so it actually executes — `element.innerHTML = html`
 * never runs `<script>` tags, so each script node is re-created. Used only
 * for `settings.headHtml` / `settings.bodyEndHtml`, and only in host mode on
 * a non-app host (§1); never inside the editor or path-mode preview.
 */
export function injectHtml(html: string, target: Element, markAttr: string): () => void {
  if (!html || typeof document === 'undefined') return () => undefined;
  const holder = document.createElement('div');
  holder.innerHTML = html;
  const nodes = Array.from(holder.childNodes);
  const inserted: Node[] = [];
  for (const node of nodes) {
    let toInsert: Node = node;
    if (node.nodeType === 1 && (node as Element).tagName === 'SCRIPT') {
      const old = node as HTMLScriptElement;
      const script = document.createElement('script');
      for (const attr of Array.from(old.attributes)) script.setAttribute(attr.name, attr.value);
      script.text = old.text;
      toInsert = script;
    }
    if (toInsert.nodeType === 1) (toInsert as Element).setAttribute(markAttr, '');
    target.appendChild(toInsert);
    inserted.push(toInsert);
  }
  return () => {
    for (const n of inserted) n.parentNode?.removeChild(n);
  };
}
