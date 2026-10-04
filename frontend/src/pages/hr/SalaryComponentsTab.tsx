import React, { useState } from 'react';
import { Plus, Edit2, Trash2 } from 'lucide-react';
import { DataTable, type Column } from '@/components/DataTable/DataTable';
import { ConfirmModal } from '@/components/common/ConfirmModal';
import { Alert, Badge, Button, Checkbox, ErrorState, Input, Modal, Select } from '@/components/ui';
import { useT } from '@/i18n';
import { useDeleteSalaryComponent, useSalaryComponents, useSaveSalaryComponent, type ComponentPayload } from './hr.queries';
import type { SalaryComponent } from './hr.types';
import { describeValue } from './salaryComponents.utils';

const EMPTY: ComponentPayload = { name: '', type: 'ALLOWANCE', calcType: 'FIXED', value: 0, isActive: true };

/** Salary component catalogue. Writes are SUPER_ADMIN/ADMIN; ACCOUNTANT reads. */
export default function SalaryComponentsTab({ canWrite }: { canWrite: boolean }) {
  const t = useT();
  const { data, isLoading, isError, refetch } = useSalaryComponents();
  const save = useSaveSalaryComponent();
  const del = useDeleteSalaryComponent();
  const [editing, setEditing] = useState<SalaryComponent | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [form, setForm] = useState<ComponentPayload>(EMPTY);
  const [error, setError] = useState('');
  const [toDelete, setToDelete] = useState<SalaryComponent | null>(null);

  const openNew = () => {
    setEditing(null);
    setForm(EMPTY);
    setError('');
    setIsOpen(true);
  };
  const openEdit = (c: SalaryComponent) => {
    setEditing(c);
    setForm({ name: c.name, type: c.type, calcType: c.calcType, value: c.value, isActive: c.isActive });
    setError('');
    setIsOpen(true);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return setError(t('Name is required.'));
    if (form.value < 0) return setError(t('Value cannot be negative.'));
    if (form.calcType === 'PERCENT_OF_BASE' && form.value > 100) return setError(t('A percentage cannot exceed 100.'));
    await save.mutateAsync({ id: editing?.id, data: { ...form, name: form.name.trim() } });
    setIsOpen(false);
  };

  const columns: Column<SalaryComponent>[] = [
    { key: 'name', header: t('Component'), accessor: 'name', primary: true, sortable: true },
    {
      key: 'type',
      header: t('Type'),
      accessor: 'type',
      render: (c) => <Badge variant={c.type === 'ALLOWANCE' ? 'success' : 'danger'}>{c.type === 'ALLOWANCE' ? t('Allowance') : t('Deduction')}</Badge>,
    },
    { key: 'value', header: t('Default value'), align: 'right', render: (c) => describeValue(c), exportValue: (c) => describeValue(c) },
    { key: 'assignedCount', header: t('Assigned staff'), accessor: 'assignedCount', align: 'right', hideOnMobile: true },
    {
      key: 'isActive',
      header: t('Status'),
      render: (c) => <Badge variant={c.isActive ? 'success' : 'neutral'}>{c.isActive ? t('Active') : t('Inactive')}</Badge>,
      exportValue: (c) => (c.isActive ? 'Active' : 'Inactive'),
    },
    ...(canWrite
      ? [
          {
            key: 'actions',
            header: t('Actions'),
            render: (c: SalaryComponent) => (
              <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                <Button variant="ghost" size="icon-sm" aria-label={t('Edit {name}', { name: c.name })} onClick={() => openEdit(c)}>
                  <Edit2 className="w-4 h-4" />
                </Button>
                <Button variant="ghost" size="icon-sm" aria-label={t('Delete {name}', { name: c.name })} onClick={() => setToDelete(c)}>
                  <Trash2 className="w-4 h-4 text-rose-600" />
                </Button>
              </div>
            ),
          } as Column<SalaryComponent>,
        ]
      : []),
  ];

  return (
    <div className="space-y-4">
      <Alert tone="info">
        {t('Components are applied when payroll is processed for staff they are assigned to (Staff tab → Components). Staff with no components are paid exactly as before: base + manual allowances − deductions.')}
      </Alert>
      {isError ? (
        <div className="glass-card rounded-2xl"><ErrorState message={t('Could not load salary components.')} onRetry={() => refetch()} /></div>
      ) : (
        <div className="glass-card rounded-2xl p-4">
          <DataTable
            data={data ?? []}
            columns={columns}
            isLoading={isLoading}
            exportFileName="salary-components"
            emptyTitle={t('No salary components yet')}
            emptyDescription={t('Create allowances (house rent, medical) and deductions (provident fund, tax).')}
            emptyAction={canWrite ? <Button leftIcon={<Plus className="w-4 h-4" />} onClick={openNew}>{t('Add component')}</Button> : undefined}
            toolbar={canWrite ? <Button size="sm" leftIcon={<Plus className="w-4 h-4" />} onClick={openNew}>{t('Add component')}</Button> : undefined}
          />
        </div>
      )}

      <Modal isOpen={isOpen} onClose={() => setIsOpen(false)} title={editing ? t('Edit salary component') : t('New salary component')} size="md">
        <form onSubmit={submit} className="space-y-4">
          <Input label={t('Name')} required value={form.name} maxLength={100} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Select
              label={t('Type')}
              value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value as ComponentPayload['type'] })}
              options={[
                { value: 'ALLOWANCE', label: t('Allowance') },
                { value: 'DEDUCTION', label: t('Deduction') },
              ]}
            />
            <Select
              label={t('Calculation')}
              value={form.calcType}
              onChange={(e) => setForm({ ...form, calcType: e.target.value as ComponentPayload['calcType'] })}
              options={[
                { value: 'FIXED', label: t('Fixed amount (৳)') },
                { value: 'PERCENT_OF_BASE', label: t('% of base salary') },
              ]}
            />
          </div>
          <Input
            label={form.calcType === 'PERCENT_OF_BASE' ? t('Percent of base') : t('Amount (৳)')}
            type="number"
            min={0}
            max={form.calcType === 'PERCENT_OF_BASE' ? 100 : undefined}
            step="0.01"
            value={form.value}
            onChange={(e) => setForm({ ...form, value: Number(e.target.value) || 0 })}
          />
          <Checkbox label={t('Active')} checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} />
          {error && <p className="text-xs text-rose-600 dark:text-rose-400">{error}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setIsOpen(false)}>{t('Cancel')}</Button>
            <Button type="submit" isLoading={save.isPending}>{t('Save')}</Button>
          </div>
        </form>
      </Modal>

      <ConfirmModal
        isOpen={!!toDelete}
        title={t('Delete salary component')}
        message={toDelete ? t('Delete “{name}”? It will be removed from every staff member. Payslips already processed keep their breakdown.', { name: toDelete.name }) : ''}
        confirmLabel={t('Delete')}
        variant="danger"
        isLoading={del.isPending}
        onConfirm={async () => {
          if (toDelete) await del.mutateAsync(toDelete.id);
          setToDelete(null);
        }}
        onCancel={() => setToDelete(null)}
      />
    </div>
  );
}
