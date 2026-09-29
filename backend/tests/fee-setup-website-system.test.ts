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

describe('Fee setup, custom notifications, website items, system info', () => {
  let inst: InstitutionFixture;
  let other: InstitutionFixture;
  let adminToken: string;
  let otherAdminToken: string;
  let branchId: string;
  let classId: string;
  let feeCategoryId: string;

  beforeAll(async () => {
    inst = await createTestInstitution('fee-web-sys');
    other = await createTestInstitution('fee-web-sys-other');
    adminToken = inst.usersByRole[UserRole.ADMIN].token;
    otherAdminToken = other.usersByRole[UserRole.ADMIN].token;
    const branch = await prisma.branch.create({ data: { institutionId: inst.institutionId, name: 'Main' } });
    branchId = branch.id;
    classId = (await prisma.class.create({ data: { branchId, name: 'FWS Class 1', level: 1 } })).id;
    feeCategoryId = (
      await prisma.feeCategory.create({
        data: { institutionId: inst.institutionId, name: 'Exam Fee', amount: 500, frequency: 'ONE_TIME' },
      })
    ).id;
  });

  afterAll(async () => {
    await prisma.classFee.deleteMany({ where: { institutionId: { in: [inst.institutionId, other.institutionId] } } });
    await prisma.feeCategory.deleteMany({ where: { id: feeCategoryId } });
    await prisma.class.deleteMany({ where: { id: classId } });
    await prisma.branch.deleteMany({ where: { id: branchId } });
    await prisma.websiteItem.deleteMany({ where: { institutionId: { in: [inst.institutionId, other.institutionId] } } });
    await prisma.notification.deleteMany({ where: { institutionId: { in: [inst.institutionId, other.institutionId] }, type: 'CUSTOM' } });
    await prisma.notificationBroadcast.deleteMany({ where: { institutionId: { in: [inst.institutionId, other.institutionId] } } });
    await cleanupInstitution(inst);
    await cleanupInstitution(other);
    await disconnectFixtures();
  });

  it('assigns, edits and lists class fees', async () => {
    const put = await request(app)
      .put('/api/v1/fee-setup/class-fees')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ classId, items: [{ feeCategoryId, amount: 750 }] });
    expect(put.status).toBe(200);
    expect(put.body.data).toHaveLength(1);
    expect(Number(put.body.data[0].amount)).toBe(750);

    const edit = await request(app)
      .put('/api/v1/fee-setup/class-fees')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ classId, items: [{ feeCategoryId, amount: 900 }] });
    expect(edit.status).toBe(200);
    expect(Number(edit.body.data[0].amount)).toBe(900);
    expect(await prisma.classFee.count({ where: { classId } })).toBe(1);
  });

  it('rejects assigning fees to another institution\'s class', async () => {
    const res = await request(app)
      .put('/api/v1/fee-setup/class-fees')
      .set('Authorization', `Bearer ${otherAdminToken}`)
      .send({ classId, items: [{ feeCategoryId, amount: 100 }] });
    expect(res.status).toBe(404);
  });

  it('lists payment transactions (empty is fine)', async () => {
    const res = await request(app).get('/api/v1/fee-setup/payments').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('sends a custom notification to a target group and deletes it from inboxes', async () => {
    const send = await request(app)
      .post('/api/v1/notifications/custom')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'Holiday', body: 'School closed tomorrow', target: 'TEACHER' });
    expect(send.status).toBe(201);
    const teacherId = inst.usersByRole[UserRole.TEACHER].userId;
    expect(send.body.data.recipientCount).toBeGreaterThanOrEqual(1);
    expect(await prisma.notification.count({ where: { recipientUserId: teacherId, type: 'CUSTOM' } })).toBe(1);

    const del = await request(app)
      .delete(`/api/v1/notifications/custom/${send.body.data.id}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(del.status).toBe(200);
    expect(await prisma.notification.count({ where: { recipientUserId: teacherId, type: 'CUSTOM' } })).toBe(0);
  });

  it('forbids non-admins from sending custom notifications', async () => {
    const res = await request(app)
      .post('/api/v1/notifications/custom')
      .set('Authorization', `Bearer ${inst.usersByRole[UserRole.TEACHER].token}`)
      .send({ title: 'x', body: 'y', target: 'ALL' });
    expect(res.status).toBe(403);
  });

  it('manages website items per type and blocks unsafe URLs and other tenants', async () => {
    const created = await request(app)
      .post('/api/v1/website-items')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ type: 'FAQ', title: 'When does school start?', description: '8 AM' });
    expect(created.status).toBe(201);

    const list = await request(app).get('/api/v1/website-items?type=FAQ').set('Authorization', `Bearer ${adminToken}`);
    expect(list.body.data.map((i: any) => i.id)).toContain(created.body.data.id);

    const unsafe = await request(app)
      .post('/api/v1/website-items')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ type: 'VIDEO', title: 'x', mediaUrl: 'javascript:alert(1)' });
    expect(unsafe.status).toBe(422);

    const crossTenant = await request(app)
      .delete(`/api/v1/website-items/${created.body.data.id}`)
      .set('Authorization', `Bearer ${otherAdminToken}`);
    expect(crossTenant.status).toBe(404);
  });

  it('reports system info to admins', async () => {
    const res = await request(app).get('/api/v1/system/info').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.version).toBeTruthy();
    expect(res.body.data.appliedMigrations).toBeGreaterThan(0);
  });
});
