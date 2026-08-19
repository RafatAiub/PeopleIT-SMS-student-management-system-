import { z } from 'zod';

// =============================================================================
// ID Card DTOs — Zod schemas for the Smart Dynamic ID Card endpoints
// =============================================================================

const ShowFieldsDto = z
  .object({
    admissionNo: z.boolean().optional(),
    name: z.boolean().optional(),
    class: z.boolean().optional(),
    fatherName: z.boolean().optional(),
    motherName: z.boolean().optional(),
    address: z.boolean().optional(),
    dob: z.boolean().optional(),
    bloodGroup: z.boolean().optional(),
  })
  .catchall(z.boolean());

const HexColorDto = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Must be a hex color like #7c3aed');

// Advanced (drag-and-drop canvas) mode — an element list stored verbatim and
// interpreted identically by the React preview and the pdfkit renderer, both
// working in the same mm/top-left coordinate space as widthMm/heightMm.
const TEXT_DATA_KEYS = [
  'name',
  'admissionNo',
  'class',
  'fatherName',
  'motherName',
  'address',
  'dob',
  'bloodGroup',
  'cardNumber',
  'designation',
  'department',
  'phone',
] as const;

const BoxFieldsDto = {
  id: z.string().min(1),
  xMm: z.coerce.number(),
  yMm: z.coerce.number(),
  widthMm: z.coerce.number().positive(),
  heightMm: z.coerce.number().positive(),
  rotationDeg: z.coerce.number().default(0),
  zIndex: z.coerce.number().int().default(0),
};

const TextCanvasElementDto = z.object({
  ...BoxFieldsDto,
  type: z.literal('TEXT'),
  dataKey: z.enum(TEXT_DATA_KEYS),
  // Optional "Label : value" prefix (e.g. "D.O.B", "Adm. No") — rendered by
  // both the PDF and the React preview when set, left off when not.
  label: z.string().max(40).optional().nullable(),
  fontSizePt: z.coerce.number().positive().max(72).default(10),
  fontWeight: z.enum(['normal', 'bold']).default('normal'),
  color: HexColorDto.default('#0f172a'),
  align: z.enum(['left', 'center', 'right']).default('left'),
});

const PhotoCanvasElementDto = z.object({
  ...BoxFieldsDto,
  type: z.literal('PHOTO'),
  shape: z.enum(['CIRCLE', 'SQUARE', 'ROUNDED']).default('CIRCLE'),
});

const SimpleImageCanvasElementDto = z.object({
  ...BoxFieldsDto,
  type: z.enum(['LOGO', 'SIGNATURE', 'QR']),
});

const CanvasElementDto = z.discriminatedUnion('type', [
  TextCanvasElementDto,
  PhotoCanvasElementDto,
  SimpleImageCanvasElementDto,
]);

export const CreateIdCardTemplateDto = z.object({
  title: z.string().min(1, 'Title is required').max(150),
  applicableTo: z.enum(['STUDENT', 'STAFF']),
  layout: z.enum(['VERTICAL', 'HORIZONTAL']).default('VERTICAL'),
  widthMm: z.coerce.number().int().positive().max(200).default(57),
  heightMm: z.coerce.number().int().positive().max(200).default(89),
  backgroundImage: z.string().optional().nullable(),
  logoImage: z.string().optional().nullable(),
  signatureImage: z.string().optional().nullable(),
  photoStyle: z.enum(['CIRCLE', 'SQUARE', 'ROUNDED']).default('CIRCLE'),
  photoWidthMm: z.coerce.number().int().positive().max(100).default(21),
  photoHeightMm: z.coerce.number().int().positive().max(100).default(21),
  primaryColor: HexColorDto.default('#7c3aed'),
  secondaryColor: HexColorDto.default('#0f172a'),
  showFields: ShowFieldsDto.default({}),
  layoutMode: z.enum(['SIMPLE', 'ADVANCED']).default('SIMPLE'),
  canvasElements: z.array(CanvasElementDto).optional().nullable(),
  isActive: z.boolean().default(true),
});

export const UpdateIdCardTemplateDto = CreateIdCardTemplateDto.partial();

export const GenerateIdCardsDto = z
  .object({
    templateId: z.string().min(1, 'templateId is required'),
    studentIds: z.array(z.string().min(1)).optional(),
    staffIds: z.array(z.string().min(1)).optional(),
  })
  .refine(
    (data) => (data.studentIds && data.studentIds.length > 0) || (data.staffIds && data.staffIds.length > 0),
    { message: 'Provide at least one studentId or staffId' },
  );

export const IdCardQueryDto = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(1000).default(20),
  classId: z.string().min(1).optional(),
  department: z.string().min(1).optional(),
  userType: z.enum(['STUDENT', 'STAFF']).optional(),
  status: z.enum(['ACTIVE', 'REVOKED']).optional(),
  // Matches card number, student/staff name, admission/employee no.
  search: z.string().min(1).max(100).optional(),
});

export const IdParamDto = z.object({
  id: z.string().min(1, 'Invalid ID'),
});

export const TokenParamDto = z.object({
  token: z.string().min(1, 'Invalid token'),
});

export type CreateIdCardTemplateDtoType = z.infer<typeof CreateIdCardTemplateDto>;
export type UpdateIdCardTemplateDtoType = z.infer<typeof UpdateIdCardTemplateDto>;
export type GenerateIdCardsDtoType = z.infer<typeof GenerateIdCardsDto>;
export type IdCardQueryDtoType = z.infer<typeof IdCardQueryDto>;
export type CanvasElementType = z.infer<typeof CanvasElementDto>;
