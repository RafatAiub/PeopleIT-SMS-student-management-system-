import { z } from 'zod';

export const EventTypeEnum = z.enum(['SINGLE', 'MULTIPLE']);
export const EventCategoryEnum = z.enum([
  'ACADEMIC',
  'SPORTS',
  'CULTURAL',
  'CELEBRATION',
  'EXAM',
  'MEETING',
  'TRIP',
  'COMPETITION',
  'OTHER',
]);
export const EventAudienceEnum = z.enum(['STUDENTS', 'GUARDIANS', 'TEACHERS', 'STAFF']);

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format');
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Time must be in HH:MM format');

// Compressed client-side (see frontend utils/imageCompressor) — ~1MB of
// base64 is far above what an 800px JPEG needs, and keeps rows bounded.
const imageDataUrl = z
  .string()
  .max(1_400_000, 'Image is too large — please use a smaller picture')
  .regex(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/, 'Image must be a PNG, JPEG or WebP picture');

const EventFields = z.object({
  title: z.string().trim().min(2).max(150),
  description: z.string().trim().max(2000).optional(),
  academicYearId: z.string().min(1),
  category: EventCategoryEnum.default('OTHER'),
  type: EventTypeEnum.default('SINGLE'),
  startDate: isoDate,
  endDate: isoDate.optional(),
  startTime: time.optional(),
  endTime: time.optional(),
  venue: z.string().trim().max(150).optional(),
  audience: z.array(EventAudienceEnum).min(1, 'Choose at least one audience'),
  imageUrl: imageDataUrl.nullable().optional(),
});

interface RangeFields {
  type?: 'SINGLE' | 'MULTIPLE';
  startDate?: string;
  endDate?: string;
  startTime?: string | null;
  endTime?: string | null;
}

function checkRange(d: RangeFields, ctx: z.RefinementCtx) {
  if (d.type === 'MULTIPLE') {
    if (!d.endDate) {
      ctx.addIssue({ code: 'custom', message: 'End date is required for a multi-day event', path: ['endDate'] });
    } else if (d.startDate && d.endDate <= d.startDate) {
      ctx.addIssue({ code: 'custom', message: 'End date must be after the start date', path: ['endDate'] });
    }
  }
  if (d.endTime && !d.startTime) {
    ctx.addIssue({ code: 'custom', message: 'Add a start time too', path: ['startTime'] });
  }
  if (d.startTime && d.endTime && d.endTime <= d.startTime) {
    ctx.addIssue({ code: 'custom', message: 'End time must be after the start time', path: ['endTime'] });
  }
}

export const CreateEventDto = EventFields.extend({
  // Send an in-app notification to everyone in the audience.
  notify: z.boolean().default(true),
}).superRefine(checkRange);

// Updates send the full event (the edit form always has every field), so the
// same cross-field rules apply.
export const UpdateEventDto = EventFields.extend({
  description: z.string().trim().max(2000).nullable().optional(),
  venue: z.string().trim().max(150).nullable().optional(),
  startTime: time.nullable().optional(),
  endTime: time.nullable().optional(),
}).superRefine(checkRange);

export const EventQueryDto = z.object({
  academicYearId: z.string().optional(),
  category: EventCategoryEnum.optional(),
  when: z.enum(['upcoming', 'past', 'all']).default('all'),
});

export const UpcomingEventQueryDto = z.object({
  limit: z.coerce.number().int().min(1).max(20).default(5),
});

export const EventIdParamDto = z.object({
  id: z.string().min(1),
});

export type CreateEventDtoType = z.infer<typeof CreateEventDto>;
export type UpdateEventDtoType = z.infer<typeof UpdateEventDto>;
export type EventQueryDtoType = z.infer<typeof EventQueryDto>;
