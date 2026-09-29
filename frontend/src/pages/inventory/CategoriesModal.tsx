import React, { useState } from 'react';
import { Plus, Pencil, Trash2, Check, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { Modal, Button, Input, SkeletonText, ErrorState } from '../../components/ui';
import { EmptyState } from '../../components/common/EmptyState';
import { useT } from '../../i18n';
import { errMsg, invApi, useCategories, useInvMutation, type Category } from './inventory.api';

/** One catalogue of categories shared by assets and stock items. */
export const CategoriesModal: React.FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => {
  const t = useT();
  const categories = useCategories();
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  const create = useInvMutation((n: string) => invApi.post('/categories', { name: n }));
  const update = useInvMutation((v: { id: string; name: string }) => invApi.put(`/categories/${v.id}`, { name: v.name }));
  const remove = useInvMutation((id: string) => invApi.del(`/categories/${id}`));

  const add = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return setError(t('Name is required'));
    setError('');
    create.mutate(name.trim(), {
      onSuccess: () => { setName(''); toast.success(t('Category added')); },
      onError: (err) => toast.error(errMsg(err, t('Could not add category'))),
    });
  };

  const saveEdit = (c: Category) => {
    if (!editName.trim()) return;
    update.mutate(
      { id: c.id, name: editName.trim() },
      {
        onSuccess: () => { setEditingId(null); toast.success(t('Category renamed')); },
        onError: (err) => toast.error(errMsg(err, t('Could not rename category'))),
      },
    );
  };

  const items = categories.data?.items ?? [];

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t('Categories')} description={t('Shared by assets and stock items.')} size="md">
      <form onSubmit={add} className="flex items-start gap-2 mb-4">
        <Input containerClassName="flex-1" aria-label={t('New category name')} placeholder={t('e.g. Furniture, IT equipment, Stationery')} value={name} onChange={(e) => setName(e.target.value)} error={error} />
        <Button type="submit" variant="gradient" leftIcon={<Plus className="w-4 h-4" />} isLoading={create.isPending}>{t('Add')}</Button>
      </form>
      {categories.isLoading ? (
        <SkeletonText lines={4} />
      ) : categories.isError ? (
        <ErrorState message={t('Could not load categories.')} onRetry={() => categories.refetch()} />
      ) : items.length === 0 ? (
        <EmptyState compact title={t('No categories yet')} description={t('Add one above.')} />
      ) : (
        <ul className="divide-y divide-slate-200 dark:divide-white/10">
          {items.map((c) => (
            <li key={c.id} className="flex items-center gap-2 py-2">
              {editingId === c.id ? (
                <>
                  <Input containerClassName="flex-1" aria-label={t('Category name')} value={editName} onChange={(e) => setEditName(e.target.value)} autoFocus onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); saveEdit(c); } if (e.key === 'Escape') setEditingId(null); }} />
                  <Button type="button" size="icon-sm" variant="ghost" aria-label={t('Save')} onClick={() => saveEdit(c)} isLoading={update.isPending}><Check className="w-4 h-4" /></Button>
                  <Button type="button" size="icon-sm" variant="ghost" aria-label={t('Cancel')} onClick={() => setEditingId(null)}><X className="w-4 h-4" /></Button>
                </>
              ) : (
                <>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-900 dark:text-white truncate">{c.name}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {t('{a} assets · {s} stock items', { a: c._count?.assets ?? 0, s: c._count?.stockItems ?? 0 })}
                    </p>
                  </div>
                  <Button type="button" size="icon-sm" variant="ghost" aria-label={t('Rename {name}', { name: c.name })} onClick={() => { setEditingId(c.id); setEditName(c.name); }}><Pencil className="w-4 h-4" /></Button>
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    aria-label={t('Delete {name}', { name: c.name })}
                    disabled={remove.isPending}
                    onClick={() =>
                      remove.mutate(c.id, {
                        onSuccess: () => toast.success(t('Category deleted')),
                        onError: (err) => toast.error(errMsg(err, t('Could not delete category'))),
                      })
                    }
                  >
                    <Trash2 className="w-4 h-4 text-red-600 dark:text-red-400" />
                  </Button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
};
