import React from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Eye, History, Languages, Save, Search, Send, Bookmark } from 'lucide-react';
import toast from 'react-hot-toast';
import type { Data } from '@puckeditor/core';
import { Button, Badge, ErrorState, Skeleton, Alert, Tooltip } from '@/components/ui';
import { useT } from '@/i18n';
import { SiteRuntimeProvider } from '@/site/runtime';
import { normaliseNavigation, normaliseSettings, normaliseTheme } from '@/site/theme';
import { isCodePage } from '@/site/code/codePage';
import type { PublicInstitution, SiteLang } from '@/site/types';
import { useInstitutionInfo, usePage, usePreviewToken, usePublishPage, useSite, useUpdatePage, apiError } from '../sites.queries';
import { joinUrl, pagePath, useSiteRole } from '../siteUtils';
import type { PuckData, SitePage } from '../sites.types';
import { SeoDrawer } from './SeoDrawer';
import { VersionHistoryDrawer } from './VersionHistoryDrawer';

const PuckEditor = React.lazy(() => import('./PuckEditor'));
const CodePageEditor = React.lazy(() => import('./CodePageEditor'));

const toPuck = (d: PuckData | null | undefined): Data => (d && Array.isArray(d.content) ? (d as unknown as Data) : ({ root: { props: {} }, content: [] } as Data));

const EditorSkeleton: React.FC = () => (
  <div className="flex-1 grid grid-cols-[16rem_1fr_18rem] gap-0 max-md:grid-cols-1" aria-busy="true">
    <div className="border-r border-slate-200 dark:border-white/10 p-3 space-y-2 max-md:hidden">{Array.from({ length: 10 }).map((_, i) => <Skeleton key={i} className="h-8" />)}</div>
    <div className="p-6 bg-slate-100 dark:bg-slate-950"><Skeleton className="h-full min-h-96 rounded-xl" /></div>
    <div className="border-l border-slate-200 dark:border-white/10 p-3 space-y-3 max-md:hidden">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10" />)}</div>
  </div>
);

/**
 * Full-screen page editor (/website-builder/pages/:id). Puck is lazy-loaded;
 * the same `siteConfig` renders the public site, so what you see here is what
 * visitors get. Drafts are saved explicitly (Ctrl/Cmd+S); publishing saves
 * first, then copies the draft to the live page.
 */
export default function PageEditor() {
  const t = useT();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { canManage } = useSiteRole();
  const pageQ = usePage(canManage ? id : undefined);
  const siteQ = useSite(canManage);
  const instQ = useInstitutionInfo();
  const tokenQ = usePreviewToken(canManage);
  const update = useUpdatePage();
  const publish = usePublishPage();

  const [lang, setLang] = React.useState<SiteLang>('en');
  const [editorKey, setEditorKey] = React.useState(0);
  const [initial, setInitial] = React.useState<Data | null>(null);
  const [dirty, setDirty] = React.useState(false);
  const [seoOpen, setSeoOpen] = React.useState(false);
  const [historyOpen, setHistoryOpen] = React.useState(false);
  const current = React.useRef<Data | null>(null);
  const savedJson = React.useRef<string>('');

  const page = pageQ.data;

  const loadInto = React.useCallback((p: SitePage) => {
    const d = toPuck(p.draft);
    current.current = d;
    savedJson.current = JSON.stringify(d);
    setInitial(d);
    setDirty(false);
    setEditorKey((k) => k + 1);
  }, []);

  // Initialise once per page id (never from background refetches).
  const loadedId = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (page && loadedId.current !== page.id) {
      loadedId.current = page.id;
      loadInto(page);
    }
  }, [page, loadInto]);

  const onChange = React.useCallback((d: Data) => {
    current.current = d;
    setDirty(JSON.stringify(d) !== savedJson.current);
  }, []);

  const saveDraft = React.useCallback(
    async (opts?: { quiet?: boolean; checkpoint?: string }) => {
      if (!page || !current.current) return false;
      const data = current.current;
      try {
        await update.mutateAsync({
          id: page.id,
          data: { draft: data as unknown as PuckData, ...(opts?.checkpoint ? { createVersion: true, note: opts.checkpoint } : {}) } as never,
        });
        savedJson.current = JSON.stringify(data);
        setDirty(JSON.stringify(current.current) !== savedJson.current);
        if (!opts?.quiet) toast.success(opts?.checkpoint ? t('Checkpoint saved to version history.') : t('Draft saved.'));
        return true;
      } catch {
        return false;
      }
    },
    [page, update, t]
  );

  const onPublish = async () => {
    if (!page) return;
    if (dirty && !(await saveDraft({ quiet: true }))) return;
    publish.mutate(page.id, { onSuccess: () => toast.success(t('“{title}” is live.', { title: page.title })) });
  };

  // Ctrl/Cmd+S saves; warn before leaving with unsaved changes.
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        void saveDraft();
      }
    };
    const onUnload = (e: BeforeUnloadEvent) => {
      if (!dirty) return;
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('beforeunload', onUnload);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('beforeunload', onUnload);
    };
  }, [saveDraft, dirty]);

  const goBack = () => {
    if (dirty && !window.confirm(t('You have unsaved changes. Leave without saving?'))) return;
    navigate('/website-builder?tab=pages');
  };

  const me = siteQ.data;
  const institution: PublicInstitution | null = instQ.data
    ? { name: instQ.data.name ?? '', logo: instQ.data.logoUrl ?? undefined, contact: { email: instQ.data.contactEmail ?? undefined, phone: instQ.data.contactPhone ?? undefined, address: instQ.data.address ?? undefined } }
    : null;
  const settings = React.useMemo(() => normaliseSettings(me?.site.settings), [me?.site.settings]);
  const theme = React.useMemo(() => normaliseTheme(me?.site.theme), [me?.site.theme]);
  const navigation = React.useMemo(() => normaliseNavigation(me?.site.navigation), [me?.site.navigation]);
  const pages = React.useMemo(() => (me?.pages ?? []).map((p) => ({ slug: p.slug, title: p.title, titleBn: p.titleBn ?? undefined })), [me?.pages]);
  const previewToken = tokenQ.data?.token ?? me?.previewToken ?? null;
  const previewBase = tokenQ.data?.previewUrl ?? me?.previewUrl ?? null;
  const previewHref = previewBase && page ? joinUrl(previewBase, pagePath(page.slug)) : null;
  const saving = update.isPending;
  /** Code pages (`root.props.mode === 'code'`, WEBSITE_V2_BRIEF.md §2) get the HTML/CSS/JS editor instead of Puck's block canvas. */
  const isCode = React.useMemo(() => (initial ? isCodePage(initial) : false), [initial]);

  const actions = (
    <div className="flex items-center gap-1.5 flex-wrap justify-end">
      <div className="inline-flex rounded-lg border border-slate-300 dark:border-white/15 overflow-hidden" role="group" aria-label={t('Editing language')}>
        {(['en', 'bn'] as SiteLang[]).map((l) => (
          <button
            key={l}
            type="button"
            aria-pressed={lang === l}
            onClick={() => setLang(l)}
            className={`px-2.5 h-8 text-xs font-semibold ${lang === l ? 'bg-primary-600 text-white' : 'bg-white dark:bg-transparent text-slate-700 dark:text-slate-200'}`}
          >
            {l === 'en' ? 'EN' : 'বাং'}
          </button>
        ))}
      </div>
      <Tooltip content={t('Page settings and SEO')} side="bottom">
        <Button size="icon-sm" variant="secondary" aria-label={t('Page settings and SEO')} onClick={() => setSeoOpen(true)}><Search className="w-4 h-4" /></Button>
      </Tooltip>
      <Tooltip content={t('Version history')} side="bottom">
        <Button size="icon-sm" variant="secondary" aria-label={t('Version history')} onClick={() => setHistoryOpen(true)}><History className="w-4 h-4" /></Button>
      </Tooltip>
      <Tooltip content={t('Save a named checkpoint')} side="bottom">
        <Button
          size="icon-sm"
          variant="secondary"
          aria-label={t('Save a named checkpoint')}
          onClick={() => {
            const note = window.prompt(t('Name this checkpoint'), t('Checkpoint'));
            if (note !== null) void saveDraft({ checkpoint: note.trim().slice(0, 200) || t('Checkpoint') });
          }}
        >
          <Bookmark className="w-4 h-4" />
        </Button>
      </Tooltip>
      {previewHref && (
        <a href={previewHref} target="_blank" rel="noreferrer" aria-label={t('Preview saved draft')} title={t('Preview saved draft')} className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-300 dark:border-white/12 text-slate-700 dark:text-slate-200 bg-white dark:bg-white/6">
          <Eye className="w-4 h-4" />
        </a>
      )}
      <Button size="sm" variant="secondary" leftIcon={<Save className="w-3.5 h-3.5" />} isLoading={saving} disabled={!dirty} onClick={() => void saveDraft()}>
        {t('Save draft')}
      </Button>
      <Button size="sm" leftIcon={<Send className="w-3.5 h-3.5" />} isLoading={publish.isPending} onClick={onPublish}>
        {t('Publish')}
      </Button>
    </div>
  );

  if (!canManage) {
    return (
      <div className="p-6">
        <ErrorState title={t('Not allowed')} message={t('Only administrators can edit website pages.')} />
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-white dark:bg-slate-900">
      <div className="flex items-center gap-2 px-3 h-11 border-b border-slate-200 dark:border-white/10 shrink-0">
        <Button size="sm" variant="ghost" leftIcon={<ArrowLeft className="w-4 h-4" />} onClick={goBack}>{t('Pages')}</Button>
        <span className="text-sm font-semibold text-slate-900 dark:text-slate-50 truncate">{page?.title ?? '…'}</span>
        {page && <span className="text-xs font-mono text-slate-500 hidden sm:inline">{pagePath(page.slug)}</span>}
        <span className="ml-auto flex items-center gap-2">
          {dirty ? <Badge variant="warning" dot>{t('Unsaved changes')}</Badge> : page ? <Badge variant="success" dot>{t('Saved')}</Badge> : null}
          <Languages className="w-4 h-4 text-slate-400 hidden sm:block" aria-hidden />
          <span className="text-xs text-slate-500 hidden sm:inline">{lang === 'bn' ? t('Showing Bangla text') : t('Showing English text')}</span>
        </span>
      </div>

      <div className="md:hidden px-3 py-2">
        <Alert tone="info">{t('The editor works best on a tablet or computer. On a phone, use the panel buttons in the editor header to switch between blocks and settings.')}</Alert>
      </div>

      {pageQ.isError || siteQ.isError ? (
        <ErrorState
          title={t('Could not open this page')}
          message={apiError(pageQ.error ?? siteQ.error, t('It may have been deleted.'))}
          onRetry={() => { pageQ.refetch(); siteQ.refetch(); }}
        />
      ) : !page || !me || !initial ? (
        <EditorSkeleton />
      ) : (
        <div className="flex-1 min-h-0">
          <SiteRuntimeProvider
            siteId={me.site.id}
            lang={lang}
            setLang={setLang}
            mode="editor"
            institution={institution}
            settings={settings}
            theme={theme}
            navigation={navigation}
            pages={pages}
            subdomain={me.site.subdomain}
            basePath={`/s/${me.site.subdomain}`}
            previewToken={previewToken}
          >
            {isCode ? (
              <div className="h-full flex flex-col min-h-0">
                <div className="flex items-center justify-end gap-2 px-3 py-2 border-b border-slate-200 dark:border-white/10 shrink-0">
                  {actions}
                </div>
                <div className="flex-1 min-h-0">
                  <React.Suspense fallback={<EditorSkeleton />}>
                    <CodePageEditor key={editorKey} data={initial} onChange={onChange} />
                  </React.Suspense>
                </div>
              </div>
            ) : (
              <React.Suspense fallback={<EditorSkeleton />}>
                <PuckEditor key={editorKey} data={initial} onChange={onChange} headerTitle={lang === 'bn' && page.titleBn ? page.titleBn : page.title} actions={actions} />
              </React.Suspense>
            )}
          </SiteRuntimeProvider>
          <SeoDrawer page={page} isOpen={seoOpen} onClose={() => setSeoOpen(false)} />
          <VersionHistoryDrawer
            page={page}
            isOpen={historyOpen}
            onClose={() => setHistoryOpen(false)}
            hasUnsaved={dirty}
            onRestored={(p) => (p?.draft ? loadInto(p) : pageQ.refetch().then((r) => r.data && loadInto(r.data)))}
          />
        </div>
      )}
      <Link to="/website-builder?tab=pages" className="sr-only">{t('Back to pages')}</Link>
    </div>
  );
}
