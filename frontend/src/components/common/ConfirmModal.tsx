import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { LoadingSpinner } from './LoadingSpinner';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';

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
  const variantStyles = {
    danger: {
      icon: 'text-red-600 dark:text-red-400',
      iconBg: 'bg-red-50 dark:bg-red-500/10 border-red-200 dark:border-red-500/20',
      btn: 'bg-red-600 hover:bg-red-500 text-white',
    },
    warning: {
      icon: 'text-amber-600 dark:text-amber-400',
      iconBg: 'bg-amber-50 dark:bg-amber-500/10 border-amber-200 dark:border-amber-500/20',
      btn: 'bg-amber-600 hover:bg-amber-500 text-white',
    },
    info: {
      icon: 'text-primary-600 dark:text-primary-400',
      iconBg: 'bg-primary-50 dark:bg-primary-500/10 border-primary-200 dark:border-primary-500/20',
      btn: 'bg-primary-600 hover:bg-primary-500 text-white',
    },
  };

  const styles = variantStyles[variant];

  return (
    <Modal isOpen={isOpen} onClose={onCancel}>
      <div className="flex items-start gap-4">
        <div className={`w-12 h-12 rounded-full border flex items-center justify-center flex-shrink-0 ${styles.iconBg}`}>
          <AlertTriangle className={`w-6 h-6 ${styles.icon}`} />
        </div>
        <div className="flex-1">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">{title}</h3>
          <p className="text-slate-600 dark:text-slate-400 text-sm leading-relaxed">{message}</p>
        </div>
      </div>

      <div className="flex gap-3 mt-6 justify-end">
        <Button id="confirm-modal-cancel" variant="secondary" size="sm" onClick={onCancel} disabled={isLoading}>
          {cancelLabel}
        </Button>
        <button
          id="confirm-modal-confirm"
          onClick={onConfirm}
          disabled={isLoading}
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg font-semibold text-sm transition-all duration-200 active:scale-95 ${styles.btn}`}
        >
          {isLoading ? <LoadingSpinner size="sm" /> : null}
          {confirmLabel}
        </button>
      </div>
    </Modal>
  );
};
