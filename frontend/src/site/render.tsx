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
import type { SiteComponentData, SitePageData } from './types';

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
  const props = useMemo(() => {
    const def = config.components[item.type];
    if (!def) return null;
    const out: Record<string, unknown> = { ...(def.defaultProps ?? {}), ...(item.props ?? {}) };
    const id = (out.id as string) ?? '';
    const child: RenderCtx = { config, data, depth: depth + 1 };
    for (const key of slotKeys(config, item.type)) {
      const content = Array.isArray(out[key]) ? (out[key] as SiteComponentData[]) : [];
      out[key] = function Slot({ className, style, as }: SlotProps = {}) {
        const El = (as ?? 'div') as 'div';
        return <El className={className} style={style}>{renderList(content, child)}</El>;
      };
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
  }, [item, config, data, depth]);
  const def = config.components[item.type];
  if (!def || !props || depth > 12) return null;
  const Render = def.render as unknown as (p: Record<string, unknown>) => ReactNode;
  return <BlockBoundary type={item.type}><Render {...props} /></BlockBoundary>;
}

export function SiteRender({ data, config = siteConfig }: { data: SitePageData; config?: AnyConfig }) {
  const ctx: RenderCtx = { config, data, depth: 0 };
  const body = renderList(data.content, ctx);
  const RootRender = config.root?.render as unknown as ((p: Record<string, unknown>) => ReactNode) | undefined;
  if (!RootRender) return <>{body}</>;
  const rootProps = (data.root?.props ?? {}) as Record<string, unknown>;
  return <RootRender {...rootProps} puck={{ isEditing: false, dragRef: null, metadata: {}, renderDropZone: () => null }}>{body}</RootRender>;
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
