/** Pure helpers over Puck page data (component trees with slot props). */
import type { SiteComponentData } from './types';

type Node = SiteComponentData;

/** Depth-first search for a component by its `props.id`, through slot props and legacy zones. */
export function findComponent(data: { content?: Node[]; zones?: Record<string, Node[]> } | null | undefined, id: string): Node | null {
  if (!data || !id) return null;
  const visit = (list: unknown, depth: number): Node | null => {
    if (!Array.isArray(list) || depth > 14) return null;
    for (const raw of list) {
      const n = raw as Node;
      if (!n || typeof n !== 'object' || !n.props) continue;
      if (n.props.id === id) return n;
      for (const v of Object.values(n.props)) {
        if (Array.isArray(v) && v.length && typeof v[0] === 'object' && v[0] && 'type' in (v[0] as object)) {
          const hit = visit(v, depth + 1);
          if (hit) return hit;
        }
      }
    }
    return null;
  };
  const hit = visit(data.content, 0);
  if (hit) return hit;
  for (const z of Object.values(data.zones ?? {})) {
    const h = visit(z, 0);
    if (h) return h;
  }
  return null;
}

/** All component nodes (any depth) of a type. */
export function findAllOfType(list: unknown, type: string, depth = 0): Node[] {
  const out: Node[] = [];
  if (!Array.isArray(list) || depth > 14) return out;
  for (const raw of list) {
    const n = raw as Node;
    if (!n || typeof n !== 'object' || !n.props) continue;
    if (n.type === type) out.push(n);
    for (const v of Object.values(n.props)) if (Array.isArray(v)) out.push(...findAllOfType(v, type, depth + 1));
  }
  return out;
}
