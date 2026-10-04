/**
 * Wraps a block definition so EVERY block gets the reserved props
 * `_bind` (field → data, W2) and `_visible` (show-if rules, W6) without each
 * block knowing about them.
 *
 * It runs identically in Puck's preview and in the public `SiteRender`, because
 * both call `def.render`: bindings resolve against the ambient data scope
 * (`scopeContext.tsx`), then the original render receives plain props.
 */
import { useMemo, type ComponentType, type ReactNode } from 'react';
import type { CustomField, Field } from '@puckeditor/core';
import { applyBindings, evalVisibility, hasVisibility, hideClasses, type Rec, type Scope, type VisibleSpec } from './binding';
import { useScope } from './scopeContext';
import { useSiteRuntime } from './runtime';
import { VisibilityField } from './editor/VisibilityField';
import type { SiteBlock } from './blocks/shared';

const visibilityField: CustomField<VisibleSpec | undefined> = { type: 'custom', render: VisibilityField };

type AnyProps = Record<string, unknown>;

function BoundBlock({ Inner, props }: { Inner: ComponentType<AnyProps>; props: AnyProps }): ReactNode {
  const rt = useSiteRuntime();
  const ambient = useScope();
  const editing = rt.mode === 'editor';
  const scope = useMemo<Scope>(() => ({ ...ambient, site: ambient.site ?? rt.tokens }), [ambient, rt.tokens]);
  const bound = useMemo(() => (props._bind ? applyBindings(props as Rec, scope, rt.lang) : props), [props, scope, rt.lang]);
  const vis = props._visible as VisibleSpec | undefined;
  const ruled = hasVisibility(vis);
  const show = ruled ? evalVisibility(vis, scope) : true;
  const el = <Inner {...bound} />;
  if (!ruled) return el;
  if (editing) {
    const wouldHide = !show || (vis?.hideOn?.length ?? 0) > 0;
    return wouldHide ? (
      <div style={{ opacity: show ? 0.75 : 0.4, outline: '1px dashed #94a3b8', outlineOffset: -1 }} data-site-hidden-preview="true">{el}</div>
    ) : el;
  }
  if (!show) return null;
  const cls = hideClasses(vis);
  return cls ? <div className={cls}>{el}</div> : el;
}

export function makeBindable(def: SiteBlock): SiteBlock {
  const Inner = def.render as unknown as ComponentType<AnyProps>;
  return {
    ...def,
    fields: { ...(def.fields ?? {}), _visible: visibilityField as Field },
    render: ((props: AnyProps) => <BoundBlock Inner={Inner} props={props} />) as unknown as SiteBlock['render'],
  };
}
