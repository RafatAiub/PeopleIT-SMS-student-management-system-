import { z } from 'zod';
import { CUSTOM_FIELD_KEY_PATTERN, CUSTOM_FIELD_TYPES } from './customFields.validation';

// =============================================================================
// Custom field definition DTOs
// =============================================================================

export const CustomFieldEntityEnum = z.enum(['STUDENT']);
export const CustomFieldTypeEnum = z.enum(CUSTOM_FIELD_TYPES);

const options = z
  .array(z.string().trim().min(1).max(100))
  .max(50)
  .refine((arr) => new Set(arr).size === arr.length, 'Options must be unique');

export const CreateCustomFieldDto = z
  .object({
    entity: CustomFieldEntityEnum.default('STUDENT'),
    /** Optional — derived from the label when omitted. Immutable after creation. */
    key: z
      .string()
      .trim()
      .regex(CUSTOM_FIELD_KEY_PATTERN, 'Key must be lowercase letters, digits and underscores, starting with a letter')
      .optional(),
    label: z.string().trim().min(1, 'Label is required').max(100),
    type: CustomFieldTypeEnum,
    options: options.optional().nullable(),
    required: z.boolean().default(false),
    sortOrder: z.coerce.number().int().min(0).max(10000).default(0),
  })
  .superRefine((v, ctx) => {
    if (v.type === 'select' && (!v.options || v.options.length === 0)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['options'], message: 'A select field needs at least one option' });
    }
  });

// `key` and `entity` are deliberately absent: stored values are keyed by them.
export const UpdateCustomFieldDto = z.object({
  label: z.string().trim().min(1).max(100).optional(),
  type: CustomFieldTypeEnum.optional(),
  options: options.optional().nullable(),
  required: z.boolean().optional(),
  sortOrder: z.coerce.number().int().min(0).max(10000).optional(),
});

export const CustomFieldQueryDto = z.object({
  entity: CustomFieldEntityEnum.default('STUDENT'),
});

export const ReorderCustomFieldsDto = z.object({
  ids: z.array(z.string().min(1)).min(1).max(200),
});

export const IdParamDto = z.object({ id: z.string().min(1, 'Invalid ID') });

export type CreateCustomFieldDtoType = z.infer<typeof CreateCustomFieldDto>;
export type UpdateCustomFieldDtoType = z.infer<typeof UpdateCustomFieldDto>;
