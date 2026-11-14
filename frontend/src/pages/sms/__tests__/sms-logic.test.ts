/**
 * Pure-logic tests for P5 SMS credits (pages/sms/sms.logic.ts + the Bangla
 * dictionary in sms.i18n.ts). Self-running, like lib/__tests__/modules-logic.test.ts.
 *
 *   npx esbuild src/pages/sms/__tests__/sms-logic.test.ts --bundle --platform=node \
 *     --loader:.css=empty --jsx=automatic --outfile=<tmp>/sms-tests.cjs && node <tmp>/sms-tests.cjs
 *
 * Exits non-zero on the first failure.
 */
import {
  balanceLevel,
  isInsufficient,
  logQuery,
  messagesLeft,
  perSms,
  purchaseResult,
  purposeLabel,
  senderIdError,
  signedUnits,
  smsUnits,
} from '../sms.logic';

let passed = 0;
const failures: string[] = [];
function test(name: string, fn: () => void) {
  try {
    fn();
    passed++;
  } catch (e) {
    failures.push(`${name}: ${(e as Error).message}`);
  }
}
function eq<T>(a: T, b: T, msg = '') {
  const x = JSON.stringify(a);
  const y = JSON.stringify(b);
  if (x !== y) throw new Error(`${msg} expected ${y}, got ${x}`);
}

test('English segments: 160 = 1, 161 = 2, 306 = 2, 307 = 3', () => {
  eq(smsUnits('a'.repeat(160)).units, 1);
  eq(smsUnits('a'.repeat(161)).units, 2);
  eq(smsUnits('a'.repeat(306)).units, 2);
  eq(smsUnits('a'.repeat(307)).units, 3);
});
test('Bangla segments: 70 = 1, 71 = 2, 134 = 2, 135 = 3', () => {
  eq(smsUnits('আ'.repeat(70)), { encoding: 'UNICODE', length: 70, units: 1 });
  eq(smsUnits('আ'.repeat(71)).units, 2);
  eq(smsUnits('আ'.repeat(134)).units, 2);
  eq(smsUnits('আ'.repeat(135)).units, 3);
});
test('one Bangla char or emoji forces Unicode; GSM extension chars count double', () => {
  eq(smsUnits(`${'a'.repeat(100)}আ`).encoding, 'UNICODE');
  eq(smsUnits('hi 😀').encoding, 'UNICODE');
  eq(smsUnits('{}').length, 4);
  eq(smsUnits('').units, 0);
});
test('sender ID validation mirrors the server', () => {
  eq(senderIdError('MySchool'), null);
  eq(senderIdError('Al-Amin Sch'), null);
  eq(senderIdError('AB') !== null, true);
  eq(senderIdError('TwelveChars1') !== null, true);
  eq(senderIdError('01712345678'), 'Sender ID must contain at least one letter');
  eq(senderIdError('স্কুল') !== null, true);
});
test('balance levels and messages left', () => {
  eq(balanceLevel(0, 100), 'empty');
  eq(balanceLevel(50, 100), 'low');
  eq(balanceLevel(150, 100), 'ok');
  eq(balanceLevel(5, 0), 'ok');
  eq(messagesLeft(10, 5), 15);
  eq(messagesLeft(10, 0, 2), 5);
  eq(messagesLeft(-3, 0), 0);
});
test('formatting helpers', () => {
  eq(signedUnits(500), '+500');
  eq(signedUnits(-2), '−2');
  eq(signedUnits(0), '0');
  eq(perSms(350, 1000), 0.35);
  eq(purposeLabel('FEE_REMINDER'), 'Fee reminder');
  eq(purposeLabel('SOME_NEW_THING'), 'Some new thing');
  eq(purposeLabel(null), '—');
  eq(isInsufficient('INSUFFICIENT_CREDITS: needs 2'), true);
  eq(isInsufficient('Error: x'), false);
});
test('query building and gateway redirect parsing', () => {
  eq(logQuery({ status: 'SENT', purpose: '', page: 2, search: undefined }), 'status=SENT&page=2');
  eq(purchaseResult('?purchase=success&pid=abc'), { status: 'success', purchaseId: 'abc' });
  eq(purchaseResult('?purchase=hacked'), null);
  eq(purchaseResult(''), null);
});

if (failures.length) {
  console.error(`sms-logic: ${failures.length} failed\n${failures.join('\n')}`);
  process.exit(1);
}
console.log(`sms-logic: ${passed} passed`);
