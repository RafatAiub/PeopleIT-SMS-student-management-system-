import React from 'react';
import { Input, Select } from '@/components/ui';
import { formatDate, formatNumber, useT } from '@/i18n';
import type { CustomFieldDefinition, CustomFieldFormState } from './customFields.types';

interface CustomFieldInputsProps {
  definitions: CustomFieldDefinition[];
  values: CustomFieldFormState;
  errors?: Record<string, string>;
  onChange: (key: string, value: string) => void;
  onBlur?: (key: string) => void;
  /** Tailwind grid classes for the wrapper. */
  className?: string;
}

/**
 * Renders one input per custom field definition. Shared by the admission
 * wizard and the student profile; field `name`s are `custom_<key>` so the
 * wizard can focus the first invalid one.
 */
export const CustomFieldInputs: React.FC<CustomFieldInputsProps> = ({
  definitions,
  values,
  errors = {},
  onChange,
  onBlur,
  className = 'grid grid-cols-1 md:grid-cols-2 gap-4',
}) => {
  const t = useT();
  return (
    <div className={className}>
      {definitions.map((def) => {
        const common = {
          name: `custom_${def.key}`,
          label: def.label,
          required: def.required,
          value: values[def.key] ?? '',
          error: errors[def.key],
          onBlur: () => onBlur?.(def.key),
        };
        if (def.type === 'select') {
          return (
            <Select
              key={def.id}
              {...common}
              placeholder={t('Select…')}
              options={(def.options || []).map((o) => ({ value: o, label: o }))}
              onChange={(e) => onChange(def.key, e.target.value)}
            />
          );
        }
        return (
          <Input
            key={def.id}
            {...common}
            type={def.type === 'number' ? 'number' : def.type === 'date' ? 'date' : 'text'}
            inputMode={def.type === 'number' ? 'decimal' : undefined}
            maxLength={def.type === 'text' ? 1000 : undefined}
            onChange={(e) => onChange(def.key, e.target.value)}
          />
        );
      })}
    </div>
  );
};

/** Read-only display value for a stored custom field. */
export function formatCustomFieldValue(def: CustomFieldDefinition, value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (def.type === 'date') return formatDate(String(value));
  if (def.type === 'number' && typeof value === 'number') return formatNumber(value);
  return String(value);
}
