// P2 — route wiring, roles and tenant isolation over HTTP.
jest.mock('../src/modules/notifications/notifications.service', () => ({
  __esModule: true,
  notifySafe: jest.fn(),
  notify: jest.fn(),
  buildDedupeKey: (...p: string[]) => p.join(':'),
}));

import request from 'supertest';
import { UserRole } from '@prisma/client';
import app from '../src/app';
import { disconnectFixtures, prisma } from './helpers/fixtures';
import { makeInvoice, p2Cleanup, p2Setup, type P2Fixture } from './helpers/p2-fees-fixtures';

jest.setTimeout(180000);

describe('P2 routes', () => {
  let p: P2Fixture;
  let other: P2Fixture;
  const tok = (f: P2Fixture, r: UserRole) => `Bearer ${f.fx.usersByRole[r].token}`;

  beforeAll(async () => {
    p = await p2Setup(`p2-routes-${Date.now()}`);
    other = await p2Setup(`p2-routes-b-${Date.now()}`);
  }, 120000);

  afterAll(async () => {
    await p2Cleanup(p);
    await p2Cleanup(other);
    await disconnectFixtures();
  }, 120000);

  it('settings: staff read, only ADMIN writes', async () => {
    const get = await request(app).get('/api/v1/fees/settings/monthly').set('Authorization', tok(p, UserRole.ACCOUNTANT));
    expect(get.status).toBe(200);
    expect(get.body.data.dueDay).toBe(10);
    expect(get.body.data.effectiveMonthlyCategories.map((c: { id: string }) => c.id).sort()).toEqual([p.tuitionId, p.transportId].sort());
    const denied = await request(app).put('/api/v1/fees/settings/monthly').set('Authorization', tok(p, UserRole.ACCOUNTANT)).send({ dueDay: 5 });
    expect(denied.status).toBe(403);
    const ok = await request(app).put('/api/v1/fees/settings/monthly').set('Authorization', tok(p, UserRole.ADMIN)).send({ dueDay: 5, autoGenerate: true });
    expect(ok.status).toBe(200);
    expect(ok.body.data.dueDay).toBe(5);
  });

  it('counter is staff-only; preview and generate work without background jobs', async () => {
    expect((await request(app).get('/api/v1/fees/counter/search?q=Test').set('Authorization', tok(p, UserRole.GUARDIAN))).status).toBe(403);
    expect((await request(app).get('/api/v1/fees/counter/search?q=Test').set('Authorization', tok(p, UserRole.TEACHER))).status).toBe(403);
    const s = await request(app).get('/api/v1/fees/counter/search?q=Test').set('Authorization', tok(p, UserRole.ACCOUNTANT));
    expect(s.status).toBe(200);
    expect(s.body.data.some((x: { id: string }) => x.id === p.fx.studentId)).toBe(true);

    const pv = await request(app).post('/api/v1/fees/monthly/preview').set('Authorization', tok(p, UserRole.ACCOUNTANT)).send({ period: '2027-09' });
    expect(pv.status).toBe(200);
    expect(pv.body.data.invoiceCount).toBe(1);
    const gen = await request(app).post('/api/v1/fees/monthly/generate').set('Authorization', tok(p, UserRole.ACCOUNTANT)).send({ period: '2027-09' });
    expect(gen.status).toBe(201);
    expect(gen.body.data.createdCount).toBe(1);
    const bad = await request(app).post('/api/v1/fees/monthly/preview').set('Authorization', tok(p, UserRole.ACCOUNTANT)).send({ period: '2027-13' });
    expect(bad.status).toBe(422);
  });

  it('reverse is ADMIN only; tenant isolation on payments and invoices', async () => {
    const inv = await makeInvoice(p, p.fx.studentId, 400, { dueDate: new Date(Date.now() + 86400000) });
    const col = await request(app)
      .post('/api/v1/fees/counter/collect')
      .set('Authorization', tok(p, UserRole.ACCOUNTANT))
      .send({ studentId: p.fx.studentId, allocations: [{ invoiceId: inv.id, amount: 400 }], method: 'CASH' });
    expect(col.status).toBe(201);
    const paymentId = col.body.data.payments[0].paymentId;

    const acc = await request(app).post(`/api/v1/fees/payments/${paymentId}/reverse`).set('Authorization', tok(p, UserRole.ACCOUNTANT)).send({ reason: 'Mistake here' });
    expect(acc.status).toBe(403);
    const foreign = await request(app).post(`/api/v1/fees/payments/${paymentId}/reverse`).set('Authorization', tok(other, UserRole.ADMIN)).send({ reason: 'Not mine' });
    expect(foreign.status).toBe(404);
    const foreignCancel = await request(app).post(`/api/v1/fees/invoices/${inv.id}/cancel`).set('Authorization', tok(other, UserRole.ADMIN)).send({ reason: 'Not mine' });
    expect(foreignCancel.status).toBe(404);
    const ok = await request(app).post(`/api/v1/fees/payments/${paymentId}/reverse`).set('Authorization', tok(p, UserRole.ADMIN)).send({ reason: 'Mistake here' });
    expect(ok.status).toBe(200);

    // Guardian sees the reversed payment and the month on the invoice detail.
    const detail = await request(app).get(`/api/v1/fees/invoices/${inv.id}`).set('Authorization', tok(p, UserRole.GUARDIAN));
    expect(detail.status).toBe(200);
    expect(detail.body.data.payments[0].status).toBe('REVERSED');
    expect(detail.body.data.payments[0].reversal.reason).toBe('Mistake here');
    const list = await request(app).get('/api/v1/fees/invoices').set('Authorization', tok(p, UserRole.GUARDIAN));
    expect(list.body.data.some((i: { feePeriod: { period: string } | null }) => i.feePeriod?.period === '2027-09')).toBe(true);
    expect(await prisma.paymentReversal.count({ where: { paymentId } })).toBe(1);
  });
});
