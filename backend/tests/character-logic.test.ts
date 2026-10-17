import {
  BADGE_ICONS,
  DEFAULT_TRAITS,
  autoDedupeKey,
  badgeRuleProblem,
  characterBand,
  isValidScore,
  leaderboardName,
  longestOnTimeStreak,
  meetsBadgeRule,
  overallPercent,
  parseScoreCell,
  periodRangeProblem,
  rankRows,
  scorePercent,
  suggestPeriod,
} from '../src/modules/character/character.logic';
import { pdfSafeText } from '../src/modules/results/reportCard.pdf';

// T2 character — pure logic (no DB).

describe('T2 character logic', () => {
  it('ships the seven default traits with Bangla names', () => {
    expect(DEFAULT_TRAITS.map((t) => t.nameBn)).toEqual(['সময়ানুবর্তিতা', 'আদব', 'সালাত', 'পরিচ্ছন্নতা', 'শ্রদ্ধাবোধ', 'দায়িত্বশীলতা', 'সততা']);
    expect(BADGE_ICONS).toContain('star');
  });

  it('validates scores against the trait scale', () => {
    const t = { scaleMin: 1, scaleMax: 5 };
    expect(isValidScore(1, t)).toBe(true);
    expect(isValidScore(5, t)).toBe(true);
    expect(isValidScore(0, t)).toBe(false);
    expect(isValidScore(6, t)).toBe(false);
    expect(isValidScore(2.5, t)).toBe(false);
  });

  it('maps a score to a percentage of its scale and weights the overall', () => {
    expect(scorePercent(1, { scaleMin: 1, scaleMax: 5 })).toBe(0);
    expect(scorePercent(5, { scaleMin: 1, scaleMax: 5 })).toBe(100);
    expect(scorePercent(8, { scaleMin: 1, scaleMax: 10 })).toBeCloseTo(77.78, 1);
    const traits = [
      { id: 'a', scaleMin: 1, scaleMax: 5, weight: 2 },
      { id: 'b', scaleMin: 1, scaleMax: 5, weight: 1 },
      { id: 'z', scaleMin: 1, scaleMax: 5, weight: 0 },
    ];
    // a=100% (w2), b=50% (w1) → 83.3; weight-0 trait ignored.
    expect(overallPercent([{ traitId: 'a', score: 5 }, { traitId: 'b', score: 3 }, { traitId: 'z', score: 1 }], traits)).toBe(83.3);
    expect(overallPercent([], traits)).toBeNull();
  });

  it('bands the overall in EN and BN', () => {
    expect(characterBand(95)).toEqual({ en: 'Excellent', bn: 'চমৎকার' });
    expect(characterBand(30)?.en).toBe('Needs improvement');
    expect(characterBand(null)).toBeNull();
  });

  it('counts the longest PRESENT streak over recorded school days (LATE breaks it)', () => {
    const d = (s: string) => new Date(`${s}T00:00:00Z`);
    const rows = [
      { date: d('2026-10-01'), status: 'PRESENT' },
      { date: d('2026-10-02'), status: 'PRESENT' },
      // weekend gap — no rows, does not break
      { date: d('2026-10-05'), status: 'PRESENT' },
      { date: d('2026-10-06'), status: 'LATE' },
      { date: d('2026-10-07'), status: 'PRESENT' },
    ];
    expect(longestOnTimeStreak(rows)).toBe(3);
    expect(longestOnTimeStreak([])).toBe(0);
  });

  it('evaluates the three auto rules', () => {
    const facts = { traitScores: { t1: 5, t2: 3 }, overallPercent: 85, streak: 12 };
    expect(meetsBadgeRule({ rule: 'TRAIT_AVERAGE', ruleTraitId: 't1', ruleThreshold: 5, ruleStreakDays: null }, facts)).toBe(true);
    expect(meetsBadgeRule({ rule: 'TRAIT_AVERAGE', ruleTraitId: 't2', ruleThreshold: 4, ruleStreakDays: null }, facts)).toBe(false);
    expect(meetsBadgeRule({ rule: 'TRAIT_AVERAGE', ruleTraitId: 'missing', ruleThreshold: 1, ruleStreakDays: null }, facts)).toBe(false);
    expect(meetsBadgeRule({ rule: 'OVERALL_AVERAGE', ruleTraitId: null, ruleThreshold: 80, ruleStreakDays: null }, facts)).toBe(true);
    expect(meetsBadgeRule({ rule: 'OVERALL_AVERAGE', ruleTraitId: null, ruleThreshold: 90, ruleStreakDays: null }, facts)).toBe(false);
    expect(meetsBadgeRule({ rule: 'ATTENDANCE_STREAK', ruleTraitId: null, ruleThreshold: null, ruleStreakDays: 10 }, facts)).toBe(true);
    expect(meetsBadgeRule({ rule: 'NONE', ruleTraitId: null, ruleThreshold: null, ruleStreakDays: null }, facts)).toBe(false);
  });

  it('rejects incomplete rule definitions', () => {
    expect(badgeRuleProblem({ rule: 'NONE', ruleTraitId: null, ruleThreshold: null, ruleStreakDays: null })).toBeNull();
    expect(badgeRuleProblem({ rule: 'TRAIT_AVERAGE', ruleTraitId: null, ruleThreshold: 4, ruleStreakDays: null })).toMatch(/trait/);
    expect(badgeRuleProblem({ rule: 'TRAIT_AVERAGE', ruleTraitId: 't', ruleThreshold: 9, ruleStreakDays: null }, { scaleMin: 1, scaleMax: 5 })).toMatch(/between 1 and 5/);
    expect(badgeRuleProblem({ rule: 'OVERALL_AVERAGE', ruleTraitId: null, ruleThreshold: 0, ruleStreakDays: null })).not.toBeNull();
    expect(badgeRuleProblem({ rule: 'ATTENDANCE_STREAK', ruleTraitId: null, ruleThreshold: null, ruleStreakDays: 1 })).not.toBeNull();
    expect(autoDedupeKey('b', 's', 'p')).toBe('auto:b:s:p');
  });

  it('suggests Saturday–Friday weeks and calendar months', () => {
    const w = suggestPeriod('WEEKLY', new Date('2026-10-14T10:00:00Z')); // Wednesday
    expect(w.startDate.toISOString().slice(0, 10)).toBe('2026-10-10'); // Saturday
    expect(w.endDate.toISOString().slice(0, 10)).toBe('2026-10-16');
    const m = suggestPeriod('MONTHLY', new Date('2026-02-10T00:00:00Z'));
    expect(m.name).toBe('February 2026');
    expect(m.endDate.toISOString().slice(0, 10)).toBe('2026-02-28');
    expect(periodRangeProblem(new Date('2026-02-02'), new Date('2026-02-01'))).not.toBeNull();
  });

  it('keeps leaderboards private: first name only, dense ranking', () => {
    expect(leaderboardName('Abdur Rahman')).toBe('Abdur');
    expect(leaderboardName('  ')).toBe('—');
    expect(rankRows([{ points: 5 }, { points: 9 }, { points: 9 }, { points: 1 }]).map((r) => r.rank)).toEqual([1, 1, 2, 3]);
  });

  it('parses grid cells and filters text the PDF font cannot print', () => {
    expect(parseScoreCell('')).toBeNull();
    expect(parseScoreCell(' 4 ')).toBe(4);
    expect(Number.isNaN(parseScoreCell('x') as number)).toBe(true);
    expect(pdfSafeText('Very polite')).toBe('Very polite');
    expect(pdfSafeText('খুব ভদ্র')).toBeNull();
  });
});
