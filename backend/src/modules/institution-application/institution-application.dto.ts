import { z } from 'zod';

const bdMobilePhoneSchema = z
  .string()
  .trim()
  .refine(
    (val) => {
      if (!val) return true;
      const digitsOnly = val.replace(/\D/g, '');
      return digitsOnly.length >= 11;
    },
    { message: 'Mobile number must have at least 11 digits (e.g., 01700000000)' },
  )
  .refine(
    (val) => {
      if (!val) return true;
      const digitsOnly = val.replace(/\D/g, '');
      return digitsOnly.length <= 13;
    },
    { message: 'Mobile number cannot exceed 13 digits' },
  )
  .refine(
    (val) => {
      if (!val) return true;
      const digitsOnly = val.replace(/\D/g, '');
      const has01 = /^01[0-9]{9}$/.test(digitsOnly);
      const has8801 = /^8801[0-9]{9}$/.test(digitsOnly);
      return has01 || has8801;
    },
    {
      message:
        'Enter a valid BD mobile number (01XXXXXXXXX or +8801XXXXXXXXX). Valid operators: Grameenphone, Banglalink, Robi, Airtel, TeletalkBD',
    },
  )
  .refine(
    (val) => {
      if (!val) return true;
      const digitsOnly = val.replace(/\D/g, '');
      const localFormat = /^01[0-9]{9}$/.test(digitsOnly);
      if (!localFormat && !/^8801[0-9]{9}$/.test(digitsOnly)) return false;
      const secondDigit = localFormat ? digitsOnly[2] : digitsOnly[3];
      const validOperators = ['0', '2', '3', '4', '5', '6', '7', '8', '9'];
      return validOperators.includes(secondDigit);
    },
    { message: 'Enter a valid operator prefix (01[0-9]XXXXXXXX)' },
  );

const institutionPhoneSchema = z
  .string()
  .trim()
  .refine(
    (val) => {
      if (!val) return true;
      const digitsOnly = val.replace(/\D/g, '');
      return digitsOnly.length >= 7;
    },
    { message: 'Phone number must have at least 7 digits' },
  )
  .refine(
    (val) => {
      if (!val) return true;
      return /^\+?[-0-9\s()]*$/.test(val);
    },
    { message: 'Phone number can only contain digits, +, -, (), and spaces' },
  )
  .refine(
    (val) => val.length <= 25,
    { message: 'Phone number is too long' },
  );

export const SubmitApplicationDto = z.object({
  institutionName: z
    .string()
    .trim()
    .min(2, 'Institution name must be at least 2 characters')
    .max(200, 'Institution name must not exceed 200 characters')
    .refine(
      (val) => /^[a-zA-Z0-9\s\-&.,()]*$/.test(val),
      { message: 'Institution name contains invalid characters' },
    ),

  slug: z
    .string()
    .trim()
    .regex(/^\d+$/, 'Institution Code / EIIN must be a numeric value')
    .refine(
      (val) => val.length >= 4 && val.length <= 10,
      { message: 'Institution Code / EIIN must be between 4 and 10 digits' },
    ),

  address: z
    .string()
    .trim()
    .max(500, 'Address must not exceed 500 characters')
    .optional()
    .or(z.literal('')),

  phone: institutionPhoneSchema.optional().or(z.literal('')),

  applicantFirstName: z
    .string()
    .trim()
    .min(1, 'First name is required')
    .max(100, 'First name must not exceed 100 characters')
    .refine(
      (val) => /^[a-zA-Z\s\-']*$/.test(val),
      { message: 'First name should only contain letters, spaces, hyphens, and apostrophes' },
    ),

  applicantLastName: z
    .string()
    .trim()
    .min(1, 'Last name is required')
    .max(100, 'Last name must not exceed 100 characters')
    .refine(
      (val) => /^[a-zA-Z\s\-']*$/.test(val),
      { message: 'Last name should only contain letters, spaces, hyphens, and apostrophes' },
    ),

  applicantEmail: z
    .string()
    .trim()
    .toLowerCase()
    .email('Please enter a valid email address (e.g., name@example.com)')
    .refine(
      (val) => val.length <= 255,
      { message: 'Email address must not exceed 255 characters' },
    ),

  applicantPhone: bdMobilePhoneSchema.optional().or(z.literal('')),

  message: z
    .string()
    .trim()
    .max(2000, 'Message must not exceed 2000 characters')
    .optional()
    .or(z.literal('')),
});

export type SubmitApplicationDtoType = z.infer<typeof SubmitApplicationDto>;

export const RejectApplicationDto = z.object({
  reason: z.string().trim().min(5, 'Reason must be at least 5 characters').max(1000),
});

export type RejectApplicationDtoType = z.infer<typeof RejectApplicationDto>;
