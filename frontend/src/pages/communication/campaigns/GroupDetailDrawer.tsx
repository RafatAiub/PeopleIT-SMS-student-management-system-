import React, { useEffect, useState } from 'react';
import { Pencil, Trash2, UserPlus } from 'lucide-react';
import { Badge, Button, Drawer, ErrorState, SkeletonText } from '@/components/ui';
import { EmptyState } from '@/components/common/EmptyState';
import { ConfirmModal } from '@/components/common/ConfirmModal';
import { useT, formatDate, formatNumber } from '@/i18n';
import { useAuthStore } from '@/store/authStore';
import { useAddGroupMembers, useGroup, useRemoveGroupMember } from './campaigns.queries';
import MemberPicker from './MemberPicker';
import { AUDIENCE_ROLE_OPTIONS, type GroupMemberUser, type MessageGroup } from './campaigns.types';

interface GroupDetailDrawerProps {
  groupId: string | null;
  onClose: () => void;
  onEdit: (group: MessageGroup) => void;
}

/** Group detail: members list with remove, and an "add members" picker. */
export default function GroupDetailDrawer({ groupId, onClose, onEdit }: GroupDetailDrawerProps) {
  const t = useT();
  const { user } = useAuthStore();
  const isTeacher = user?.role === 'TEACHER';
  const { data: group, isLoading, isError, refetch } = useGroup(groupId ?? undefined);
  const addMutation = useAddGroupMembers();
  const removeMutation = useRemoveGroupMember();

  const [adding, setAdding] = useState(false);
  const [toAdd, setToAdd] = useState<GroupMemberUser[]>([]);
  const [toRemove, setToRemove] = useState<GroupMemberUser | null>(null);

  useEffect(() => {
    setAdding(false);
    setToAdd([]);
  }, [groupId]);

  const existingIds = new Set((group?.members ?? []).map((m) => m.id));
  const newOnes = toAdd.filter((m) => !existingIds.has(m.id));

  const handleAdd = () => {
    if (!group || newOnes.length === 0) return;
    addMutation.mutate(
      { id: group.id, userIds: newOnes.map((m) => m.id) },
      {
        onSuccess: () => {
          setToAdd([]);
          setAdding(false);
        },
      },
    );
  };

  return (
    <Drawer
      isOpen={!!groupId}
      onClose={onClose}
      title={group?.name ?? t('Message group')}
      description={group?.description ?? undefined}
      width="lg"
      footer={
        group ? (
          <>
            <Button type="button" variant="secondary" onClick={onClose}>
              {t('Close')}
            </Button>
            <Button type="button" variant="outline" leftIcon={<Pencil className="w-4 h-4" />} onClick={() => onEdit(group)}>
              {t('Edit')}
            </Button>
          </>
        ) : undefined
      }
    >
      {isError ? (
        <ErrorState message={t('Could not load this group.')} onRetry={() => refetch()} />
      ) : isLoading || !group ? (
        <SkeletonText lines={6} />
      ) : (
        <div className="space-y-5">
          <p className="text-sm text-slate-600 dark:text-slate-300">
            {t('{count} members · created by {name} on {date}', {
              count: formatNumber(group.members.length),
              name: `${group.createdBy.firstName} ${group.createdBy.lastName}`,
              date: formatDate(group.createdAt),
            })}
          </p>

          {adding ? (
            <div className="space-y-3 rounded-2xl border border-slate-200 dark:border-white/10 p-3">
              <MemberPicker
                selected={toAdd}
                onChange={setToAdd}
                roleOptions={
                  isTeacher ? AUDIENCE_ROLE_OPTIONS.filter((o) => o.value === 'STUDENT' || o.value === 'GUARDIAN') : undefined
                }
                helperText={isTeacher ? t('You can only add students and guardians of sections you are class teacher of.') : undefined}
              />
              <div className="flex flex-wrap justify-end gap-2">
                <Button type="button" variant="ghost" size="sm" onClick={() => { setAdding(false); setToAdd([]); }}>
                  {t('Cancel')}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={handleAdd}
                  isLoading={addMutation.isPending}
                  disabled={newOnes.length === 0}
                >
                  {t('Add {count} members', { count: newOnes.length })}
                </Button>
              </div>
            </div>
          ) : (
            <Button type="button" variant="outline" size="sm" leftIcon={<UserPlus className="w-4 h-4" />} onClick={() => setAdding(true)}>
              {t('Add members')}
            </Button>
          )}

          {group.members.length === 0 ? (
            <EmptyState compact title={t('No members yet')} description={t('Add people to use this group as a campaign audience.')} />
          ) : (
            <ul className="divide-y divide-slate-200/70 dark:divide-white/5" aria-label={t('Group members')}>
              {group.members.map((m) => (
                <li key={m.id} className="flex items-center gap-3 py-2.5">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-900 dark:text-white truncate">
                      {`${m.firstName} ${m.lastName}`.trim()}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                      {[m.phone, m.email].filter(Boolean).join(' · ') || '—'}
                    </p>
                  </div>
                  <Badge variant="neutral">{t(m.role)}</Badge>
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="danger-soft"
                    aria-label={t('Remove {name}', { name: `${m.firstName} ${m.lastName}` })}
                    onClick={() => setToRemove(m)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <ConfirmModal
        isOpen={!!toRemove}
        title={t('Remove member')}
        message={toRemove ? t('Remove {name} from this group?', { name: `${toRemove.firstName} ${toRemove.lastName}` }) : ''}
        confirmLabel={t('Remove')}
        variant="danger"
        isLoading={removeMutation.isPending}
        onConfirm={() =>
          group && toRemove && removeMutation.mutate({ id: group.id, userId: toRemove.id }, { onSuccess: () => setToRemove(null) })
        }
        onCancel={() => setToRemove(null)}
      />
    </Drawer>
  );
}
