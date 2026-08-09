import * as curriculumRepository from './curriculum.repository';
import { StudentGroup } from '@prisma/client';

export async function getSubjectOfferings(institutionId: string, className: string, group?: StudentGroup) {
  const offerings = await curriculumRepository.findOfferingsByClass(institutionId, className, group);

  return offerings.map((o) => ({
    id: o.id,
    subjectName: o.subject.name,
    paper: o.paper,
    // Folds the paper into a single label (e.g. "Bangla 1st Paper") since
    // ExamResult.subject has always been one free-text string — callers
    // save/read marks against this label, same shape as before.
    label:
      o.paper === 'FIRST'
        ? `${o.subject.name} 1st Paper`
        : o.paper === 'SECOND'
          ? `${o.subject.name} 2nd Paper`
          : o.subject.name,
    defaultMaxMarks: Number(o.defaultMaxMarks),
    group: o.group,
    displayOrder: o.displayOrder,
  }));
}
