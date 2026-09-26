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
});
export type CreateAssignmentInput = z.infer<typeof CreateAssignmentDto>;
