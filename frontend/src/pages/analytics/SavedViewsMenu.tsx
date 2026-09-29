import React, { useState } from 'react';
import { Bookmark, ChevronDown, Save, Trash2, RefreshCw, Users } from 'lucide-react';
import { Button, Checkbox, Dropdown, Input, Modal, type DropdownSection } from '@/components/ui';
import { ConfirmModal } from '@/components/common/ConfirmModal';
import { useT } from '@/i18n';
import { useCreateSavedView, useDeleteSavedView, useSavedViews, useUpdateSavedView } from './analytics.queries';
import type { ReportFilters, ReportKey, SavedView } from './analytics.types';

interface Props {
  reportKey: ReportKey;
  filters: ReportFilters;
  activeViewId: string | null;
  onApply: (view: SavedView | null) => void;
  /** SUPER_ADMIN/ADMIN may delete views shared by others (mirrors the backend). */
  canDeleteAny: boolean;
}

/** Saved-views dropdown: load a view, save the current filters, update or delete. */
export const SavedViewsMenu: React.FC<Props> = ({ reportKey, filters, activeViewId, onApply, canDeleteAny }) => {
  const t = useT();
  const views = useSavedViews(reportKey);
  const create = useCreateSavedView();
  const update = useUpdateSavedView();
  const remove = useDeleteSavedView();
  const [saveOpen, setSaveOpen] = useState(false);
  const [name, setName] = useState('');
  const [shared, setShared] = useState(false);
  const [nameError, setNameError] = useState<string | undefined>();
  const [confirmDelete, setConfirmDelete] = useState(false);

  const items = views.data?.items ?? [];
  const active = items.find((v) => v.id === activeViewId) ?? null;

  const sections: DropdownSection[] = [
    {
      label: t('Saved views'),
      items: views.isError
        ? [{ id: 'error', label: t('Could not load saved views'), disabled: true }]
        : views.isLoading
          ? [{ id: 'loading', label: t('Loading…'), disabled: true }]
          : items.length === 0
            ? [{ id: 'none', label: t('No saved views yet'), disabled: true }]
            : items.map((v) => ({
                id: v.id,
                label: v.name,
                selected: v.id === activeViewId,
                icon: v.isShared ? <Users className="w-4 h-4" /> : <Bookmark className="w-4 h-4" />,
                hint: v.isOwner ? undefined : v.ownerName,
                onSelect: () => onApply(v),
              })),
    },
    {
      items: [
        { id: 'save', label: t('Save current filters as…'), icon: <Save className="w-4 h-4" />, onSelect: () => { setName(''); setShared(false); setNameError(undefined); setSaveOpen(true); } },
        ...(active?.isOwner
          ? [{ id: 'update', label: t('Update "{name}"', { name: active.name }), icon: <RefreshCw className="w-4 h-4" />, onSelect: () => update.mutate({ id: active.id, filters }) }]
          : []),
        ...(active && (active.isOwner || (canDeleteAny && active.isShared))
          ? [{ id: 'delete', label: t('Delete "{name}"', { name: active.name }), icon: <Trash2 className="w-4 h-4" />, danger: true, onSelect: () => setConfirmDelete(true) }]
          : []),
        ...(active ? [{ id: 'clear', label: t('Clear selected view'), onSelect: () => onApply(null) }] : []),
      ],
    },
  ];

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setNameError(t('Name is required'));
      return;
    }
    create.mutate(
      { name: name.trim(), reportKey, filters, isShared: shared },
      {
        onSuccess: (view) => {
          setSaveOpen(false);
          onApply(view);
        },
      },
    );
  };

  return (
    <>
      <Dropdown
        align="right"
        width="w-72"
        sections={sections}
        trigger={(p) => (
          <Button {...p} type="button" variant="secondary" size="sm" leftIcon={<Bookmark className="w-4 h-4" />} rightIcon={<ChevronDown className="w-4 h-4" />}>
            <span className="max-w-[10rem] truncate">{active ? active.name : t('Saved views')}</span>
          </Button>
        )}
      />

      <Modal
        isOpen={saveOpen}
        onClose={() => setSaveOpen(false)}
        title={t('Save view')}
        description={t('Saves the current filters for this tab. Relative ranges like "Last 30 days" stay relative.')}
        size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setSaveOpen(false)}>{t('Cancel')}</Button>
            <Button type="submit" form="save-view-form" isLoading={create.isPending}>{t('Save')}</Button>
          </div>
        }
      >
        <form id="save-view-form" onSubmit={submit} className="space-y-4">
          <Input id="saved-view-name" label={t('Name')} required value={name} maxLength={100} error={nameError} onChange={(e) => { setName(e.target.value); setNameError(undefined); }} />
          <Checkbox id="saved-view-shared" label={t('Share with my institution')} description={t('Colleagues who can open this report will see it in their list.')} checked={shared} onChange={(e) => setShared(e.target.checked)} />
        </form>
      </Modal>

      <ConfirmModal
        isOpen={confirmDelete}
        title={t('Delete saved view?')}
        message={t('This also deletes any scheduled emails that use it.')}
        confirmLabel={t('Delete')}
        variant="danger"
        isLoading={remove.isPending}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() =>
          active &&
          remove.mutate(active.id, {
            onSuccess: () => {
              setConfirmDelete(false);
              onApply(null);
            },
          })
        }
      />
    </>
  );
};
