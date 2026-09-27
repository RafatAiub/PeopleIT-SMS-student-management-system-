// DB-free unit tests for the pure concession calculator (Wave C).
import { applyConcessions, isAssignmentActive, type ConcessionRule } from '../src/modules/fees/concessions/concession.calc';

const TUITION = 'cat-tuition';
const TRANSPORT = 'cat-transport';

const line = (feeCategoryId: string, amount: number, discount = 0, description = feeCategoryId) => ({
  feeCategoryId,
  amount,
  discount,
  description,
});

const rule = (over: Partial<ConcessionRule>): ConcessionRule => ({
  id: over.id ?? 'c1',
  name: over.name ?? 'Sibling',
  type: over.type ?? 'PERCENT',
  value: over.value ?? 10,
  feeCategoryId: over.feeCategoryId ?? null,
});

describe('applyConcessions', () => {
  it('returns lines unchanged when there are no concessions', () => {
    const r = applyConcessions([line(TUITION, 1000)], []);
    expect(r.items[0].discount).toBe(0);
    expect(r.items[0].description).toBe(TUITION);
    expect(r.totalConcession).toBe(0);
    expect(r.applied).toEqual([]);
  });

  it('applies a category-specific percentage only to matching lines', () => {
    const r = applyConcessions([line(TUITION, 1000), line(TRANSPORT, 500)], [rule({ value: 50, feeCategoryId: TUITION })]);
    expect(r.items[0].discount).toBe(500);
    expect(r.items[1].discount).toBe(0);
    expect(r.items[0].description).toBe(`${TUITION} (Concession: Sibling)`);
    expect(r.totalConcession).toBe(500);
  });

  it('applies a whole-invoice percentage to every line', () => {
    const r = applyConcessions([line(TUITION, 1000), line(TRANSPORT, 500)], [rule({ value: 10 })]);
    expect(r.items.map((i) => i.discount)).toEqual([100, 50]);
    expect(r.totalConcession).toBe(150);
  });

  it('stacks on top of a manual discount, computed on what remains', () => {
    const r = applyConcessions([line(TUITION, 1000, 200)], [rule({ value: 50 })]);
    expect(r.items[0].discount).toBe(600); // 200 manual + 50% of 800
    expect(r.items[0].concessionDiscount).toBe(400);
  });

  it('category-specific FIXED is taken off each matching line, capped at the line', () => {
    const r = applyConcessions(
      [line(TUITION, 300), line(TUITION, 100)],
      [rule({ type: 'FIXED', value: 150, feeCategoryId: TUITION })],
    );
    expect(r.items.map((i) => i.discount)).toEqual([150, 100]);
    expect(r.totalConcession).toBe(250);
  });

  it('whole-invoice FIXED is spread proportionally and sums exactly', () => {
    const r = applyConcessions([line(TUITION, 1000), line(TRANSPORT, 500), line('cat-lab', 250)], [rule({ type: 'FIXED', value: 100 })]);
    const total = r.items.reduce((s, i) => s + i.discount, 0);
    expect(Math.round(total * 100) / 100).toBe(100);
    expect(r.items[0].discount).toBeCloseTo(57.14, 2);
    expect(r.items[1].discount).toBeCloseTo(28.57, 2);
    expect(r.items[2].discount).toBeCloseTo(14.29, 2);
  });

  it('whole-invoice FIXED larger than the invoice discounts it to zero, never below', () => {
    const r = applyConcessions([line(TUITION, 300), line(TRANSPORT, 200)], [rule({ type: 'FIXED', value: 10_000 })]);
    expect(r.items.map((i) => i.amount - i.discount)).toEqual([0, 0]);
    expect(r.totalConcession).toBe(500);
  });

  it('applies category-specific concessions before whole-invoice ones', () => {
    const r = applyConcessions(
      [line(TUITION, 1000)],
      [rule({ id: 'w', name: 'Merit', value: 10 }), rule({ id: 'c', name: 'Staff child', value: 50, feeCategoryId: TUITION })],
    );
    // 50% of 1000 = 500, then 10% of remaining 500 = 50
    expect(r.items[0].discount).toBe(550);
    expect(r.applied).toEqual(
      expect.arrayContaining([
        { concessionId: 'c', name: 'Staff child', amount: 500 },
        { concessionId: 'w', name: 'Merit', amount: 50 },
      ]),
    );
    expect(r.items[0].description).toContain('Staff child');
    expect(r.items[0].description).toContain('Merit');
  });

  it('caps percentages at 100% and ignores non-positive values', () => {
    const r = applyConcessions([line(TUITION, 400)], [rule({ value: 150 }), rule({ id: 'z', value: 0 })]);
    expect(r.items[0].discount).toBe(400);
    expect(r.applied).toHaveLength(1);
  });

  it('rounds to paisa without float drift', () => {
    const r = applyConcessions([line(TUITION, 333.33)], [rule({ value: 33.33 })]);
    expect(r.items[0].discount).toBe(111.1);
  });
});

describe('isAssignmentActive', () => {
  const at = new Date('2026-06-15T12:00:00Z');
  it('treats null bounds as open-ended', () => {
    expect(isAssignmentActive({ validFrom: null, validTo: null }, at)).toBe(true);
  });
  it('respects validFrom and validTo', () => {
    expect(isAssignmentActive({ validFrom: new Date('2026-07-01'), validTo: null }, at)).toBe(false);
    expect(isAssignmentActive({ validFrom: null, validTo: new Date('2026-06-01') }, at)).toBe(false);
    expect(isAssignmentActive({ validFrom: new Date('2026-01-01'), validTo: new Date('2026-12-31T23:59:59Z') }, at)).toBe(true);
  });
});
