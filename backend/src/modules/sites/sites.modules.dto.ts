import { z } from 'zod';
import { id, pagination } from './sites.dto';
import { MODULE_CODE_MAX_BYTES, MODULE_KEY_PATTERN } from './sites.modules.logic';

// =============================================================================
// Website custom modules — request DTOs. The fields schema is validated and
// normalised in the service (sites.modules.logic.parseModuleFields) so its
// errors carry field paths; code size is capped here (≈ bytes; the service
// re-checks exact UTF-8 bytes).
// =============================================================================

const code = (label: string) =>
  z.string().max(MODULE_CODE_MAX_BYTES, `${label} is too large (limit ${MODULE_CODE_MAX_BYTES / 1024} KB)`);
const optText = (max: number) => z.preprocess((v) => (v === '' ? null : v), z.string().trim().max(max).nullable().optional());

export const ModuleKeyDto = z.string().trim().regex(MODULE_KEY_PATTERN, 'Key: lowercase letters, digits, "-" or "_", starting with a letter (max 60)');

export const ModuleQueryDto = z.object({
  ...pagination,
  pageSize: z.coerce.number().int().positive().max(200).default(100),
  search: z.string().trim().max(100).optional(),
  category: z.string().trim().max(40).optional(),
  status: z.enum(['DRAFT', 'PUBLISHED']).optional(),
});

export const CreateModuleDto = z.object({
  key: ModuleKeyDto.optional(),
  name: z.string().trim().min(1).max(120),
  nameBn: optText(120),
  description: optText(500),
  category: z.string().trim().min(1).max(40).default('general'),
  icon: optText(40),
  fields: z.unknown().default([]),
  template: code('HTML (Liquid)').default(''),
  css: code('CSS').default(''),
  js: code('JS').default(''),
});

export const UpdateModuleDto = z.object({
  key: ModuleKeyDto.optional(),
  name: z.string().trim().min(1).max(120).optional(),
  nameBn: optText(120),
  description: optText(500),
  category: z.string().trim().min(1).max(40).optional(),
  icon: optText(40),
  fields: z.unknown().optional(),
  template: code('HTML (Liquid)').optional(),
  css: code('CSS').optional(),
  js: code('JS').optional(),
});

export const PublishModuleDto = z.object({ note: optText(200) }).default({});
export const DeleteModuleQueryDto = z.object({ force: z.enum(['true', 'false', '1', '0']).optional() });
export const ModuleVersionParamDto = z.object({ id, versionId: id });
export const ModuleVersionsQueryDto = z.object(pagination);

export const ValidateModuleDto = z.object({
  fields: z.unknown().optional(),
  template: code('HTML (Liquid)').default(''),
  css: code('CSS').default(''),
  js: code('JS').default(''),
});

/** The body IS the exported document (`{ format, module }`) or a bare module; parsed in the service. */
export const ImportModuleDto = z.object({}).passthrough();

export const PublicModulesQueryDto = z.object({
  preview: z.string().max(2000).optional(),
  // With a valid preview token: also return draft definitions (module editor previews).
  drafts: z.enum(['1', 'true']).optional(),
  key: ModuleKeyDto.optional(),
});
export const PublicModuleVersionParamDto = z.object({ siteId: id, key: ModuleKeyDto, version: z.coerce.number().int().positive() });

export type ModuleQueryDtoType = z.infer<typeof ModuleQueryDto>;
export type CreateModuleDtoType = z.infer<typeof CreateModuleDto>;
export type UpdateModuleDtoType = z.infer<typeof UpdateModuleDto>;
export type ValidateModuleDtoType = z.infer<typeof ValidateModuleDto>;
