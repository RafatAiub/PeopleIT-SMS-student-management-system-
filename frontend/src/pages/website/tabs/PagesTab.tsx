import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowDown, ArrowUp, Blocks, Code2, ExternalLink, FilePlus2, FileText, GripVertical, Home, Pencil, Rocket, Send, Settings2, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { Card, CardHeader, Button, Badge, Modal, Input } from '@/components/ui';
import { EmptyState } from '@/components/common/EmptyState';
import { ConfirmModal } from '@/components/common/ConfirmModal';
import { useT, formatDate } from '@/i18n';
import { cn } from '@/lib/cn';
import { emptyCodePageData } from '@/site/code/codePage';
import { useCreatePage, useDeletePage, usePublishPage, useReorderPages, useUpdatePage } from '../sites.queries';
import { EMPTY_PAGE, SLUG_RE, joinUrl, pagePath, pageState, slugify } from '../siteUtils';
import type { PuckData, SiteMeResponse, SitePageSummary } from '../sites.types';

/** A truly blank code page (as opposed to the pre-filled "Blank landing page" starter). */
const EMPTY_CODE_PAGE: PuckData = { root: { props: { mode: 'code', chrome: 'full', code: { html: '', css: '', js: '' } } }, content: [] };

type NewPageKind = 'visual' | 'code' | 'landing';

export const PageStateBadge: React.FC<{ page: SitePageSummary }> = ({ page }) => {
  const t = useT();
  const s = pageState(page);
  if (s === 'live') return <Badge variant="success" dot>{t('Published')}</Badge>;
  if (s === 'changed') return <Badge variant="warning" dot>{t('Unpublished changes')}</Badge>;
  return <Badge variant="neutral" dot>{t('Draft')}</Badge>;
};

/** Create or rename a page (title, Bangla title, URL slug). */
const PageDetailsModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  page?: SitePageSummary | null;
  existingSlugs: string[];
}> = ({ isOpen, onClose, page, existingSlugs }) => {
  const t = useT();
  const navigate = useNavigate();
  const create = useCreatePage();
  const update = useUpdatePage();
  const [title, setTitle] = React.useState('');
  const [titleBn, setTitleBn] = React.useState('');
  const [slug, setSlug] = React.useState('');
  const [slugTouched, setSlugTouched] = React.useState(false);
  const [kind, setKind] = React.useState<NewPageKind>('visual');
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const isHome = !!page && page.slug === '';

  React.useEffect(() => {
    if (!isOpen) return;
    setTitle(page?.title ?? '');
    setTitleBn(page?.titleBn ?? '');
    setSlug(page?.slug ?? '');
    setSlugTouched(!!page);
    setKind('visual');
    setErrors({});
  }, [isOpen, page]);

  // Mirrors backend/src/modules/sites/sites.logic.ts RESERVED_PAGE_SLUGS (WEBSITE_V2_BRIEF.md §2: shop/course/learner routes the public renderer owns).
  const RESERVED_SLUGS = [
    'api', 'preview', 'sitemap.xml', 'robots.txt', 'admin', 'login', 'news',
    'blog', 'shop', 'cart', 'checkout', 'order', 'courses', 'learn', 'account',
  ];

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!title.trim()) errs.title = t('Enter a page title.');
    if (!isHome) {
      if (!slug) errs.slug = t('Enter the page address.');
      else if (!SLUG_RE.test(slug)) errs.slug = t('Use lowercase letters, numbers and hyphens only.');
      else if (existingSlugs.includes(slug) && slug !== page?.slug) errs.slug = t('Another page already uses this address.');
      else if (RESERVED_SLUGS.includes(slug)) errs.slug = t('This address is reserved. Choose another.');
    }
    setErrors(errs);
    if (Object.keys(errs).length) return;

    if (page) {
      update.mutate(
        { id: page.id, data: { title: title.trim(), titleBn: titleBn.trim() || null, ...(isHome ? {} : { slug }) } },
        { onSuccess: () => { toast.success(t('Page details saved.')); onClose(); } }
      );
    } else {
      const trimmedTitle = title.trim();
      const data: PuckData = kind === 'visual' ? EMPTY_PAGE : kind === 'landing' ? (emptyCodePageData(trimmedTitle) as unknown as PuckData) : EMPTY_CODE_PAGE;
      create.mutate(
        { title: trimmedTitle, titleBn: titleBn.trim() || undefined, slug, data },
        {
          onSuccess: (p) => {
            toast.success(t('Page created.'));
            onClose();
            if (p?.id) navigate(`/website-builder/pages/${p.id}`);
          },
        }
      );
    }
  };

  const busy = create.isPending || update.isPending;
  return (
    <Modal
      isOpen={isOpen}
      onClose={busy ? () => {} : onClose}
      title={page ? t('Page details') : t('Add a page')}
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose} disabled={busy}>{t('Cancel')}</Button>
          <Button type="submit" form="site-page-details" isLoading={busy}>{page ? t('Save') : t('Create and open editor')}</Button>
        </>
      }
    >
      <form id="site-page-details" className="space-y-4" onSubmit={submit} noValidate>
        {!page && (
          <fieldset className="space-y-2">
            <legend className="field-label">{t('Page type')}</legend>
            <div className="grid gap-2 sm:grid-cols-3">
              {(
                [
                  { id: 'visual' as const, icon: <Blocks className="w-4 h-4" />, label: t('Visual (blocks)'), desc: t('Build with the drag-and-drop block editor.') },
                  { id: 'code' as const, icon: <Code2 className="w-4 h-4" />, label: t('Code (HTML/CSS/JS)'), desc: t('Write your own HTML, CSS and JavaScript.') },
                  { id: 'landing' as const, icon: <Rocket className="w-4 h-4" />, label: t('Blank landing page'), desc: t('A code page pre-filled with a starter hero and features section.') },
                ]
              ).map((opt) => (
                <label
                  key={opt.id}
                  className={cn(
                    'flex flex-col gap-1 rounded-lg border p-3 cursor-pointer text-sm',
                    kind === opt.id ? 'border-primary-500 bg-primary-50/50 dark:bg-primary-500/10' : 'border-slate-200 dark:border-white/10'
                  )}
                >
                  <span className="flex items-center gap-2 font-semibold text-slate-900 dark:text-slate-100">
                    <input type="radio" name="site-page-kind" className="accent-primary-600" checked={kind === opt.id} onChange={() => setKind(opt.id)} />
                    {opt.icon} {opt.label}
                  </span>
                  <span className="text-xs text-slate-600 dark:text-slate-400">{opt.desc}</span>
                </label>
              ))}
            </div>
          </fieldset>
        )}
        <Input
          id="site-page-title"
          label={t('Title')}
          required
          value={title}
          error={errors.title}
          onChange={(e) => {
            setTitle(e.target.value);
            if (!slugTouched && !isHome) setSlug(slugify(e.target.value));
          }}
        />
        <Input id="site-page-titleBn" label={t('Title (Bangla)')} lang="bn" value={titleBn} onChange={(e) => setTitleBn(e.target.value)} />
        {isHome ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">{t('The home page always lives at “/”.')}</p>
        ) : (
          <Input
            id="site-page-slug"
            label={t('Address')}
            required
            value={slug}
            error={errors.slug}
            leftIcon={<span className="text-xs font-mono">/</span>}
            helperText={t('Lowercase letters, numbers and hyphens, e.g. “admissions”.')}
            onChange={(e) => {
              setSlugTouched(true);
              setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''));
            }}
          />
        )}
      </form>
    </Modal>
  );
};

export const PagesTab: React.FC<{ me: SiteMeResponse }> = ({ me }) => {
  const t = useT();
  const navigate = useNavigate();
  const reorder = useReorderPages();
  const publish = usePublishPage();
  const del = useDeletePage();
  const sorted = React.useMemo(() => [...me.pages].sort((a, b) => a.sortOrder - b.sortOrder), [me.pages]);
  const [order, setOrder] = React.useState(sorted);
  const [details, setDetails] = React.useState<{ open: boolean; page: SitePageSummary | null }>({ open: false, page: null });
  const [toDelete, setToDelete] = React.useState<SitePageSummary | null>(null);
  const [dragFrom, setDragFrom] = React.useState<number | null>(null);
  const [dragOver, setDragOver] = React.useState<number | null>(null);
  const [grab, setGrab] = React.useState<number | null>(null);
  const [publishingId, setPublishingId] = React.useState<string | null>(null);

  React.useEffect(() => setOrder(sorted), [sorted]);

  const commit = (next: SitePageSummary[]) => {
    setOrder(next);
    reorder.mutate(next.map((p) => p.id));
  };
  const moveTo = (from: number, to: number) => {
    if (to < 0 || to >= order.length || from === to) return;
    const next = [...order];
    const [p] = next.splice(from, 1);
    next.splice(to, 0, p);
    commit(next);
  };

  const previewFor = (p: SitePageSummary) => (me.previewUrl ? joinUrl(me.previewUrl, pagePath(p.slug)) : null);

  return (
    <Card>
      <CardHeader
        icon={<FileText className="w-4 h-4" />}
        title={t('Pages')}
        description={t('Drag to reorder. Open a page to edit it with the drag-and-drop editor.')}
        actions={<Button leftIcon={<FilePlus2 className="w-4 h-4" />} onClick={() => setDetails({ open: true, page: null })}>{t('Add page')}</Button>}
      />

      {order.length === 0 ? (
        <EmptyState
          icon={<FileText />}
          title={t('No pages yet')}
          description={t('Apply a template from the Design tab, generate a site with AI, or add a blank page.')}
          action={<Button onClick={() => setDetails({ open: true, page: null })}>{t('Add page')}</Button>}
        />
      ) : (
        <ul className="divide-y divide-slate-100 dark:divide-white/6 -mx-5">
          {order.map((p, i) => {
            const preview = previewFor(p);
            return (
              <li
                key={p.id}
                draggable={grab === i}
                onDragStart={(e) => {
                  setDragFrom(i);
                  e.dataTransfer.effectAllowed = 'move';
                }}
                onDragEnd={() => {
                  setDragFrom(null);
                  setDragOver(null);
                  setGrab(null);
                }}
                onDragOver={(e) => {
                  if (dragFrom === null) return;
                  e.preventDefault();
                  setDragOver(i);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  if (dragFrom !== null) moveTo(dragFrom, i);
                  setDragFrom(null);
                  setDragOver(null);
                }}
                className={cn('px-5 py-3 flex flex-col sm:flex-row sm:items-center gap-3', dragOver === i && dragFrom !== i && 'bg-primary-50/60 dark:bg-primary-500/10')}
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <span
                    className="hidden sm:flex cursor-grab text-slate-400"
                    aria-hidden
                    title={t('Drag to reorder')}
                    onMouseDown={() => setGrab(i)}
                    onMouseUp={() => setGrab(null)}
                  >
                    <GripVertical className="w-4 h-4" />
                  </span>
                  <span className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-white/6 flex items-center justify-center shrink-0 text-slate-500 dark:text-slate-400">
                    {p.slug === '' ? <Home className="w-4 h-4" aria-hidden /> : <FileText className="w-4 h-4" aria-hidden />}
                  </span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <button type="button" onClick={() => navigate(`/website-builder/pages/${p.id}`)} className="font-medium text-slate-900 dark:text-slate-50 hover:underline text-left truncate">
                        {p.title}
                      </button>
                      <PageStateBadge page={p} />
                      {p.isSystem && <Badge variant="info">{t('Home')}</Badge>}
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                      <span className="font-mono">{pagePath(p.slug)}</span>
                      {' · '}
                      {p.publishedAt ? t('Published {when}', { when: formatDate(p.publishedAt, true) }) : t('Never published')}
                      {p.scheduledPublishAt && ` · ${t('Scheduled {when}', { when: formatDate(p.scheduledPublishAt, true) })}`}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-1 sm:justify-end">
                  <Button size="icon-sm" variant="ghost" aria-label={t('Move up')} disabled={i === 0 || reorder.isPending} onClick={() => moveTo(i, i - 1)}><ArrowUp className="w-4 h-4" /></Button>
                  <Button size="icon-sm" variant="ghost" aria-label={t('Move down')} disabled={i === order.length - 1 || reorder.isPending} onClick={() => moveTo(i, i + 1)}><ArrowDown className="w-4 h-4" /></Button>
                  <Button size="sm" variant="secondary" leftIcon={<Pencil className="w-3.5 h-3.5" />} onClick={() => navigate(`/website-builder/pages/${p.id}`)}>{t('Edit')}</Button>
                  <Button
                    size="sm"
                    variant="outline"
                    leftIcon={<Send className="w-3.5 h-3.5" />}
                    isLoading={publish.isPending && publishingId === p.id}
                    disabled={pageState(p) === 'live'}
                    onClick={() => {
                      setPublishingId(p.id);
                      publish.mutate(p.id, { onSuccess: () => toast.success(t('“{title}” is published.', { title: p.title })), onSettled: () => setPublishingId(null) });
                    }}
                  >
                    {t('Publish')}
                  </Button>
                  {preview && (
                    <a href={preview} target="_blank" rel="noreferrer" className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/6" aria-label={t('Preview {title}', { title: p.title })} title={t('Preview')}>
                      <ExternalLink className="w-4 h-4" />
                    </a>
                  )}
                  <Button size="icon-sm" variant="ghost" aria-label={t('Page details')} title={t('Page details')} onClick={() => setDetails({ open: true, page: p })}><Settings2 className="w-4 h-4" /></Button>
                  {!p.isSystem && (
                    <Button size="icon-sm" variant="ghost" className="text-red-600 dark:text-red-400" aria-label={t('Delete {title}', { title: p.title })} title={t('Delete')} onClick={() => setToDelete(p)}><Trash2 className="w-4 h-4" /></Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <PageDetailsModal isOpen={details.open} page={details.page} existingSlugs={me.pages.map((p) => p.slug)} onClose={() => setDetails({ open: false, page: null })} />
      <ConfirmModal
        isOpen={!!toDelete}
        title={t('Delete “{title}”?', { title: toDelete?.title ?? '' })}
        message={t('The page, its draft and its version history are deleted. Menu links pointing to it will stop working.')}
        confirmLabel={t('Delete page')}
        isLoading={del.isPending}
        onCancel={() => setToDelete(null)}
        onConfirm={() => toDelete && del.mutate(toDelete.id, { onSuccess: () => setToDelete(null) })}
      />
    </Card>
  );
};
