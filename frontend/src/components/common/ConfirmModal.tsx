import React from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { LoadingSpinner } from './LoadingSpinner';

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
  if (!isOpen) return null;

  const variantStyles = {
    danger: {
      icon: 'text-red-400',
      iconBg: 'bg-red-500/10 border-red-500/20',
      btn: 'bg-red-600 hover:bg-red-500 text-white',
    },
    warning: {
      icon: 'text-amber-400',
      iconBg: 'bg-amber-500/10 border-amber-500/20',
      btn: 'bg-amber-600 hover:bg-amber-500 text-white',
    },
    info: {
      icon: 'text-indigo-400',
      iconBg: 'bg-indigo-500/10 border-indigo-500/20',
      btn: 'bg-indigo-600 hover:bg-indigo-500 text-white',
    },
  };

  const styles = variantStyles[variant];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onCancel}
      />

      {/* Modal */}
      <div className="relative glass-card p-6 w-full max-w-md animate-fadeIn">
        <button
          id="confirm-modal-close"
          onClick={onCancel}
          className="absolute top-4 right-4 p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="flex items-start gap-4">
          <div className={`w-12 h-12 rounded-full border flex items-center justify-center flex-shrink-0 ${styles.iconBg}`}>
            <AlertTriangle className={`w-6 h-6 ${styles.icon}`} />
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-white mb-2">{title}</h3>
            <p className="text-slate-400 text-sm leading-relaxed">{message}</p>
          </div>
        </div>

        <div className="flex gap-3 mt-6 justify-end">
          <button
            id="confirm-modal-cancel"
            onClick={onCancel}
            disabled={isLoading}
            className="btn-secondary text-sm"
          >
            {cancelLabel}
          </button>
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
      </div>
    </div>
  );
};
