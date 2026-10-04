/**
 * Lightweight public renderer: renders Puck `Data` straight from
 * `siteConfig` without importing `@puckeditor/core` (whose main entry pulls
 * the whole editor, tiptap included). Supports `slot` fields (what Columns
 * and Section use) and legacy `zones` via `puck.renderDropZone`.
 *
 * Each block renders inside an error boundary, so one bad block can't take
 * the page down.
 */
import { Component as ReactComponent, useMemo, type CSSProperties, type ReactNode } from 'react';
import type { Config } from '@puckeditor/core';
import { siteConfig } from './config';
import { PageScope } from './scopeContext';
import type { Rec } from './binding';
import type { SiteComponentData, SitePageData } from './types';
import { isModuleAlias } from './modules/registry';

/** Editor-only palette aliases of custom modules (`CustomModule__<key>`) render as CustomModule. */
function typeOf(config: AnyConfig, type: string): string {
  return !config.components[type] && isModuleAlias(type) ? 'CustomModule' : type;
}

type AnyConfig = Config;
type SlotProps = { className?: string; style?: CSSProperties; as?: keyof JSX.IntrinsicElements };

class BlockBoundary extends ReactComponent<{ type: string; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(err: unknown) {
    if (import.meta.env?.DEV) console.error(`[site] block "${this.props.type}" failed to render`, err);
  }
  render() { return this.state.failed ? null : this.props.children; }
}

function slotKeys(config: AnyConfig, type: string): string[] {
  const fields = (config.components[type]?.fields ?? {}) as Record<string, { type?: string }>;
  return Object.keys(fields).filter((k) => fields[k]?.type === 'slot');
}

function renderList(items: SiteComponentData[] | undefined, ctx: RenderCtx): ReactNode {
  return (items ?? []).map((item, i) => <RenderItem key={(item.props?.id as string) ?? `${item.type}-${i}`} item={item} ctx={ctx} />);
}

interface RenderCtx { config: AnyConfig; data: SitePageData; depth: number }

function RenderItem({ item, ctx }: { item: SiteComponentData; ctx: RenderCtx }) {
  const { config, data, depth } = ctx;
  // Memoised so slot components keep a stable identity across re-renders
  // (a new function each render would remount the subtree and lose state).
  const type = typeOf(config, item.type);
  const props = useMemo(() => {
    const def = config.components[type];
    if (!def) return null;
    const out: Record<string, unknown> = { ...(def.defaultProps ?? {}), ...(item.props ?? {}) };
    const id = (out.id as string) ?? '';
    const child: RenderCtx = { config, data, depth: depth + 1 };
    for (const key of slotKeys(config, type)) {
      const content = Array.isArray(out[key]) ? (out[key] as SiteComponentData[]) : [];
      const Slot = function Slot({ className, style, as }: SlotProps = {}) {
        const El = (as ?? 'div') as 'div';
        return <El className={className} style={style}>{renderList(content, child)}</El>;
      };
      // Lets a block (CollectionList) read the slot's blocks, e.g. to find which relations they bind.
      (Slot as unknown as { content: SiteComponentData[] }).content = content;
      out[key] = Slot;
    }
    out.puck = {
      isEditing: false,
      dragRef: null,
      metadata: {},
      renderDropZone: ({ zone, className, style }: { zone: string; className?: string; style?: CSSProperties }) => (
        <div className={className} style={style}>{renderList(data.zones?.[`${id}:${zone}`], child)}</div>
      ),
    };
    out.id = id;
    return out;
  }, [item, type, config, data, depth]);
  const def = config.components[type];
  if (!def || !props || depth > 12) return null;
  const Render = def.render as unknown as (p: Record<string, unknown>) => ReactNode;
  return <BlockBoundary type={type}><Render {...props} /></BlockBoundary>;
}

/**
 * Renders a list of blocks read-only with the ambient data scope. Used by the
 * editor's CollectionList to show items 2..N from the item template that Puck
 * renders editably for item 1 (a Puck slot can only render once).
 */
export function RenderBlocks({ content, config = siteConfig, data }: { content: SiteComponentData[] | undefined; config?: AnyConfig; data?: SitePageData }) {
  const ctx: RenderCtx = { config, data: data ?? { root: {}, content: [] }, depth: 1 };
  return <>{renderList(content, ctx)}</>;
}

/**
 * `record`: when set, the page is a collection *template* page and `record` is
 * the item it shows — blocks resolve `item` / `page` bindings and `{{item.x}}`
 * tokens against it.
 */
export function SiteRender({ data, config = siteConfig, record }: { data: SitePageData; config?: AnyConfig; record?: Rec | null }) {
  const ctx: RenderCtx = { config, data, depth: 0 };
  const body = renderList(data.content, ctx);
  const RootRender = config.root?.render as unknown as ((p: Record<string, unknown>) => ReactNode) | undefined;
  const page = !RootRender ? <>{body}</> : (
    <RootRender {...((data.root?.props ?? {}) as Record<string, unknown>)} puck={{ isEditing: false, dragRef: null, metadata: {}, renderDropZone: () => null }}>{body}</RootRender>
  );
  return record ? <PageScope record={record}>{page}</PageScope> : page;
}

/** Structural check for stored page JSON (used before rendering / applying templates). */
export function isValidPageData(v: unknown, config: AnyConfig = siteConfig): v is SitePageData {
  if (!v || typeof v !== 'object') return false;
  const d = v as Record<string, unknown>;
  if (!Array.isArray(d.content)) return false;
  const check = (items: unknown[], depth: number): boolean =>
    depth < 12 && items.every((it) => {
      if (!it || typeof it !== 'object') return false;
      const { type, props } = it as { type?: unknown; props?: unknown };
      if (typeof type !== 'string' || !config.components[type] || !props || typeof props !== 'object') return false;
      return slotKeys(config, type).every((k) => {
        const val = (props as Record<string, unknown>)[k];
        return val === undefined || (Array.isArray(val) && check(val, depth + 1));
      });
    });
  return check(d.content, 0);
}
