import { z } from 'zod';

export const CreateVehicleDto = z.object({
  registrationNumber: z.string().min(1, 'Registration number is required'),
  capacity: z.preprocess((val) => {
    if (val === undefined || val === null || val === '') return undefined;
    const num = Number(val);
    return isNaN(num) ? val : num;
  }, z.number().int().min(1, 'Capacity must be at least 1')),
  driverName: z.string().min(1, 'Driver name is required'),
  driverPhone: z.string().optional().nullable(),
});
export type CreateVehicleInput = z.infer<typeof CreateVehicleDto>;

const RouteBaseDto = z.object({
  name: z.string().min(1, 'Route name is required'),
  stops: z
    .preprocess((val) => {
      if (val === undefined || val === null || val === '') return undefined;
      if (typeof val === 'number') return String(val);
      if (Array.isArray(val)) return val.join(', ');
      return String(val);
    }, z.string())
    .optional()
    .nullable(),
  startPoint: z.string().optional().nullable(),
  endPoint: z.string().optional().nullable(),
  distance: z
    .preprocess((val) => {
      if (val === undefined || val === null || val === '') return undefined;
      return String(val);
    }, z.string())
    .optional()
    .nullable(),
  vehicleId: z.string().optional().nullable(),
  routeFare: z
    .preprocess((val) => {
      if (val === undefined || val === null || val === '') return 0;
      const num = Number(val);
      return isNaN(num) ? 0 : num;
    }, z.number().min(0))
    .default(0),
  fare: z
    .preprocess((val) => {
      if (val === undefined || val === null || val === '') return undefined;
      const num = Number(val);
      return isNaN(num) ? 0 : num;
    }, z.number().min(0))
    .optional()
    .nullable(),
  isActive: z.boolean().optional().default(true),
});

function normalizeRoute(data: Partial<z.infer<typeof RouteBaseDto>>) {
  let finalStops = data.stops?.trim();
  if (!finalStops && (data.startPoint || data.endPoint)) {
    finalStops = [data.startPoint?.trim(), data.endPoint?.trim()].filter(Boolean).join(' -> ');
  }
  const finalFare = data.routeFare ?? data.fare ?? 0;
  return {
    name: data.name,
    stops: finalStops || 'Direct Route',
    routeFare: finalFare,
    isActive: data.isActive ?? true,
  };
}

export const CreateRouteDto = RouteBaseDto.transform((data) => ({
  ...normalizeRoute(data),
  name: data.name,
}));
export type CreateRouteInput = z.infer<typeof CreateRouteDto>;

// Update reuses the same shape/normalization as create — the edit form
// resubmits the whole route, not a partial patch. All fields are optional
// here purely so a partial PUT body doesn't fail validation; Prisma treats
// an `undefined` field as "leave unchanged".
export const UpdateRouteDto = RouteBaseDto.partial().transform((data) => normalizeRoute(data));
export type UpdateRouteInput = z.infer<typeof UpdateRouteDto>;

export const UpdateVehicleDto = CreateVehicleDto.partial();
export type UpdateVehicleInput = z.infer<typeof UpdateVehicleDto>;

export const CreateAssignmentDto = z.object({
  studentId: z.string().min(1, 'Student ID is required'),
  routeId: z.string().min(1, 'Route ID is required'),
  vehicleId: z.string().min(1, 'Vehicle ID is required'),
  pickupPoint: z.string().optional().nullable(),
  // Wave C — structured stop on the chosen route (optional; free-text
  // pickupPoint stays for schools that don't use structured stops).
  stopId: z.string().min(1).optional().nullable(),
});
export type CreateAssignmentInput = z.infer<typeof CreateAssignmentDto>;

// ── Wave C ──────────────────────────────────────────────────────────────────
export const UpdateAssignmentDto = z.object({
  routeId: z.string().min(1).optional(),
  vehicleId: z.string().min(1).optional(),
  pickupPoint: z.string().optional().nullable(),
  stopId: z.string().min(1).optional().nullable(),
});
export type UpdateAssignmentInput = z.infer<typeof UpdateAssignmentDto>;

const hhmm = z
  .string()
  .trim()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Time must be HH:mm (24-hour)');
const optTime = z.union([hhmm, z.literal('')]).optional().nullable().transform((v) => (v ? v : v === '' ? null : v));
const lat = z.coerce.number().min(-90, 'Latitude must be between -90 and 90').max(90, 'Latitude must be between -90 and 90');
const lng = z.coerce.number().min(-180, 'Longitude must be between -180 and 180').max(180, 'Longitude must be between -180 and 180');

export const StopFieldsDto = z
  .object({
    name: z.string().trim().min(1, 'Stop name is required').max(150),
    pickupTime: optTime,
    dropTime: optTime,
    lat: lat.optional().nullable(),
    lng: lng.optional().nullable(),
  })
  .refine((d) => (d.lat === undefined || d.lat === null) === (d.lng === undefined || d.lng === null), {
    message: 'Enter both latitude and longitude, or neither',
    path: ['lng'],
  });
export const UpdateStopDto = z
  .object({
    name: z.string().trim().min(1, 'Stop name is required').max(150).optional(),
    pickupTime: optTime,
    dropTime: optTime,
    lat: lat.optional().nullable(),
    lng: lng.optional().nullable(),
  })
  .refine((d) => (d.lat === undefined) === (d.lng === undefined) && (d.lat === null) === (d.lng === null), {
    message: 'Update latitude and longitude together',
    path: ['lng'],
  });
export type StopFieldsInput = z.infer<typeof StopFieldsDto>;
export type UpdateStopInput = z.infer<typeof UpdateStopDto>;

export const ReorderStopsDto = z.object({
  stopIds: z.array(z.string().min(1)).max(200),
});

export const IdParamDto = z.object({ id: z.string().min(1, 'Invalid ID') });
export const StopIdParamDto = z.object({ stopId: z.string().min(1, 'Invalid stop ID') });

export const VehicleLocationDto = z.object({
  lat,
  lng,
  // Optional device timestamp; defaults to server time. Future-dated
  // readings are rejected so a bad device clock can't pin "last seen".
  recordedAt: z
    .string()
    .datetime()
    .optional()
    .refine((v) => !v || new Date(v).getTime() <= Date.now() + 5 * 60 * 1000, 'recordedAt cannot be in the future'),
});
export type VehicleLocationInput = z.infer<typeof VehicleLocationDto>;

export const TransportFeeDto = z.object({
  period: z.string().trim().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Period must be YYYY-MM'),
  dueDate: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, 'Due date must be YYYY-MM-DD'),
  feeCategoryId: z.string().min(1).optional().nullable(),
  routeId: z.string().min(1).optional().nullable(),
});
export type TransportFeeInput = z.infer<typeof TransportFeeDto>;
