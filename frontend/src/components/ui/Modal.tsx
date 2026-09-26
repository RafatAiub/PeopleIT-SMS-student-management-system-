import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { cn } from '../../lib/cn';

type ModalSize = 'sm' | 'md' | 'lg' | 'xl' | '2xl' | 'full';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  className?: string;
  /** Hide the built-in close (X) button, e.g. when the caller renders its own. */
  hideCloseButton?: boolean;
  /** Optional built-in header. Also used as the dialog's accessible name. */
  title?: React.ReactNode;
  description?: React.ReactNode;
  /** Sticky footer (actions). */
  footer?: React.ReactNode;
  /** Default `md` keeps the historic max-w-md width. Callers may still override via className. */
  size?: ModalSize;
  /** Clicking the backdrop closes the dialog (default true). */
  closeOnBackdrop?: boolean;
}

const SIZE: Record<ModalSize, string> = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-2xl',
  '2xl': 'max-w-4xl',
  full: 'max-w-6xl',
};

// Shared stack of every currently-open dialog, ordered by mount time. Escape
// and focus trapping only apply to the top-most entry so nested dialogs (a
// confirm inside a form modal) behave correctly.
export const dialogStack: symbol[] = [];

const FOCUSABLE =
  'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';

/** Focus trap + Escape + scroll lock + focus restore for any overlay panel. */
export function useDialogBehaviour(isOpen: boolean, onClose: () => void, panelRef: React.RefObject<HTMLElement>) {
  const idRef = React.useRef<symbol>(Symbol('dialog'));
  const onCloseRef = React.useRef(onClose);
  React.useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  React.useEffect(() => {
    if (!isOpen) return;
    const id = idRef.current;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    dialogStack.push(id);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    // Move focus into the panel (first field, else the panel itself).
    const t = window.setTimeout(() => {
      const panel = panelRef.current;
      if (!panel || panel.contains(document.activeElement)) return;
      const first = panel.querySelector<HTMLElement>('[data-autofocus]') ??
        panel.querySelector<HTMLElement>('input:not([type="hidden"]):not([disabled]),select,textarea') ??
        panel.querySelector<HTMLElement>(FOCUSABLE);
      (first ?? panel).focus({ preventScroll: true });
    }, 30);

    const onKey = (e: KeyboardEvent) => {
      if (dialogStack[dialogStack.length - 1] !== id) return;
      if (e.key === 'Escape') {
        e.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (e.key === 'Tab' && panelRef.current) {
        const nodes = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
          (n) => n.offsetParent !== null || n === document.activeElement
        );
        if (nodes.length === 0) return;
        const first = nodes[0];
        const last = nodes[nodes.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener('keydown', onKey);
      const idx = dialogStack.lastIndexOf(id);
      if (idx !== -1) dialogStack.splice(idx, 1);
      if (dialogStack.length === 0) document.body.style.overflow = prevOverflow;
      previouslyFocused?.focus?.({ preventScroll: true });
    };
  }, [isOpen, panelRef]);
}

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  children,
  className,
  hideCloseButton,
  title,
  description,
  footer,
  size = 'md',
  closeOnBackdrop = true,
}) => {
  const panelRef = React.useRef<HTMLDivElement>(null);
  const titleId = React.useId();
  const descId = React.useId();
  useDialogBehaviour(isOpen, onClose, panelRef);

  // Rendered in place (not portalled): some callers wrap a Modal inside a
  // <form>, and native submit needs the button to be a DOM descendant.
  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="absolute inset-0 bg-slate-950/50 backdrop-blur-[2px]"
            onClick={closeOnBackdrop ? onClose : undefined}
            aria-hidden
          />

          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={title ? titleId : undefined}
            aria-describedby={description ? descId : undefined}
            tabIndex={-1}
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 420, damping: 34 }}
            className={cn(
              // Mobile: bottom sheet (full width, rounded top). ≥sm: centred dialog.
              'relative w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 shadow-lg',
              'rounded-t-2xl sm:rounded-2xl max-h-[92dvh] overflow-y-auto focus:outline-none',
              !title && !footer && 'p-5 sm:p-6',
              SIZE[size],
              className
            )}
          >
            {title && (
              <div className="sticky top-0 z-10 bg-white dark:bg-slate-900 px-5 sm:px-6 pt-5 pb-4 border-b border-slate-100 dark:border-white/6 pr-12">
                <h2 id={titleId} className="text-base font-semibold text-slate-900 dark:text-slate-50">{title}</h2>
                {description && (
                  <p id={descId} className="text-sm text-slate-500 dark:text-slate-400 mt-1">{description}</p>
                )}
              </div>
            )}
            {!hideCloseButton && (
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="absolute top-4 right-4 z-20 p-1.5 rounded-lg text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/10 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            )}
            {title || footer ? <div className="px-5 sm:px-6 py-5">{children}</div> : children}
            {footer && (
              <div className="sticky bottom-0 bg-white dark:bg-slate-900 px-5 sm:px-6 py-4 border-t border-slate-100 dark:border-white/6 flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
                {footer}
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
