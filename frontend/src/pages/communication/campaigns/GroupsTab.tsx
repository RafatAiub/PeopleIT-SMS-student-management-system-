import React, { useState } from 'react';
import { Plus } from 'lucide-react';
import { ErrorState, Button } from '@/components/ui';
import { DataTable, type Column } from '@/components/DataTable/DataTable';
import { ConfirmModal } from '@/components/common/ConfirmModal';
import { useTableParams } from '@/hooks/useTableParams';
import { useT, formatDate, formatNumber } from '@/i18n';
import { useDeleteGroup, useGroups } from './campaigns.queries';
import GroupFormModal from './GroupFormModal';
import GroupDetailDrawer from './GroupDetailDrawer';
import type { MessageGroup } from './campaigns.types';

export default function GroupsTab() {
  const t = useT();
  const { params, debouncedSearch, setPage, setPageSize, setSearch } = useTableParams();
  const { data, isLoading, isError, refetch } = useGroups({
    page: params.page,
    pageSize: params.pageSize,
    search: debouncedSearch,
  });

  const deleteMutation = useDeleteGroup();

  const [formOpen, setFormOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<MessageGroup | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [groupToDelete, setGroupToDelete] = useState<MessageGroup | null>(null);

  const openCreate = () => {
    setEditingGroup(null);
    setFormOpen(true);
  };
  const openEdit = (group: MessageGroup) => {
    setEditingGroup(group);
    setFormOpen(true);
  };

  const columns: Column<MessageGroup>[] = [
    { key: 'name', header: t('Name'), accessor: 'name', primary: true },
    { key: 'description', header: t('Description'), render: (g) => g.description || '—', hideOnMobile: true },
    { key: 'members', header: t('Members'), render: (g) => formatNumber(g._count.members), align: 'right' },
    {
      key: 'createdBy',
      header: t('Created by'),
      hideOnMobile: true,
      render: (g) => `${g.createdBy.firstName} ${g.createdBy.lastName}`,
    },
    { key: 'createdAt', header: t('Created'), render: (g) => formatDate(g.createdAt), hideOnMobile: true },
  ];

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button variant="gradient" leftIcon={<Plus className="w-4 h-4" />} onClick={openCreate}>
          {t('New group')}
        </Button>
      </div>

      {isError ? (
        <ErrorState message={t('Could not load message groups.')} onRetry={() => refetch()} />
      ) : (
      <DataTable
        data={data?.groups ?? []}
        columns={columns}
        isLoading={isLoading}
        serverPagination
        totalCount={data?.total ?? 0}
        page={params.page}
        onPageChange={setPage}
        onPageSizeChange={setPageSize}
        pageSize={params.pageSize}
        serverSearch
        onSearch={setSearch}
        searchPlaceholder={t('Search groups by name…')}
        onRowClick={(g) => setDetailId(g.id)}
        emptyTitle={t('No message groups yet')}
        emptyDescription={t('Groups let you save a set of people to reuse across campaigns.')}
        emptyAction={
          <Button variant="primary" size="sm" leftIcon={<Plus className="w-4 h-4" />} onClick={openCreate}>
            {t('New group')}
          </Button>
        }
        actions={[
          { label: t('Edit'), icon: 'edit', onClick: openEdit },
          { label: t('Delete'), icon: 'delete', variant: 'danger', onClick: setGroupToDelete },
        ]}
      />
      )}


      <GroupFormModal isOpen={formOpen} onClose={() => setFormOpen(false)} group={editingGroup} />
      <GroupDetailDrawer groupId={detailId} onClose={() => setDetailId(null)} onEdit={openEdit} />

      <ConfirmModal
        isOpen={!!groupToDelete}
        title={t('Delete group?')}
        message={groupToDelete ? t('Are you sure you want to delete "{name}"? This cannot be undone.', { name: groupToDelete.name }) : ''}
        confirmLabel={t('Delete')}
        variant="danger"
        isLoading={deleteMutation.isPending}
        onConfirm={() => groupToDelete && deleteMutation.mutate(groupToDelete.id, { onSuccess: () => setGroupToDelete(null) })}
        onCancel={() => setGroupToDelete(null)}
      />
    </div>
  );
}
