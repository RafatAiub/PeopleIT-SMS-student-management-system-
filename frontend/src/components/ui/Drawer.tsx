import React from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { cn } from '../../lib/cn';
import { useDialogBehaviour } from './Modal';

interface DrawerProps {
  isOpen: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  side?: 'right' | 'left';
  width?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

const WIDTH = { sm: 'sm:max-w-sm', md: 'sm:max-w-md', lg: 'sm:max-w-xl', xl: 'sm:max-w-3xl' };

/** Side panel for quick view / quick edit without leaving the list. */
export const Drawer: React.FC<DrawerProps> = ({
  isOpen,
  onClose,
  title,
  description,
  children,
  footer,
  side = 'right',
  width = 'md',
  className,
}) => {
  const panelRef = React.useRef<HTMLDivElement>(null);
  const titleId = React.useId();
  useDialogBehaviour(isOpen, onClose, panelRef);
  const from = side === 'right' ? '100%' : '-100%';

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="absolute inset-0 bg-slate-950/40"
            onClick={onClose}
            aria-hidden
          />
          <motion.aside
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={title ? titleId : undefined}
            tabIndex={-1}
            initial={{ x: from }}
            animate={{ x: 0 }}
            exit={{ x: from }}
            transition={{ type: 'spring', stiffness: 380, damping: 38 }}
            className={cn(
              'absolute top-0 bottom-0 w-full flex flex-col bg-white dark:bg-slate-900 shadow-lg focus:outline-none',
              'border-slate-200 dark:border-white/10',
              side === 'right' ? 'right-0 border-l' : 'left-0 border-r',
              WIDTH[width],
              className
            )}
          >
            <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-slate-100 dark:border-white/6">
              <div className="min-w-0">
                {title && <h2 id={titleId} className="text-base font-semibold text-slate-900 dark:text-slate-50 truncate">{title}</h2>}
                {description && <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">{description}</p>}
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="p-1.5 -mr-1.5 rounded-lg text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/10"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-5">{children}</div>
            {footer && (
              <div className="px-5 py-4 border-t border-slate-100 dark:border-white/6 flex justify-end gap-2">{footer}</div>
            )}
          </motion.aside>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
};
