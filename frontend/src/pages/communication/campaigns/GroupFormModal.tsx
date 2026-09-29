import React, { useEffect, useState } from 'react';
import { Button, Input, Modal, Textarea } from '@/components/ui';
import { useT } from '@/i18n';
import { useCreateGroup, useUpdateGroup } from './campaigns.queries';
import MemberPicker from './MemberPicker';
import type { GroupMemberUser, MessageGroup } from './campaigns.types';

interface GroupFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** null = create mode, otherwise the group being edited (name/description only — see below). */
  group: MessageGroup | null;
}

export default function GroupFormModal({ isOpen, onClose, group }: GroupFormModalProps) {
  const t = useT();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [members, setMembers] = useState<GroupMemberUser[]>([]);
  const [error, setError] = useState<string | undefined>();

  const createMutation = useCreateGroup();
  const updateMutation = useUpdateGroup();
  const isSaving = createMutation.isPending || updateMutation.isPending;

  useEffect(() => {
    if (!isOpen) return;
    setName(group?.name ?? '');
    setDescription(group?.description ?? '');
    setMembers([]);
    setError(undefined);
  }, [isOpen, group]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError(t('Name is required'));
      return;
    }
    if (group) {
      updateMutation.mutate(
        { id: group.id, data: { name: name.trim(), description: description.trim() || null } },
        { onSuccess: () => onClose() }
      );
    } else {
      createMutation.mutate(
        { name: name.trim(), description: description.trim() || null, memberUserIds: members.map((m) => m.id) },
        { onSuccess: () => onClose() }
      );
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={group ? t('Edit group') : t('New message group')}
      size="xl"
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose} disabled={isSaving}>
            {t('Cancel')}
          </Button>
          <Button type="submit" form="groupForm" variant="gradient" isLoading={isSaving}>
            {group ? t('Save changes') : t('Create group')}
          </Button>
        </>
      }
    >
      <form id="groupForm" onSubmit={handleSubmit} className="space-y-5">
        <Input
          label={t('Name')}
          required
          data-autofocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          error={error}
          maxLength={120}
          placeholder={t('e.g. Class 8 section A guardians')}
        />
        <Textarea
          label={t('Description')}
          rows={2}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={500}
          placeholder={t('Optional note about who this group is for')}
        />
        {group ? (
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {t('Add or remove members from the group’s detail view after saving.')}
          </p>
        ) : (
          <div>
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 mb-2">{t('Members (optional)')}</p>
            <MemberPicker selected={members} onChange={setMembers} />
          </div>
        )}
      </form>
    </Modal>
  );
}
