import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { cn } from '../../lib/cn';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
  required?: boolean;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, helperText, required, id, className, ...props }, ref) => {
    const field = (
      <input
        ref={ref}
        id={id}
        className={cn('input-field', error && 'border-red-400 dark:border-red-500/50 focus:ring-red-500', className)}
        {...props}
      />
    );

    if (!label) return field;

    return (
      <div className="flex flex-col gap-1.5">
        <label htmlFor={id} className="text-sm font-medium text-slate-300">
          {label}
          {required && <span className="text-red-400 ml-1">*</span>}
        </label>
        {field}
        <AnimatePresence initial={false}>
          {error ? (
            <motion.p
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.15 }}
              className="text-xs text-red-400 flex items-center gap-1 overflow-hidden"
            >
              <span className="w-1 h-1 rounded-full bg-red-400 shrink-0" />
              {error}
            </motion.p>
          ) : helperText ? (
            <p className="text-xs text-slate-500">{helperText}</p>
          ) : null}
        </AnimatePresence>
      </div>
    );
  }
);

Input.displayName = 'Input';
