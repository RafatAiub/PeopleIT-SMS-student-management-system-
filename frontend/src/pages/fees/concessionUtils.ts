import { formatCurrency } from '../../i18n';
import type { ActiveConcessionRule, Concession } from './types';

export const describeConcession = (c: Pick<Concession, 'type' | 'value'>) =>
  c.type === 'PERCENT' ? `${Number(c.value)}%` : formatCurrency(c.value);

export interface LineLike {
  feeCategoryId: string;
  amount: number;
  discount: number;
}

/**
 * Client-side ESTIMATE mirroring backend/src/modules/fees/concessions/concession.calc.ts
 * (category-specific first, then whole-invoice; PERCENT per line; FIXED per
 * matching line or spread across the invoice). The server computes the final
 * figures when the invoice is created.
 */
export function estimateConcession(lines: LineLike[], rules: ActiveConcessionRule[]): number {
  const p = (n: number) => Math.round(n * 100);
  const rem = lines.map((l) => Math.max(p(l.amount) - Math.min(p(l.discount), p(l.amount)), 0));
  let total = 0;
  const take = (i: number, off: number) => {
    const v = Math.max(Math.min(off, rem[i]), 0);
    rem[i] -= v;
    total += v;
  };
  const valid = rules.filter((r) => r.value > 0);
  for (const r of valid.filter((x) => x.feeCategoryId)) {
    lines.forEach((l, i) => {
      if (l.feeCategoryId !== r.feeCategoryId || rem[i] <= 0) return;
      take(i, r.type === 'PERCENT' ? Math.round((rem[i] * Math.min(r.value, 100)) / 100) : p(r.value));
    });
  }
  for (const r of valid.filter((x) => !x.feeCategoryId)) {
    if (r.type === 'PERCENT') {
      rem.forEach((v, i) => take(i, Math.round((v * Math.min(r.value, 100)) / 100)));
    } else {
      const pool = rem.reduce((a, b) => a + b, 0);
      if (pool <= 0) continue;
      const target = Math.min(p(r.value), pool);
      let given = 0;
      const last = rem.reduce((acc, v, i) => (v > 0 ? i : acc), -1);
      const snapshot = [...rem];
      snapshot.forEach((v, i) => {
        if (v <= 0) return;
        const share = i === last ? target - given : Math.floor((target * v) / pool);
        given += share;
        take(i, share);
      });
    }
  }
  return total / 100;
}

