// Standard grading bands. Server-computed so every report card is
// consistent — grade is never trusted as client input (see results.service.ts).
export function computeGrade(marksObtained: number, maxMarks: number): string {
  const percentage = maxMarks > 0 ? (marksObtained / maxMarks) * 100 : 0;
  if (percentage >= 80) return 'A+';
  if (percentage >= 70) return 'A';
  if (percentage >= 60) return 'A-';
  if (percentage >= 50) return 'B';
  if (percentage >= 40) return 'C';
  if (percentage >= 33) return 'D';
  return 'F';
}
