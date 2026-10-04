import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Modal, Button, Input, Textarea, Select } from '../../components/ui';
import { useCreateFeeCategory, useUpdateFeeCategory } from './hooks';
import type { FeeCategory } from './types';

const FREQUENCY_OPTIONS = [
  { value: 'MONTHLY', label: 'Monthly' },
  { value: 'TERM', label: 'Term-based' },
  { value: 'ONE_TIME', label: 'One time' },
  { value: 'ANNUAL', label: 'Annual' },
];

interface CategoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  category: FeeCategory | null; // null => create mode
}

export const CategoryModal: React.FC<CategoryModalProps> = ({ isOpen, onClose, category }) => {
  const createCategory = useCreateFeeCategory();
  const updateCategory = useUpdateFeeCategory();
  const isEdit = !!category;

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [frequency, setFrequency] = useState('MONTHLY');
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (isOpen) {
      setName(category?.name ?? '');
      setDescription(category?.description ?? '');
      setAmount(category ? String(Number(category.amount)) : '');
      setFrequency(category?.frequency ?? 'MONTHLY');
      setErrors({});
    }
  }, [isOpen, category]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (!name.trim()) next.name = 'Name is required';
    const numeric = Number(amount);
    if (!amount || Number.isNaN(numeric) || numeric <= 0) next.amount = 'Amount must be greater than ৳ 0';
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    const payload = { name: name.trim(), description: description.trim() || undefined, amount: numeric, frequency };
    try {
      if (isEdit && category) {
        await updateCategory.mutateAsync({ id: category.id, ...payload });
        toast.success('Fee category updated successfully');
      } else {
        await createCategory.mutateAsync(payload);
        toast.success('Fee category created successfully');
      }
      onClose();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to save fee category');
    }
  };

  const isSaving = createCategory.isPending || updateCategory.isPending;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={isEdit ? 'Edit fee category' : 'Create fee category'} size="md">
      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <Input
          label="Category name"
          required
          placeholder="e.g. Tuition Fee Q1, Exam Fee"
          value={name}
          onChange={(e) => setName(e.target.value)}
          error={errors.name}
        />
        <Textarea
          label="Description"
          placeholder="Optional brief description..."
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
        />
        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Amount (৳)"
            type="number"
            required
            min={0}
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            error={errors.amount}
          />
          <Select
            label="Billing frequency"
            value={frequency}
            onChange={(e) => setFrequency(e.target.value)}
            options={FREQUENCY_OPTIONS}
          />
        </div>
        <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-white/5">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" isLoading={isSaving}>{isEdit ? 'Save changes' : 'Create category'}</Button>
        </div>
      </form>
    </Modal>
  );
};
