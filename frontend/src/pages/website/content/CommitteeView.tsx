import React from 'react';
import { ArrowDown, ArrowUp, Edit, Plus, Trash2, Users2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { Card, CardHeader, Button, Input, Checkbox, Drawer, Skeleton, ErrorState } from '@/components/ui';
import { EmptyState } from '@/components/common/EmptyState';
import { ConfirmModal } from '@/components/common/ConfirmModal';
import { useT } from '@/i18n';
import { useCommittee, useSaveCommitteeMember, useDeleteCommitteeMember, apiError } from '../sites.queries';
import { MediaField, MediaThumb } from '../media/MediaPicker';
import type { SiteCommitteeMember, CommitteeMemberPayload } from '../sites.types';

interface MemberForm {
  name: string;
  nameBn: string;
  role: string;
  roleBn: string;
  photoUrl: string;
  phone: string;
  showPhone: boolean;
}

const emptyForm: MemberForm = { name: '', nameBn: '', role: '', roleBn: '', photoUrl: '', phone: '', showPhone: false };

const MemberDrawer: React.FC<{ open: boolean; member: SiteCommitteeMember | null; onClose: () => void }> = ({ open, member, onClose }) => {
  const t = useT();
  const save = useSaveCommitteeMember();
  const [form, setForm] = React.useState<MemberForm>(emptyForm);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const set = <K extends keyof MemberForm>(k: K, v: MemberForm[K]) => setForm((f) => ({ ...f, [k]: v }));

  React.useEffect(() => {
    if (!open) return;
    setForm(
      member
        ? {
            name: member.name, nameBn: member.nameBn ?? '', role: member.role, roleBn: member.roleBn ?? '',
            photoUrl: member.photoUrl ?? '', phone: member.phone ?? '', showPhone: member.showPhone,
          }
        : emptyForm
    );
    setErrors({});
  }, [open, member]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!form.name.trim()) errs.name = t('Enter a name.');
    if (!form.role.trim()) errs.role = t('Enter their role on the committee, e.g. President.');
    setErrors(errs);
    if (Object.keys(errs).length) return;

    const data: CommitteeMemberPayload = {
      name: form.name.trim(),
      nameBn: form.nameBn.trim() || undefined,
      role: form.role.trim(),
      roleBn: form.roleBn.trim() || undefined,
      photoUrl: form.photoUrl.trim() || undefined,
      phone: form.phone.trim() || undefined,
      showPhone: form.showPhone,
    };
    save.mutate({ id: member?.id, data }, { onSuccess: () => { toast.success(t('Committee member saved.')); onClose(); } });
  };

  return (
    <Drawer
      isOpen={open}
      onClose={save.isPending ? () => {} : onClose}
      title={member ? t('Edit committee member') : t('New committee member')}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={save.isPending}>{t('Cancel')}</Button>
          <Button type="submit" form="committee-member-form" isLoading={save.isPending}>{t('Save')}</Button>
        </>
      }
    >
      <form id="committee-member-form" className="space-y-4" onSubmit={submit} noValidate>
        <div className="grid gap-3 sm:grid-cols-2">
          <Input id="committee-name" label={t('Name')} required value={form.name} error={errors.name} onChange={(e) => set('name', e.target.value)} />
          <Input id="committee-nameBn" label={t('Name (Bangla)')} lang="bn" value={form.nameBn} onChange={(e) => set('nameBn', e.target.value)} />
          <Input id="committee-role" label={t('Role')} required placeholder={t('e.g. President, General Secretary')} value={form.role} error={errors.role} onChange={(e) => set('role', e.target.value)} />
          <Input id="committee-roleBn" label={t('Role (Bangla)')} lang="bn" value={form.roleBn} onChange={(e) => set('roleBn', e.target.value)} />
        </div>
        <MediaField id="committee-photo" label={t('Photo')} value={form.photoUrl} onChange={(v) => set('photoUrl', v)} />
        <Input id="committee-phone" label={t('Phone')} value={form.phone} onChange={(e) => set('phone', e.target.value)} />
        <Checkbox
          label={t('Show phone number publicly')}
          description={t('Off by default — the phone number stays private until you turn this on.')}
          checked={form.showPhone}
          onChange={(e) => set('showPhone', e.target.checked)}
        />
      </form>
    </Drawer>
  );
};

/**
 * Website > Content > Committee (ম্যানেজিং কমিটি — DSHE item 11). No bulk
 * reorder endpoint exists server-side; "Move up/down" persists the two
 * swapped rows' `sortOrder` individually (§7.2 `PUT /committee/:id`).
 */
export const CommitteeView: React.FC = () => {
  const t = useT();
  const q = useCommittee({ page: 1, pageSize: 100 });
  const save = useSaveCommitteeMember();
  const del = useDeleteCommitteeMember();
  const [editor, setEditor] = React.useState<{ open: boolean; member: SiteCommitteeMember | null }>({ open: false, member: null });
  const [toDelete, setToDelete] = React.useState<SiteCommitteeMember | null>(null);

  const items = q.data?.items ?? [];

  const swap = (a: SiteCommitteeMember, b: SiteCommitteeMember) => {
    save.mutate({ id: a.id, data: { sortOrder: b.sortOrder } });
    save.mutate({ id: b.id, data: { sortOrder: a.sortOrder } });
  };

  return (
    <Card>
      <CardHeader
        icon={<Users2 className="w-4 h-4" />}
        title={t('Managing committee')}
        description={t('ম্যানেজিং কমিটি — required by the DSHE website order. Use the arrows to set the display order.')}
        actions={<Button leftIcon={<Plus className="w-4 h-4" />} onClick={() => setEditor({ open: true, member: null })}>{t('Add member')}</Button>}
      />
      {q.isLoading ? (
        <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-lg" />)}</div>
      ) : q.isError ? (
        <ErrorState message={apiError(q.error, t('Could not load the committee.'))} onRetry={() => q.refetch()} />
      ) : items.length === 0 ? (
        <EmptyState icon={<Users2 />} title={t('No committee members yet')} description={t('Add the school’s managing committee — this is required by the DSHE website order.')} action={<Button onClick={() => setEditor({ open: true, member: null })}>{t('Add member')}</Button>} />
      ) : (
        <ul className="space-y-2">
          {items.map((m, i) => (
            <li key={m.id} className="flex items-center gap-3 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-white/3 p-3">
              <div className="w-11 h-11 rounded-full overflow-hidden border border-slate-200 dark:border-white/10 shrink-0 bg-slate-50 dark:bg-white/5">
                {m.photoUrl ? <MediaThumb media={{ url: m.photoUrl, kind: 'IMAGE', name: m.name, alt: m.name }} /> : <Users2 className="w-full h-full p-2.5 text-slate-300" aria-hidden />}
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-medium text-slate-900 dark:text-slate-50 truncate">{m.name}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{m.role}{m.phone ? ` · ${m.phone}${m.showPhone ? '' : ` (${t('private')})`}` : ''}</p>
              </div>
              <div className="flex items-center gap-0.5 shrink-0">
                <Button size="icon-sm" variant="ghost" aria-label={t('Move up')} disabled={i === 0 || save.isPending} onClick={() => swap(m, items[i - 1])}><ArrowUp className="w-4 h-4" /></Button>
                <Button size="icon-sm" variant="ghost" aria-label={t('Move down')} disabled={i === items.length - 1 || save.isPending} onClick={() => swap(m, items[i + 1])}><ArrowDown className="w-4 h-4" /></Button>
                <Button size="icon-sm" variant="ghost" aria-label={t('Edit')} onClick={() => setEditor({ open: true, member: m })}><Edit className="w-4 h-4" /></Button>
                <Button size="icon-sm" variant="ghost" className="text-red-600 dark:text-red-400" aria-label={t('Delete')} onClick={() => setToDelete(m)}><Trash2 className="w-4 h-4" /></Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <MemberDrawer open={editor.open} member={editor.member} onClose={() => setEditor({ open: false, member: null })} />
      <ConfirmModal
        isOpen={!!toDelete}
        title={t('Remove “{name}”?', { name: toDelete?.name ?? '' })}
        message={t('They are removed from the public committee list immediately.')}
        confirmLabel={t('Remove')}
        isLoading={del.isPending}
        onCancel={() => setToDelete(null)}
        onConfirm={() => toDelete && del.mutate(toDelete.id, { onSuccess: () => setToDelete(null) })}
      />
    </Card>
  );
};
