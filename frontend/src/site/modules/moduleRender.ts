/**
 * Module rendering pipeline (W14), host-agnostic:
 *   1. collection-type fields → items through the collections API (their
 *      configured collection / filters / sort / limit, tokens like
 *      `{{item.department}}` allowed in filter values);
 *   2. the template data: `module.*`, `site.*`, `institution.*`, `head.*`,
 *      `page.*`, `item.*`, `parent.*`, `lang`, `url.query` / `url.path`;
 *   3. Liquid render (engine.ts).
 * The React side (CustomModule.tsx) supplies `fetchCollection` (React Query
 * cached) and sanitises + scopes the result.
 */
import { buildCollectionQuery, type CollectionFilterSpec, type CollectionParams } from '../collections';
import type { Scope } from '../binding';
import { isQueryableCollection } from './collectionTag';
import { renderLiquid, type ModuleLang } from './engine';
import { collectionFieldQuery, moduleItem, nestTokens, resolveModuleValues, type ModuleDef, type Rec } from './types';

export interface ModuleRenderInput {
  def: Pick<ModuleDef, 'fields' | 'template'>;
  values: Rec | null | undefined;
  lang: ModuleLang;
  scope: Scope;
  /** Site tokens (runtime `tokens`): `institution.name`, `site.name`, `head.name`, `year` … */
  tokens: Record<string, string | undefined>;
  institution?: Rec | null;
  siteId: string | null;
  fetchCollection: (key: string, params: CollectionParams) => Promise<Rec[]>;
  path?: string;
  now?: () => Date;
}

/** Fetches every collection field of the module (in parallel). Unknown/empty config → []. */
export async function resolveCollectionFields(input: Pick<ModuleRenderInput, 'def' | 'values' | 'scope' | 'siteId' | 'fetchCollection'>): Promise<Record<string, Rec[]>> {
  const out: Record<string, Rec[]> = {};
  await Promise.all(
    input.def.fields
      .filter((f) => f.type === 'collection')
      .map(async (f) => {
        const q = collectionFieldQuery(f, input.values?.[f.key]);
        if (!input.siteId || !q.collection || !isQueryableCollection(q.collection)) { out[f.key] = []; return; }
        const filters: CollectionFilterSpec[] = q.filters.map((x) => ({ field: x.field, op: x.op, source: 'literal', value: x.value }));
        const params = buildCollectionQuery({ filters, limit: q.limit }, input.scope);
        if (q.sort) params.sort = q.sort;
        out[f.key] = await input.fetchCollection(q.collection, params);
      }),
  );
  return out;
}

export function buildModuleData(input: Omit<ModuleRenderInput, 'fetchCollection'>, collections: Record<string, Rec[]>): Rec {
  const nested = nestTokens(input.tokens);
  const scope = input.scope ?? {};
  return {
    module: resolveModuleValues(input.def.fields, input.values, input.lang, collections),
    site: { ...(nested.site ?? {}), id: input.siteId, lang: input.lang },
    institution: { ...(input.institution ?? {}), ...(nested.institution ?? {}) },
    head: nested.head ?? {},
    year: input.tokens.year ?? String(new Date().getFullYear()),
    page: scope.page ? moduleItem(scope.page) : null,
    item: scope.item ? moduleItem(scope.item) : null,
    parent: scope.parent ? moduleItem(scope.parent) : null,
    url: { query: { ...(scope.url ?? {}) }, path: input.path ?? '' },
  };
}

export async function renderModule(input: ModuleRenderInput): Promise<string> {
  const collections = await resolveCollectionFields(input);
  const data = buildModuleData(input, collections);
  return renderLiquid(input.def.template, data, { lang: input.lang, fetchCollection: input.fetchCollection, now: input.now });
}

export { checkTemplate, ModuleTemplateError, toTemplateError } from './engine';
