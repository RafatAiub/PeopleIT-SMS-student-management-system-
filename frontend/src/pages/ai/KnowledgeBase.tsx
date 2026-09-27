import { useState } from 'react';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { BookOpen, Plus } from 'lucide-react';
import apiClient from '../../api/client';
import { Alert, Badge, Button, Checkbox, Drawer, Input, PageHeader, Select, Textarea, ErrorState } from '../../components/ui';
import { DataTable, type Column } from '../../components/DataTable/DataTable';
import { ConfirmModal } from '../../components/common/ConfirmModal';
import { useT, formatDate } from '../../i18n';
import { errorMessage, useAiStatus, type PageMeta } from './aiUtils';

interface KnowledgeDoc {
  id: string;
  title: string;
  content: string;
  category: string | null;
  isActive: boolean;
  updatedAt: string;
  createdBy: { firstName: string; lastName: string } | null;
}

interface KnowledgeResponse {
  data: KnowledgeDoc[];
  meta: PageMeta;
  categories: { category: string | null; count: number }[];
}

const SUGGESTED = ['admission', 'fees', 'policy', 'academic', 'transport', 'general'];

interface FormState {
  id?: string;
  title: string;
  content: string;
  category: string;
  isActive: boolean;
}
const EMPTY: FormState = { title: '', content: '', category: '', isActive: true };

export default function KnowledgeBase() {
  const t = useT();
  const qc = useQueryClient();
  const status = useAiStatus();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [form, setForm] = useState<FormState | null>(null);
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [toDelete, setToDelete] = useState<KnowledgeDoc | null>(null);

  const query = useQuery({
    queryKey: ['ai', 'knowledge', { page, pageSize, search, category }],
    queryFn: async (): Promise<KnowledgeResponse> =>
      (await apiClient.get('/ai/knowledge', { params: { page, pageSize, search: search || undefined, category: category || undefined } })).data,
    placeholderData: keepPreviousData,
  });

  const save = useMutation({
    mutationFn: async (f: FormState) => {
      const body = { title: f.title.trim(), content: f.content.trim(), category: f.category.trim() || null, isActive: f.isActive };
      return f.id ? apiClient.patch(`/ai/knowledge/${f.id}`, body) : apiClient.post('/ai/knowledge', body);
    },
    onSuccess: (_r, f) => {
      toast.success(f.id ? t('Document updated') : t('Document added'));
      setForm(null);
      qc.invalidateQueries({ queryKey: ['ai', 'knowledge'] });
    },
    onError: (e) => toast.error(errorMessage(e, t('Could not save the document.'))),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => apiClient.delete(`/ai/knowledge/${id}`),
    onSuccess: () => {
      toast.success(t('Document deleted'));
      setToDelete(null);
      qc.invalidateQueries({ queryKey: ['ai', 'knowledge'] });
    },
    onError: (e) => toast.error(errorMessage(e, t('Could not delete the document.'))),
  });

  const submit = () => {
    if (!form) return;
    const e: typeof errors = {};
    if (form.title.trim().length < 2) e.title = t('Title must be at least 2 characters');
    if (form.content.trim().length < 10) e.content = t('Content must be at least 10 characters');
    setErrors(e);
    if (Object.keys(e).length === 0) save.mutate(form);
  };

  const columns: Column<KnowledgeDoc>[] = [
    {
      key: 'title',
      header: t('Title'),
      accessor: 'title',
      primary: true,
      render: (d) => (
        <div>
          <div className="font-semibold text-slate-900 dark:text-white">{d.title}</div>
          <div className="text-xs text-slate-500 dark:text-slate-400 line-clamp-1 max-w-md">{d.content}</div>
        </div>
      ),
    },
    { key: 'category', header: t('Category'), accessor: 'category', render: (d) => (d.category ? <Badge variant="info">{d.category}</Badge> : '—') },
    { key: 'isActive', header: t('Status'), accessor: 'isActive', render: (d) => <Badge variant={d.isActive ? 'success' : 'neutral'}>{d.isActive ? t('Active') : t('Inactive')}</Badge>, exportValue: (d) => (d.isActive ? 'Active' : 'Inactive') },
    { key: 'updatedAt', header: t('Updated'), accessor: 'updatedAt', hideOnMobile: true, render: (d) => formatDate(d.updatedAt) },
  ];

  const categoryOptions = Array.from(new Set([...SUGGESTED, ...(query.data?.categories ?? []).map((c) => c.category).filter((c): c is string => !!c)]));

  return (
    <div className="space-y-5">
      <PageHeader
        title={<span className="flex items-center gap-2"><BookOpen className="w-6 h-6 text-primary-600 dark:text-primary-400" />{t('Knowledge base')}</span>}
        description={t('Documents the AI assistants may answer from — policies, fees, admission rules, FAQs. They answer only from active documents here.')}
        breadcrumbs={[{ label: t('AI Assistant'), to: '/ai' }, { label: t('Knowledge base') }]}
        actions={<Button leftIcon={<Plus className="w-4 h-4" />} onClick={() => { setErrors({}); setForm({ ...EMPTY }); }}>{t('Add document')}</Button>}
      />
      <Alert tone="info">
        {t('Use the category “admission” for documents the public admission assistant on your website may use. Guardians’ and staff assistants can use every active document.')}
        {status.data?.semanticSearch ? ` ${t('Semantic search is enabled.')}` : ''}
      </Alert>

      {query.isError ? (
        <ErrorState title={t('Could not load documents')} message={errorMessage(query.error, '')} onRetry={() => query.refetch()} />
      ) : (
        <DataTable<KnowledgeDoc>
          data={query.data?.data ?? []}
          columns={columns}
          isLoading={query.isLoading}
          serverPagination
          totalCount={query.data?.meta.total ?? 0}
          page={page}
          pageSize={pageSize}
          onPageChange={setPage}
          onPageSizeChange={(n) => { setPageSize(n); setPage(1); }}
          serverSearch
          onSearch={(q) => { setSearch(q); setPage(1); }}
          searchPlaceholder={t('Search documents…')}
          onRowClick={(d) => { setErrors({}); setForm({ id: d.id, title: d.title, content: d.content, category: d.category ?? '', isActive: d.isActive }); }}
          actions={[
            { label: t('Edit'), icon: 'edit', onClick: (d) => { setErrors({}); setForm({ id: d.id, title: d.title, content: d.content, category: d.category ?? '', isActive: d.isActive }); } },
            { label: t('Delete'), icon: 'delete', variant: 'danger', onClick: (d) => setToDelete(d) },
          ]}
          exportFileName="knowledge-base"
          emptyTitle={t('No documents yet')}
          emptyDescription={t('Add your admission policy, fee rules and FAQs so the assistants can answer from them.')}
          emptyAction={<Button size="sm" leftIcon={<Plus className="w-4 h-4" />} onClick={() => setForm({ ...EMPTY })}>{t('Add document')}</Button>}
          toolbar={
            <Select aria-label={t('Category')} value={category} onChange={(e) => { setCategory(e.target.value); setPage(1); }} placeholder={t('All categories')}
              options={categoryOptions.map((c) => ({ value: c, label: c }))} />
          }
        />
      )}

      <Drawer
        isOpen={!!form}
        onClose={() => setForm(null)}
        title={form?.id ? t('Edit document') : t('Add document')}
        width="lg"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setForm(null)}>{t('Cancel')}</Button>
            <Button isLoading={save.isPending} onClick={submit}>{t('Save')}</Button>
          </div>
        }
      >
        {form && (
          <div className="space-y-4">
            <Input label={t('Title')} required maxLength={200} value={form.title} error={errors.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            <div>
              <Input label={t('Category')} list="kb-categories" maxLength={50} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} helperText={t('e.g. admission, fees, policy')} />
              <datalist id="kb-categories">{categoryOptions.map((c) => <option key={c} value={c} />)}</datalist>
            </div>
            <Textarea label={t('Content')} required rows={14} maxLength={50000} value={form.content} error={errors.content} onChange={(e) => setForm({ ...form, content: e.target.value })} helperText={t('{n} / 50,000 characters', { n: form.content.length })} />
            <Checkbox label={t('Active — assistants may use this document')} checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} />
          </div>
        )}
      </Drawer>

      <ConfirmModal
        isOpen={!!toDelete}
        title={t('Delete document?')}
        message={t('“{title}” will be removed permanently and the assistants will stop using it.', { title: toDelete?.title ?? '' })}
        confirmLabel={t('Delete')}
        variant="danger"
        isLoading={remove.isPending}
        onConfirm={() => toDelete && remove.mutate(toDelete.id)}
        onCancel={() => setToDelete(null)}
      />
    </div>
  );
}
