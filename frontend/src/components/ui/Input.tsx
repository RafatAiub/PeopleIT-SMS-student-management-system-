import React from 'react';
import { AlertCircle } from 'lucide-react';
import { cn } from '../../lib/cn';

/**
 * Form controls with built-in label ↔ control association, inline errors
 * (aria-invalid + aria-describedby) and helper text. Styling comes from the
 * shared `.input-field` / `.field-*` classes so legacy forms and new forms
 * look identical.
 */

interface FieldShellProps {
  id: string;
  label?: React.ReactNode;
  error?: string;
  helperText?: React.ReactNode;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}

export const FieldShell: React.FC<FieldShellProps> = ({ id, label, error, helperText, required, className, children }) => (
  <div className={cn('flex flex-col', className)}>
    {label && (
      <label htmlFor={id} className="field-label">
        {label}
        {required && <span className="text-red-600 dark:text-red-400 ml-0.5" aria-hidden>*</span>}
      </label>
    )}
    {children}
    {error ? (
      <p id={`${id}-error`} className="field-error" role="alert">
        <AlertCircle className="w-3.5 h-3.5 shrink-0" aria-hidden />
        {error}
      </p>
    ) : helperText ? (
      <p id={`${id}-hint`} className="field-hint">{helperText}</p>
    ) : null}
  </div>
);

function useFieldIds(id: string | undefined, error?: string, helperText?: React.ReactNode) {
  const auto = React.useId();
  const fieldId = id ?? `f${auto.replace(/:/g, '')}`;
  const describedBy = error ? `${fieldId}-error` : helperText ? `${fieldId}-hint` : undefined;
  return { fieldId, describedBy };
}

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: React.ReactNode;
  error?: string;
  helperText?: React.ReactNode;
  leftIcon?: React.ReactNode;
  rightSlot?: React.ReactNode;
  containerClassName?: string;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, helperText, required, id, className, leftIcon, rightSlot, containerClassName, ...props }, ref) => {
    const { fieldId, describedBy } = useFieldIds(id, error, helperText);
    const control = (
      <div className="relative">
        {leftIcon && (
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 [&>svg]:w-4 [&>svg]:h-4">
            {leftIcon}
          </span>
        )}
        <input
          ref={ref}
          id={fieldId}
          required={required}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={cn('input-field', leftIcon && 'pl-9', rightSlot && 'pr-10', className)}
          {...props}
        />
        {rightSlot && <span className="absolute right-2 top-1/2 -translate-y-1/2">{rightSlot}</span>}
      </div>
    );
    if (!label && !error && !helperText) return control;
    return (
      <FieldShell id={fieldId} label={label} error={error} helperText={helperText} required={required} className={containerClassName}>
        {control}
      </FieldShell>
    );
  }
);
Input.displayName = 'Input';

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: React.ReactNode;
  error?: string;
  helperText?: React.ReactNode;
  containerClassName?: string;
}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, error, helperText, required, id, className, containerClassName, rows = 4, ...props }, ref) => {
    const { fieldId, describedBy } = useFieldIds(id, error, helperText);
    return (
      <FieldShell id={fieldId} label={label} error={error} helperText={helperText} required={required} className={containerClassName}>
        <textarea
          ref={ref}
          id={fieldId}
          rows={rows}
          required={required}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={cn('input-field min-h-0 resize-y leading-relaxed', className)}
          {...props}
        />
      </FieldShell>
    );
  }
);
Textarea.displayName = 'Textarea';

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: React.ReactNode;
  error?: string;
  helperText?: React.ReactNode;
  placeholder?: string;
  options?: { value: string; label: string; disabled?: boolean }[];
  containerClassName?: string;
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, error, helperText, required, id, className, containerClassName, options, placeholder, children, ...props }, ref) => {
    const { fieldId, describedBy } = useFieldIds(id, error, helperText);
    return (
      <FieldShell id={fieldId} label={label} error={error} helperText={helperText} required={required} className={containerClassName}>
        <select
          ref={ref}
          id={fieldId}
          required={required}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={cn('input-field', className)}
          {...props}
        >
          {placeholder !== undefined && <option value="">{placeholder}</option>}
          {options?.map((o) => (
            <option key={o.value} value={o.value} disabled={o.disabled}>{o.label}</option>
          ))}
          {children}
        </select>
      </FieldShell>
    );
  }
);
Select.displayName = 'Select';

interface CheckboxProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: React.ReactNode;
  description?: React.ReactNode;
}

export const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(({ label, description, id, className, ...props }, ref) => {
  const auto = React.useId();
  const fieldId = id ?? `c${auto.replace(/:/g, '')}`;
  return (
    <label htmlFor={fieldId} className={cn('flex items-start gap-2.5 cursor-pointer', className)}>
      <input
        ref={ref}
        id={fieldId}
        type="checkbox"
        className="mt-0.5 w-4 h-4 rounded border-slate-300 dark:border-white/20 accent-primary-600 cursor-pointer"
        {...props}
      />
      <span className="text-sm">
        <span className="font-medium text-slate-800 dark:text-slate-200">{label}</span>
        {description && <span className="block text-slate-500 dark:text-slate-400 text-xs mt-0.5">{description}</span>}
      </span>
    </label>
  );
});
Checkbox.displayName = 'Checkbox';
