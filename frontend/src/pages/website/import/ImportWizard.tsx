/**
 * "Import website (ZIP / HTML)" — Track D (see docs/redesign/WEBSITE_V3_PLAN.md
 * §1 "AI website ZIP import" and §3 Track D). Accepts a single `.html` file or
 * a ZIP of a built static site, parses it with the pure logic in `./logic.ts`
 * (fully unit-tested — see `__tests__/zip-import.test.ts`), uploads local
 * assets with `./assetUpload.ts`, then lets the admin review before saving
 * every page as a DRAFT code page through the existing page hooks.
 */
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { unzipSync } from 'fflate';
import {
  UploadCloud, FileArchive, FileCode2, Loader2, CheckCircle2, AlertTriangle, ExternalLink, Home as HomeIcon, Rocket,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { Modal, Button, Card, Input, Checkbox, Select, Alert, Badge } from '@/components/ui';
import { useT } from '@/i18n';
import { cn } from '@/lib/cn';
import { useCreateMedia, useCreatePage, usePublishPage, useUpdatePage } from '../sites.queries';
import { SLUG_RE, pagePath } from '../siteUtils';
import type { PuckData, SiteMeResponse } from '../sites.types';
import {
  applyAssetUrls,
  checkExecutables,
  checkPageSizeCap,
  checkServerApp,
  checkSourceProject,
  checkZipLimits,
  cleanZipEntries,
  extractHtmlPage,
  MAX_ZIP_BYTES,
  RESERVED_IMPORT_SLUGS,
  slugForPath,
  type ZipFiles,
} from './logic';
import { isUploadableAssetPath, uploadAssets, type AssetUploadOutcome } from './assetUpload';

interface DetectedPage {
  key: string;
  htmlPath: string;
  slug: string;
  title: string;
  description?: string;
  html: string;
  css: string;
  js: string;
  assetRefs: string[];
  hasModuleScript: boolean;
  warnings: string[];
  include: boolean;
}

type Step = 'select' | 'parsing' | 'review' | 'working' | 'summary';

interface SummaryRow {
  key: string;
  title: string;
  slug: string;
  action: 'created' | 'updated-home' | 'updated' | 'skipped' | 'oversize' | 'error';
  pageId?: string;
  message?: string;
}

const TEXT_DECODER = new TextDecoder('utf-8');

function titleCase(slug: string): string {
  return slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) || 'Page';
}

export const ImportWizard: React.FC<{ isOpen: boolean; onClose: () => void; me: SiteMeResponse }> = ({ isOpen, onClose, me }) => {
  const t = useT();
  const navigate = useNavigate();
  const createPage = useCreatePage();
  const updatePage = useUpdatePage();
  const publishPage = usePublishPage();
  const createMedia = useCreateMedia();

  const [step, setStep] = React.useState<Step>('select');
  const [error, setError] = React.useState<string | null>(null);
  const [pages, setPages] = React.useState<DetectedPage[]>([]);
  const [zipFiles, setZipFiles] = React.useState<ZipFiles>({});
  const [homeKey, setHomeKey] = React.useState<string>('');
  const [chrome, setChrome] = React.useState<'full' | 'none'>('none');
  const [conflictMode, setConflictMode] = React.useState<'replace' | 'skip'>('skip');
  const [progress, setProgress] = React.useState<{ done: number; total: number } | null>(null);
  const [workingLabel, setWorkingLabel] = React.useState('');
  const [summary, setSummary] = React.useState<SummaryRow[]>([]);
  const [notes, setNotes] = React.useState<string[]>([]);
  const [publishing, setPublishing] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const reset = React.useCallback(() => {
    setStep('select');
    setError(null);
    setPages([]);
    setZipFiles({});
    setHomeKey('');
    setChrome('none');
    setConflictMode('skip');
    setProgress(null);
    setWorkingLabel('');
    setSummary([]);
    setNotes([]);
  }, []);

  React.useEffect(() => {
    if (isOpen) reset();
  }, [isOpen, reset]);

  const busy = step === 'parsing' || step === 'working';
  const handleClose = () => {
    if (busy) return;
    onClose();
  };

  const homePage = React.useMemo(() => me.pages.find((p) => p.slug === ''), [me.pages]);

  const readFile = async (file: File) => {
    setStep('parsing');
    setError(null);
    try {
      const isHtml = /\.html?$/i.test(file.name);
      const isZip = /\.zip$/i.test(file.name);
      if (!isHtml && !isZip) {
        setError(t('Choose a single .html file, or a .zip of a built website (up to 50 MB).'));
        setStep('select');
        return;
      }
      if (file.size > MAX_ZIP_BYTES) {
        setError(t('That file is larger than 50 MB.'));
        setStep('select');
        return;
      }

      let cleaned: ZipFiles;
      if (isHtml) {
        cleaned = { 'index.html': new TextEncoder().encode(await file.text()) };
      } else {
        const raw = unzipSync(new Uint8Array(await file.arrayBuffer()));
        const totalBytes = Object.values(raw).reduce((s, d) => s + d.byteLength, 0);
        const limits = checkZipLimits(Object.keys(raw).length, totalBytes);
        if (!limits.ok) {
          setError(limits.reason ?? t('That ZIP is too large.'));
          setStep('select');
          return;
        }
        cleaned = cleanZipEntries(raw).files;
      }

      const paths = Object.keys(cleaned);
      const htmlPaths = paths.filter((p) => /\.html?$/i.test(p)).sort();
      if (htmlPaths.length === 0) {
        setError(t('No HTML pages were found in that file.'));
        setStep('select');
        return;
      }

      const rejectChecks = [checkSourceProject(paths), checkServerApp(paths), checkExecutables(paths)];
      const rejected = rejectChecks.find((r) => r.rejected);
      if (rejected) {
        setError(rejected.reason ?? t('That file can’t be imported.'));
        setStep('select');
        return;
      }

      const textCache = new Map<string, string>();
      const readText = (p: string): string | undefined => {
        if (textCache.has(p)) return textCache.get(p);
        const data = cleaned[p];
        if (!data) return undefined;
        const text = TEXT_DECODER.decode(data);
        textCache.set(p, text);
        return text;
      };

      const used = new Set<string>();
      const existingSlugs = new Set(me.pages.filter((p) => p.slug !== '').map((p) => p.slug));
      const detected: DetectedPage[] = [];
      const collectedWarnings: string[] = [];

      for (const htmlPath of htmlPaths) {
        const html = readText(htmlPath) ?? '';
        const extracted = extractHtmlPage({ html, htmlPath, readText });
        const slug = slugForPath(htmlPath, used);
        const title = extracted.title || titleCase(slug);
        detected.push({
          key: htmlPath,
          htmlPath,
          slug,
          title,
          description: extracted.description,
          html: extracted.html,
          css: extracted.css,
          js: extracted.js,
          assetRefs: extracted.assetRefs,
          hasModuleScript: extracted.hasModuleScript,
          warnings: extracted.warnings,
          include: true,
        });
        extracted.warnings.forEach((w) => collectedWarnings.push(`${title}: ${w}`));
        if (extracted.hasModuleScript) collectedWarnings.push(t('“{title}” keeps its original <script> tags in the page (it uses JavaScript modules).', { title }));
        if (existingSlugs.has(slug)) collectedWarnings.push(t('“{title}” uses the same address as an existing page ({path}).', { title, path: pagePath(slug) }));
      }

      setZipFiles(cleaned);
      setPages(detected);
      setNotes(collectedWarnings);
      setStep('review');
    } catch (e) {
      setError(e instanceof Error ? e.message : t('Could not read that file.'));
      setStep('select');
    }
  };

  const onPickFile: React.ChangeEventHandler<HTMLInputElement> = (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) void readFile(file);
  };

  const includedPages = pages.filter((p) => p.include);

  const assetSummary = React.useMemo(() => {
    const set = new Set<string>();
    includedPages.forEach((p) => p.assetRefs.forEach((r) => set.add(r)));
    let bytes = 0;
    let missing = 0;
    let notUploadable = 0;
    set.forEach((p) => {
      const data = zipFiles[p];
      if (!data) {
        missing += 1;
        return;
      }
      if (!isUploadableAssetPath(p)) {
        notUploadable += 1;
        return;
      }
      bytes += data.byteLength;
    });
    return { count: set.size, bytes, missing, notUploadable };
  }, [includedPages, zipFiles]);

  const slugErrors = React.useMemo(() => {
    const errors: Record<string, string> = {};
    // A page chosen as Home doesn't consume its own address (it updates the
    // system home page instead), so it's exempt from address validation.
    const addressed = includedPages.filter((p) => p.key !== homeKey);
    const counts = new Map<string, number>();
    addressed.forEach((p) => counts.set(p.slug, (counts.get(p.slug) ?? 0) + 1));
    addressed.forEach((p) => {
      if (!p.slug || !SLUG_RE.test(p.slug)) errors[p.key] = t('Use lowercase letters, numbers and hyphens only.');
      else if ((counts.get(p.slug) ?? 0) > 1) errors[p.key] = t('Two imported pages use this same address.');
      else if ((RESERVED_IMPORT_SLUGS as readonly string[]).includes(p.slug)) errors[p.key] = t('This address is reserved.');
    });
    return errors;
  }, [includedPages, homeKey, t]);

  const canImport = includedPages.length > 0 && Object.keys(slugErrors).length === 0;

  const updatePageField = (key: string, patch: Partial<DetectedPage>) => {
    setPages((prev) => prev.map((p) => (p.key === key ? { ...p, ...patch } : p)));
  };

  const runImport = async () => {
    setStep('working');
    setWorkingLabel(t('Uploading files…'));
    setProgress({ done: 0, total: 0 });

    const assetPaths = new Set<string>();
    includedPages.forEach((p) => p.assetRefs.forEach((r) => assetPaths.add(r)));
    const missingAssets: string[] = [];
    const skippedExt: string[] = [];
    const tasks: { path: string; data: Uint8Array }[] = [];
    assetPaths.forEach((p) => {
      const data = zipFiles[p];
      if (!data) {
        missingAssets.push(p);
        return;
      }
      if (!isUploadableAssetPath(p)) {
        skippedExt.push(p);
        return;
      }
      tasks.push({ path: p, data });
    });

    let outcomes: AssetUploadOutcome[] = [];
    if (tasks.length) {
      outcomes = await uploadAssets(tasks, {
        onProgress: (done, total) => setProgress({ done, total }),
        registerMedia: (payload) => createMedia.mutateAsync(payload),
      });
    }
    const urlMap = new Map<string, string>();
    outcomes.forEach((o) => {
      if (o.url) urlMap.set(o.path, o.url);
    });

    setWorkingLabel(t('Saving pages…'));
    setProgress(null);

    const rows: SummaryRow[] = [];
    for (const p of includedPages) {
      const finalCode = {
        html: applyAssetUrls(p.html, urlMap),
        css: applyAssetUrls(p.css, urlMap),
        js: applyAssetUrls(p.js, urlMap),
      };
      const cap = checkPageSizeCap(finalCode);
      if (!cap.ok) {
        rows.push({ key: p.key, title: p.title, slug: p.slug, action: 'oversize', message: cap.reason });
        continue;
      }
      const data: PuckData = { root: { props: { title: p.title, mode: 'code', chrome, code: finalCode } }, content: [] };
      const seo = p.description ? { description: p.description } : undefined;
      try {
        if (p.key === homeKey && homePage) {
          const updated = await updatePage.mutateAsync({ id: homePage.id, data: { title: p.title, draft: data, seo } });
          rows.push({ key: p.key, title: p.title, slug: '', action: 'updated-home', pageId: updated?.id ?? homePage.id });
          continue;
        }
        const existing = me.pages.find((mp) => mp.slug === p.slug);
        if (existing) {
          if (conflictMode === 'skip') {
            rows.push({ key: p.key, title: p.title, slug: p.slug, action: 'skipped', message: t('A page already uses this address — left unchanged.') });
            continue;
          }
          const updated = await updatePage.mutateAsync({ id: existing.id, data: { title: p.title, draft: data, seo } });
          rows.push({ key: p.key, title: p.title, slug: p.slug, action: 'updated', pageId: updated?.id ?? existing.id });
        } else {
          const created = await createPage.mutateAsync({ title: p.title, slug: p.slug, data, seo });
          rows.push({ key: p.key, title: p.title, slug: p.slug, action: 'created', pageId: created?.id });
        }
      } catch (e) {
        rows.push({ key: p.key, title: p.title, slug: p.slug, action: 'error', message: e instanceof Error ? e.message : t('Could not save this page.') });
      }
    }

    const warn = [...notes];
    missingAssets.forEach((p) => warn.push(t('Missing file, not imported: {path}', { path: p })));
    skippedExt.forEach((p) => warn.push(t('Not an image, font, video or PDF, so not uploaded: {path}', { path: p })));
    outcomes.forEach((o) => {
      if (o.warning) warn.push(o.warning);
    });
    setNotes(warn);
    setSummary(rows);
    setStep('summary');
  };

  const publishableRows = summary.filter((r) => r.pageId && (r.action === 'created' || r.action === 'updated' || r.action === 'updated-home'));

  const publishAll = async () => {
    setPublishing(true);
    let ok = 0;
    for (const row of publishableRows) {
      try {
        await publishPage.mutateAsync(row.pageId as string);
        ok += 1;
      } catch {
        // per-page toast already fired by the mutation's onError
      }
    }
    setPublishing(false);
    if (ok) toast.success(t('{n} page(s) published.', { n: ok }));
  };

  const openInEditor = (id: string) => {
    onClose();
    navigate(`/website-builder/pages/${id}`);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      size={step === 'review' ? 'full' : 'lg'}
      title={t('Import website (ZIP / HTML)')}
      description={step === 'select' ? t('Bring in a site built elsewhere — a single HTML file, or a ZIP of a built static site (e.g. a Vite dist/ folder).') : undefined}
      footer={
        step === 'review' ? (
          <>
            <Button variant="secondary" onClick={handleClose}>{t('Cancel')}</Button>
            <Button disabled={!canImport} onClick={() => void runImport()}>{t('Import {n} page(s)', { n: includedPages.length })}</Button>
          </>
        ) : step === 'summary' ? (
          <>
            <Button variant="secondary" onClick={handleClose}>{t('Done')}</Button>
            {publishableRows.length > 0 && (
              <Button leftIcon={<Rocket className="w-4 h-4" />} isLoading={publishing} onClick={() => void publishAll()}>
                {t('Publish all imported')}
              </Button>
            )}
          </>
        ) : (
          <Button variant="secondary" onClick={handleClose} disabled={busy}>{t('Cancel')}</Button>
        )
      }
    >
      {step === 'select' && (
        <div className="space-y-4">
          <label
            htmlFor="site-import-file"
            className="flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 dark:border-white/15 px-4 py-10 text-center cursor-pointer hover:border-primary-500 focus-within:border-primary-500"
          >
            <UploadCloud className="w-7 h-7 text-slate-400" aria-hidden />
            <span className="text-sm font-medium text-slate-800 dark:text-slate-100">{t('Choose a file')}</span>
            <span className="text-xs text-slate-500 dark:text-slate-400">{t('A single .html file, or a .zip of a built site — up to 50 MB, 500 files')}</span>
            <input ref={fileInputRef} id="site-import-file" type="file" accept=".zip,.html,.htm" className="sr-only" onChange={onPickFile} />
          </label>
          {error && <Alert tone="danger" title={t('Could not import that file')}>{error}</Alert>}
          <Alert tone="info">
            {t('Source projects (React/Vue/Next.js source code) aren’t supported — build the project first (“npm run build”) and upload the output folder. Every page is saved as a draft; nothing goes live until you publish it.')}
          </Alert>
        </div>
      )}

      {step === 'parsing' && (
        <div className="flex flex-col items-center justify-center gap-3 py-14 text-slate-500 dark:text-slate-400" aria-busy="true">
          <Loader2 className="w-6 h-6 animate-spin" aria-hidden />
          <p className="text-sm">{t('Reading your file…')}</p>
        </div>
      )}

      {step === 'review' && (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border border-slate-200 dark:border-white/10 p-3">
              <p className="text-xs text-slate-500 dark:text-slate-400">{t('Pages found')}</p>
              <p className="text-lg font-semibold text-slate-900 dark:text-slate-50">{pages.length}</p>
            </div>
            <div className="rounded-lg border border-slate-200 dark:border-white/10 p-3">
              <p className="text-xs text-slate-500 dark:text-slate-400">{t('Assets to upload')}</p>
              <p className="text-lg font-semibold text-slate-900 dark:text-slate-50">
                {assetSummary.count} <span className="text-sm font-normal text-slate-500">({(assetSummary.bytes / (1024 * 1024)).toFixed(1)} MB)</span>
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Select
                label={t('Header & footer')}
                value={chrome}
                onChange={(e) => setChrome(e.target.value as 'full' | 'none')}
                options={[{ value: 'none', label: t('Imported site’s own') }, { value: 'full', label: t('This site’s') }]}
              />
              <Select
                label={t('If a page address already exists')}
                value={conflictMode}
                onChange={(e) => setConflictMode(e.target.value as 'replace' | 'skip')}
                options={[{ value: 'skip', label: t('Skip it') }, { value: 'replace', label: t('Replace its draft') }]}
              />
            </div>
          </div>

          {notes.length > 0 && (
            <Alert tone="warning" title={t('Worth checking')}>
              <ul className="list-disc ml-4 space-y-0.5 max-h-32 overflow-y-auto">
                {notes.map((w, i) => <li key={i}>{w}</li>)}
              </ul>
            </Alert>
          )}

          <Card className="!p-0">
            <ul className="divide-y divide-slate-100 dark:divide-white/6">
              {pages.map((p) => (
                <li key={p.key} className={cn('p-4 flex flex-col gap-3', !p.include && 'opacity-60')}>
                  <div className="flex items-start gap-3">
                    <Checkbox
                      className="mt-2"
                      checked={p.include}
                      onChange={(e) => updatePageField(p.key, { include: e.target.checked })}
                      label={<span className="sr-only">{t('Include “{title}”', { title: p.title })}</span>}
                    />
                    <div className="flex-1 min-w-0 grid gap-2 sm:grid-cols-2">
                      <Input
                        id={`import-title-${p.key}`}
                        label={t('Title')}
                        value={p.title}
                        onChange={(e) => updatePageField(p.key, { title: e.target.value })}
                        disabled={!p.include}
                      />
                      <Input
                        id={`import-slug-${p.key}`}
                        label={t('Address')}
                        leftIcon={<span className="text-xs font-mono">/</span>}
                        value={p.slug}
                        error={p.include ? slugErrors[p.key] : undefined}
                        onChange={(e) => updatePageField(p.key, { slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })}
                        disabled={!p.include || p.key === homeKey}
                      />
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 pl-7 text-xs">
                    <label className={cn('inline-flex items-center gap-1.5 cursor-pointer', !p.include && 'cursor-not-allowed')}>
                      <input
                        type="radio"
                        name="site-import-home"
                        className="accent-primary-600"
                        checked={homeKey === p.key}
                        disabled={!p.include}
                        onChange={() => setHomeKey(p.key)}
                      />
                      <HomeIcon className="w-3.5 h-3.5" aria-hidden /> {t('Use as the home page')}
                    </label>
                    <span className="font-mono text-slate-400">{p.htmlPath}</span>
                    {p.hasModuleScript && <Badge variant="info">{t('JS modules')}</Badge>}
                    {p.warnings.length > 0 && <Badge variant="warning">{t('{n} warning(s)', { n: p.warnings.length })}</Badge>}
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      )}

      {step === 'working' && (
        <div className="flex flex-col items-center justify-center gap-3 py-14 text-slate-500 dark:text-slate-400" aria-busy="true">
          <Loader2 className="w-6 h-6 animate-spin" aria-hidden />
          <p className="text-sm">{workingLabel}</p>
          {progress && progress.total > 0 && (
            <div className="w-full max-w-xs h-2 rounded-full bg-slate-200 dark:bg-white/10 overflow-hidden" role="progressbar" aria-valuenow={progress.done} aria-valuemin={0} aria-valuemax={progress.total}>
              <div className="h-full bg-primary-600 transition-[width]" style={{ width: `${(progress.done / progress.total) * 100}%` }} />
            </div>
          )}
        </div>
      )}

      {step === 'summary' && (
        <div className="space-y-4">
          <Card className="!p-0">
            <ul className="divide-y divide-slate-100 dark:divide-white/6">
              {summary.map((row) => (
                <li key={row.key} className="p-3 flex items-center gap-3">
                  {row.action === 'error' || row.action === 'oversize' ? (
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" aria-hidden />
                  ) : row.action === 'skipped' ? (
                    <FileCode2 className="w-4 h-4 text-slate-400 shrink-0" aria-hidden />
                  ) : (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" aria-hidden />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-slate-900 dark:text-slate-50 truncate">{row.title}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {row.action === 'created' && t('Created as a draft at {path}', { path: pagePath(row.slug) })}
                      {row.action === 'updated' && t('Draft updated at {path}', { path: pagePath(row.slug) })}
                      {row.action === 'updated-home' && t('The home page’s draft was updated')}
                      {(row.action === 'skipped' || row.action === 'oversize' || row.action === 'error') && (row.message ?? row.action)}
                    </p>
                  </div>
                  {row.pageId && (
                    <Button size="sm" variant="outline" rightIcon={<ExternalLink className="w-3.5 h-3.5" />} onClick={() => openInEditor(row.pageId as string)}>
                      {t('Open')}
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          </Card>
          {notes.length > 0 && (
            <Alert tone="warning" title={t('Worth checking')}>
              <ul className="list-disc ml-4 space-y-0.5 max-h-32 overflow-y-auto">
                {notes.map((w, i) => <li key={i}>{w}</li>)}
              </ul>
            </Alert>
          )}
        </div>
      )}
    </Modal>
  );
};

/** Small entry button reused by the Pages and Design tabs. */
export const ImportWebsiteButton: React.FC<{ me: SiteMeResponse; variant?: 'primary' | 'secondary' | 'outline'; size?: 'sm' | 'md' }> = ({ me, variant = 'outline', size = 'md' }) => {
  const t = useT();
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <Button variant={variant} size={size} leftIcon={<FileArchive className="w-4 h-4" />} onClick={() => setOpen(true)}>
        {t('Import website (ZIP / HTML)')}
      </Button>
      <ImportWizard isOpen={open} onClose={() => setOpen(false)} me={me} />
    </>
  );
};
