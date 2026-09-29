import React, { useState } from 'react';
import toast from 'react-hot-toast';
import { Edit2, Power, PowerOff, Trash2, Tag, Plus, Layers, DollarSign } from 'lucide-react';
import { DataTable, type Column } from '../../components/DataTable/DataTable';
import { StatusBadge } from '../../components/common/StatusBadge';
import { ConfirmModal } from '../../components/common/ConfirmModal';
import { Button, Checkbox, StatCard, ErrorState } from '../../components/ui';
import { formatCurrency } from '../../i18n';
import { useFeeCategoriesList, useUpdateFeeCategory, useDeleteFeeCategory } from './hooks';
import { CategoryModal } from './CategoryModal';
import type { FeeCategory } from './types';

interface CategoriesTabProps {
  canManage: boolean;
}

export const CategoriesTab: React.FC<CategoriesTabProps> = ({ canManage }) => {
  const [includeInactive, setIncludeInactive] = useState(false);
  const { data, isLoading, isError, refetch } = useFeeCategoriesList(includeInactive);
  const updateCategory = useUpdateFeeCategory();
  const deleteCategory = useDeleteFeeCategory();

  const [modalOpen, setModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<FeeCategory | null>(null);
  const [categoryToDelete, setCategoryToDelete] = useState<FeeCategory | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const categories = data?.data ?? [];
  const summary = data?.summary;

  const openCreate = () => { setEditingCategory(null); setModalOpen(true); };
  const openEdit = (cat: FeeCategory) => { setEditingCategory(cat); setModalOpen(true); };

  const handleToggleActive = async (cat: FeeCategory) => {
    setTogglingId(cat.id);
    try {
      await updateCategory.mutateAsync({ id: cat.id, isActive: !cat.isActive });
      toast.success(`${cat.name} is now ${cat.isActive ? 'inactive' : 'active'}.`);
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to update category status');
    } finally {
      setTogglingId(null);
    }
  };

  const handleConfirmDelete = async () => {
    if (!categoryToDelete) return;
    try {
      await deleteCategory.mutateAsync(categoryToDelete.id);
      toast.success(`${categoryToDelete.name} deleted.`);
      setCategoryToDelete(null);
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to delete fee category');
    }
  };

  const columns: Column<FeeCategory>[] = [
    {
      key: 'name',
      header: 'Category name',
      accessor: 'name',
      primary: true,
      render: (cat) => (
        <span className="flex items-center gap-2">
          <Tag className="w-4 h-4 text-slate-400 dark:text-slate-500" />
          {cat.name}
        </span>
      ),
    },
    {
      key: 'description',
      header: 'Description',
      sortable: false,
      hideOnMobile: true,
      render: (cat) => (
        cat.description
          ? <span className="text-slate-500 dark:text-slate-400 max-w-xs truncate block">{cat.description}</span>
          : <span className="text-slate-400 dark:text-slate-600 italic">No description</span>
      ),
    },
    {
      key: 'frequency',
      header: 'Frequency',
      accessor: 'frequency',
      render: (cat) => (
        <span className="px-2 py-0.5 rounded-sm bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-semibold border border-slate-200 dark:border-transparent">
          {cat.frequency}
        </span>
      ),
    },
    {
      key: 'amount',
      header: 'Default amount',
      sortable: false,
      align: 'right',
      render: (cat) => <span className="font-semibold text-slate-900 dark:text-white tabular-nums">{formatCurrency(cat.amount)}</span>,
    },
    {
      key: 'usage',
      header: 'Usage',
      sortable: false,
      hideOnMobile: true,
      render: (cat) => (
        <>
          <div className="text-xs text-slate-700 dark:text-slate-300">{cat.linkedInvoiceCount ?? 0} invoice{cat.linkedInvoiceCount === 1 ? '' : 's'}</div>
          <div className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">{formatCurrency(cat.revenueCollected ?? 0)} collected</div>
        </>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      sortable: false,
      render: (cat) => <StatusBadge status={cat.isActive !== false ? 'ACTIVE' : 'INACTIVE'} />,
    },
  ];

  if (canManage) {
    columns.push({
      key: 'actions',
      header: 'Actions',
      sortable: false,
      render: (cat) => (
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => openEdit(cat)}
            title="Edit category"
            aria-label={`Edit ${cat.name}`}
            className="p-1.5 rounded-lg text-slate-500 hover:text-primary-600 dark:hover:text-primary-400 hover:bg-slate-100 dark:hover:bg-white/10 transition-colors"
          >
            <Edit2 className="w-4 h-4" />
          </button>
          <button
            onClick={() => handleToggleActive(cat)}
            disabled={togglingId === cat.id}
            title={cat.isActive !== false ? 'Deactivate category' : 'Activate category'}
            aria-label={cat.isActive !== false ? `Deactivate ${cat.name}` : `Activate ${cat.name}`}
            className={`p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-white/10 transition-colors disabled:opacity-50 ${
              cat.isActive !== false ? 'text-slate-500 hover:text-rose-600 dark:hover:text-red-400' : 'text-slate-500 hover:text-emerald-600 dark:hover:text-emerald-400'
            }`}
          >
            {cat.isActive !== false ? <PowerOff className="w-4 h-4" /> : <Power className="w-4 h-4" />}
          </button>
          <button
            onClick={() => (cat.linkedInvoiceCount ?? 0) > 0 ? undefined : setCategoryToDelete(cat)}
            disabled={(cat.linkedInvoiceCount ?? 0) > 0}
            title={(cat.linkedInvoiceCount ?? 0) > 0 ? `Cannot delete — ${cat.linkedInvoiceCount} invoice(s) use this category. Deactivate instead.` : 'Delete category'}
            aria-label={`Delete ${cat.name}`}
            className="p-1.5 rounded-lg text-slate-500 hover:text-rose-600 dark:hover:text-red-400 hover:bg-slate-100 dark:hover:bg-white/10 transition-colors disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:text-slate-500"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      ),
    });
  }

  if (isError) {
    return <ErrorState onRetry={() => refetch()} message="Failed to load fee categories." />;
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard label="Total categories" value={summary?.totalCategories ?? 0} icon={<Layers />} tone="primary" hint={`${summary?.activeCount ?? 0} active`} />
        <StatCard label="Active categories" value={summary?.activeCount ?? 0} icon={<Tag />} tone="success" />
        <StatCard label="Revenue potential" value={formatCurrency(summary?.revenuePotential ?? 0)} icon={<DollarSign />} tone="warning" hint="Sum of active category fees" />
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <Checkbox
          label="Show inactive categories"
          checked={includeInactive}
          onChange={(e) => setIncludeInactive(e.target.checked)}
        />
        {canManage && (
          <Button leftIcon={<Plus className="w-4 h-4" />} onClick={openCreate}>
            Add category
          </Button>
        )}
      </div>

      <DataTable
        data={categories}
        columns={columns}
        isLoading={isLoading}
        searchPlaceholder="Search categories..."
        emptyTitle="No fee categories created yet"
        emptyDescription="Add a fee category to start generating invoices."
      />

      {canManage && (
        <>
          <CategoryModal isOpen={modalOpen} onClose={() => setModalOpen(false)} category={editingCategory} />
          <ConfirmModal
            isOpen={!!categoryToDelete}
            title="Delete fee category"
            message={`Are you sure you want to delete "${categoryToDelete?.name}"? This cannot be undone.`}
            confirmLabel="Delete"
            variant="danger"
            isLoading={deleteCategory.isPending}
            onConfirm={handleConfirmDelete}
            onCancel={() => setCategoryToDelete(null)}
          />
        </>
      )}
    </div>
  );
};
