import React from 'react';
import { ImagePlus, Package, Plus, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { Card, CardHeader, Button, Badge, Drawer, Input, Textarea, Select, Checkbox, Skeleton, ErrorState } from '@/components/ui';
import { DataTable, type Column } from '@/components/DataTable/DataTable';
import { ConfirmModal } from '@/components/common/ConfirmModal';
import { useT, formatCurrency, formatNumber } from '@/i18n';
import { useTableParams } from '@/hooks/useTableParams';
import { useProducts, useProduct, useSaveProduct, useDeleteProduct, apiError } from '../../sites.queries';
import { SLUG_RE, slugify } from '../../siteUtils';
import type { SiteProduct, SiteProductKind, SiteStatus } from '../../sites.types';
import { htmlToText, textToHtml } from '../../blog/postBody';
import { MediaThumb, MediaPickerModal } from '../../media/MediaPicker';

const ImagesField: React.FC<{ images: string[]; onChange: (images: string[]) => void }> = ({ images, onChange }) => {
  const t = useT();
  const [open, setOpen] = React.useState(false);
  return (
    <div>
      <span className="field-label">{t('Photos')}</span>
      <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
        {images.map((url, i) => (
          <div key={`${url}-${i}`} className="relative aspect-square rounded-lg overflow-hidden border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5">
            <MediaThumb media={{ url, kind: 'IMAGE', name: '', alt: '' }} />
            <button
              type="button"
              onClick={() => onChange(images.filter((_, j) => j !== i))}
              aria-label={t('Remove photo')}
              className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black/80"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="aspect-square rounded-lg border-2 border-dashed border-slate-300 dark:border-white/15 flex flex-col items-center justify-center gap-1 text-slate-500 hover:border-primary-500 hover:text-primary-600"
        >
          <ImagePlus className="w-5 h-5" aria-hidden />
          <span className="text-[11px] font-medium">{t('Add')}</span>
        </button>
      </div>
      <MediaPickerModal isOpen={open} onClose={() => setOpen(false)} kind="IMAGE" onSelect={(m) => onChange([...images, m.url])} />
    </div>
  );
};

const KIND_OPTIONS: { value: SiteProductKind; label: string }[] = [
  { value: 'PHYSICAL', label: 'Physical (shipped)' },
  { value: 'DIGITAL', label: 'Digital (download link)' },
];

interface ProductForm {
  name: string;
  nameBn: string;
  slug: string;
  slugTouched: boolean;
  price: string;
  compareAtPrice: string;
  sku: string;
  stock: string;
  unlimitedStock: boolean;
  category: string;
  kind: SiteProductKind;
  digitalUrl: string;
  images: string[];
  description: string;
  status: SiteStatus;
}

const emptyForm: ProductForm = {
  name: '', nameBn: '', slug: '', slugTouched: false, price: '', compareAtPrice: '', sku: '', stock: '',
  unlimitedStock: true, category: '', kind: 'PHYSICAL', digitalUrl: '', images: [], description: '', status: 'DRAFT',
};

const ProductEditorDrawer: React.FC<{ open: boolean; productId: string | null; onClose: () => void }> = ({ open, productId, onClose }) => {
  const t = useT();
  const q = useProduct(open && productId ? productId : undefined);
  const save = useSaveProduct();
  const [form, setForm] = React.useState<ProductForm>(emptyForm);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const loaded = React.useRef<string | null>(null);
  const set = <K extends keyof ProductForm>(k: K, v: ProductForm[K]) => setForm((f) => ({ ...f, [k]: v }));

  React.useEffect(() => {
    if (!open) { loaded.current = null; return; }
    if (!productId) {
      if (loaded.current === 'new') return;
      loaded.current = 'new';
      setForm(emptyForm);
      setErrors({});
      return;
    }
    const p = q.data;
    if (!p || loaded.current === p.id) return;
    loaded.current = p.id;
    setForm({
      name: p.name, nameBn: p.nameBn ?? '', slug: p.slug, slugTouched: true,
      price: String(p.price ?? ''), compareAtPrice: p.compareAtPrice != null ? String(p.compareAtPrice) : '',
      sku: p.sku ?? '', stock: p.stock != null ? String(p.stock) : '', unlimitedStock: p.stock == null,
      category: p.category ?? '', kind: p.kind, digitalUrl: p.digitalUrl ?? '', images: p.images ?? [],
      description: htmlToText(p.description ?? ''), status: p.status,
    });
    setErrors({});
  }, [open, productId, q.data]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!form.name.trim()) errs.name = t('Enter a product name.');
    if (form.slug && !SLUG_RE.test(form.slug)) errs.slug = t('Use lowercase letters, numbers and hyphens only.');
    const price = Number(form.price);
    if (!form.price || Number.isNaN(price) || price < 0) errs.price = t('Enter a valid price.');
    if (form.compareAtPrice && (Number.isNaN(Number(form.compareAtPrice)) || Number(form.compareAtPrice) < 0)) errs.compareAtPrice = t('Enter a valid amount.');
    if (!form.unlimitedStock && form.stock && (Number.isNaN(Number(form.stock)) || Number(form.stock) < 0)) errs.stock = t('Enter a valid quantity.');
    if (form.kind === 'DIGITAL' && !form.digitalUrl.trim()) errs.digitalUrl = t('Add the download link for the digital file.');
    if (form.digitalUrl && !/^https?:\/\/\S+$/i.test(form.digitalUrl)) errs.digitalUrl = t('Enter a full https:// address.');
    setErrors(errs);
    if (Object.keys(errs).length) return;

    save.mutate(
      {
        id: productId ?? undefined,
        data: {
          name: form.name.trim(),
          nameBn: form.nameBn.trim() || undefined,
          slug: form.slug || undefined,
          description: textToHtml(form.description),
          images: form.images,
          price,
          compareAtPrice: form.compareAtPrice ? Number(form.compareAtPrice) : null,
          sku: form.sku.trim() || undefined,
          stock: form.unlimitedStock ? null : (form.stock ? Number(form.stock) : 0),
          category: form.category.trim() || undefined,
          kind: form.kind,
          digitalUrl: form.kind === 'DIGITAL' ? form.digitalUrl.trim() : undefined,
          status: form.status,
        },
      },
      { onSuccess: () => { toast.success(t('Product saved.')); onClose(); } }
    );
  };

  const loading = !!productId && q.isLoading;
  return (
    <Drawer
      isOpen={open}
      onClose={save.isPending ? () => {} : onClose}
      title={productId ? t('Edit product') : t('New product')}
      width="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={save.isPending}>{t('Cancel')}</Button>
          <Button type="submit" form="site-product-editor" isLoading={save.isPending} disabled={loading || q.isError}>{t('Save product')}</Button>
        </>
      }
    >
      {loading ? (
        <div className="space-y-3"><Skeleton className="h-10" /><Skeleton className="h-10" /><Skeleton className="h-40" /></div>
      ) : q.isError ? (
        <ErrorState compact message={apiError(q.error, t('Could not load the product.'))} onRetry={() => q.refetch()} />
      ) : (
        <form id="site-product-editor" className="space-y-4" onSubmit={submit} noValidate>
          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              id="site-product-name" label={t('Name')} required value={form.name} error={errors.name}
              onChange={(e) => { set('name', e.target.value); if (!form.slugTouched) set('slug', slugify(e.target.value)); }}
            />
            <Input id="site-product-nameBn" label={t('Name (Bangla)')} lang="bn" value={form.nameBn} onChange={(e) => set('nameBn', e.target.value)} />
          </div>
          <Input
            id="site-product-slug" label={t('Address')} value={form.slug} error={errors.slug}
            leftIcon={<span className="text-xs font-mono">/shop/</span>}
            onChange={(e) => { set('slugTouched', true); set('slug', e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '')); }}
          />
          <div className="grid gap-3 sm:grid-cols-3">
            <Input id="site-product-price" label={t('Price')} required inputMode="decimal" value={form.price} error={errors.price} onChange={(e) => set('price', e.target.value.replace(/[^0-9.]/g, ''))} />
            <Input id="site-product-compare" label={t('Compare-at price')} inputMode="decimal" value={form.compareAtPrice} error={errors.compareAtPrice} helperText={t('Optional. Shown crossed out.')} onChange={(e) => set('compareAtPrice', e.target.value.replace(/[^0-9.]/g, ''))} />
            <Input id="site-product-sku" label={t('SKU')} value={form.sku} onChange={(e) => set('sku', e.target.value)} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Input id="site-product-category" label={t('Category')} value={form.category} onChange={(e) => set('category', e.target.value)} />
            <Select id="site-product-kind" label={t('Type')} value={form.kind} onChange={(e) => set('kind', e.target.value as SiteProductKind)} options={KIND_OPTIONS.map((o) => ({ value: o.value, label: t(o.label) }))} />
          </div>
          {form.kind === 'DIGITAL' ? (
            <Input id="site-product-digital" label={t('Download link')} required value={form.digitalUrl} error={errors.digitalUrl} helperText={t('Only ever shown to a buyer after their order is marked Paid.')} onChange={(e) => set('digitalUrl', e.target.value)} />
          ) : (
            <div className="flex items-end gap-3">
              <Checkbox label={t('Unlimited stock')} checked={form.unlimitedStock} onChange={(e) => set('unlimitedStock', e.target.checked)} />
              {!form.unlimitedStock && (
                <Input id="site-product-stock" label={t('In stock')} inputMode="numeric" value={form.stock} error={errors.stock} onChange={(e) => set('stock', e.target.value.replace(/\D/g, ''))} containerClassName="flex-1 max-w-40" />
              )}
            </div>
          )}
          <ImagesField images={form.images} onChange={(images) => set('images', images)} />
          <Textarea id="site-product-description" label={t('Description')} rows={5} value={form.description} onChange={(e) => set('description', e.target.value)} helperText={t('Leave an empty line between paragraphs.')} />
          <Select
            id="site-product-status" label={t('Status')} value={form.status} onChange={(e) => set('status', e.target.value as SiteStatus)}
            options={[{ value: 'DRAFT', label: t('Draft (hidden from the shop)') }, { value: 'PUBLISHED', label: t('Published') }]}
          />
        </form>
      )}
    </Drawer>
  );
};

export const ProductsView: React.FC = () => {
  const t = useT();
  const { params, debouncedSearch, setPage, setPageSize, setSearch, setFilter } = useTableParams(20);
  const q = useProducts({ page: params.page, pageSize: params.pageSize, q: debouncedSearch, status: (params.filters.status || '') as SiteStatus | '' });
  const del = useDeleteProduct();
  const [editor, setEditor] = React.useState<{ open: boolean; id: string | null }>({ open: false, id: null });
  const [toDelete, setToDelete] = React.useState<SiteProduct | null>(null);

  const columns: Column<SiteProduct>[] = [
    {
      key: 'name', header: t('Product'), primary: true, accessor: 'name',
      render: (p) => (
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-lg overflow-hidden border border-slate-200 dark:border-white/10 shrink-0 bg-slate-50 dark:bg-white/5">
            {p.images[0] ? <MediaThumb media={{ url: p.images[0], kind: 'IMAGE', name: p.name, alt: p.name }} /> : <Package className="w-full h-full p-2 text-slate-300" aria-hidden />}
          </div>
          <div className="min-w-0">
            <p className="font-medium text-slate-900 dark:text-slate-50 truncate">{p.name}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{p.sku ? `${p.sku} · ` : ''}{p.category || t('Uncategorised')}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'price', header: t('Price'), align: 'right',
      render: (p) => (
        <span>
          {formatCurrency(p.price)}
          {p.compareAtPrice ? <span className="block text-xs text-slate-400 line-through">{formatCurrency(p.compareAtPrice)}</span> : null}
        </span>
      ),
      exportValue: (p) => p.price,
    },
    {
      key: 'stock', header: t('Stock'), hideOnMobile: true,
      render: (p) => (p.kind === 'DIGITAL' ? <Badge variant="info">{t('Digital')}</Badge> : p.stock == null ? t('Unlimited') : formatNumber(p.stock)),
    },
    { key: 'status', header: t('Status'), render: (p) => <Badge variant={p.status === 'PUBLISHED' ? 'success' : 'neutral'} dot>{p.status === 'PUBLISHED' ? t('Published') : t('Draft')}</Badge>, exportValue: (p) => p.status },
  ];

  return (
    <Card>
      <CardHeader
        icon={<Package className="w-4 h-4" />}
        title={t('Products')}
        description={t('Uniforms, books and other items your school sells online.')}
        actions={<Button leftIcon={<Plus className="w-4 h-4" />} onClick={() => setEditor({ open: true, id: null })}>{t('New product')}</Button>}
      />
      {q.isError ? (
        <ErrorState message={apiError(q.error, t('Could not load products.'))} onRetry={() => q.refetch()} />
      ) : (
        <DataTable
          data={q.data?.items ?? []}
          columns={columns}
          isLoading={q.isLoading}
          onRowClick={(p) => setEditor({ open: true, id: p.id })}
          serverSearch
          onSearch={setSearch}
          searchPlaceholder={t('Search products')}
          serverPagination
          totalCount={q.data?.total ?? 0}
          page={params.page}
          pageSize={params.pageSize}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
          toolbar={
            <Select
              aria-label={t('Filter by status')}
              value={params.filters.status || ''}
              onChange={(e) => setFilter('status', e.target.value)}
              className="w-auto min-w-36"
              placeholder={t('All statuses')}
              options={[{ value: 'DRAFT', label: t('Draft') }, { value: 'PUBLISHED', label: t('Published') }]}
            />
          }
          actions={[
            { label: t('Edit'), icon: 'edit', onClick: (p) => setEditor({ open: true, id: p.id }) },
            { label: t('Delete'), icon: 'delete', variant: 'danger', onClick: (p) => setToDelete(p) },
          ]}
          emptyTitle={t('No products yet')}
          emptyDescription={t('Add uniforms, books or merchandise to sell on your website.')}
          emptyAction={<Button onClick={() => setEditor({ open: true, id: null })}>{t('New product')}</Button>}
          exportFileName="website-products"
        />
      )}
      <ProductEditorDrawer open={editor.open} productId={editor.id} onClose={() => setEditor({ open: false, id: null })} />
      <ConfirmModal
        isOpen={!!toDelete}
        title={t('Delete “{name}”?', { name: toDelete?.name ?? '' })}
        message={t('The product is removed from your shop immediately. Past orders keep their own record of it.')}
        confirmLabel={t('Delete product')}
        isLoading={del.isPending}
        onCancel={() => setToDelete(null)}
        onConfirm={() => toDelete && del.mutate(toDelete.id, { onSuccess: () => setToDelete(null) })}
      />
    </Card>
  );
};
