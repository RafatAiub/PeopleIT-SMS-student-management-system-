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

export const CreateRouteDto = z.object({
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
}).transform((data) => {
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
});

export type CreateRouteInput = z.infer<typeof CreateRouteDto>;

export const CreateAssignmentDto = z.object({
  studentId: z.string().min(1, 'Student ID is required'),
  routeId: z.string().min(1, 'Route ID is required'),
  vehicleId: z.string().min(1, 'Vehicle ID is required'),
  pickupPoint: z.string().optional().nullable(),
});
export type CreateAssignmentInput = z.infer<typeof CreateAssignmentDto>;
