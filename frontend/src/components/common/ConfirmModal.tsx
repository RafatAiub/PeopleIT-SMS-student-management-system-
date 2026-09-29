import React from 'react';
import { AlertTriangle, Info } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { cn } from '../../lib/cn';

interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  isLoading?: boolean;
  variant?: 'danger' | 'warning' | 'info';
}

const STYLES = {
  danger: { icon: 'text-red-600 dark:text-red-300', bg: 'bg-red-50 dark:bg-red-500/15', btn: 'danger' as const },
  warning: { icon: 'text-amber-600 dark:text-amber-300', bg: 'bg-amber-50 dark:bg-amber-500/15', btn: 'primary' as const },
  info: { icon: 'text-blue-600 dark:text-blue-300', bg: 'bg-blue-50 dark:bg-blue-500/15', btn: 'primary' as const },
};

export const ConfirmModal: React.FC<ConfirmModalProps> = ({
  isOpen,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
  isLoading = false,
  variant = 'danger',
}) => {
  const s = STYLES[variant];
  const titleId = React.useId();
  return (
    <Modal isOpen={isOpen} onClose={isLoading ? () => {} : onCancel} hideCloseButton size="sm">
      <div className="flex items-start gap-4" aria-labelledby={titleId}>
        <div className={cn('w-10 h-10 rounded-full flex items-center justify-center shrink-0', s.bg)}>
          {variant === 'info' ? <Info className={cn('w-5 h-5', s.icon)} /> : <AlertTriangle className={cn('w-5 h-5', s.icon)} />}
        </div>
        <div className="flex-1 min-w-0 pt-0.5">
          <h3 id={titleId} className="text-base font-semibold text-slate-900 dark:text-slate-50">{title}</h3>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1.5 leading-relaxed">{message}</p>
        </div>
      </div>

      <div className="flex flex-col-reverse sm:flex-row gap-2 mt-6 sm:justify-end">
        <Button id="confirm-modal-cancel" variant="secondary" onClick={onCancel} disabled={isLoading} data-autofocus={variant === 'danger' ? true : undefined}>
          {cancelLabel}
        </Button>
        <Button id="confirm-modal-confirm" variant={s.btn} onClick={onConfirm} isLoading={isLoading} data-autofocus={variant === 'danger' ? undefined : true}>
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  );
};
