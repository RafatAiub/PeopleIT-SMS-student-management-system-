import { prisma } from '../../config/prisma';
import { NotFoundError } from '../../utils/AppError';
import { isMissingSchemaError, withSchemaFallback } from './schemaGuard';
import { computeChecklist, updateSkipped, type OnboardingChecklist, type OnboardingFacts } from './onboarding.logic';

// =============================================================================
// Onboarding — facts are counted live from tenant data; the admin's skip /
// dismiss choices persist in OnboardingProgress (one row per institution).
// =============================================================================

function filled(v: string | null | undefined): boolean {
  return typeof v === 'string' && v.trim().length > 0;
}

async function loadFacts(institutionId: string): Promise<OnboardingFacts> {
  const [institution, academicYears, classes, sections, subjects, teachers, students, feeHeads, gradingScales, notices] =
    await Promise.all([
      prisma.institution.findUnique({
        where: { id: institutionId },
        select: { name: true, phone: true, email: true, address: true, logoUrl: true },
      }),
      prisma.academicYear.count({ where: { institutionId } }),
      prisma.class.count({ where: { branch: { institutionId } } }),
      prisma.section.count({ where: { class: { branch: { institutionId } } } }),
      prisma.subject.count({ where: { institutionId } }),
      prisma.user.count({ where: { institutionId, role: 'TEACHER', isActive: true } }),
      prisma.student.count({ where: { institutionId, status: 'ACTIVE' } }),
      prisma.feeCategory.count({ where: { institutionId } }),
      withSchemaFallback<number | null>('gradingScale', () => prisma.gradingScale.count({ where: { institutionId } }), null),
      prisma.notice.count({ where: { institutionId } }),
    ]);

  if (!institution) throw new NotFoundError('Institution not found');

  return {
    profileComplete:
      filled(institution.name) && filled(institution.phone) && filled(institution.email) && filled(institution.address),
    hasLogo: filled(institution.logoUrl),
    academicYears,
    classes,
    sections,
    subjects,
    teachers,
    students,
    feeHeads,
    gradingScales,
    notices,
  };
}

interface StoredProgress {
  skippedSteps: string[];
  dismissed: boolean;
  persisted: boolean; // false when OnboardingProgress isn't available yet
}

async function loadProgress(institutionId: string): Promise<StoredProgress> {
  try {
    const row = await prisma.onboardingProgress.findUnique({
      where: { institutionId },
      select: { completedSteps: true, dismissed: true },
    });
    return { skippedSteps: row?.completedSteps ?? [], dismissed: row?.dismissed ?? false, persisted: true };
  } catch (error) {
    if (isMissingSchemaError(error)) return { skippedSteps: [], dismissed: false, persisted: false };
    throw error;
  }
}

export type OnboardingResponse = OnboardingChecklist & { persisted: boolean };

export async function getOnboarding(institutionId: string): Promise<OnboardingResponse> {
  const [facts, progress] = await Promise.all([loadFacts(institutionId), loadProgress(institutionId)]);
  return { ...computeChecklist(facts, progress), persisted: progress.persisted };
}

export async function updateOnboarding(
  institutionId: string,
  patch: { dismissed?: boolean; skip?: string; unskip?: string },
): Promise<OnboardingResponse> {
  const current = await loadProgress(institutionId);
  if (!current.persisted) {
    // Migration not applied: nothing to write to. Report the computed state
    // with persisted=false so the UI can fall back to local storage.
    return getOnboarding(institutionId);
  }
  const completedSteps = updateSkipped(current.skippedSteps, patch.skip, patch.unskip);
  const dismissed = patch.dismissed ?? current.dismissed;
  await prisma.onboardingProgress.upsert({
    where: { institutionId },
    create: { institutionId, completedSteps, dismissed },
    update: { completedSteps, dismissed },
    select: { id: true },
  });
  return getOnboarding(institutionId);
}
