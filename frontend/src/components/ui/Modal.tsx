import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { cn } from '../../lib/cn';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  className?: string;
  /** Hide the built-in close (X) button, e.g. when the caller renders its own. */
  hideCloseButton?: boolean;
}

// Shared stack of every currently-open Modal instance, ordered by mount time.
// Escape only closes the top-most entry so nested modals (e.g. a confirm dialog
// rendered inside another Modal) don't both close on a single press.
const modalStack: symbol[] = [];

export const Modal: React.FC<ModalProps> = ({ isOpen, onClose, children, className, hideCloseButton }) => {
  const idRef = React.useRef<symbol>(Symbol('modal'));
  // Keep the latest onClose without re-running the stack effect, so a changing
  // onClose identity never reorders the stack.
  const onCloseRef = React.useRef(onClose);
  React.useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  React.useEffect(() => {
    if (!isOpen) return;
    const id = idRef.current;
    modalStack.push(id);
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && modalStack[modalStack.length - 1] === id) {
        onCloseRef.current();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      const idx = modalStack.lastIndexOf(id);
      if (idx !== -1) modalStack.splice(idx, 1);
    };
  }, [isOpen]);

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="absolute inset-0 bg-black/60 backdrop-blur-xs"
            onClick={onClose}
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 8 }}
            transition={{ type: 'spring', stiffness: 400, damping: 32 }}
            className={cn(
              // Deliberately opaque, not the translucent .glass-card used for
              // in-page cards — this panel sits over our own dark backdrop
              // scrim, so a translucent white background in light mode reads
              // as washed-out gray instead of white.
              'relative bg-white dark:bg-surface-900 border border-slate-200 dark:border-white/10 rounded-2xl shadow-xl p-6 w-full max-w-md',
              className
            )}
          >
            {!hideCloseButton && (
              <button
                onClick={onClose}
                aria-label="Close"
                className="absolute top-4 right-4 p-1.5 rounded-lg text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/10 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            )}
            {children}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
