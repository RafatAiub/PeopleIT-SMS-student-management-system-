import React, { useState } from 'react';
import { Plus, Save } from 'lucide-react';
import toast from 'react-hot-toast';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import apiClient from '../../api/client';
import { ConfirmModal } from '../common/ConfirmModal';
import { Button, Modal, Input, PageHeader, ErrorState } from '../ui';
import { DataTable, Column, RowAction } from '../DataTable/DataTable';

interface LookupItem {
  id: string;
  name?: string;
  createdAt?: string;
  [key: string]: any;
}

interface SimpleLookupManagerProps {
  /** Human-readable label, e.g. "Medium" — used for headings, placeholders, and toasts. */
  title: string;
  /** REST base path, e.g. "/academics/mediums". POST hits this path directly; PUT/DELETE append "/:id". Also used for the list GET unless `listPath` is given. */
  apiBasePath: string;
  /** Override the list GET path when it differs from `apiBasePath` (e.g. a shared base path whose bare GET has different query requirements/shape). */
  listPath?: string;
  /**
   * Extracts the display name from a list item — override for endpoints whose
   * record shape doesn't use a plain `name` field. Defaults to `item.name`.
   */
  getDisplayName?: (item: LookupItem) => string;
  /** Optional page description shown under the title. */
  description?: string;
}

/**
 * Generic manager for single-field lookup tables (Medium/Stream/Shift/
 * Semester/Subject catalogue/Student category): a PageHeader + DataTable of
 * records, with create/edit handled in a Modal and delete behind a
 * ConfirmModal. Data is fetched/mutated through React Query.
 */
export const SimpleLookupManager: React.FC<SimpleLookupManagerProps> = ({
  title,
  apiBasePath,
  listPath,
  getDisplayName,
  description,
}) => {
  const fetchPath = listPath || apiBasePath;
  const queryClient = useQueryClient();
  const queryKey = ['lookup', fetchPath];

  const [modalOpen, setModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<LookupItem | null>(null);
  const [name, setName] = useState('');
  const [nameError, setNameError] = useState('');
  const [itemToDelete, setItemToDelete] = useState<LookupItem | null>(null);

  const displayName = getDisplayName || ((item: LookupItem) => item.name ?? '');

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey,
    queryFn: async () => {
      const res = await apiClient.get(fetchPath);
      return (res.data?.data || []) as LookupItem[];
    },
  });
  const items = data || [];

  const invalidate = () => queryClient.invalidateQueries({ queryKey });

  const createMutation = useMutation({
    mutationFn: (payload: { name: string }) => apiClient.post(apiBasePath, payload),
    onSuccess: () => {
      toast.success(`${title} created successfully`);
      invalidate();
      closeModal();
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || `Failed to save ${title.toLowerCase()}`);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: { name: string } }) =>
      apiClient.put(`${apiBasePath}/${id}`, payload),
    onSuccess: () => {
      toast.success(`${title} updated successfully`);
      invalidate();
      closeModal();
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || `Failed to save ${title.toLowerCase()}`);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiClient.delete(`${apiBasePath}/${id}`),
    onSuccess: () => {
      toast.success(`${title} deleted successfully`);
      setItemToDelete(null);
      invalidate();
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || `Failed to delete ${title.toLowerCase()}`);
    },
  });

  const saving = createMutation.isPending || updateMutation.isPending;

  const openCreate = () => {
    setEditingItem(null);
    setName('');
    setNameError('');
    setModalOpen(true);
  };

  const openEdit = (item: LookupItem) => {
    setEditingItem(item);
    setName(displayName(item));
    setNameError('');
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditingItem(null);
    setName('');
    setNameError('');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setNameError(`${title} name is required`);
      return;
    }
    const payload = { name: name.trim() };
    if (editingItem) {
      updateMutation.mutate({ id: editingItem.id, payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const columns: Column<LookupItem>[] = [
    {
      key: 'name',
      header: 'Name',
      accessor: 'name',
      primary: true,
      render: (item) => <span className="font-medium text-slate-900 dark:text-white">{displayName(item)}</span>,
    },
  ];

  const actions: RowAction<LookupItem>[] = [
    { label: 'Edit', icon: 'edit', onClick: openEdit },
    { label: 'Delete', icon: 'delete', variant: 'danger', onClick: (item) => setItemToDelete(item) },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Manage ${title}`}
        description={description}
        actions={
          <Button variant="gradient" onClick={openCreate}>
            <Plus className="w-4 h-4" />
            Add {title}
          </Button>
        }
      />

      <div className="glass-card p-4 sm:p-6 rounded-2xl">
        {isError ? (
          <ErrorState
            title={`Failed to load ${title.toLowerCase()} list`}
            message="Please check your connection and try again."
            onRetry={() => refetch()}
          />
        ) : (
          <DataTable
            data={items}
            columns={columns}
            actions={actions}
            isLoading={isLoading}
            searchPlaceholder={`Search ${title.toLowerCase()}...`}
            emptyTitle={`No ${title.toLowerCase()} records found`}
            emptyDescription={`Create your first ${title.toLowerCase()} to get started.`}
            emptyAction={
              <Button variant="primary" size="sm" onClick={openCreate}>
                <Plus className="w-4 h-4" />
                Add {title}
              </Button>
            }
          />
        )}
      </div>

      <Modal
        isOpen={modalOpen}
        onClose={closeModal}
        title={editingItem ? `Edit ${title}` : `Create ${title}`}
        footer={
          <>
            <Button type="button" variant="secondary" onClick={closeModal} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" form="lookup-form" variant="primary" isLoading={saving}>
              <Save className="w-4 h-4" />
              {editingItem ? 'Update' : 'Submit'}
            </Button>
          </>
        }
      >
        <form id="lookup-form" onSubmit={handleSubmit} className="space-y-4">
          <Input
            id="lookup-name"
            label="Name"
            required
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (nameError) setNameError('');
            }}
            placeholder={`Enter ${title.toLowerCase()} name`}
            error={nameError}
            data-autofocus
          />
        </form>
      </Modal>

      <ConfirmModal
        isOpen={!!itemToDelete}
        title={`Delete ${title}`}
        message={`Delete "${itemToDelete ? displayName(itemToDelete) : ''}"? This cannot be undone.`}
        confirmLabel="Delete"
        variant="danger"
        isLoading={deleteMutation.isPending}
        onConfirm={() => itemToDelete && deleteMutation.mutate(itemToDelete.id)}
        onCancel={() => setItemToDelete(null)}
      />
    </div>
  );
};

export default SimpleLookupManager;
