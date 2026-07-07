import { z } from 'zod';

export const CreateVehicleDto = z.object({
  registrationNumber: z.string().min(1, 'Registration number is required'),
  capacity: z.number().int().min(1, 'Capacity must be at least 1'),
  driverName: z.string().min(1, 'Driver name is required'),
  driverPhone: z.string().optional(),
});
export type CreateVehicleInput = z.infer<typeof CreateVehicleDto>;

export const CreateRouteDto = z.object({
  name: z.string().min(1, 'Route name is required'),
  stops: z.string().min(1, 'Stops are required'),
  routeFare: z.number().min(0).default(0),
});
export type CreateRouteInput = z.infer<typeof CreateRouteDto>;

export const CreateAssignmentDto = z.object({
  studentId: z.string().min(1, 'Student ID is required'),
  routeId: z.string().min(1, 'Route ID is required'),
  vehicleId: z.string().min(1, 'Vehicle ID is required'),
  pickupPoint: z.string().optional(),
});
export type CreateAssignmentInput = z.infer<typeof CreateAssignmentDto>;
