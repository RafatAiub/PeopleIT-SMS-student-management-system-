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

describe('Timetable PDF export + exact-match/update-validation fixes', () => {
  let fixture: InstitutionFixture;
  let teacherId: string;
  let branchId: string;
  let classOneId: string;
  let classTenId: string;
  const createdSlotIds: string[] = [];

  beforeAll(async () => {
    fixture = await createTestInstitution('tt-pdf-fixes');

    const teacher = await prisma.teacher.create({
      data: { userId: fixture.usersByRole[UserRole.TEACHER].userId },
    });
    teacherId = teacher.id;

    // Force self-heal of Branch + default Class rows (includes "Class 1" and "Class 10").
    const metaRes = await request(app)
      .get('/api/v1/students/meta/classes')
      .set('Authorization', `Bearer ${fixture.usersByRole[UserRole.ADMIN].token}`);
    branchId = metaRes.body.data[0].branchId;
    classOneId = metaRes.body.data.find((c: any) => c.name === 'Class 1').id;
    classTenId = metaRes.body.data.find((c: any) => c.name === 'Class 10').id;
    expect(classOneId).toBeTruthy();
    expect(classTenId).toBeTruthy();
  }, 30_000);

  afterAll(async () => {
    for (const id of createdSlotIds) {
      await prisma.timetableSlot.delete({ where: { id } }).catch(() => {});
    }
    await prisma.teacher.delete({ where: { id: teacherId } }).catch(() => {});
    await cleanupInstitution(fixture);
    await disconnectFixtures();
  }, 30_000);

  it('exact-match: filtering by "Class 1" does not also return "Class 10" slots', async () => {
    const slotOne = await request(app)
      .post('/api/v1/timetables')
      .set('Authorization', `Bearer ${fixture.usersByRole[UserRole.ADMIN].token}`)
      .send({
        branchId,
        className: 'Class 1',
        sectionName: 'A',
        dayOfWeek: 'MONDAY',
        startTime: '09:00',
        endTime: '09:45',
        subject: 'Mathematics',
        teacherUserId: fixture.usersByRole[UserRole.TEACHER].userId,
      });
    expect(slotOne.status).toBe(201);
    createdSlotIds.push(slotOne.body.data.id);

    const slotTen = await request(app)
      .post('/api/v1/timetables')
      .set('Authorization', `Bearer ${fixture.usersByRole[UserRole.ADMIN].token}`)
      .send({
        branchId,
        className: 'Class 10',
        sectionName: 'A',
        dayOfWeek: 'MONDAY',
        // Different period than the "Class 1" slot above — same teacher
        // can't legitimately teach two classes at once, so reusing 09:00
        // would (correctly) trip the teacher-conflict check instead of
        // exercising the exact-match filter this test is actually about.
        startTime: '10:30',
        endTime: '11:15',
        subject: 'Physics',
        teacherUserId: fixture.usersByRole[UserRole.TEACHER].userId,
      });
    expect(slotTen.status).toBe(201);
    createdSlotIds.push(slotTen.body.data.id);

    const res = await request(app)
      .get('/api/v1/timetables')
      .query({ className: 'Class 1', sectionName: 'A' })
      .set('Authorization', `Bearer ${fixture.usersByRole[UserRole.ADMIN].token}`);

    expect(res.status).toBe(200);
    const subjects = res.body.data.map((s: any) => s.subject);
    expect(subjects).toContain('Mathematics');
    expect(subjects).not.toContain('Physics');
    expect(res.body.data.every((s: any) => s.className === 'Class 1')).toBe(true);
  }, 20_000);

  it('PDF export: GET /timetables/pdf returns a valid PDF buffer for a class/section', async () => {
    const res = await request(app)
      .get('/api/v1/timetables/pdf')
      .query({ className: 'Class 1', sectionName: 'A' })
      .set('Authorization', `Bearer ${fixture.usersByRole[UserRole.ADMIN].token}`)
      .buffer(true)
      .parse((response, callback) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => chunks.push(chunk));
        response.on('end', () => callback(null, Buffer.concat(chunks)));
      });

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('application/pdf');
    expect(Buffer.isBuffer(res.body)).toBe(true);
    expect(res.body.subarray(0, 5).toString('ascii')).toBe('%PDF-');
  }, 20_000);

  it('PDF export: requires className+sectionName, teacherUserId, or studentUserId', async () => {
    const res = await request(app)
      .get('/api/v1/timetables/pdf')
      .set('Authorization', `Bearer ${fixture.usersByRole[UserRole.ADMIN].token}`);
    expect(res.status).toBe(400);
  }, 20_000);

  it('update validation: PUT that only moves startTime past the existing endTime is rejected', async () => {
    const created = await request(app)
      .post('/api/v1/timetables')
      .set('Authorization', `Bearer ${fixture.usersByRole[UserRole.ADMIN].token}`)
      .send({
        branchId,
        className: 'Class 1',
        sectionName: 'B',
        dayOfWeek: 'TUESDAY',
        startTime: '09:00',
        endTime: '09:45',
        subject: 'Chemistry',
        teacherUserId: fixture.usersByRole[UserRole.TEACHER].userId,
      });
    expect(created.status).toBe(201);
    createdSlotIds.push(created.body.data.id);

    const updated = await request(app)
      .put(`/api/v1/timetables/${created.body.data.id}`)
      .set('Authorization', `Bearer ${fixture.usersByRole[UserRole.ADMIN].token}`)
      .send({ startTime: '10:00' }); // endTime stays 09:45 -> invalid range

    expect(updated.status).toBe(400);
    expect(updated.body.message).toContain('End time must be after start time');
  }, 20_000);

  it('teacher conflict check: same teacher CAN take different subjects the same day at non-overlapping periods', async () => {
    const morning = await request(app)
      .post('/api/v1/timetables')
      .set('Authorization', `Bearer ${fixture.usersByRole[UserRole.ADMIN].token}`)
      .send({
        branchId,
        className: 'Class 1',
        sectionName: 'C',
        dayOfWeek: 'WEDNESDAY',
        startTime: '09:00',
        endTime: '09:45',
        subject: 'Mathematics',
        teacherUserId: fixture.usersByRole[UserRole.TEACHER].userId,
      });
    expect(morning.status).toBe(201);
    createdSlotIds.push(morning.body.data.id);

    const laterSameDay = await request(app)
      .post('/api/v1/timetables')
      .set('Authorization', `Bearer ${fixture.usersByRole[UserRole.ADMIN].token}`)
      .send({
        branchId,
        className: 'Class 1',
        sectionName: 'D',
        dayOfWeek: 'WEDNESDAY',
        startTime: '10:30',
        endTime: '11:15',
        subject: 'General Science',
        teacherUserId: fixture.usersByRole[UserRole.TEACHER].userId,
      });
    expect(laterSameDay.status).toBe(201);
    createdSlotIds.push(laterSameDay.body.data.id);

    // The boundary is real, not blanket-permissive: the same teacher CANNOT
    // be double-booked at an overlapping time on that same day.
    const overlapping = await request(app)
      .post('/api/v1/timetables')
      .set('Authorization', `Bearer ${fixture.usersByRole[UserRole.ADMIN].token}`)
      .send({
        branchId,
        className: 'Class 1',
        sectionName: 'E',
        dayOfWeek: 'WEDNESDAY',
        startTime: '09:15',
        endTime: '10:00',
        subject: 'English',
        teacherUserId: fixture.usersByRole[UserRole.TEACHER].userId,
      });
    expect(overlapping.status).toBe(400);
    expect(overlapping.body.message).toContain('Teacher schedule conflict');
  }, 20_000);
});
