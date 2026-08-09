import request from 'supertest';
import { UserRole } from '@prisma/client';
import app from '../src/app';
import {
  createTestInstitution,
  cleanupInstitution,
  disconnectFixtures,
  prisma,
  InstitutionFixture,
} from './helpers/fixtures';

// 1x1 transparent PNG — valid, tiny, exercises the real logo-drawing path.
const TINY_PNG_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
// A syntactically-valid data URL but in a format pdfkit cannot decode —
// exercises the graceful-skip fallback so a bad/legacy logo never 500s.
const FAKE_WEBP_DATA_URL = 'data:image/webp;base64,UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==';

async function submitReportCardFixtures(institutionId: string, studentId: string, teacherToken: string) {
  const examRes = await request(app)
    .post('/api/v1/results')
    .set('Authorization', `Bearer ${teacherToken}`)
    .send({ name: 'Report Card Test Exam', startDate: '2026-04-01', endDate: '2026-04-15' });
  expect(examRes.status).toBe(201);
  const examId = examRes.body.data.id;

  const submitRes = await request(app)
    .post('/api/v1/results/submit')
    .set('Authorization', `Bearer ${teacherToken}`)
    .send({
      examId,
      results: [
        { studentId, subject: 'Mathematics', marksObtained: 85, maxMarks: 100 },
        { studentId, subject: 'English', marksObtained: 72, maxMarks: 100 },
      ],
    });
  expect(submitRes.status).toBe(201);

  return examId;
}

describe('Report card PDF generation (pdfkit, no headless browser)', () => {
  let fixture: InstitutionFixture;
  let examId: string;

  beforeAll(async () => {
    fixture = await createTestInstitution('report-card-pdf');
    examId = await submitReportCardFixtures(
      fixture.institutionId,
      fixture.studentId,
      fixture.usersByRole[UserRole.TEACHER].token,
    );
  }, 30_000);

  afterAll(async () => {
    await cleanupInstitution(fixture);
    await disconnectFixtures();
  }, 30_000);

  async function fetchReportCardBuffer(token: string) {
    return request(app)
      .get(`/api/v1/results/${fixture.studentId}/report-card`)
      .query({ examId })
      .set('Authorization', `Bearer ${token}`)
      .buffer(true)
      .parse((response, callback) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => chunks.push(chunk));
        response.on('end', () => callback(null, Buffer.concat(chunks)));
      });
  }

  it('returns a valid PDF buffer with no institution logo set', async () => {
    const res = await fetchReportCardBuffer(fixture.usersByRole[UserRole.ADMIN].token);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('application/pdf');
    expect(res.body.subarray(0, 5).toString('ascii')).toBe('%PDF-');
    expect(res.body.length).toBeGreaterThan(500);
  }, 20_000);

  it('still returns a valid PDF when the institution has a real PNG logo', async () => {
    await prisma.institution.update({ where: { id: fixture.institutionId }, data: { logoUrl: TINY_PNG_DATA_URL } });
    const res = await fetchReportCardBuffer(fixture.usersByRole[UserRole.ADMIN].token);
    expect(res.status).toBe(200);
    expect(res.body.subarray(0, 5).toString('ascii')).toBe('%PDF-');
  }, 20_000);

  it('gracefully skips an unsupported (e.g. legacy WebP) logo instead of crashing', async () => {
    await prisma.institution.update({ where: { id: fixture.institutionId }, data: { logoUrl: FAKE_WEBP_DATA_URL } });
    const res = await fetchReportCardBuffer(fixture.usersByRole[UserRole.ADMIN].token);
    expect(res.status).toBe(200);
    expect(res.body.subarray(0, 5).toString('ascii')).toBe('%PDF-');
  }, 20_000);

  it('student can download their own report card', async () => {
    const res = await fetchReportCardBuffer(fixture.usersByRole[UserRole.STUDENT].token);
    expect(res.status).toBe(200);
    expect(res.body.subarray(0, 5).toString('ascii')).toBe('%PDF-');
  }, 20_000);
});
