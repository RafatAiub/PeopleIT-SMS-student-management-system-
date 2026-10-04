import React from 'react';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Blocks, Check, FileUp, Package, Plus, Search } from 'lucide-react';
import { Badge, Button, Card, CardHeader, ErrorState, Skeleton } from '@/components/ui';
import { STARTER_MODULES, starterDoc } from '@/site/modules/starters';
import type { SiteMeResponse } from '../sites.types';
import { apiError } from '../sites.queries';
import { ModuleEditor } from '../modules/ModuleEditor';
import { useCreateModule, useImportModule, useModules } from '../modules/modules.api';
import { useMT } from '../modules/modules.i18n';

// =============================================================================
// Website Builder → Modules (W16/W17): the school's custom modules (Liquid),
// a one-click starter library, import/export. `?module=<id>` opens the editor.
// =============================================================================

const BLANK_TEMPLATE = `<section class="my-module">
  <h2>{{ module.heading | t }}</h2>
  {% if module.text %}<p>{{ module.text }}</p>{% endif %}
</section>
`;
const BLANK_CSS = `.my-module { padding: 24px; border-radius: var(--site-radius); background: var(--site-surface); }
.my-module h2 { margin: 0 0 8px; font-family: var(--site-heading-font); }
`;
const BLANK_FIELDS = [
  { key: 'heading', type: 'text', label: 'Heading', bn: true, default: 'Hello' },
  { key: 'text', type: 'textarea', label: 'Text', bn: true, default: '' },
];

const inputCls = 'w-full rounded-lg border border-slate-300 dark:border-white/15 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-slate-100';

export const ModulesTab: React.FC<{ me: SiteMeResponse }> = ({ me }) => {
  const mt = useMT();
  const [params, setParams] = useSearchParams();
  const openId = params.get('module');
  const setOpen = (id: string | null) => {
    const next = new URLSearchParams(params);
    if (id) next.set('module', id);
    else next.delete('module');
    setParams(next, { replace: true });
  };

  const [search, setSearch] = React.useState('');
  const [category, setCategory] = React.useState('');
  const [status, setStatus] = React.useState('');
  const listQ = useModules({ search: search.trim() || undefined, category: category || undefined, status: status || undefined });
  const allQ = useModules({});
  const create = useCreateModule();
  const importer = useImportModule();
  const fileRef = React.useRef<HTMLInputElement>(null);

  if (openId) return <ModuleEditor id={openId} me={me} onBack={() => setOpen(null)} />;

  const categories = Array.from(new Set((allQ.data ?? []).map((m) => m.category))).sort();
  const installedKeys = new Set((allQ.data ?? []).map((m) => m.key));

  const onNew = () => {
    const name = window.prompt(mt('Name'), 'My module');
    if (!name?.trim()) return;
    create.mutate(
      { name: name.trim(), category: 'general', fields: BLANK_FIELDS, template: BLANK_TEMPLATE, css: BLANK_CSS, js: '' },
      { onSuccess: (m) => { toast.success(mt('Module created.')); setOpen(m.id); } },
    );
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    let doc: unknown;
    try {
      doc = JSON.parse(await file.text());
    } catch {
      toast.error(mt('That file is not a module export.'));
      return;
    }
    importer.mutate(doc, { onSuccess: (r) => { toast.success(mt('Module imported as “{key}”.', { key: r.module.key })); setOpen(r.module.id); } });
  };

  const install = (key: string) => {
    const s = STARTER_MODULES.find((x) => x.key === key);
    if (!s) return;
    importer.mutate(starterDoc(s), { onSuccess: (r) => { toast.success(mt('Module imported as “{key}”.', { key: r.module.key })); setOpen(r.module.id); } });
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          icon={<Blocks className="w-4 h-4" />}
          title={mt('Custom modules')}
          description={mt('Reusable blocks your school builds with code (Liquid HTML, CSS and optional JavaScript). Publish one and editors can drag it from “My modules” in the page editor and just fill in a form.')}
          actions={
            <div className="flex flex-wrap gap-2">
              <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={(e) => { void onFile(e.target.files?.[0]); e.target.value = ''; }} />
              <Button size="sm" variant="secondary" leftIcon={<FileUp className="w-4 h-4" />} isLoading={importer.isPending} onClick={() => fileRef.current?.click()} title={mt('Import a module (.json)')}>{mt('Import')}</Button>
              <Button size="sm" leftIcon={<Plus className="w-4 h-4" />} isLoading={create.isPending} onClick={onNew}>{mt('New module')}</Button>
            </div>
          }
        />
        <div className="grid gap-2 sm:grid-cols-[1fr_12rem_12rem]">
          <label className="relative">
            <span className="sr-only">{mt('Search modules')}</span>
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
            <input className={`${inputCls} pl-8`} placeholder={mt('Search modules')} value={search} onChange={(e) => setSearch(e.target.value)} />
          </label>
          <select aria-label={mt('Category')} className={inputCls} value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">{mt('All categories')}</option>
            {categories.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <select aria-label="Status" className={inputCls} value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">{mt('All statuses')}</option>
            <option value="DRAFT">{mt('Draft')}</option>
            <option value="PUBLISHED">{mt('Published')}</option>
          </select>
        </div>

        <div className="mt-4">
          {listQ.isLoading ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}</div>
          ) : listQ.isError ? (
            <ErrorState compact title="Could not load modules" message={apiError(listQ.error, 'Try again.')} onRetry={() => listQ.refetch()} />
          ) : !listQ.data?.length ? (
            <div className="rounded-xl border border-dashed border-slate-300 dark:border-white/15 p-6 text-center">
              <p className="font-semibold text-slate-800 dark:text-slate-100">{mt('No modules yet')}</p>
              <p className="text-sm text-slate-500">{mt('Create one, import a file, or install a starter below.')}</p>
            </div>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {listQ.data.map((m) => (
                <li key={m.id}>
                  <button type="button" onClick={() => setOpen(m.id)} className="flex h-full w-full flex-col gap-1.5 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 p-4 text-left transition hover:border-primary-600 hover:shadow-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-600">
                    <span className="flex items-center gap-2">
                      <span className="truncate font-semibold text-slate-900 dark:text-slate-50">{m.name}</span>
                      {m.publishedVersion ? <Badge variant="success" dot>v{m.publishedVersion}</Badge> : <Badge variant="neutral" dot>{mt('Draft')}</Badge>}
                      {m.publishedVersion && m.hasDraftChanges && <Badge variant="warning">{mt('Unpublished changes')}</Badge>}
                    </span>
                    {m.nameBn && <span className="text-sm text-slate-600 dark:text-slate-300">{m.nameBn}</span>}
                    <span className="font-mono text-xs text-slate-500">{m.key} · {m.category}</span>
                    <span className="mt-auto text-xs text-slate-500">{m.usageCount ? mt('Used {n} times', { n: m.usageCount }) : mt('Not used on any page')}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>

      <Card>
        <CardHeader icon={<Package className="w-4 h-4" />} title={mt('Starter library')} description={mt('Install a ready-made module with one click, then edit and publish it.')} />
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {STARTER_MODULES.map((s) => {
            const installed = installedKeys.has(s.key);
            return (
              <li key={s.key} className="flex flex-col gap-1.5 rounded-xl border border-slate-200 dark:border-white/10 p-4">
                <span className="font-semibold text-slate-900 dark:text-slate-50">{s.name}</span>
                <span className="text-sm text-slate-600 dark:text-slate-300">{s.nameBn}</span>
                <span className="text-xs text-slate-500">{s.description}</span>
                <div className="mt-auto flex items-center gap-2 pt-2">
                  {installed && <Badge variant="success"><Check className="mr-1 inline h-3 w-3" />{mt('Installed')}</Badge>}
                  <Button size="sm" variant={installed ? 'secondary' : 'primary'} isLoading={importer.isPending && (importer.variables as { module?: { key?: string } } | undefined)?.module?.key === s.key} onClick={() => install(s.key)}>
                    {installed ? mt('Install again') : mt('Install')}
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      </Card>
    </div>
  );
};
