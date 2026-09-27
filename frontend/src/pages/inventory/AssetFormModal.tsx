import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Modal, Button, Input, Select, Textarea, Alert } from '../../components/ui';
import { useT } from '../../i18n';
import {
  CONDITION_OPTIONS,
  dateKey,
  errMsg,
  invApi,
  useInvMutation,
  type Asset,
  type AssetStatus,
  type Category,
} from './inventory.api';

interface FormState {
  name: string;
  code: string;
  categoryId: string;
  serialNo: string;
  purchaseDate: string;
  purchaseCost: string;
  vendor: string;
  location: string;
  condition: string;
  status: AssetStatus;
  notes: string;
}

const EMPTY: FormState = {
  name: '', code: '', categoryId: '', serialNo: '', purchaseDate: '', purchaseCost: '', vendor: '', location: '', condition: 'GOOD', status: 'AVAILABLE', notes: '',
};

// ALLOCATED is only set through Allocate / Return.
const EDITABLE_STATUSES: { value: AssetStatus; label: string }[] = [
  { value: 'AVAILABLE', label: 'Available' },
  { value: 'MAINTENANCE', label: 'Maintenance' },
  { value: 'RETIRED', label: 'Retired' },
  { value: 'LOST', label: 'Lost' },
];

export const AssetFormModal: React.FC<{ isOpen: boolean; asset: Asset | null; categories: Category[]; onClose: () => void }> = ({ isOpen, asset, categories, onClose }) => {
  const t = useT();
  const [v, setV] = useState<FormState>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const isAllocated = asset?.status === 'ALLOCATED';

  useEffect(() => {
    if (!isOpen) return;
    setErrors({});
    setV(
      asset
        ? {
            name: asset.name,
            code: asset.code,
            categoryId: asset.categoryId || '',
            serialNo: asset.serialNo || '',
            purchaseDate: dateKey(asset.purchaseDate),
            purchaseCost: asset.purchaseCost === null ? '' : String(Number(asset.purchaseCost)),
            vendor: asset.vendor || '',
            location: asset.location || '',
            condition: asset.condition || '',
            status: asset.status,
            notes: asset.notes || '',
          }
        : EMPTY,
    );
  }, [isOpen, asset]);

  const save = useInvMutation((body: Record<string, unknown>) => (asset ? invApi.put(`/assets/${asset.id}`, body) : invApi.post('/assets', body)));

  const set = (k: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setV((p) => ({ ...p, [k]: e.target.value }));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (!v.name.trim()) next.name = t('Name is required');
    if (!v.code.trim()) next.code = t('Asset code is required');
    if (v.purchaseCost && (isNaN(Number(v.purchaseCost)) || Number(v.purchaseCost) < 0)) next.purchaseCost = t('Enter a valid amount');
    setErrors(next);
    if (Object.keys(next).length) return;

    const body: Record<string, unknown> = {
      name: v.name.trim(),
      code: v.code.trim(),
      categoryId: v.categoryId || null,
      serialNo: v.serialNo.trim() || null,
      purchaseDate: v.purchaseDate || null,
      purchaseCost: v.purchaseCost === '' ? null : Number(v.purchaseCost),
      vendor: v.vendor.trim() || null,
      location: v.location.trim() || null,
      condition: v.condition || null,
      notes: v.notes.trim() || null,
    };
    if (!isAllocated) body.status = v.status;

    save.mutate(body, {
      onSuccess: () => { toast.success(asset ? t('Asset updated') : t('Asset added')); onClose(); },
      onError: (err) => toast.error(errMsg(err, t('Could not save asset'))),
    });
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={asset ? t('Edit asset') : t('Add asset')}
      size="lg"
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose}>{t('Cancel')}</Button>
          <Button type="submit" form="asset-form" variant="gradient" isLoading={save.isPending}>{asset ? t('Save changes') : t('Add asset')}</Button>
        </>
      }
    >
      <form id="asset-form" onSubmit={submit} className="space-y-4" noValidate>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input label={t('Name')} required value={v.name} onChange={set('name')} error={errors.name} />
          <Input label={t('Asset code')} required value={v.code} onChange={set('code')} error={errors.code} helperText={t('Unique per school, e.g. LAB-PC-01')} />
          <Select label={t('Category')} value={v.categoryId} onChange={set('categoryId')} placeholder={t('Uncategorised')} options={categories.map((c) => ({ value: c.id, label: c.name }))} />
          <Input label={t('Serial no.')} value={v.serialNo} onChange={set('serialNo')} />
          <Input label={t('Purchase date')} type="date" value={v.purchaseDate} onChange={set('purchaseDate')} />
          <Input label={t('Purchase cost (৳)')} type="number" min={0} step="0.01" value={v.purchaseCost} onChange={set('purchaseCost')} error={errors.purchaseCost} />
          <Input label={t('Vendor')} value={v.vendor} onChange={set('vendor')} />
          <Input label={t('Location')} value={v.location} onChange={set('location')} placeholder={t('e.g. Science lab, Room 204')} />
          <Select label={t('Condition')} value={v.condition} onChange={set('condition')} placeholder={t('Not recorded')} options={CONDITION_OPTIONS.map((o) => ({ value: o.value, label: t(o.label) }))} />
          {isAllocated ? (
            <div className="sm:self-end">
              <Alert tone="info">{t('Allocated — return it to change its status.')}</Alert>
            </div>
          ) : (
            <Select label={t('Status')} value={v.status} onChange={set('status')} options={EDITABLE_STATUSES.map((o) => ({ value: o.value, label: t(o.label) }))} />
          )}
        </div>
        <Textarea label={t('Notes')} rows={3} value={v.notes} onChange={set('notes')} />
      </form>
    </Modal>
  );
};
