import { PrismaClient, StudentGroup, SubjectPaper } from '@prisma/client';

const prisma = new PrismaClient();

type OfferingSeed = {
  name: string;
  paper?: SubjectPaper; // default NONE
  defaultMaxMarks?: number; // default 100
};

type ClassCurriculum = {
  classNames: string[]; // one block can apply to multiple class labels
  group?: StudentGroup; // default NONE
  subjects: OfferingSeed[];
};

/**
 * NCTB-aligned defaults. Confidence varies by block — see the comment above
 * each one. Nothing here touches ExamResult or existing results data; this
 * only populates the new Subject/SubjectOffering tables, and every write
 * below is an upsert so re-running this script is always safe.
 *
 * Verified against current public NCTB/SSC/HSC subject references:
 *  - Class 1: exactly 3 subjects (Bangla, English, Mathematics) — no
 *    separate General Science/Social Science, unlike the old hardcoded
 *    frontend list that applied a 7-subject set uniformly to Class 1-8.
 *  - Class 6: cross-checked against a current textbook list — Bangla/English
 *    are graded as one combined subject each despite spanning multiple
 *    books; "Bangladesh and Global Studies" and "Science" are the correct
 *    subject names (not split into "General Science" + "Social Science").
 *  - SSC (9-10): only Bangla and English split into 1st/2nd paper; Math and
 *    every group subject (Physics, Chemistry, Biology, Higher Math,
 *    Accounting, etc.) are single-paper at this level.
 *  - HSC (11-12): Bangla/English still split; every group subject ALSO
 *    splits into 1st/2nd paper; ICT stays single-paper.
 *
 * NOT independently verified this session — confirm before relying on them:
 *  - KG/Nursery/Junior One and Class 2-5's exact subject lists (extended
 *    from Class 1's verified core using general curriculum knowledge).
 *  - Whether Class 6-8 co-curricular subjects (Arts & Crafts, Music, PE,
 *    Work & Life, Agriculture, Home Science, per-religion Religious
 *    Studies) should be graded — deliberately omitted rather than guessed.
 *  - The exact HSC Arts group elective set (lower confidence than the
 *    Science/Commerce group lists).
 */
const CURRICULUM: ClassCurriculum[] = [
  {
    // Pre-primary, not part of NCTB's numbered curriculum — defaulted to
    // Class 1's core. Confirm these grades even run graded exams.
    classNames: ['KG', 'Nursery', 'Junior One'],
    subjects: [{ name: 'Bangla' }, { name: 'English' }, { name: 'Mathematics' }],
  },
  {
    // Verified for Class 1; Class 2 assumed to match.
    classNames: ['Class 1', 'Class 2'],
    subjects: [{ name: 'Bangla' }, { name: 'English' }, { name: 'Mathematics' }],
  },
  {
    // Not independently verified — confirm with the school's syllabus.
    classNames: ['Class 3', 'Class 4', 'Class 5'],
    subjects: [
      { name: 'Bangla' },
      { name: 'English' },
      { name: 'Mathematics' },
      { name: 'Bangladesh and Global Studies' },
      { name: 'Religious & Moral Education' },
    ],
  },
  {
    // Cross-checked against a current Class 6 textbook list.
    classNames: ['Class 6', 'Class 7', 'Class 8'],
    subjects: [
      { name: 'Bangla' },
      { name: 'English' },
      { name: 'Mathematics' },
      { name: 'Information and Communication Technology' },
      { name: 'Science' },
      { name: 'Bangladesh and Global Studies' },
      { name: 'Religious & Moral Education' },
    ],
  },

  // ── SSC (Class 9-10) — verified ──────────────────────────────────────
  {
    // Compulsory for every SSC student regardless of group.
    classNames: ['Class 9', 'Class 10'],
    subjects: [
      { name: 'Bangla', paper: SubjectPaper.FIRST },
      { name: 'Bangla', paper: SubjectPaper.SECOND },
      { name: 'English', paper: SubjectPaper.FIRST },
      { name: 'English', paper: SubjectPaper.SECOND },
      { name: 'Mathematics' },
      { name: 'Information and Communication Technology' },
      { name: 'Religious & Moral Education' },
    ],
  },
  {
    classNames: ['Class 9', 'Class 10'],
    group: StudentGroup.SCIENCE,
    subjects: [{ name: 'Physics' }, { name: 'Chemistry' }, { name: 'Biology' }, { name: 'Higher Mathematics' }],
  },
  {
    classNames: ['Class 9', 'Class 10'],
    group: StudentGroup.COMMERCE,
    subjects: [
      { name: 'Accounting' },
      { name: 'Finance & Banking' },
      { name: 'Business Entrepreneurship' },
      { name: 'General Science' },
    ],
  },
  {
    classNames: ['Class 9', 'Class 10'],
    group: StudentGroup.ARTS,
    subjects: [{ name: 'History' }, { name: 'Geography' }, { name: 'Economics' }, { name: 'Civics' }],
  },

  // ── HSC (Class 11-12) — verified; new to this app ────────────────────
  {
    classNames: ['Class 11', 'Class 12'],
    subjects: [
      { name: 'Bangla', paper: SubjectPaper.FIRST },
      { name: 'Bangla', paper: SubjectPaper.SECOND },
      { name: 'English', paper: SubjectPaper.FIRST },
      { name: 'English', paper: SubjectPaper.SECOND },
      { name: 'Information and Communication Technology' },
    ],
  },
  {
    classNames: ['Class 11', 'Class 12'],
    group: StudentGroup.SCIENCE,
    subjects: [
      { name: 'Physics', paper: SubjectPaper.FIRST },
      { name: 'Physics', paper: SubjectPaper.SECOND },
      { name: 'Chemistry', paper: SubjectPaper.FIRST },
      { name: 'Chemistry', paper: SubjectPaper.SECOND },
      { name: 'Biology', paper: SubjectPaper.FIRST },
      { name: 'Biology', paper: SubjectPaper.SECOND },
      { name: 'Higher Mathematics', paper: SubjectPaper.FIRST },
      { name: 'Higher Mathematics', paper: SubjectPaper.SECOND },
    ],
  },
  {
    classNames: ['Class 11', 'Class 12'],
    group: StudentGroup.COMMERCE,
    subjects: [
      { name: 'Accounting', paper: SubjectPaper.FIRST },
      { name: 'Accounting', paper: SubjectPaper.SECOND },
      { name: 'Finance & Banking', paper: SubjectPaper.FIRST },
      { name: 'Finance & Banking', paper: SubjectPaper.SECOND },
      { name: 'Business Organization & Management', paper: SubjectPaper.FIRST },
      { name: 'Business Organization & Management', paper: SubjectPaper.SECOND },
      { name: 'Production Management & Marketing', paper: SubjectPaper.FIRST },
      { name: 'Production Management & Marketing', paper: SubjectPaper.SECOND },
    ],
  },
  {
    // Lower confidence than Science/Commerce above — HSC Arts electives vary
    // more between schools; confirm the exact set.
    classNames: ['Class 11', 'Class 12'],
    group: StudentGroup.ARTS,
    subjects: [
      { name: 'History', paper: SubjectPaper.FIRST },
      { name: 'History', paper: SubjectPaper.SECOND },
      { name: 'Economics', paper: SubjectPaper.FIRST },
      { name: 'Economics', paper: SubjectPaper.SECOND },
      { name: 'Civics', paper: SubjectPaper.FIRST },
      { name: 'Civics', paper: SubjectPaper.SECOND },
      { name: 'Sociology', paper: SubjectPaper.FIRST },
      { name: 'Sociology', paper: SubjectPaper.SECOND },
    ],
  },
];

async function main() {
  const institutions = await prisma.institution.findMany({ select: { id: true, name: true } });
  console.log(`Seeding curriculum for ${institutions.length} institution(s)...`);

  for (const inst of institutions) {
    const subjectIdByName = new Map<string, string>();

    for (const block of CURRICULUM) {
      for (const s of block.subjects) {
        if (subjectIdByName.has(s.name)) continue;
        const subject = await prisma.subject.upsert({
          where: { institutionId_name: { institutionId: inst.id, name: s.name } },
          update: {},
          create: { institutionId: inst.id, name: s.name },
        });
        subjectIdByName.set(s.name, subject.id);
      }
    }

    let count = 0;
    for (const block of CURRICULUM) {
      const group = block.group ?? StudentGroup.NONE;
      for (const className of block.classNames) {
        for (let i = 0; i < block.subjects.length; i++) {
          const s = block.subjects[i];
          const subjectId = subjectIdByName.get(s.name)!;
          const paper = s.paper ?? SubjectPaper.NONE;
          await prisma.subjectOffering.upsert({
            where: {
              // Prisma's client API keys this by the field list, not the
              // @@unique's `map:` name — the map name only affects the
              // underlying DB constraint (see schema.prisma).
              institutionId_className_group_subjectId_paper: {
                institutionId: inst.id,
                className,
                group,
                subjectId,
                paper,
              },
            },
            update: {
              defaultMaxMarks: s.defaultMaxMarks ?? 100,
              displayOrder: i,
            },
            create: {
              institutionId: inst.id,
              className,
              group,
              subjectId,
              paper,
              defaultMaxMarks: s.defaultMaxMarks ?? 100,
              displayOrder: i,
            },
          });
          count++;
        }
      }
    }
    console.log(`  ${inst.name}: ${count} subject offerings upserted.`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
