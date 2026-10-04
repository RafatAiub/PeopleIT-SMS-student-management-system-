import React, { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ListPlus, Pencil, Plus, SlidersHorizontal, Trash2 } from 'lucide-react';
import {
  Alert,
  Badge,
  Button,
  Card,
  Checkbox,
  ErrorState,
  Input,
  Modal,
  PageHeader,
  Select,
  Skeleton,
  Textarea,
} from '@/components/ui';
import { EmptyState } from '@/components/common/EmptyState';
import { ConfirmModal } from '@/components/common/ConfirmModal';
import { useT } from '@/i18n';
import {
  useCreateCustomField,
  useCustomFieldDefinitions,
  useDeleteCustomField,
  useReorderCustomFields,
  useUpdateCustomField,
} from './customFields.queries';
import {
  EMPTY_FIELD_FORM,
  FIELD_TYPE_OPTIONS,
  KEY_PATTERN,
  keyFromLabel,
  parseOptions,
  type CustomFieldDefinition,
  type CustomFieldFormValues,
} from './customFields.types';

// Settings → Custom fields (SUPER_ADMIN, ADMIN). Defines extra student
// fields; values are captured in the admission wizard and shown/edited on
// the student profile, validated server-side against these definitions.

type FormErrors = Partial<Record<'label' | 'key' | 'optionsText', string>>;

function validate(values: CustomFieldFormValues, isEdit: boolean): FormErrors {
  const errors: FormErrors = {};
  if (!values.label.trim()) errors.label = 'Label is required';
  else if (values.label.length > 100) errors.label = 'Label must be 100 characters or fewer';
  if (!isEdit) {
    const key = values.key.trim() || keyFromLabel(values.label);
    if (!KEY_PATTERN.test(key)) {
      errors.key = 'Lowercase letters, digits and underscores only, starting with a letter (max 40)';
    }
  }
  if (values.type === 'select') {
    const options = parseOptions(values.optionsText);
    if (options.length === 0) errors.optionsText = 'Add at least one option (one per line)';
    else if (options.length > 50) errors.optionsText = 'At most 50 options';
    else if (options.some((o) => o.length > 100)) errors.optionsText = 'Each option must be 100 characters or fewer';
  }
  return errors;
}

const FieldFormModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  field: CustomFieldDefinition | null;
  nextSortOrder: number;
}> = ({ isOpen, onClose, field, nextSortOrder }) => {
  const t = useT();
  const createMutation = useCreateCustomField();
  const updateMutation = useUpdateCustomField();
  const [values, setValues] = useState<CustomFieldFormValues>(EMPTY_FIELD_FORM);
  const [errors, setErrors] = useState<FormErrors>({});
  const [keyTouched, setKeyTouched] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setValues(
      field
        ? {
            label: field.label,
            key: field.key,
            type: field.type,
            optionsText: (field.options || []).join('\n'),
            required: field.required,
          }
        : EMPTY_FIELD_FORM,
    );
    setErrors({});
    setKeyTouched(false);
  }, [isOpen, field]);

  const derivedKey = field ? field.key : keyTouched ? values.key : keyFromLabel(values.label);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const next = validate({ ...values, key: derivedKey }, !!field);
    setErrors(next);
    if (Object.keys(next).length) return;

    const options = values.type === 'select' ? parseOptions(values.optionsText) : null;
    if (field) {
      updateMutation.mutate(
        { id: field.id, data: { label: values.label.trim(), type: values.type, options, required: values.required } },
        { onSuccess: onClose },
      );
    } else {
      createMutation.mutate(
        {
          label: values.label.trim(),
          key: derivedKey,
          type: values.type,
          options,
          required: values.required,
          sortOrder: nextSortOrder,
        },
        { onSuccess: onClose },
      );
    }
  };

  const isSubmitting = createMutation.isPending || updateMutation.isPending;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={field ? t('Edit custom field') : t('New custom field')}
      description={t('Shown in the admission form and on the student profile.')}
      size="lg"
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose} disabled={isSubmitting}>
            {t('Cancel')}
          </Button>
          <Button type="submit" form="customFieldForm" variant="primary" isLoading={isSubmitting}>
            {field ? t('Save changes') : t('Create field')}
          </Button>
        </>
      }
    >
      <form id="customFieldForm" onSubmit={handleSubmit} className="space-y-4" noValidate>
        <Input
          label={t('Label')}
          required
          data-autofocus
          value={values.label}
          maxLength={100}
          onChange={(e) => setValues((p) => ({ ...p, label: e.target.value }))}
          error={errors.label}
          placeholder={t('e.g. Birth certificate number')}
        />
        <Input
          label={t('Key')}
          value={derivedKey}
          disabled={!!field}
          maxLength={40}
          onChange={(e) => {
            setKeyTouched(true);
            setValues((p) => ({ ...p, key: e.target.value }));
          }}
          error={errors.key}
          helperText={
            field
              ? t('The key cannot change after creation — stored values are saved under it.')
              : t('Generated from the label. Used to store the value; cannot be changed later.')
          }
        />
        <Select
          label={t('Type')}
          value={values.type}
          onChange={(e) => setValues((p) => ({ ...p, type: e.target.value as CustomFieldFormValues['type'] }))}
          options={FIELD_TYPE_OPTIONS.map((o) => ({ ...o, label: t(o.label) }))}
          helperText={
            field && field.type !== values.type
              ? t('Changing the type does not convert values already saved; invalid ones must be corrected on next edit.')
              : undefined
          }
        />
        {values.type === 'select' && (
          <Textarea
            label={t('Options (one per line)')}
            required
            rows={5}
            value={values.optionsText}
            onChange={(e) => setValues((p) => ({ ...p, optionsText: e.target.value }))}
            error={errors.optionsText}
          />
        )}
        <Checkbox
          label={t('Required')}
          description={t('New admissions and student edits must fill this field.')}
          checked={values.required}
          onChange={(e) => setValues((p) => ({ ...p, required: e.target.checked }))}
        />
      </form>
    </Modal>
  );
};

const CustomFieldsSettings: React.FC = () => {
  const t = useT();
  const { data, isLoading, isError, refetch } = useCustomFieldDefinitions();
  const deleteMutation = useDeleteCustomField();
  const reorderMutation = useReorderCustomFields();

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<CustomFieldDefinition | null>(null);
  const [toDelete, setToDelete] = useState<CustomFieldDefinition | null>(null);
  const [order, setOrder] = useState<CustomFieldDefinition[]>([]);

  useEffect(() => {
    setOrder(data || []);
  }, [data]);

  const nextSortOrder = useMemo(
    () => (order.length ? Math.max(...order.map((f) => f.sortOrder)) + 10 : 0),
    [order],
  );

  const move = (index: number, delta: -1 | 1) => {
    const target = index + delta;
    if (target < 0 || target >= order.length) return;
    const next = [...order];
    [next[index], next[target]] = [next[target], next[index]];
    setOrder(next);
    reorderMutation.mutate(next.map((f) => f.id));
  };

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <PageHeader
        title={t('Custom fields')}
        description={t('Add school-specific student fields — they appear in the admission form and on each student profile.')}
        breadcrumbs={[{ label: t('Settings'), to: '/settings' }, { label: t('Custom fields') }]}
        actions={
          <Button variant="primary" leftIcon={<Plus className="w-4 h-4" />} onClick={openCreate}>
            {t('New field')}
          </Button>
        }
      />

      <Alert tone="info" title={t('How custom fields work')}>
        {t('Values are checked against the field type on every save. Marking a field required applies to new admissions and to any edit of a student’s custom fields.')}
      </Alert>

      {isError ? (
        <ErrorState message={t('Could not load custom fields.')} onRetry={() => refetch()} />
      ) : isLoading ? (
        <Card className="p-4 space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full rounded-xl" />
          ))}
        </Card>
      ) : order.length === 0 ? (
        <Card>
          <EmptyState
            icon={<SlidersHorizontal />}
            title={t('No custom fields yet')}
            description={t('Create a field such as “Birth certificate no.” or “Transport pickup point”.')}
            action={
              <Button variant="primary" leftIcon={<ListPlus className="w-4 h-4" />} onClick={openCreate}>
                {t('Create the first field')}
              </Button>
            }
          />
        </Card>
      ) : (
        <Card className="divide-y divide-slate-200/70 dark:divide-white/5 overflow-hidden">
          <ul aria-label={t('Custom fields, in display order')}>
            {order.map((field, index) => (
              <li key={field.id} className="flex flex-col sm:flex-row sm:items-center gap-3 p-4">
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-slate-900 dark:text-white break-words">{field.label}</span>
                    <Badge variant="neutral">{t(FIELD_TYPE_OPTIONS.find((o) => o.value === field.type)?.label || field.type)}</Badge>
                    {field.required && <Badge variant="warning">{t('Required')}</Badge>}
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 break-all">
                    <code>{field.key}</code>
                    {field.type === 'select' && field.options?.length ? ` · ${field.options.join(', ')}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    aria-label={t('Move {label} up', { label: field.label })}
                    disabled={index === 0 || reorderMutation.isPending}
                    onClick={() => move(index, -1)}
                  >
                    <ArrowUp className="w-4 h-4" />
                  </Button>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    aria-label={t('Move {label} down', { label: field.label })}
                    disabled={index === order.length - 1 || reorderMutation.isPending}
                    onClick={() => move(index, 1)}
                  >
                    <ArrowDown className="w-4 h-4" />
                  </Button>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    aria-label={t('Edit {label}', { label: field.label })}
                    onClick={() => {
                      setEditing(field);
                      setFormOpen(true);
                    }}
                  >
                    <Pencil className="w-4 h-4" />
                  </Button>
                  <Button
                    size="icon-sm"
                    variant="danger-soft"
                    aria-label={t('Delete {label}', { label: field.label })}
                    onClick={() => setToDelete(field)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <FieldFormModal isOpen={formOpen} onClose={() => setFormOpen(false)} field={editing} nextSortOrder={nextSortOrder} />

      <ConfirmModal
        isOpen={!!toDelete}
        title={t('Delete custom field')}
        message={
          toDelete
            ? t('Delete “{label}”? It disappears from forms and profiles. Values already saved are kept but no longer shown.', {
                label: toDelete.label,
              })
            : ''
        }
        confirmLabel={t('Delete')}
        variant="danger"
        isLoading={deleteMutation.isPending}
        onConfirm={() => toDelete && deleteMutation.mutate(toDelete.id, { onSuccess: () => setToDelete(null) })}
        onCancel={() => setToDelete(null)}
      />
    </div>
  );
};

export default CustomFieldsSettings;
