/**
 * The data-scope stack (W2). A `Scope` (see binding.ts) is provided by:
 *   - the public template-page route / the editor's sample-item picker (`PageScope`)
 *   - every CollectionList item (`ItemScope`) — pushing the enclosing item to `parent`
 *   - the site shell (`UrlScope`) for `{{url.q}}`
 * The renderer and Puck's render both read it through `useScope()`, so a block
 * resolves identically in the editor and on the live site.
 *
 * Kept free of `runtime.tsx` imports so `useSiteText` can read it without a cycle.
 */
import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { EMPTY_SCOPE, type Rec, type Scope } from './binding';

export const ScopeContext = createContext<Scope>(EMPTY_SCOPE);

export function useScope(): Scope {
  return useContext(ScopeContext);
}

/** Pushes a collection-list item: it becomes `item`, the previous `item` becomes `parent`. */
export function ItemScope({ item, children }: { item: Rec | null | undefined; children: ReactNode }) {
  const outer = useContext(ScopeContext);
  const value = useMemo<Scope>(() => ({ ...outer, parent: outer.item ?? outer.parent ?? null, item: item ?? null }), [outer, item]);
  return <ScopeContext.Provider value={value}>{children}</ScopeContext.Provider>;
}

/** A template page's record: `page` and (outside any list) `item`. */
export function PageScope({ record, children }: { record: Rec | null | undefined; children: ReactNode }) {
  const outer = useContext(ScopeContext);
  const value = useMemo<Scope>(() => ({ ...outer, page: record ?? null, item: record ?? null, parent: null }), [outer, record]);
  return <ScopeContext.Provider value={value}>{children}</ScopeContext.Provider>;
}

/** Query-string / route params for `{{url.q}}` and `src: 'url'` rules. */
export function UrlScope({ params, children }: { params: Record<string, string | undefined>; children: ReactNode }) {
  const outer = useContext(ScopeContext);
  const key = JSON.stringify(params);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` is the stable identity of `params`
  const value = useMemo<Scope>(() => ({ ...outer, url: params }), [outer, key]);
  return <ScopeContext.Provider value={value}>{children}</ScopeContext.Provider>;
}
