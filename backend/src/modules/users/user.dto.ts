import { z } from 'zod';
import { UserRole } from '@prisma/client';

export const CreateUserSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters long'),
  role: z.nativeEnum(UserRole),
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  phone: z.string().optional().nullable(),
  avatarUrl: z.string().optional().nullable(),
  
  // Student specifics
  rollNumber: z.string().optional().nullable(),
  admissionDate: z.string().optional().nullable(),
  dateOfBirth: z.string().optional().nullable(),
  gender: z.string().optional().nullable(),
  bloodGroup: z.string().optional().nullable(),
  religion: z.string().optional().nullable(),
  nationality: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  classId: z.string().optional().nullable(),
  sectionId: z.string().optional().nullable(),

  // Teacher specifics
  qualification: z.string().optional().nullable(),
  subjectExpertise: z.string().optional().nullable(),
  joiningDate: z.string().optional().nullable(),
});

export const UpdateUserSchema = CreateUserSchema.partial().omit({ password: true });

export const ChangePasswordSchema = z.object({
  oldPassword: z.string().min(1, 'Old password is required'),
  newPassword: z.string().min(8, 'New password must be at least 8 characters long'),
});
