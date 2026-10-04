import React, { useState } from 'react';
import { AlertTriangle, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { billingApi, type BillingCycle, type Plan } from '@/api/billing.api';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input, Textarea } from '@/components/ui/Input';
import { ConfirmModal } from '@/components/common/ConfirmModal';
import { BILLING_CYCLE_LABELS } from './shared';

const SLUG_RE = /^[a-z0-9-]+$/;

export const PlanFormModal: React.FC<{
  mode: 'create' | 'edit';
  plan?: Plan;
  onClose: () => void;
  onSuccess: () => void;
}> = ({ mode, plan, onClose, onSuccess }) => {
  const [name, setName] = useState(plan?.name || '');
  const [slug, setSlug] = useState(plan?.slug || '');
  const [studentCap, setStudentCap] = useState<string>(plan?.studentCap ? String(plan.studentCap) : '');
  const [description, setDescription] = useState(plan?.description || '');
  const [displayOrder, setDisplayOrder] = useState<string>(plan ? String(plan.displayOrder) : '0');
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<{ name?: string; slug?: string; studentCap?: string }>({});

  const validate = () => {
    const errs: typeof errors = {};
    if (name.trim().length < 2) errs.name = 'Plan name must be at least 2 characters';
    if (mode === 'create' && !SLUG_RE.test(slug.trim())) errs.slug = 'Slug must be lowercase letters, numbers and hyphens only';
    if (studentCap.trim() && (!/^\d+$/.test(studentCap.trim()) || Number(studentCap) <= 0)) {
      errs.studentCap = 'Student cap must be a positive whole number';
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setSubmitting(true);
    try {
      const payload = {
        name: name.trim(),
        studentCap: studentCap.trim() ? Number(studentCap) : null,
        description: description.trim() || undefined,
        displayOrder: displayOrder.trim() ? Number(displayOrder) : undefined,
      };
      if (mode === 'create') {
        await billingApi.createPlan({ ...payload, slug: slug.trim().toLowerCase() });
        toast.success('Plan created');
      } else if (plan) {
        await billingApi.updatePlan(plan.id, payload);
        toast.success('Plan updated');
      }
      onSuccess();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to save plan');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal isOpen onClose={onClose} title={mode === 'create' ? 'Create plan' : 'Edit plan'} size="lg">
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="Plan name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          error={errors.name}
          required
          autoFocus
        />
        {mode === 'create' && (
          <Input
            label="Slug"
            helperText={errors.slug ? undefined : 'Cannot be changed later'}
            error={errors.slug}
            value={slug}
            onChange={(e) => setSlug(e.target.value.toLowerCase())}
            placeholder="e.g. standard"
            className="font-mono"
            required
          />
        )}
        <div className="grid grid-cols-2 gap-4">
          <Input
            label="Student cap"
            helperText={errors.studentCap ? undefined : 'Blank = unlimited'}
            error={errors.studentCap}
            value={studentCap}
            onChange={(e) => setStudentCap(e.target.value)}
            type="number"
            min={1}
          />
          <Input
            label="Display order"
            value={displayOrder}
            onChange={(e) => setDisplayOrder(e.target.value)}
            type="number"
          />
        </div>
        <Textarea label="Description" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
        <div className="flex justify-end gap-3 pt-2 border-t border-slate-100 dark:border-white/5">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="gradient" isLoading={submitting}>
            {mode === 'create' ? 'Create plan' : 'Save changes'}
          </Button>
        </div>
      </form>
    </Modal>
  );
};

export const ArchiveConfirmModal: React.FC<{
  plan: Plan;
  mode: 'archive' | 'restore';
  onClose: () => void;
  onSuccess: () => void;
}> = ({ plan, mode, onClose, onSuccess }) => {
  const [submitting, setSubmitting] = useState(false);
  const archiving = mode === 'archive';

  const handleConfirm = async () => {
    setSubmitting(true);
    try {
      if (archiving) {
        await billingApi.archivePlan(plan.id);
        toast.success(`"${plan.name}" archived`);
      } else {
        await billingApi.restorePlan(plan.id);
        toast.success(`"${plan.name}" is live at checkout again`);
      }
      onSuccess();
    } catch (err: any) {
      toast.error(err.response?.data?.message || `Failed to ${mode} plan`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ConfirmModal
      isOpen
      variant={archiving ? 'warning' : 'info'}
      title={archiving ? 'Archive plan' : 'Restore plan'}
      message={
        archiving
          ? `"${plan.name}" will be hidden from new checkouts. Existing subscriptions on it are unaffected, and you can restore it at any time.`
          : `"${plan.name}" will be shown to institutions at checkout again, with its current pricing.`
      }
      confirmLabel={archiving ? 'Archive plan' : 'Restore plan'}
      isLoading={submitting}
      onConfirm={handleConfirm}
      onCancel={onClose}
    />
  );
};

/**
 * Permanent delete, gated behind typing the plan's slug — the backend refuses
 * any plan with subscriptions or payments behind it, so this only ever removes
 * a plan that was never used.
 */
export const DeletePlanModal: React.FC<{ plan: Plan; onClose: () => void; onSuccess: () => void }> = ({ plan, onClose, onSuccess }) => {
  const [confirmText, setConfirmText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const matches = confirmText.trim() === plan.slug;

  const handleDelete = async () => {
    if (!matches) return;
    setSubmitting(true);
    try {
      await billingApi.deletePlan(plan.id);
      toast.success(`"${plan.name}" deleted permanently`);
      onSuccess();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to delete plan');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal isOpen onClose={onClose} title="Delete plan permanently" size="lg">
      <div className="flex items-start gap-3 mb-4">
        <div className="w-10 h-10 rounded-xl bg-rose-100 dark:bg-rose-500/15 text-rose-600 dark:text-rose-400 flex items-center justify-center flex-shrink-0">
          <Trash2 className="w-5 h-5" />
        </div>
        <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
          <strong className="text-slate-900 dark:text-white">{plan.name}</strong> and its {plan.prices.length} price
          {plan.prices.length === 1 ? '' : 's'} will be erased. This cannot be undone.
        </p>
      </div>

      <div className="rounded-xl border border-amber-200 dark:border-amber-500/20 bg-amber-50/60 dark:bg-amber-500/5 p-3 mb-4 flex gap-2.5">
        <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
        <p className="text-xs text-amber-800 dark:text-amber-300 leading-relaxed">
          Prefer <strong>Archive</strong> if this plan was ever offered — archiving hides it from checkout while keeping billing
          history intact. Deleting is rejected outright if any institution or payment still references the plan.
        </p>
      </div>

      <Input
        label="Type the plan slug to confirm"
        value={confirmText}
        onChange={(e) => setConfirmText(e.target.value)}
        placeholder={plan.slug}
        className="font-mono"
        autoFocus
        autoComplete="off"
        spellCheck={false}
      />

      <div className="flex justify-end gap-3 pt-4 mt-4 border-t border-slate-100 dark:border-white/5">
        <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
        <Button type="button" variant="danger" isLoading={submitting} disabled={!matches} onClick={handleDelete}>
          <Trash2 className="w-4 h-4" /> Delete plan
        </Button>
      </div>
    </Modal>
  );
};

export const SetPriceModal: React.FC<{ plan: Plan; cycle: BillingCycle; onClose: () => void; onSuccess: () => void }> = ({
  plan,
  cycle,
  onClose,
  onSuccess,
}) => {
  const existing = plan.prices.find((p) => p.billingCycle === cycle);
  const [amount, setAmount] = useState<string>(existing ? String(existing.amount) : '');
  const [error, setError] = useState<string>();
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const value = Number(amount);
    if (!value || value <= 0) {
      setError('Amount must be greater than zero');
      return;
    }
    setSubmitting(true);
    try {
      await billingApi.setPlanPrice(plan.id, { billingCycle: cycle, amount: value });
      toast.success('Price saved');
      onSuccess();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to save price');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal isOpen onClose={onClose} title="Set price" description={`${plan.name} — ${BILLING_CYCLE_LABELS[cycle]}`} size="sm">
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="Amount (BDT)"
          value={amount}
          onChange={(e) => { setAmount(e.target.value); setError(undefined); }}
          error={error}
          type="number"
          min={0}
          step="0.01"
          autoFocus
          required
        />
        <div className="flex justify-end gap-3">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="gradient" isLoading={submitting}>Save price</Button>
        </div>
      </form>
    </Modal>
  );
};
