import React from 'react';
import { Newspaper, Plus } from 'lucide-react';
import toast from 'react-hot-toast';
import { Card, CardHeader, Button, Badge, Drawer, Input, Textarea, Select, Alert, Skeleton, ErrorState } from '@/components/ui';
import { DataTable, type Column } from '@/components/DataTable/DataTable';
import { ConfirmModal } from '@/components/common/ConfirmModal';
import { useT, formatDate } from '@/i18n';
import { useAuthStore } from '@/store/authStore';
import { usePosts, usePost, useSavePost, useDeletePost, apiError } from '../sites.queries';
import { SLUG_RE, slugify, useSiteRole } from '../siteUtils';
import type { PostStatus, SitePost } from '../sites.types';
import { MediaField } from '../media/MediaPicker';
import { readPostBody, writePostBody } from '../blog/postBody';

const PostEditorDrawer: React.FC<{ open: boolean; postId: string | null; onClose: () => void }> = ({ open, postId, onClose }) => {
  const t = useT();
  const { canManage } = useSiteRole();
  const q = usePost(open && postId ? postId : undefined);
  const save = useSavePost();
  const [title, setTitle] = React.useState('');
  const [slug, setSlug] = React.useState('');
  const [slugTouched, setSlugTouched] = React.useState(false);
  const [excerpt, setExcerpt] = React.useState('');
  const [coverUrl, setCoverUrl] = React.useState('');
  const [tags, setTags] = React.useState('');
  const [status, setStatus] = React.useState<PostStatus>('DRAFT');
  const [text, setText] = React.useState('');
  const [textBn, setTextBn] = React.useState('');
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const loaded = React.useRef<string | null>(null);

  React.useEffect(() => {
    if (!open) {
      loaded.current = null;
      return;
    }
    if (!postId) {
      if (loaded.current === 'new') return;
      loaded.current = 'new';
      setTitle(''); setSlug(''); setSlugTouched(false); setExcerpt(''); setCoverUrl(''); setTags(''); setStatus('DRAFT'); setText(''); setTextBn(''); setErrors({});
      return;
    }
    const p = q.data;
    if (!p || loaded.current === p.id) return;
    loaded.current = p.id;
    const body = readPostBody(p.body);
    setTitle(p.title); setSlug(p.slug); setSlugTouched(true); setExcerpt(p.excerpt ?? ''); setCoverUrl(p.coverUrl ?? '');
    setTags((p.tags ?? []).join(', ')); setStatus(p.status); setText(body.text); setTextBn(body.textBn); setErrors({});
  }, [open, postId, q.data]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!title.trim()) errs.title = t('Enter a title.');
    if (slug && !SLUG_RE.test(slug)) errs.slug = t('Use lowercase letters, numbers and hyphens only.');
    if (!text.trim()) errs.text = t('Write the post.');
    if (coverUrl && !/^https?:\/\/\S+$/i.test(coverUrl)) errs.coverUrl = t('Enter a full https:// address.');
    setErrors(errs);
    if (Object.keys(errs).length) return;
    save.mutate(
      {
        id: postId ?? undefined,
        data: {
          title: title.trim(),
          slug: slug || slugify(title),
          excerpt: excerpt.trim() || null,
          coverUrl: coverUrl.trim() || null,
          tags: tags.split(',').map((s) => s.trim()).filter(Boolean).slice(0, 20),
          status: canManage ? status : 'DRAFT',
          body: writePostBody(q.data?.body, text, textBn),
        },
      },
      {
        onSuccess: () => {
          toast.success(canManage && status === 'PUBLISHED' ? t('Post published.') : t('Draft saved.'));
          onClose();
        },
      }
    );
  };

  const loading = !!postId && q.isLoading;
  return (
    <Drawer
      isOpen={open}
      onClose={save.isPending ? () => {} : onClose}
      title={postId ? t('Edit post') : t('New post')}
      width="xl"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={save.isPending}>{t('Cancel')}</Button>
          <Button type="submit" form="site-post-editor" isLoading={save.isPending} disabled={loading || q.isError}>
            {canManage && status === 'PUBLISHED' ? t('Save and publish') : t('Save draft')}
          </Button>
        </>
      }
    >
      {loading ? (
        <div className="space-y-3"><Skeleton className="h-10" /><Skeleton className="h-10" /><Skeleton className="h-64" /></div>
      ) : q.isError ? (
        <ErrorState compact message={apiError(q.error, t('Could not load the post.'))} onRetry={() => q.refetch()} />
      ) : (
        <form id="site-post-editor" className="space-y-4" onSubmit={submit} noValidate>
          {!canManage && (
            <Alert tone="info">{t('Teachers save posts as drafts. An administrator reviews and publishes them.')}</Alert>
          )}
          <Input
            id="site-post-title"
            label={t('Title')}
            required
            value={title}
            error={errors.title}
            onChange={(e) => {
              setTitle(e.target.value);
              if (!slugTouched) setSlug(slugify(e.target.value));
            }}
          />
          <Input
            id="site-post-slug"
            label={t('Address')}
            value={slug}
            error={errors.slug}
            helperText={t('Shown in the link: /blog/{slug}', { slug: slug || '…' })}
            onChange={(e) => {
              setSlugTouched(true);
              setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''));
            }}
          />
          <Textarea id="site-post-excerpt" label={t('Summary')} rows={2} maxLength={500} value={excerpt} onChange={(e) => setExcerpt(e.target.value)} helperText={t('Shown in news lists. Optional.')} />
          <MediaField id="site-post-cover" label={t('Cover image')} value={coverUrl} onChange={setCoverUrl} helperText={errors.coverUrl} />
          <Textarea
            id="site-post-body"
            label={t('Post')}
            required
            rows={12}
            value={text}
            error={errors.text}
            onChange={(e) => setText(e.target.value)}
            helperText={t('Leave an empty line between paragraphs.')}
          />
          <Textarea id="site-post-bodyBn" label={t('Post (Bangla)')} lang="bn" rows={8} value={textBn} onChange={(e) => setTextBn(e.target.value)} helperText={t('Optional. Shown when a visitor switches to Bangla.')} />
          <div className="grid gap-3 sm:grid-cols-2">
            <Input id="site-post-tags" label={t('Tags')} value={tags} onChange={(e) => setTags(e.target.value)} helperText={t('Separate tags with commas.')} />
            {canManage && (
              <Select
                id="site-post-status"
                label={t('Status')}
                value={status}
                onChange={(e) => setStatus(e.target.value as PostStatus)}
                options={[{ value: 'DRAFT', label: t('Draft') }, { value: 'PUBLISHED', label: t('Published') }]}
              />
            )}
          </div>
        </form>
      )}
    </Drawer>
  );
};

export const BlogTab: React.FC = () => {
  const t = useT();
  const { canManage } = useSiteRole();
  const userId = useAuthStore((s) => s.user?.id);
  const q = usePosts();
  const del = useDeletePost();
  const [editor, setEditor] = React.useState<{ open: boolean; id: string | null }>({ open: false, id: null });
  const [toDelete, setToDelete] = React.useState<SitePost | null>(null);
  const canEdit = (p: SitePost) => canManage || p.authorUserId === userId;

  const columns: Column<SitePost>[] = [
    {
      key: 'title',
      header: t('Title'),
      primary: true,
      sortable: true,
      accessor: 'title',
      render: (p) => (
        <div className="min-w-0">
          <p className="font-medium text-slate-900 dark:text-slate-50 truncate">{p.title}</p>
          <p className="text-xs text-slate-500 dark:text-slate-400 font-mono truncate">/blog/{p.slug}</p>
        </div>
      ),
    },
    {
      key: 'status',
      header: t('Status'),
      render: (p) => <Badge variant={p.status === 'PUBLISHED' ? 'success' : 'neutral'} dot>{p.status === 'PUBLISHED' ? t('Published') : t('Draft')}</Badge>,
      exportValue: (p) => p.status,
    },
    { key: 'author', header: t('Author'), render: (p) => p.authorName ?? '—', exportValue: (p) => p.authorName ?? '', hideOnMobile: true },
    { key: 'tags', header: t('Tags'), render: (p) => (p.tags?.length ? p.tags.join(', ') : '—'), exportValue: (p) => p.tags?.join(', ') ?? '', hideOnMobile: true },
    {
      key: 'date',
      header: t('Date'),
      sortable: true,
      accessor: 'updatedAt',
      render: (p) => formatDate(p.publishedAt ?? p.updatedAt),
      exportValue: (p) => formatDate(p.publishedAt ?? p.updatedAt),
    },
  ];

  return (
    <Card>
      <CardHeader
        icon={<Newspaper className="w-4 h-4" />}
        title={t('News and blog')}
        description={t('Posts appear on the “Latest news” block and at /blog on your website.')}
        actions={<Button leftIcon={<Plus className="w-4 h-4" />} onClick={() => setEditor({ open: true, id: null })}>{t('New post')}</Button>}
      />
      {q.isError ? (
        <ErrorState message={apiError(q.error, t('Could not load posts.'))} onRetry={() => q.refetch()} />
      ) : (
        <DataTable
          data={q.data ?? []}
          columns={columns}
          isLoading={q.isLoading}
          onRowClick={(p) => canEdit(p) && setEditor({ open: true, id: p.id })}
          actions={[
            { label: t('Edit'), icon: 'edit', onClick: (p) => (canEdit(p) ? setEditor({ open: true, id: p.id }) : toast.error(t('You can only edit your own posts.'))) },
            ...(canManage ? [{ label: t('Delete'), icon: 'delete' as const, variant: 'danger' as const, onClick: (p: SitePost) => setToDelete(p) }] : []),
          ]}
          emptyTitle={t('No posts yet')}
          emptyDescription={t('Share school news, achievements and event reports.')}
          emptyAction={<Button onClick={() => setEditor({ open: true, id: null })}>{t('New post')}</Button>}
          exportFileName="website-posts"
        />
      )}
      <PostEditorDrawer open={editor.open} postId={editor.id} onClose={() => setEditor({ open: false, id: null })} />
      <ConfirmModal
        isOpen={!!toDelete}
        title={t('Delete “{title}”?', { title: toDelete?.title ?? '' })}
        message={t('The post is removed from your website immediately.')}
        confirmLabel={t('Delete post')}
        isLoading={del.isPending}
        onCancel={() => setToDelete(null)}
        onConfirm={() => toDelete && del.mutate(toDelete.id, { onSuccess: () => setToDelete(null) })}
      />
    </Card>
  );
};
