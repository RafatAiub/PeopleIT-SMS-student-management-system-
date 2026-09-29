import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Modal, Button, Input, Select } from '../../components/ui';
import { useT } from '../../i18n';
import { errMsg, invApi, useInvMutation, type Category, type StockItem } from './inventory.api';

const isWhole = (s: string) => /^\d+$/.test(s.trim());

export const StockItemModal: React.FC<{ isOpen: boolean; item: StockItem | null; categories: Category[]; onClose: () => void }> = ({ isOpen, item, categories, onClose }) => {
  const t = useT();
  const [name, setName] = useState('');
  const [sku, setSku] = useState('');
  const [unit, setUnit] = useState('pcs');
  const [reorderLevel, setReorderLevel] = useState('0');
  const [categoryId, setCategoryId] = useState('');
  const [openingQuantity, setOpeningQuantity] = useState('0');
  const [openingUnitCost, setOpeningUnitCost] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!isOpen) return;
    setErrors({});
    setName(item?.name ?? '');
    setSku(item?.sku ?? '');
    setUnit(item?.unit ?? 'pcs');
    setReorderLevel(String(item?.reorderLevel ?? 0));
    setCategoryId(item?.categoryId ?? '');
    setOpeningQuantity('0');
    setOpeningUnitCost('');
  }, [isOpen, item]);

  const save = useInvMutation((body: Record<string, unknown>) => (item ? invApi.put(`/stock/${item.id}`, body) : invApi.post('/stock', body)));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (!name.trim()) next.name = t('Name is required');
    if (!unit.trim()) next.unit = t('Unit is required');
    if (!isWhole(reorderLevel)) next.reorderLevel = t('Enter a whole number of 0 or more');
    if (!item && !isWhole(openingQuantity)) next.openingQuantity = t('Enter a whole number of 0 or more');
    if (!item && openingUnitCost && (isNaN(Number(openingUnitCost)) || Number(openingUnitCost) < 0)) next.openingUnitCost = t('Enter a valid amount');
    setErrors(next);
    if (Object.keys(next).length) return;

    const body: Record<string, unknown> = {
      name: name.trim(),
      sku: sku.trim() || null,
      unit: unit.trim(),
      reorderLevel: Number(reorderLevel),
      categoryId: categoryId || null,
    };
    if (!item) {
      body.openingQuantity = Number(openingQuantity);
      body.openingUnitCost = openingUnitCost === '' ? null : Number(openingUnitCost);
    }
    save.mutate(body, {
      onSuccess: () => { toast.success(item ? t('Stock item updated') : t('Stock item added')); onClose(); },
      onError: (err) => toast.error(errMsg(err, t('Could not save stock item'))),
    });
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={item ? t('Edit stock item') : t('Add stock item')}
      size="md"
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose}>{t('Cancel')}</Button>
          <Button type="submit" form="stock-item-form" variant="gradient" isLoading={save.isPending}>{item ? t('Save changes') : t('Add item')}</Button>
        </>
      }
    >
      <form id="stock-item-form" onSubmit={submit} className="space-y-4" noValidate>
        <Input label={t('Name')} required value={name} onChange={(e) => setName(e.target.value)} error={errors.name} />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input label={t('SKU')} value={sku} onChange={(e) => setSku(e.target.value)} helperText={t('Optional')} />
          <Input label={t('Unit')} required value={unit} onChange={(e) => setUnit(e.target.value)} error={errors.unit} placeholder={t('pcs, box, ream, litre')} />
          <Input label={t('Reorder level')} type="number" min={0} step={1} value={reorderLevel} onChange={(e) => setReorderLevel(e.target.value)} error={errors.reorderLevel} helperText={t('Alert when stock falls to this level')} />
          <Select label={t('Category')} value={categoryId} onChange={(e) => setCategoryId(e.target.value)} placeholder={t('Uncategorised')} options={categories.map((c) => ({ value: c.id, label: c.name }))} />
        </div>
        {item ? (
          <p className="text-xs text-slate-500 dark:text-slate-400">{t('Quantity changes only through stock movements (In / out / adjust), so the history always adds up.')}</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input label={t('Opening quantity')} type="number" min={0} step={1} value={openingQuantity} onChange={(e) => setOpeningQuantity(e.target.value)} error={errors.openingQuantity} helperText={t('Recorded as an IN movement')} />
            <Input label={t('Opening unit cost (৳)')} type="number" min={0} step="0.01" value={openingUnitCost} onChange={(e) => setOpeningUnitCost(e.target.value)} error={errors.openingUnitCost} helperText={t('Optional — used for valuation')} />
          </div>
        )}
      </form>
    </Modal>
  );
};
