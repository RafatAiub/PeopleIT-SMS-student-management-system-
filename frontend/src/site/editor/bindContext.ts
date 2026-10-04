/**
 * Editor-only plumbing shared between the Puck shell (`pages/website/editor`)
 * and field components that live in the block config. It has NO `@puckeditor/core`
 * import, so the public renderer can import the config without the editor.
 *
 * `PuckEditor` fills this context from inside Puck (where `useGetPuck` works).
 */
import { createContext, useContext } from 'react';
import type { BindSpec, BindSrc } from '../binding';
import type { CollectionMeta } from '../collections';
import type { SitePageData } from '../types';

export interface ScopeCollections {
  /** Collection behind `item` for the selected block (nearest CollectionList, else the template page's). */
  item?: CollectionMeta | null;
  /** Collection behind `parent` (the next list out). */
  parent?: CollectionMeta | null;
  /** The template page's collection. */
  page?: CollectionMeta | null;
}

export interface EditorBindValue {
  collections: CollectionMeta[];
  /** Scope collections for the block currently selected in the editor. */
  scopeForSelected: () => ScopeCollections;
  /** Writes `_bind[propPath]` on the selected block (null removes it). */
  setBinding: (propPath: string, spec: BindSpec | null) => void;
  /** Props of the block selected in the editor (null when none). */
  selectedProps: () => Record<string, unknown> | null;
  /** `_bind` of the selected block. */
  bindings: () => Record<string, BindSpec>;
  /** Bumps whenever the selection / bindings change so consumers re-render. */
  version: number;
}

export const EditorBindContext = createContext<EditorBindValue | null>(null);

export function useEditorBind(): EditorBindValue | null {
  return useContext(EditorBindContext);
}

export const SRC_LABEL: Record<BindSrc | 'url', string> = {
  item: 'This item',
  parent: 'Parent item',
  page: 'This page’s record',
  site: 'Site / institution',
  url: 'URL',
};

/**
 * Live page data inside the editor (filled by `PuckEditor` from Puck's app state).
 * CollectionList uses it to render items 2..N read-only from the item template
 * that Puck renders editably for item 1.
 */
export const EditorDataContext = createContext<{ content: SitePageData['content'] } | null>(null);
