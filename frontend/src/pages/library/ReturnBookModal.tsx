import React, { useEffect, useState } from 'react';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';

interface ReturnBookModalProps {
  isOpen: boolean;
  bookTitle: string;
  isSaving: boolean;
  onClose: () => void;
  onSubmit: (fineAmount: number) => Promise<void> | void;
}

export const ReturnBookModal: React.FC<ReturnBookModalProps> = ({ isOpen, bookTitle, isSaving, onClose, onSubmit }) => {
  const [fineAmount, setFineAmount] = useState('0');

  useEffect(() => {
    if (isOpen) setFineAmount('0');
  }, [isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const value = Number(fineAmount);
    await onSubmit(Number.isFinite(value) && value > 0 ? value : 0);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Return Book"
      description={`Mark "${bookTitle}" as returned.`}
      size="sm"
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="return-book-form" variant="gradient" isLoading={isSaving}>Return Book</Button>
        </>
      }
    >
      <form id="return-book-form" onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="Fine Amount (৳)"
          type="number"
          min={0}
          step="0.01"
          value={fineAmount}
          onChange={(e) => setFineAmount(e.target.value)}
          helperText="Leave as 0 if there is no late fine to collect."
        />
      </form>
    </Modal>
  );
};
