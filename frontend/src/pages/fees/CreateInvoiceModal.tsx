import React, { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { Modal, Button, Input, Select } from '../../components/ui';
import { formatCurrency } from '../../i18n';
import { StudentPicker } from './StudentPicker';
import { useCreateInvoice } from './hooks';
import { StudentConcessionPreview } from './StudentConcessionPreview';
import { AssignConcessionModal } from './ConcessionModals';
import type { FeeCategory, StudentSearchResult } from './types';

interface LineItemDraft {
  key: string;
  feeCategoryId: string;
  description: string;
  amount: string;
  discount: string;
}

const emptyLine = (): LineItemDraft => ({
  key: Math.random().toString(36).slice(2),
  feeCategoryId: '',
  description: '',
  amount: '',
  discount: '',
});

interface CreateInvoiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  categories: FeeCategory[];
  /** SUPER_ADMIN/ADMIN only (backend requireRole on POST /fees/concessions/assignments). */
  canAssignConcession?: boolean;
}

export const CreateInvoiceModal: React.FC<CreateInvoiceModalProps> = ({ isOpen, onClose, categories, canAssignConcession = false }) => {
  const createInvoice = useCreateInvoice();
  const activeCategories = categories.filter((c) => c.isActive !== false);

  const [student, setStudent] = useState<StudentSearchResult | null>(null);
  const [dueDate, setDueDate] = useState(new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<LineItemDraft[]>([emptyLine()]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [applyConcessions, setApplyConcessions] = useState(true);
  const [assignOpen, setAssignOpen] = useState(false);

  const reset = () => {
    setStudent(null);
    setDueDate(new Date().toISOString().split('T')[0]);
    setNotes('');
    setLines([emptyLine()]);
    setErrors({});
    setApplyConcessions(true);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const updateLine = (key: string, patch: Partial<LineItemDraft>) => {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  };

  const addLine = () => setLines((prev) => [...prev, emptyLine()]);
  const removeLine = (key: string) => setLines((prev) => (prev.length > 1 ? prev.filter((l) => l.key !== key) : prev));

  const total = lines.reduce((sum, l) => {
    const amount = Number(l.amount) || 0;
    const discount = Number(l.discount) || 0;
    return sum + Math.max(amount - discount, 0);
  }, 0);

  const validate = (): boolean => {
    const next: Record<string, string> = {};
    if (!student) next.student = 'Please select a student';
    if (!dueDate) next.dueDate = 'Due date is required';
    lines.forEach((l, i) => {
      if (!l.feeCategoryId) next[`cat-${i}`] = 'Choose a fee category';
      const amount = Number(l.amount);
      if (!l.amount || Number.isNaN(amount) || amount <= 0) next[`amt-${i}`] = 'Amount must be greater than ৳ 0';
      const discount = Number(l.discount || 0);
      if (discount < 0) next[`disc-${i}`] = 'Discount cannot be negative';
      if (l.amount && discount > amount) next[`disc-${i}`] = 'Discount cannot exceed amount';
    });
    if (total <= 0) next.total = 'Invoice total must be greater than ৳ 0';
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) {
      toast.error('Please fix the highlighted fields');
      return;
    }
    try {
      const created = await createInvoice.mutateAsync({
        applyConcessions,
        studentId: student!.id,
        dueDate: new Date(dueDate).toISOString(),
        notes: notes || undefined,
        items: lines.map((l) => {
          const cat = categories.find((c) => c.id === l.feeCategoryId);
          return {
            feeCategoryId: l.feeCategoryId,
            description: l.description || cat?.name || 'Fee item',
            amount: Number(l.amount),
            discount: Number(l.discount || 0),
          };
        }),
      });
      const applied = (created as { appliedConcessions?: { name: string; amount: number }[] } | null)?.appliedConcessions ?? [];
      toast.success(
        applied.length > 0
          ? `Invoice generated — concession discount ${formatCurrency(applied.reduce((s, a) => s + a.amount, 0))} applied`
          : 'Invoice generated successfully',
      );
      handleClose();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to generate invoice');
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Create invoice" size="xl">
      <form onSubmit={handleSubmit} noValidate className="space-y-5">
        <div>
          <label className="field-label">Student *</label>
          <StudentPicker value={student} onChange={setStudent} error={errors.student} />
          {student && (
            <StudentConcessionPreview
              studentId={student.id}
              categories={categories}
              lines={lines.map((l) => ({ feeCategoryId: l.feeCategoryId, amount: Number(l.amount) || 0, discount: Number(l.discount) || 0 }))}
              apply={applyConcessions}
              onApplyChange={setApplyConcessions}
              onAssign={canAssignConcession ? () => setAssignOpen(true) : undefined}
            />
          )}
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="field-label mb-0">Line items *</label>
            <Button type="button" variant="outline" size="sm" leftIcon={<Plus className="w-3.5 h-3.5" />} onClick={addLine}>
              Add row
            </Button>
          </div>

          <div className="space-y-3">
            {lines.map((line, i) => (
              <div key={line.key} className="rounded-lg border border-slate-200 dark:border-white/10 p-3 space-y-2">
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                  <div className="sm:col-span-2">
                    <Select
                      label="Fee category"
                      value={line.feeCategoryId}
                      onChange={(e) => {
                        const cat = activeCategories.find((c) => c.id === e.target.value);
                        updateLine(line.key, {
                          feeCategoryId: e.target.value,
                          amount: cat ? String(Number(cat.amount)) : line.amount,
                          description: line.description || cat?.name || '',
                        });
                      }}
                      placeholder="-- Choose --"
                      options={activeCategories.map((c) => ({ value: c.id, label: `${c.name} (${formatCurrency(c.amount)})` }))}
                      error={errors[`cat-${i}`]}
                    />
                  </div>
                  <Input
                    label="Amount (৳)"
                    type="number"
                    min={0}
                    step="0.01"
                    value={line.amount}
                    onChange={(e) => updateLine(line.key, { amount: e.target.value })}
                    error={errors[`amt-${i}`]}
                  />
                  <Input
                    label="Discount (৳)"
                    type="number"
                    min={0}
                    step="0.01"
                    value={line.discount}
                    onChange={(e) => updateLine(line.key, { discount: e.target.value })}
                    error={errors[`disc-${i}`]}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Input
                    label="Description"
                    value={line.description}
                    onChange={(e) => updateLine(line.key, { description: e.target.value })}
                    placeholder="e.g. Tuition Fee — Jan 2026"
                    containerClassName="flex-1"
                  />
                  <button
                    type="button"
                    onClick={() => removeLine(line.key)}
                    disabled={lines.length === 1}
                    aria-label="Remove row"
                    className="mt-6 p-2 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/10 disabled:opacity-30 disabled:cursor-not-allowed shrink-0"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
          {errors.total && <p className="field-error">{errors.total}</p>}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input
            label="Due date"
            type="date"
            required
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            error={errors.dueDate}
          />
          <div className="flex items-end justify-end sm:justify-start">
            <div className="rounded-lg bg-slate-50 dark:bg-white/5 px-4 py-2.5 w-full text-right sm:text-left">
              <p className="text-xs text-slate-500 dark:text-slate-400">Total{applyConcessions ? ' (before concessions)' : ''}</p>
              <p className="text-lg font-semibold text-slate-900 dark:text-white tabular-nums">{formatCurrency(total)}</p>
            </div>
          </div>
        </div>

        <Input
          label="Notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Optional note printed on the invoice"
        />

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-white/5">
          <Button type="button" variant="secondary" onClick={handleClose}>Cancel</Button>
          <Button type="submit" isLoading={createInvoice.isPending}>Create invoice</Button>
        </div>
      </form>
      {canAssignConcession && (
        <AssignConcessionModal isOpen={assignOpen} student={student} onClose={() => setAssignOpen(false)} />
      )}
    </Modal>
  );
};
