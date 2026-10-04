import { z } from 'zod';
import { ONBOARDING_STEP_KEYS } from './onboarding.logic';

const stepKey = z.string().refine((k) => ONBOARDING_STEP_KEYS.includes(k), 'Unknown onboarding step');

export const UpdateOnboardingDto = z
  .object({
    dismissed: z.boolean().optional(),
    skip: stepKey.optional(),
    unskip: stepKey.optional(),
  })
  .refine((d) => d.dismissed !== undefined || d.skip !== undefined || d.unskip !== undefined, {
    message: 'Nothing to update',
  });

export type UpdateOnboardingDtoType = z.infer<typeof UpdateOnboardingDto>;
