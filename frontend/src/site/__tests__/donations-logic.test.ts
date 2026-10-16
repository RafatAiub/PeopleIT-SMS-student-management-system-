/**
 * Pure-logic tests for T1 website giving (site/donations.ts) and the
 * `donation/<reference>` route. Self-running like site-logic.test.ts; run:
 *
 *   npx esbuild src/site/__tests__/donations-logic.test.ts --bundle --platform=node \
 *     --loader:.css=empty --jsx=automatic --outfile=<tmp>/donations-tests.cjs && node <tmp>/donations-tests.cjs
 */
import {
  normaliseDonationOptions, normalisePublicDonation, parsePresetAmounts, pickCampaign, progressWidth, validateDonationAmount,
  type PublicDonationCampaign,
} from '../donations';
import { parseSitePath } from '../routes';

let passed = 0;
const failures: string[] = [];
function test(name: string, fn: () => void) {
  try { fn(); passed += 1; } catch (e) { failures.push(`✗ ${name}\n    ${(e as Error).message}`); }
}
function eq<T>(actual: T, expected: T, msg = '') {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) throw new Error(`${msg} expected ${b}, got ${a}`);
}

test('preset amounts: parse, dedupe, cap at 6, fallback', () => {
  // Commas separate amounts, so editors write 5000 (not 5,000) in this field.
  eq(parsePresetAmounts('500, 1000 ,1000, 5000'), [500, 1000, 5000]);
  eq(parsePresetAmounts('1 2 3 4 5 6 7 8'), [1, 2, 3, 4, 5, 6]);
  eq(parsePresetAmounts(''), [500, 1000, 2000, 5000]);
  eq(parsePresetAmounts('abc, -5'), [5]); // "-5" → digits only
});

test('amount validation', () => {
  eq(validateDonationAmount('1,500'), { ok: true, amount: 1500 });
  eq(validateDonationAmount('99.999'), { ok: true, amount: 100 });
  eq(validateDonationAmount('5', 10).ok, false);
  eq(validateDonationAmount('').ok, false);
  eq(validateDonationAmount(20_000_000).ok, false);
});

test('progress width', () => {
  eq(progressWidth(250, 1000), 25);
  eq(progressWidth(2000, 1000), 100);
  eq(progressWidth(10, null), null);
  eq(progressWidth(10, 0), null);
});

const camp = (over: Partial<PublicDonationCampaign>): PublicDonationCampaign => ({
  id: 'c', title: 'T', goalAmount: 100, raised: 0, progress: 0, ended: false, upcoming: false,
  fund: { id: 'f', name: 'F', type: 'GENERAL' }, ...over,
});

test('pickCampaign: explicit id, else newest running, else first', () => {
  const list = [camp({ id: 'old', ended: true }), camp({ id: 'soon', upcoming: true }), camp({ id: 'now' })];
  eq(pickCampaign(list, 'soon')?.id, 'soon');
  eq(pickCampaign(list)?.id, 'now');
  eq(pickCampaign([camp({ id: 'x', ended: true })])?.id, 'x');
  eq(pickCampaign(list, 'missing'), null);
  eq(pickCampaign([]), null);
});

test('normalisers tolerate partial payloads and drop unknown gateways', () => {
  const o = normaliseDonationOptions({
    funds: [{ id: 'f1', name: 'Zakat', type: 'ZAKAT', goalAmount: '1000', raised: 250, progress: 25 }],
    campaigns: [{ id: 'c1', title: 'Hall', fund: { id: 'f1', name: 'Zakat', type: 'WEIRD' }, ended: true }],
    gateways: [{ gateway: 'BKASH', label: 'bKash', demo: true }, { gateway: 'PAYPAL' }],
  });
  eq(o.currency, 'BDT');
  eq(o.funds[0].goalAmount, 1000);
  eq(o.campaigns[0].fund.type, 'OTHER');
  eq(o.campaigns[0].ended, true);
  eq(o.gateways.map((g) => g.gateway), ['BKASH']);
  const d = normalisePublicDonation({ reference: 'DN-1', status: 'PAID', amount: '500.5', fund: { name: 'Zakat' }, receiptNo: 'DON-2026-000001' });
  eq([d.status, d.amount, d.receiptNo, d.campaign], ['PAID', 500.5, 'DON-2026-000001', null]);
  eq(normalisePublicDonation({ status: 'WAT' }).status, 'PENDING');
});

test('route: donation/<ref> is the status page; "donation" alone stays a page', () => {
  eq(parseSitePath('donation/DN-261016-ABCD2345'), { kind: 'donation-status', reference: 'DN-261016-ABCD2345' });
  eq(parseSitePath('donation'), { kind: 'page', slug: 'donation' });
  eq(parseSitePath('donate'), { kind: 'page', slug: 'donate' });
});

if (failures.length) {
  console.error(failures.join('\n'));
  console.error(`\n${failures.length} failed, ${passed} passed`);
  (globalThis as { process?: { exit(code: number): void } }).process?.exit(1);
} else {
  console.log(`donations-logic: ${passed} tests passed`);
}
