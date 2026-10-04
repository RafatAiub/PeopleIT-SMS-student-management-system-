import React, { useState } from 'react';
import { Building2, Plus } from 'lucide-react';
import toast from 'react-hot-toast';
import { Alert, Badge, Button, ErrorState, Input, Modal, Textarea } from '@/components/ui';
import { DataTable, type Column } from '@/components/DataTable/DataTable';
import { ConfirmModal } from '@/components/common/ConfirmModal';
import { formatNumber, useT } from '@/i18n';
import {
  apiErrorMessage,
  useBranches,
  useDeleteBranch,
  useEntitlements,
  useSaveBranch,
  type Branch,
} from '@/components/saas/saas.api';

// =============================================================================
// Settings → Branches (SUPER_ADMIN, ADMIN). Backend: /api/v1/branches.
// =============================================================================

interface FormState {
  id?: string;
  name: string;
  address: string;
  phone: string;
  email: string;
}

const EMPTY: FormState = { name: '', address: '', phone: '', email: '' };

function validate(f: FormState): Partial<Record<keyof FormState, string>> {
  const errors: Partial<Record<keyof FormState, string>> = {};
  if (f.name.trim().length < 2) errors.name = 'Branch name must be at least 2 characters.';
  if (f.phone.trim() && !/^[0-9+\-\s()]{7,20}$/.test(f.phone.trim())) errors.phone = 'Enter a valid phone number.';
  if (f.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim())) errors.email = 'Enter a valid email address.';
  return errors;
}

const BranchesTab: React.FC = () => {
  const t = useT();
  const { data, isLoading, isError, refetch } = useBranches({ status: 'all' });
  const { limitFor } = useEntitlements();
  const save = useSaveBranch();
  const remove = useDeleteBranch();

  const [form, setForm] = useState<FormState | null>(null);
  const [touched, setTouched] = useState(false);
  const [confirm, setConfirm] = useState<null | { kind: 'toggle' | 'delete'; branch: Branch }>(null);

  const branches = data?.items ?? [];
  const branchLimit = limitFor('branches');
  const atLimit = Boolean(branchLimit && branchLimit.limit !== null && branchLimit.used !== null && branchLimit.used >= branchLimit.limit);
  const errors = form ? validate(form) : {};

  const openCreate = () => {
    setTouched(false);
    setForm({ ...EMPTY });
  };
  const openEdit = (b: Branch) => {
    setTouched(false);
    setForm({ id: b.id, name: b.name, address: b.address ?? '', phone: b.phone ?? '', email: b.email ?? '' });
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (!form || Object.keys(validate(form)).length > 0) return;
    save.mutate(
      { id: form.id, name: form.name.trim(), address: form.address.trim(), phone: form.phone.trim(), email: form.email.trim() },
      {
        onSuccess: () => {
          toast.success(form.id ? t('Branch updated') : t('Branch created'));
          setForm(null);
        },
        onError: (err) => toast.error(apiErrorMessage(err, t('Could not save the branch.'))),
      }
    );
  };

  const runConfirm = () => {
    if (!confirm) return;
    const { kind, branch } = confirm;
    const done = { onSettled: () => setConfirm(null), onError: (err: unknown) => toast.error(apiErrorMessage(err, t('Something went wrong.')) ) };
    if (kind === 'delete') {
      remove.mutate(branch.id, { ...done, onSuccess: () => toast.success(t('Branch deleted')) });
    } else {
      save.mutate(
        { id: branch.id, name: branch.name, isActive: !branch.isActive },
        { ...done, onSuccess: () => toast.success(branch.isActive ? t('Branch deactivated') : t('Branch activated')) }
      );
    }
  };

  const columns: Column<Branch>[] = [
    {
      key: 'name',
      header: t('Branch'),
      primary: true,
      sortable: true,
      accessor: 'name',
      render: (b) => (
        <div className="min-w-0">
          <div className="font-medium text-slate-900 dark:text-white truncate">{b.name}</div>
          {b.address && <div className="text-xs text-slate-500 dark:text-slate-400 truncate">{b.address}</div>}
        </div>
      ),
      exportValue: (b) => b.name,
    },
    {
      key: 'contact',
      header: t('Contact'),
      hideOnMobile: true,
      render: (b) => (
        <div className="text-xs text-slate-600 dark:text-slate-300">
          {b.phone || b.email ? (
            <>
              {b.phone && <div>{b.phone}</div>}
              {b.email && <div className="truncate">{b.email}</div>}
            </>
          ) : (
            <span className="text-slate-400">—</span>
          )}
        </div>
      ),
      exportValue: (b) => [b.phone, b.email].filter(Boolean).join(' / '),
    },
    { key: 'students', header: t('Students'), align: 'right', render: (b) => formatNumber(b.counts.students), exportValue: (b) => b.counts.students },
    { key: 'classes', header: t('Classes'), align: 'right', hideOnMobile: true, render: (b) => formatNumber(b.counts.classes), exportValue: (b) => b.counts.classes },
    {
      key: 'staff',
      header: t('Staff'),
      align: 'right',
      hideOnMobile: true,
      render: (b) => (b.counts.staff === null ? '—' : formatNumber(b.counts.staff)),
      exportValue: (b) => b.counts.staff ?? '',
    },
    {
      key: 'status',
      header: t('Status'),
      render: (b) => <Badge variant={b.isActive ? 'success' : 'neutral'} dot>{b.isActive ? t('Active') : t('Inactive')}</Badge>,
      exportValue: (b) => (b.isActive ? 'Active' : 'Inactive'),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <Building2 className="w-5 h-5 text-blue-500 dark:text-blue-400" />
          {t('Branches')}
        </h3>
        <Button size="sm" leftIcon={<Plus className="w-4 h-4" />} onClick={openCreate} disabled={atLimit}>
          {t('Add branch')}
        </Button>
      </div>

      {atLimit && branchLimit && (
        <Alert tone="warning" title={t('Branch limit reached')}>
          {t('Your plan allows {n} active branches. Upgrade your plan or deactivate a branch to add another.', {
            n: formatNumber(branchLimit.limit),
          })}
        </Alert>
      )}

      {isError ? (
        <ErrorState title={t('Could not load branches')} onRetry={() => refetch()} />
      ) : (
        <DataTable
          data={branches}
          columns={columns}
          isLoading={isLoading}
          exportFileName="branches"
          emptyTitle={t('No branches yet')}
          emptyDescription={t('Add your first campus or branch.')}
          emptyAction={<Button size="sm" onClick={openCreate}>{t('Add branch')}</Button>}
          actions={[
            { label: t('Edit'), icon: 'edit', onClick: openEdit },
            { label: t('Activate / deactivate'), onClick: (b) => setConfirm({ kind: 'toggle', branch: b }) },
            { label: t('Delete'), icon: 'delete', variant: 'danger', onClick: (b) => setConfirm({ kind: 'delete', branch: b }) },
          ]}
        />
      )}

      <Modal
        isOpen={form !== null}
        onClose={() => setForm(null)}
        title={form?.id ? t('Edit branch') : t('Add branch')}
        size="md"
        footer={
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setForm(null)}>
              {t('Cancel')}
            </Button>
            <Button type="submit" form="branch-form" isLoading={save.isPending}>
              {form?.id ? t('Save changes') : t('Create branch')}
            </Button>
          </div>
        }
      >
        {form && (
          <form id="branch-form" onSubmit={submit} className="space-y-4" noValidate>
            <Input
              id="branch-name"
              label={t('Branch name')}
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              error={touched && errors.name ? t(errors.name) : undefined}
            />
            <Textarea
              id="branch-address"
              label={t('Address')}
              rows={2}
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                id="branch-phone"
                label={t('Phone')}
                inputMode="tel"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                error={touched && errors.phone ? t(errors.phone) : undefined}
              />
              <Input
                id="branch-email"
                type="email"
                label={t('Email')}
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                error={touched && errors.email ? t(errors.email) : undefined}
              />
            </div>
          </form>
        )}
      </Modal>

      {confirm && (
        <ConfirmModal
          isOpen
          title={
            confirm.kind === 'delete'
              ? t('Delete {name}?', { name: confirm.branch.name })
              : confirm.branch.isActive
                ? t('Deactivate {name}?', { name: confirm.branch.name })
                : t('Activate {name}?', { name: confirm.branch.name })
          }
          message={
            confirm.kind === 'delete'
              ? t('Only a branch with no students, classes, staff or timetable records can be deleted. This cannot be undone.')
              : confirm.branch.isActive
                ? t('The branch is hidden from the branch switcher. Its records are kept.')
                : t('The branch becomes available again.')
          }
          confirmLabel={confirm.kind === 'delete' ? t('Delete') : confirm.branch.isActive ? t('Deactivate') : t('Activate')}
          variant={confirm.kind === 'delete' ? 'danger' : 'warning'}
          isLoading={save.isPending || remove.isPending}
          onConfirm={runConfirm}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  );
};

export default BranchesTab;
