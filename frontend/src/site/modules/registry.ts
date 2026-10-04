/**
 * Editor-side module registry (W15). The page editor loads the site's
 * published modules once, before Puck mounts, and stores them here so
 * `CustomModule.resolveFields` (which runs outside React) can build each
 * block's form from its module's schema.
 *
 * Palette: every published module also gets its own palette entry
 * (`CustomModule__<key>`, under "My modules"). Those alias types only live in
 * Puck's in-memory state: `normaliseModuleTypes` rewrites them to
 * `{ type: "CustomModule", props: { moduleKey } }` before anything is saved,
 * and the renderer maps any alias it still meets to CustomModule.
 */
import { MODULE_ALIAS_PREFIX, type ModuleDef, type Rec } from './types';

const editorModules = new Map<string, ModuleDef>();

export function setEditorModules(defs: ModuleDef[]): void {
  editorModules.clear();
  for (const d of defs) editorModules.set(d.key, d);
}

export function getEditorModule(key: unknown): ModuleDef | undefined {
  return typeof key === 'string' ? editorModules.get(key) : undefined;
}

export function editorModuleList(): ModuleDef[] {
  return [...editorModules.values()];
}

export function isModuleAlias(type: unknown): type is string {
  return typeof type === 'string' && type.startsWith(MODULE_ALIAS_PREFIX);
}

export function aliasKey(type: string): string {
  return type.slice(MODULE_ALIAS_PREFIX.length);
}

/** Deep copy of Puck data with every `CustomModule__<key>` block turned into a `CustomModule` (slots and zones included). Returns the same object when nothing changed. */
export function normaliseModuleTypes<T>(data: T): T {
  let changed = false;
  const walk = (v: unknown, depth: number): unknown => {
    if (depth > 60 || v === null || typeof v !== 'object') return v;
    if (Array.isArray(v)) {
      let diff = false;
      const next = v.map((x) => {
        const y = walk(x, depth + 1);
        if (y !== x) diff = true;
        return y;
      });
      return diff ? next : v;
    }
    const o = v as Rec;
    let next: Rec | null = null;
    for (const [k, val] of Object.entries(o)) {
      const y = walk(val, depth + 1);
      if (y !== val) (next ??= { ...o })[k] = y;
    }
    const cur = next ?? o;
    if (isModuleAlias(cur.type) && cur.props && typeof cur.props === 'object') {
      changed = true;
      const props = cur.props as Rec;
      return { ...cur, type: 'CustomModule', props: { ...props, moduleKey: typeof props.moduleKey === 'string' && props.moduleKey ? props.moduleKey : aliasKey(cur.type) } };
    }
    if (next) changed = true;
    return cur;
  };
  const out = walk(data, 0) as T;
  return changed ? out : data;
}
