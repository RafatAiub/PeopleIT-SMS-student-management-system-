import {
  DEFAULT_STAGES,
  computeConversion,
  computeStageFunnel,
  dhakaDayBounds,
  dueState,
  duplicateReasons,
  findDuplicateGroups,
  mergeFill,
  nameSimilarity,
  overallConversion,
  selectDigest,
  stageForStatus,
  statusForStage,
  toCsv,
  validateStageSet,
  type ReportRow,
  type StageLike,
} from '../src/modules/crm/crm.logic';

// =============================================================================
// T4 CRM pure logic (no DB).
// =============================================================================

const stages: StageLike[] = DEFAULT_STAGES.map((s) => ({ id: s.status.toLowerCase(), order: s.order, status: s.status, isWon: s.isWon, isLost: s.isLost, name: s.name }));

describe('stages', () => {
  it('maps a status to the first stage that counts as it, keeping the current one when it matches', () => {
    const custom = [...stages, { id: 'interview', order: 3.5, status: 'VISITED', isWon: false, isLost: false, name: 'Interview' }];
    expect(stageForStatus(custom, 'VISITED')?.id).toBe('visited');
    expect(stageForStatus(custom, 'VISITED', 'interview')?.id).toBe('interview');
    expect(stageForStatus(custom, 'ENROLLED')?.id).toBe('enrolled');
  });

  it('won/lost flags decide the legacy status; open stages cannot claim a closed one', () => {
    expect(statusForStage({ isWon: true, isLost: false, status: 'NEW' })).toBe('ENROLLED');
    expect(statusForStage({ isWon: false, isLost: true })).toBe('LOST');
    expect(statusForStage({ isWon: false, isLost: false, status: 'ENROLLED' }, 'CONTACTED')).toBe('CONTACTED');
    expect(statusForStage({ isWon: false, isLost: false, status: 'APPLIED' })).toBe('APPLIED');
  });

  it('a stage set needs open, won and lost stages and unique names', () => {
    expect(validateStageSet(DEFAULT_STAGES)).toBeNull();
    expect(validateStageSet(DEFAULT_STAGES.filter((s) => !s.isWon))).toMatch(/won/);
    expect(validateStageSet(DEFAULT_STAGES.filter((s) => !s.isLost))).toMatch(/lost/);
    expect(validateStageSet([...DEFAULT_STAGES, { ...DEFAULT_STAGES[0], name: 'new ' }])).toMatch(/unique/);
  });
});

describe('dates (Asia/Dhaka)', () => {
  it('day bounds are Dhaka midnight to midnight', () => {
    // 2026-10-17 20:00 UTC = 2026-10-18 02:00 Dhaka
    const { start, end } = dhakaDayBounds(new Date('2026-10-17T20:00:00Z'));
    expect(start.toISOString()).toBe('2026-10-17T18:00:00.000Z');
    expect(end.toISOString()).toBe('2026-10-18T18:00:00.000Z');
  });
  it('due state', () => {
    const now = new Date('2026-10-17T06:00:00Z'); // 12:00 Dhaka
    expect(dueState('2026-10-16T17:59:00Z', now)).toBe('overdue');
    expect(dueState('2026-10-17T17:00:00Z', now)).toBe('today');
    expect(dueState('2026-10-17T18:00:00Z', now)).toBe('upcoming');
    expect(dueState(null, now)).toBe('none');
  });
});

describe('digest selection', () => {
  const now = new Date('2026-10-17T02:00:00Z'); // 08:00 Dhaka
  it('picks overdue + due-today open tasks and follow-ups per assignee, skipping done/future/unassigned/closed', () => {
    const d = (iso: string) => new Date(iso);
    const out = selectDigest(
      [
        { id: 't1', title: 'Call back', dueAt: d('2026-10-15T05:00:00Z'), done: false, assigneeUserId: 'u1', enquiryName: 'Ayesha' },
        { id: 't2', title: 'Send prospectus', dueAt: d('2026-10-17T10:00:00Z'), done: false, assigneeUserId: 'u1' },
        { id: 't3', title: 'Done already', dueAt: d('2026-10-15T05:00:00Z'), done: true, assigneeUserId: 'u1' },
        { id: 't4', title: 'Tomorrow', dueAt: d('2026-10-18T03:00:00Z'), done: false, assigneeUserId: 'u1' },
        { id: 't5', title: 'Nobody', dueAt: d('2026-10-15T05:00:00Z'), done: false, assigneeUserId: null },
        { id: 't6', title: 'Other user', dueAt: d('2026-10-17T03:00:00Z'), done: false, assigneeUserId: 'u2' },
      ],
      [
        { id: 'e1', studentName: 'Bilal', nextStep: 'Campus tour', followUpAt: d('2026-10-17T04:00:00Z'), assignedToUserId: 'u1', closed: false },
        { id: 'e2', studentName: 'Closed', nextStep: null, followUpAt: d('2026-10-10T04:00:00Z'), assignedToUserId: 'u1', closed: true },
      ],
      now,
    );
    expect(out.map((e) => e.userId)).toEqual(['u1', 'u2']);
    const u1 = out[0];
    expect([u1.overdue, u1.dueToday, u1.followUps]).toEqual([1, 1, 1]);
    expect(u1.lines[0]).toBe('[Overdue] Call back — Ayesha');
    expect(u1.lines).toContain('Follow up: Bilal — Campus tour');
    expect(out[1].dueToday).toBe(1);
  });
  it('caps the list', () => {
    const tasks = Array.from({ length: 13 }, (_, i) => ({ id: `t${i}`, title: `T${i}`, dueAt: new Date('2026-10-16T00:00:00Z'), done: false, assigneeUserId: 'u' }));
    const [e] = selectDigest(tasks, [], now, 10);
    expect(e.lines).toHaveLength(11);
    expect(e.lines[10]).toBe('…and 3 more');
  });
});

describe('duplicates', () => {
  it('matches phone by last 10 digits and email case-insensitively', () => {
    expect(duplicateReasons({ id: 'a', studentName: 'X', phone: '+880 1711-000001' }, { id: 'b', studentName: 'Y', phone: '01711000001' })).toEqual(['PHONE']);
    expect(duplicateReasons({ id: 'a', studentName: 'X', email: 'A@B.com' }, { id: 'b', studentName: 'Y', email: 'a@b.com ' })).toEqual(['EMAIL']);
  });
  it('name similarity ignores order, case and honorifics', () => {
    expect(nameSimilarity('Md. Rahim Uddin', 'uddin rahim')).toBe(1);
    expect(nameSimilarity('Ayesha Karim', 'Ayesha Kareem')).toBeGreaterThan(0.8);
    expect(nameSimilarity('Ayesha Karim', 'Bilal Hossain')).toBeLessThan(0.5);
  });
  it('a name-only match needs similar guardians when both are known', () => {
    expect(duplicateReasons({ id: 'a', studentName: 'Ayesha Karim', guardianName: 'Abdul Karim' }, { id: 'b', studentName: 'Ayesha Karim', guardianName: 'Someone Else' })).toEqual([]);
    expect(duplicateReasons({ id: 'a', studentName: 'Ayesha Karim', guardianName: 'Abdul Karim' }, { id: 'b', studentName: 'Ayesha Kareem', guardianName: 'Abdul Karim' })).toEqual(['NAME']);
  });
  it('groups clusters transitively', () => {
    const groups = findDuplicateGroups([
      { id: '1', studentName: 'Ayesha', phone: '01711000001' },
      { id: '2', studentName: 'Ayesha K', phone: '01711000001', email: 'x@y.com' },
      { id: '3', studentName: 'Someone', email: 'X@y.com' },
      { id: '4', studentName: 'Unrelated', phone: '01999999999' },
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].items.map((i) => i.id).sort()).toEqual(['1', '2', '3']);
    expect(groups[0].reasons.sort()).toEqual(['EMAIL', 'PHONE']);
  });
  it('merge fills only empty fields of the kept record', () => {
    expect(mergeFill({ guardianName: null, email: 'keep@x', classInterested: '' } as Record<string, unknown>, { guardianName: 'G', email: 'drop@x', classInterested: 'Six' })).toEqual({
      guardianName: 'G',
      classInterested: 'Six',
    });
  });
});

describe('conversion report maths', () => {
  const c = (iso: string) => new Date(iso);
  const rows: ReportRow[] = [
    { id: '1', createdAt: c('2026-01-05T00:00:00Z'), wonAt: c('2026-01-15T00:00:00Z'), source: 'website', classInterested: 'Six', ownerId: 'u1', stageId: 'enrolled' },
    { id: '2', createdAt: c('2026-01-10T00:00:00Z'), wonAt: c('2026-01-30T00:00:00Z'), source: 'WEBSITE', classInterested: 'Six', ownerId: 'u1', stageId: 'enrolled' },
    { id: '3', createdAt: c('2026-02-01T00:00:00Z'), wonAt: null, source: 'PHONE', classInterested: 'Seven', ownerId: 'u2', stageId: 'lost', visitedStageIds: ['new', 'contacted', 'visited'] },
    { id: '4', createdAt: c('2026-02-03T00:00:00Z'), wonAt: null, source: 'PHONE', classInterested: null, ownerId: null, stageId: 'contacted' },
  ];
  it('groups by source with rates and average days to admit', () => {
    const g = computeConversion(rows, stages, 'source');
    expect(g).toEqual([
      { key: 'PHONE', total: 2, won: 0, lost: 1, open: 1, conversionRate: 0, avgDaysToAdmit: null },
      { key: 'WEBSITE', total: 2, won: 2, lost: 0, open: 0, conversionRate: 100, avgDaysToAdmit: 15 },
    ]);
  });
  it('groups by month in order, and overall', () => {
    expect(computeConversion(rows, stages, 'month').map((g) => [g.key, g.total, g.conversionRate])).toEqual([
      ['2026-01', 2, 100],
      ['2026-02', 2, 0],
    ]);
    expect(overallConversion(rows, stages)).toMatchObject({ total: 4, won: 2, lost: 1, open: 1, conversionRate: 50, avgDaysToAdmit: 15 });
    expect(computeConversion(rows, stages, 'class').find((g) => g.key === '—')?.total).toBe(1);
  });
  it('funnel counts how far each enquiry got (lost ones by their history)', () => {
    const f = computeStageFunnel(rows, stages);
    expect(f.total).toBe(4);
    expect(f.lost).toBe(1);
    expect(f.steps.map((s) => [s.stageId, s.reached])).toEqual([
      ['new', 4],
      ['contacted', 4],
      ['visited', 3],
      ['applied', 2],
      ['enrolled', 2],
    ]);
    expect(f.steps[2].rate).toBe(75);
  });
  it('csv escapes and neutralises formulas', () => {
    expect(toCsv(['a', 'b'], [['=1+1', 'x,"y"']])).toBe('a,b\r\n\'=1+1,"x,""y"""\r\n');
  });
});
