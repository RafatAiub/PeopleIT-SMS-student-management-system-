import React, { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Alert } from '../../components/ui';
import { formatCurrency } from '../../i18n';
import apiClient from '../../api/client';

interface FinePreview {
  overdueDays: number;
  chargeableDays: number;
  suggestedFine: number;
  capped: boolean;
  rule: { finePerDay: number; graceDays: number; maxFine: number | null } | null;
}

interface ReturnBookModalProps {
  isOpen: boolean;
  bookTitle: string;
  isSaving: boolean;
  onClose: () => void;
  onSubmit: (fineAmount: number) => Promise<void> | void;
  /** When given, the suggested fine from the school's fine rule is pre-filled (still editable). */
  issueId?: string | null;
}

export const ReturnBookModal: React.FC<ReturnBookModalProps> = ({ isOpen, bookTitle, isSaving, onClose, onSubmit, issueId }) => {
  const [fineAmount, setFineAmount] = useState('0');
  const [touched, setTouched] = useState(false);

  const preview = useQuery({
    queryKey: ['library', 'fine-preview', issueId],
    queryFn: async (): Promise<FinePreview> => (await apiClient.get(`/library/issues/${issueId}/fine-preview`)).data.data,
    enabled: isOpen && !!issueId,
    staleTime: 0,
    retry: false,
  });

  useEffect(() => {
    if (isOpen) {
      setFineAmount('0');
      setTouched(false);
    }
  }, [isOpen]);

  // Pre-fill the suggestion once it arrives, unless staff already typed an amount.
  useEffect(() => {
    if (isOpen && !touched && preview.data) setFineAmount(String(preview.data.suggestedFine));
  }, [isOpen, touched, preview.data]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const value = Number(fineAmount);
    await onSubmit(Number.isFinite(value) && value > 0 ? value : 0);
  };

  const p = preview.data;

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
        {issueId && p && p.overdueDays > 0 && (
          <Alert tone="warning" title={`${p.overdueDays} day${p.overdueDays === 1 ? '' : 's'} overdue`}>
            {p.rule
              ? `Suggested fine ${formatCurrency(p.suggestedFine)}: ${p.chargeableDays} chargeable day(s) after ${p.rule.graceDays} grace day(s) × ${formatCurrency(p.rule.finePerDay)}/day${p.capped ? ' (capped at the maximum fine)' : ''}.`
              : 'No fine rule is set up, so no fine is suggested. Set one in Fine settings.'}
          </Alert>
        )}
        {issueId && preview.isError && (
          <p className="text-xs text-slate-500 dark:text-slate-400">Could not calculate a suggested fine — enter the amount manually.</p>
        )}
        <Input
          label="Fine Amount (৳)"
          type="number"
          min={0}
          step="0.01"
          value={fineAmount}
          onChange={(e) => { setTouched(true); setFineAmount(e.target.value); }}
          helperText={preview.isLoading && issueId ? 'Calculating suggested fine…' : 'Pre-filled from the fine rule when the book is late — you can change it. Use 0 for no fine.'}
        />
      </form>
    </Modal>
  );
};
