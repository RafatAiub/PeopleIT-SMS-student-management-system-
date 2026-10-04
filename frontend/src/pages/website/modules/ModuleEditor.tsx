import React from 'react';
import toast from 'react-hot-toast';
import { AlertTriangle, ArrowLeft, CheckCircle2, Download, History, Save, Send, Trash2 } from 'lucide-react';
import { Alert, Badge, Button, Card, Drawer, ErrorState, Modal, Skeleton, Tabs, TabPanel } from '@/components/ui';
import { CodeEditor } from '@/site/fields/CodeField';
import { checkFields, normaliseFields, type ModuleDef } from '@/site/modules/types';
import { checkCss } from '@/site/modules/cssScope';
import type { SiteMeResponse } from '../sites.types';
import { apiError } from '../sites.queries';
import { FieldsBuilder } from './FieldsBuilder';
import { ModulePreview } from './ModulePreview';
import {
  downloadJson, exportModule, useDeleteModule, useModule, useModuleVersions, usePublishModule, useRestoreModuleVersion, useUpdateModule,
  type ModuleIssue, type ModuleValidation, type SiteModuleFull,
} from './modules.api';
import { useMT } from './modules.i18n';

// =============================================================================
// Module editor (W16): Settings / Fields / HTML (Liquid) / CSS / JS tabs, live
// preview with sample values + real data, validation with line numbers, and
// Save draft / Publish / Versions / Export / Delete.
// =============================================================================

interface Draft {
  key: string;
  name: string;
  nameBn: string;
  description: string;
  category: string;
  icon: string;
  fields: unknown[];
  template: string;
  css: string;
  js: string;
}

const toDraft = (m: SiteModuleFull): Draft => ({
  key: m.key, name: m.name, nameBn: m.nameBn ?? '', description: m.description ?? '', category: m.category, icon: m.icon ?? '',
  fields: Array.isArray(m.fields) ? (m.fields as unknown[]) : [], template: m.template ?? '', css: m.css ?? '', js: m.js ?? '',
});

const bytes = (s: string) => new Blob([s]).size;
const MAX = 100 * 1024;
const inputCls = 'w-full rounded-md border border-slate-300 dark:border-white/15 bg-white dark:bg-slate-900 px-2.5 py-2 text-sm text-slate-900 dark:text-slate-100';

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = React.useState(value);
  React.useEffect(() => {
    const id = setTimeout(() => setV(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return v;
}

const REFERENCE = `Variables
  module.<field>        your fields (text picks the visitor's language; collection fields are lists of items)
  module.<field>_en / _bn  both languages of a Bangla-twin field
  site.name, site.tagline, institution.name/phone/email/address/eiin, head.name, year
  page.*, item.*, parent.*  the record of a profile page / the current Collection list item
  lang ("en" | "bn"), url.query.<param>, url.path
  Items have url (profile page link) and photo (first image) shortcuts.

Filters
  t            {{ module.heading | t }}  ·  {{ 'Apply now' | t: 'আবেদন করুন' }}
  date         {{ d | date }} long · 'short' · 'day' · 'month' · 'weekday' · 'time' · or '%d %b %Y'
  money        {{ 1500 | money }} → ৳1,500 (Bangla digits in Bangla)
  num          {{ 1234567 | num }} → 12,34,567   {{ 98.456 | num: 1 }} → 98.5
  bn_digits    {{ '2026' | bn_digits }} → ২০২৬
  img          {{ t.photo | img: 400 }} optimised image URL
  markdown     {{ text | markdown }}  ·  raw  {{ html | raw }} (sanitised anyway)
  days_until   {{ module.deadline | days_until }}
  + every standard Liquid filter (default, upcase, split, size, …). Output is escaped by default.

Tags
  {% collection "notices" limit:5 sort:"-publishedAt" filter.title.contains:"exam" as notices %}
  options: limit (1–50), sort, q, page, include, filter.<field>, filter.<field>.<op>
  ops: eq ne in contains gt gte lt lte has · values: "text", 12, or a variable (item.department, url.query.q)
  Not available: include / render / layout (no files).`;

function IssueList({ v, checking }: { v: ModuleValidation | null; checking: boolean }) {
  const mt = useMT();
  if (!v) return checking ? <p className="text-xs text-slate-500">{mt('Checking…')}</p> : null;
  if (!v.errors.length && !v.warnings.length) {
    return <p className="flex items-center gap-1.5 text-xs text-green-700 dark:text-green-400"><CheckCircle2 className="w-3.5 h-3.5" /> {mt('No problems found.')}</p>;
  }
  const row = (i: ModuleIssue, k: number, warn: boolean) => (
    <li key={k} className={`flex gap-2 text-xs ${warn ? 'text-amber-800 dark:text-amber-300' : 'text-red-700 dark:text-red-400'}`}>
      <span className="shrink-0 font-mono uppercase">{i.source}{i.line ? `:${i.line}` : ''}</span>
      <span>{i.message}</span>
    </li>
  );
  return (
    <div role="status" aria-live="polite" className="rounded-lg border border-slate-200 dark:border-white/10 p-2">
      {v.errors.length > 0 && <p className="mb-1 flex items-center gap-1 text-xs font-semibold text-red-700 dark:text-red-400"><AlertTriangle className="w-3.5 h-3.5" /> {mt('Problems')}</p>}
      <ul className="flex flex-col gap-1">{v.errors.map((i, k) => row(i, k, false))}</ul>
      {v.warnings.length > 0 && <p className="mb-1 mt-2 text-xs font-semibold text-amber-800 dark:text-amber-300">{mt('Warnings')}</p>}
      <ul className="flex flex-col gap-1">{v.warnings.map((i, k) => row(i, k, true))}</ul>
    </div>
  );
}

function VersionsDrawer({ id, isOpen, onClose, dirty, onRestored }: { id: string; isOpen: boolean; onClose: () => void; dirty: boolean; onRestored: (m: SiteModuleFull) => void }) {
  const mt = useMT();
  const q = useModuleVersions(id, isOpen);
  const restore = useRestoreModuleVersion();
  return (
    <Drawer isOpen={isOpen} onClose={onClose} title={mt('Versions')} width="md">
      {q.isLoading ? <Skeleton className="h-24" /> : !q.data?.length ? (
        <p className="text-sm text-slate-500">{mt('No versions yet. Publishing creates one.')}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {q.data.map((v) => (
            <li key={v.id} className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 dark:border-white/10 p-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-50">v{v.version} {v.isPublished && <Badge variant="success" dot>{mt('Live')}</Badge>}</p>
                <p className="text-xs text-slate-500">{new Date(v.createdAt).toLocaleString()}{v.createdByName ? ` · ${v.createdByName}` : ''}{v.note ? ` · ${v.note}` : ''}</p>
              </div>
              <Button size="sm" variant="secondary" isLoading={restore.isPending && restore.variables?.versionId === v.id} onClick={() => {
                if (!window.confirm(`${dirty ? `${mt('You have unsaved changes. Leave without saving?')}\n\n` : ''}${mt('Restore this version into the draft? Publish afterwards to make it live.')}`)) return;
                restore.mutate({ id, versionId: v.id }, { onSuccess: (m) => { toast.success(mt('Version restored to the draft.')); onRestored(m); onClose(); } });
              }}>{mt('Restore')}</Button>
            </li>
          ))}
        </ul>
      )}
    </Drawer>
  );
}

export function ModuleEditor({ id, me, onBack }: { id: string; me: SiteMeResponse; onBack: () => void }) {
  const mt = useMT();
  const q = useModule(id);
  const update = useUpdateModule();
  const publish = usePublishModule();
  const del = useDeleteModule();
  const [draft, setDraft] = React.useState<Draft | null>(null);
  const saved = React.useRef('');
  const [tab, setTab] = React.useState('fields');
  const [historyOpen, setHistoryOpen] = React.useState(false);
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const [validation, setValidation] = React.useState<ModuleValidation | null>(null);
  const [checking, setChecking] = React.useState(false);

  const load = React.useCallback((m: SiteModuleFull) => {
    const d = toDraft(m);
    saved.current = JSON.stringify(d);
    setDraft(d);
  }, []);
  const loadedId = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (q.data && loadedId.current !== q.data.id) {
      loadedId.current = q.data.id;
      load(q.data);
    }
  }, [q.data, load]);

  const dirty = draft ? JSON.stringify(draft) !== saved.current : false;
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => (d ? { ...d, [k]: v } : d));

  // Validation while typing runs in the browser (same Liquid parser, same rules);
  // the server's result arrives with every save and with a refused publish.
  // (Calling POST /validate per keystroke pause would write an audit row each time.)
  const debounced = useDebounced(draft, 500);
  React.useEffect(() => {
    if (!debounced) return;
    let alive = true;
    setChecking(true);
    import('@/site/modules/engine')
      .then(({ checkTemplate }) => {
        if (!alive) return;
        const errors: ModuleIssue[] = [
          ...checkFields(debounced.fields).map((message): ModuleIssue => ({ source: 'fields', line: null, col: null, message })),
          ...(() => { const e = checkTemplate(debounced.template); return e ? [{ source: 'template' as const, line: e.line, col: e.col, message: e.message }] : []; })(),
          ...checkCss(debounced.css).map((x): ModuleIssue => ({ source: 'css', line: x.line, col: null, message: x.message })),
        ];
        setValidation({ ok: errors.length === 0, errors, warnings: [] });
      })
      .finally(() => { if (alive) setChecking(false); });
    return () => { alive = false; };
  }, [debounced]);

  const previewDef = useDebounced<ModuleDef | null>(
    React.useMemo(() => (draft ? { key: draft.key, version: null, draft: true, name: draft.name, nameBn: draft.nameBn, category: draft.category, fields: normaliseFields(draft.fields), template: draft.template, css: draft.css, js: draft.js } : null), [draft]),
    400,
  );

  // Warn before leaving the browser tab with unsaved changes.
  React.useEffect(() => {
    const onUnload = (e: BeforeUnloadEvent) => { if (dirty) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', onUnload);
    return () => window.removeEventListener('beforeunload', onUnload);
  }, [dirty]);

  const save = async (quiet = false): Promise<boolean> => {
    if (!draft) return false;
    if ([draft.template, draft.css, draft.js].some((s) => bytes(s) > MAX)) { toast.error('HTML, CSS and JS are limited to 100 KB each.'); return false; }
    try {
      const m = await update.mutateAsync({
        id,
        data: {
          ...(q.data?.publishedVersion == null ? { key: draft.key } : {}),
          name: draft.name, nameBn: draft.nameBn || null, description: draft.description || null, category: draft.category || 'general', icon: draft.icon || null,
          fields: draft.fields, template: draft.template, css: draft.css, js: draft.js,
        },
      });
      load(m);
      if (m.validation) setValidation(m.validation);
      if (!quiet) toast.success(mt('Saved.'));
      return true;
    } catch {
      return false;
    }
  };

  // Ctrl/Cmd+S saves.
  const saveRef = React.useRef(save);
  saveRef.current = save;
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); void saveRef.current(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const onPublish = async () => {
    if (validation && !validation.ok) { toast.error(mt('Fix the problems before publishing.')); return; }
    if (dirty && !(await save(true))) return;
    const note = window.prompt('Note for this version (optional)', '') ?? undefined;
    publish.mutate({ id, note: note?.trim() || undefined }, {
      onSuccess: (r) => {
        load(r.module);
        if (r.warnings?.length) setValidation({ ok: true, errors: [], warnings: r.warnings });
        toast.success(mt('Module published. Pages using it now show this version.'));
      },
      onError: (e) => {
        const errors = (e as { response?: { data?: { errors?: { errors?: ModuleIssue[] } } } })?.response?.data?.errors?.errors;
        if (Array.isArray(errors)) setValidation({ ok: false, errors, warnings: [] });
      },
    });
  };

  const onExport = async () => {
    try {
      downloadJson(`${draft?.key ?? 'module'}.module.json`, await exportModule(id));
    } catch (e) {
      toast.error(apiError(e, 'Could not export the module.'));
    }
  };

  const goBack = () => {
    if (dirty && !window.confirm(mt('You have unsaved changes. Leave without saving?'))) return;
    onBack();
  };

  if (q.isError) return <ErrorState title="Could not open this module" message={apiError(q.error, 'It may have been deleted.')} onRetry={() => q.refetch()} />;
  if (!draft || !q.data) return <div className="space-y-3" aria-busy="true"><Skeleton className="h-10" /><Skeleton className="h-96 rounded-2xl" /></div>;

  const m = q.data;
  const usage = m.usage ?? { count: 0, pages: [] };
  const sizeWarn = (s: string) => (bytes(s) > MAX ? <p className="field-error mt-1" role="alert">{Math.ceil(bytes(s) / 1024)} KB — limit 100 KB</p> : null);
  const tabs = [
    { id: 'fields', label: mt('Fields') },
    { id: 'html', label: mt('HTML (Liquid)') },
    { id: 'css', label: 'CSS' },
    { id: 'js', label: 'JS' },
    { id: 'settings', label: mt('Settings') },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="ghost" leftIcon={<ArrowLeft className="w-4 h-4" />} onClick={goBack}>{mt('Back to modules')}</Button>
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50">{draft.name || draft.key}</h2>
        <span className="font-mono text-xs text-slate-500">{draft.key}</span>
        {m.publishedVersion ? <Badge variant="success" dot>{mt('Published')} v{m.publishedVersion}</Badge> : <Badge variant="neutral" dot>{mt('Draft')}</Badge>}
        {m.publishedVersion && m.hasDraftChanges && <Badge variant="warning">{mt('Unpublished changes')}</Badge>}
        {dirty && <Badge variant="warning" dot>Unsaved</Badge>}
        <span className="ml-auto flex flex-wrap items-center gap-1.5">
          <Button size="sm" variant="secondary" leftIcon={<History className="w-3.5 h-3.5" />} onClick={() => setHistoryOpen(true)}>{mt('Versions')}</Button>
          <Button size="sm" variant="secondary" leftIcon={<Download className="w-3.5 h-3.5" />} onClick={onExport}>{mt('Export')}</Button>
          <Button size="sm" variant="danger-soft" leftIcon={<Trash2 className="w-3.5 h-3.5" />} onClick={() => setConfirmDelete(true)}>{mt('Delete')}</Button>
          <Button size="sm" variant="secondary" leftIcon={<Save className="w-3.5 h-3.5" />} isLoading={update.isPending} disabled={!dirty} onClick={() => void save()}>{mt('Save draft')}</Button>
          <Button size="sm" leftIcon={<Send className="w-3.5 h-3.5" />} isLoading={publish.isPending} onClick={onPublish}>{mt('Publish')}</Button>
        </span>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <Card className="min-w-0">
          <Tabs tabs={tabs} value={tab} onChange={setTab} label="Module editor sections" idPrefix="mod-tab" variant="pills" />
          <div className="pt-3">
            <TabPanel id="fields" value={tab} idPrefix="mod-tab">
              <FieldsBuilder value={draft.fields} onChange={(f) => set('fields', f)} />
            </TabPanel>
            <TabPanel id="html" value={tab} idPrefix="mod-tab">
              <CodeEditor value={draft.template} onChange={(v) => set('template', v)} language="html" height={460} placeholder={'<section class="my-module">\n  <h2>{{ module.heading | t }}</h2>\n</section>'} />
              {sizeWarn(draft.template)}
              <details className="mt-2 rounded-lg border border-slate-200 dark:border-white/10 p-2">
                <summary className="cursor-pointer text-xs font-semibold text-slate-700 dark:text-slate-200">{mt('Template reference')}</summary>
                <pre className="mt-2 whitespace-pre-wrap text-[11px] leading-relaxed text-slate-700 dark:text-slate-300">{REFERENCE}</pre>
              </details>
            </TabPanel>
            <TabPanel id="css" value={tab} idPrefix="mod-tab">
              <CodeEditor value={draft.css} onChange={(v) => set('css', v)} language="css" height={460} placeholder=".my-module { padding: 16px; border-radius: var(--site-radius); background: var(--site-surface); }" />
              {sizeWarn(draft.css)}
              <p className="mt-1 text-xs text-slate-500">Scoped to each copy of the module automatically. Theme variables: --site-primary, --site-on-primary, --site-accent, --site-surface, --site-text, --site-muted, --site-border, --site-radius, --site-font, --site-heading-font.</p>
            </TabPanel>
            <TabPanel id="js" value={tab} idPrefix="mod-tab">
              <CodeEditor value={draft.js} onChange={(v) => set('js', v)} language="javascript" height={460} placeholder="// Optional. With JavaScript the module runs in the sandbox (SITE.data(), SITE.lang, SITE.navigate())." />
              {sizeWarn(draft.js)}
            </TabPanel>
            <TabPanel id="settings" value={tab} idPrefix="mod-tab">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="flex flex-col gap-1 text-sm font-medium text-slate-700 dark:text-slate-200">{mt('Name')}<input className={inputCls} value={draft.name} onChange={(e) => set('name', e.target.value)} /></label>
                <label className="flex flex-col gap-1 text-sm font-medium text-slate-700 dark:text-slate-200">{mt('Name (Bangla)')}<input className={inputCls} value={draft.nameBn} onChange={(e) => set('nameBn', e.target.value)} /></label>
                <label className="flex flex-col gap-1 text-sm font-medium text-slate-700 dark:text-slate-200">
                  {mt('Key')}
                  <input className={`${inputCls} font-mono`} value={draft.key} disabled={m.publishedVersion != null} onChange={(e) => set('key', e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, '-').slice(0, 60))} />
                  {m.publishedVersion != null && <span className="text-xs font-normal text-slate-500">Pages use this key, so it is fixed after the first publish.</span>}
                </label>
                <label className="flex flex-col gap-1 text-sm font-medium text-slate-700 dark:text-slate-200">{mt('Category')}<input className={inputCls} value={draft.category} onChange={(e) => set('category', e.target.value.slice(0, 40))} /></label>
                <label className="flex flex-col gap-1 text-sm font-medium text-slate-700 dark:text-slate-200 sm:col-span-2">{mt('Description')}<textarea className={inputCls} rows={2} value={draft.description} onChange={(e) => set('description', e.target.value.slice(0, 500))} /></label>
              </div>
              <Alert tone="info" className="mt-3">{mt('Only admins (and website developers) can edit module code; editors only fill in the form on pages.')}</Alert>
            </TabPanel>
          </div>
          <div className="mt-3"><IssueList v={validation} checking={checking} /></div>
        </Card>

        <Card className="min-w-0">
          <h3 className="mb-2 text-sm font-semibold text-slate-900 dark:text-slate-50">{mt('Live preview')}</h3>
          {previewDef ? <ModulePreview def={previewDef} me={me} /> : <Skeleton className="h-40" />}
        </Card>
      </div>

      <VersionsDrawer id={id} isOpen={historyOpen} onClose={() => setHistoryOpen(false)} dirty={dirty} onRestored={load} />

      <Modal
        isOpen={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title={mt('Delete this module?')}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setConfirmDelete(false)}>{mt('Cancel')}</Button>
            <Button variant="danger" isLoading={del.isPending} onClick={() => del.mutate({ id, force: usage.count > 0 }, { onSuccess: () => { setConfirmDelete(false); onBack(); } })}>
              {usage.count > 0 ? mt('Delete anyway') : mt('Delete')}
            </Button>
          </div>
        }
      >
        {usage.count > 0 ? (
          <Alert tone="warning">{mt('It is used {n} times on: {pages}. Those blocks will show nothing on the live site.', { n: usage.count, pages: usage.pages.map((p) => p.title).join(', ') })}</Alert>
        ) : (
          <p className="text-sm text-slate-600 dark:text-slate-300">{mt('It is not used on any page.')}</p>
        )}
      </Modal>
    </div>
  );
}
