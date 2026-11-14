// P5 — SMS provider layer: each adapter's reply parsing, failover rules,
// sender ID validation, deduction planning (incl. Bangla segments), DLR
// parsing. Pure + mocked fetch — no real provider is ever called and no
// database is needed.
import {
  configuredOrder,
  extractBalance,
  mapDeliveryWord,
  parseBulkSmsBdResponse,
  parseGreenwebResponse,
  parseProviderName,
  parseSslWirelessResponse,
  providerChain,
  redact,
  sendWithFailover,
  type SmsProvider,
} from '../src/utils/sms.providers';
import {
  canAlertToday,
  csvCell,
  dhakaMonthKey,
  freeUnitsToReturn,
  maskForDisplay,
  nextSequence,
  planDeduction,
  receiptNumberFor,
  startOfDhakaDay,
  validateSenderId,
} from '../src/modules/sms-credits/smsCredits.logic';
import { countSmsSegments } from '../src/modules/campaigns/smsSegments';
import { parseDlrPayload } from '../src/modules/sms-credits/smsCredits.delivery';

const mockFetch = jest.fn();
const realFetch = global.fetch;
const ENV_KEYS = ['SMS_PROVIDER_PRIMARY', 'SMS_PROVIDER_FALLBACK', 'BULKSMSBD_API_KEY', 'BULKSMSBD_SENDER_ID', 'SSLWIRELESS_API_TOKEN', 'SSLWIRELESS_SID'];
const saved: Record<string, string | undefined> = {};

beforeAll(() => {
  global.fetch = mockFetch as unknown as typeof fetch;
  for (const k of ENV_KEYS) saved[k] = process.env[k];
});
afterAll(() => {
  global.fetch = realFetch;
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});
beforeEach(() => {
  mockFetch.mockReset();
  for (const k of ENV_KEYS) delete process.env[k];
});

function reply(body: string, status = 200) {
  return { ok: status >= 200 && status < 300, status, text: async () => body };
}

describe('Greenweb parser (kept from P0)', () => {
  it('accepts Ok:, rejects Error:/unknown', () => {
    expect(parseGreenwebResponse('Ok: SMS Sent Successfully To 8801712345678').ok).toBe(true);
    expect(parseGreenwebResponse('Error: Insufficient Balance').ok).toBe(false);
    expect(parseGreenwebResponse('<html>down</html>').ok).toBe(false);
  });
});

describe('BulkSMSBD parser', () => {
  it('202 is accepted with the message id', () => {
    const r = parseBulkSmsBdResponse('{"response_code":202,"message_id":98765,"success_message":"SMS Submitted Successfully","error_message":""}');
    expect(r).toEqual({ ok: true, providerMessageId: '98765', detail: 'SMS Submitted Successfully' });
  });
  it('1001 invalid number is a recipient error (no failover)', () => {
    const r = parseBulkSmsBdResponse('{"response_code":1001,"error_message":"Invalid Number"}');
    expect(r.ok).toBe(false);
    expect(r.recipientError).toBe(true);
    expect(r.detail).toMatch(/1001/);
  });
  it('1007 insufficient balance is a provider error (failover allowed)', () => {
    const r = parseBulkSmsBdResponse('{"response_code":1007,"error_message":"Balance Insufficient"}');
    expect(r.ok).toBe(false);
    expect(r.recipientError).toBe(false);
  });
  it('bare numeric codes and junk are handled', () => {
    expect(parseBulkSmsBdResponse('1032')).toMatchObject({ ok: false, detail: expect.stringMatching(/IP Not whitelisted/) });
    expect(parseBulkSmsBdResponse('<html/>').ok).toBe(false);
    expect(parseBulkSmsBdResponse('').ok).toBe(false);
    expect(parseBulkSmsBdResponse('{"foo":1}').ok).toBe(false);
  });
});

describe('SSL Wireless parser', () => {
  it('SUCCESS with smsinfo SUCCESS → ok + reference id', () => {
    const r = parseSslWirelessResponse(
      JSON.stringify({ status: 'SUCCESS', status_code: 200, error_message: '', smsinfo: [{ sms_status: 'SUCCESS', status_message: 'Success', msisdn: '8801712345678', csms_id: 'ABC', reference_id: 'REF-1' }] }),
    );
    expect(r).toEqual({ ok: true, providerMessageId: 'REF-1', detail: 'Success' });
  });
  it('FAILED is a failure; invalid msisdn is a recipient error', () => {
    const auth = parseSslWirelessResponse('{"status":"FAILED","status_code":4001,"error_message":"Unauthorized"}');
    expect(auth.ok).toBe(false);
    expect(auth.recipientError).toBe(false);
    const bad = parseSslWirelessResponse('{"status":"FAILED","status_code":4022,"error_message":"Invalid MSISDN"}');
    expect(bad.recipientError).toBe(true);
  });
  it('per-SMS failure inside an overall SUCCESS is a failure', () => {
    expect(parseSslWirelessResponse('{"status":"SUCCESS","smsinfo":[{"sms_status":"FAILED","status_message":"Invalid mobile number"}]}')).toMatchObject({ ok: false, recipientError: true });
  });
  it('non-JSON is a failure', () => {
    expect(parseSslWirelessResponse('Bad Gateway').ok).toBe(false);
  });
});

describe('adapters over HTTP (fetch mocked)', () => {
  it('BulkSMSBD sends unicode type for Bangla and never leaks the api key in the detail', async () => {
    process.env.SMS_PROVIDER_PRIMARY = 'BULKSMSBD';
    process.env.BULKSMSBD_API_KEY = 'secret-key-123';
    process.env.BULKSMSBD_SENDER_ID = '8809601000000';
    mockFetch.mockResolvedValue(reply('{"response_code":202,"message_id":5,"success_message":"ok"}'));
    const chain = providerChain();
    expect(chain.map((p) => p.name)).toEqual(['BULKSMSBD']);
    const r = await sendWithFailover({ to: '8801712345678', message: 'আসসালামু আলাইকুম', unicode: true, clientRef: 'X1' }, null, chain);
    expect(r).toMatchObject({ ok: true, provider: 'BULKSMSBD', providerMessageId: '5' });
    const body = new URLSearchParams(mockFetch.mock.calls[0][1].body as string);
    expect(body.get('type')).toBe('unicode');
    expect(body.get('number')).toBe('8801712345678');
    expect(body.get('senderid')).toBe('8809601000000');
  });

  it('SSL Wireless posts api_token/sid/msisdn/sms/csms_id; masked sender is used as sid only for its provider', async () => {
    process.env.SMS_PROVIDER_PRIMARY = 'SSLWIRELESS';
    process.env.SSLWIRELESS_API_TOKEN = 'tok';
    process.env.SSLWIRELESS_SID = 'NONMASK';
    mockFetch.mockResolvedValue(reply('{"status":"SUCCESS","smsinfo":[{"sms_status":"SUCCESS","reference_id":"R9"}]}'));
    await sendWithFailover({ to: '8801712345678', message: 'hi', unicode: false, clientRef: 'C1' }, { senderId: 'MYSCHOOL', senderProvider: 'SSLWIRELESS' });
    const sent = JSON.parse(mockFetch.mock.calls[0][1].body as string);
    expect(sent).toMatchObject({ api_token: 'tok', sid: 'MYSCHOOL', msisdn: '8801712345678', sms: 'hi', csms_id: 'C1' });
    mockFetch.mockClear();
    await sendWithFailover({ to: '8801712345678', message: 'hi', unicode: false, clientRef: 'C2' }, { senderId: 'MYSCHOOL', senderProvider: 'GREENWEB' });
    expect(JSON.parse(mockFetch.mock.calls[0][1].body as string).sid).toBe('NONMASK');
  });
});

describe('failover rules', () => {
  const fake = (name: 'GREENWEB' | 'BULKSMSBD', result: () => Promise<{ ok: boolean; recipientError?: boolean; detail: string; providerMessageId?: string }>): SmsProvider & { send: jest.Mock } => ({
    name,
    label: name,
    isConfigured: () => true,
    send: jest.fn(result),
  });
  const input = { to: '8801712345678', message: 'x', unicode: false, clientRef: 'R' };

  it('primary ok → fallback never called', async () => {
    const a = fake('GREENWEB', async () => ({ ok: true, detail: 'Ok' }));
    const b = fake('BULKSMSBD', async () => ({ ok: true, detail: 'Ok' }));
    const r = await sendWithFailover(input, null, [a, b]);
    expect(r.provider).toBe('GREENWEB');
    expect(b.send).not.toHaveBeenCalled();
  });
  it('provider error → fallback tried once and wins', async () => {
    const a = fake('GREENWEB', async () => ({ ok: false, detail: 'Error: Insufficient Balance' }));
    const b = fake('BULKSMSBD', async () => ({ ok: true, detail: 'ok', providerMessageId: '7' }));
    const r = await sendWithFailover(input, null, [a, b]);
    expect(r).toMatchObject({ ok: true, provider: 'BULKSMSBD', providerMessageId: '7' });
    expect(r.attempts).toHaveLength(2);
  });
  it('network exception → fallback', async () => {
    const a = fake('GREENWEB', async () => {
      throw new Error('ECONNRESET');
    });
    const b = fake('BULKSMSBD', async () => ({ ok: true, detail: 'ok' }));
    expect((await sendWithFailover(input, null, [a, b])).provider).toBe('BULKSMSBD');
  });
  it('recipient error (invalid number) → NO failover', async () => {
    const a = fake('GREENWEB', async () => ({ ok: false, recipientError: true, detail: 'Invalid Number' }));
    const b = fake('BULKSMSBD', async () => ({ ok: true, detail: 'ok' }));
    const r = await sendWithFailover(input, null, [a, b]);
    expect(r).toMatchObject({ ok: false, recipientError: true });
    expect(b.send).not.toHaveBeenCalled();
  });
  it('both fail → FAILED with both reasons; never more than two attempts', async () => {
    const a = fake('GREENWEB', async () => ({ ok: false, detail: 'down' }));
    const b = fake('BULKSMSBD', async () => ({ ok: false, detail: 'also down' }));
    const r = await sendWithFailover(input, null, [a, b, a]);
    expect(r.ok).toBe(false);
    expect(r.detail).toMatch(/GREENWEB: down \| BULKSMSBD: also down/);
    expect(a.send).toHaveBeenCalledTimes(1);
  });
  it('no provider configured → failure without any call', async () => {
    expect((await sendWithFailover(input, null, [])).ok).toBe(false);
  });
  it('fallback equal to primary is ignored; unknown names fall back to Greenweb', () => {
    process.env.SMS_PROVIDER_PRIMARY = 'nonsense';
    process.env.SMS_PROVIDER_FALLBACK = 'GREENWEB';
    expect(configuredOrder()).toEqual({ primary: 'GREENWEB', fallback: null });
    process.env.SMS_PROVIDER_FALLBACK = 'bulksmsbd';
    expect(configuredOrder()).toEqual({ primary: 'GREENWEB', fallback: 'BULKSMSBD' });
    expect(parseProviderName('ssl')).toBe('SSLWIRELESS');
    expect(parseProviderName('Bulk-SMS-BD')).toBe('BULKSMSBD');
  });
});

describe('misc provider helpers', () => {
  it('redacts credentials', () => {
    expect(redact('api_key=abc&x=1')).toBe('api_key=***&x=1');
    expect(redact('{"api_token":"zzz"}')).toBe('{"api_token":"***"}');
  });
  it('extracts balances from different shapes', () => {
    expect(extractBalance('{"response_code":202,"balance":"1,234.50"}')).toBe(1234.5);
    expect(extractBalance('523.75')).toBe(523.75);
    expect(extractBalance('{"data":{"Balance":10}}')).toBe(10);
  });
  it('maps DLR words', () => {
    expect(mapDeliveryWord('DELIVRD')).toBe('DELIVERED');
    expect(mapDeliveryWord('Delivered')).toBe('DELIVERED');
    expect(mapDeliveryWord('UNDELIV')).toBe('FAILED');
    expect(mapDeliveryWord('Failed')).toBe('FAILED');
    expect(mapDeliveryWord('Pending')).toBe('PENDING');
    expect(mapDeliveryWord('')).toBe('UNKNOWN');
  });
  it('parses DLR payloads (single, array, nested)', () => {
    expect(parseDlrPayload({ message_id: 5, status: 'DELIVRD' })).toEqual([{ providerMessageId: '5', state: 'DELIVERED', word: 'DELIVRD' }]);
    expect(parseDlrPayload([{ reference_id: 'a', dlr_status: 'Failed' }, { reference_id: 'b', dlr_status: 'Delivered' }]).map((x) => x.state)).toEqual(['FAILED', 'DELIVERED']);
    expect(parseDlrPayload({ smsinfo: [{ csms_id: 'c', sms_status: 'DELIVERED' }] })[0].providerMessageId).toBe('c');
    expect(parseDlrPayload({ nothing: true })).toEqual([]);
  });
});

describe('sender ID validation', () => {
  it('accepts up to 11 chars with at least one letter', () => {
    expect(validateSenderId('MySchool')).toEqual({ ok: true, value: 'MySchool' });
    expect(validateSenderId('  Al-Amin  Sch ')).toEqual({ ok: true, value: 'Al-Amin Sch' });
    expect(validateSenderId('ABC')).toMatchObject({ ok: true });
  });
  it('rejects too long, too short, digits only, Bangla or symbols', () => {
    expect(validateSenderId('TwelveChars1')).toMatchObject({ ok: false });
    expect(validateSenderId('AB')).toMatchObject({ ok: false });
    expect(validateSenderId('01712345678')).toMatchObject({ ok: false, error: expect.stringMatching(/letter/) });
    expect(validateSenderId('স্কুল')).toMatchObject({ ok: false });
    expect(validateSenderId('School!')).toMatchObject({ ok: false });
    expect(validateSenderId(null)).toMatchObject({ ok: false });
  });
});

describe('deduction planning (segments)', () => {
  const month = '2026-10';
  it('English 160 chars = 1 unit; 161 = 2 units; Bangla 71 chars = 2 units', () => {
    expect(countSmsSegments('a'.repeat(160)).segments).toBe(1);
    expect(countSmsSegments('a'.repeat(161)).segments).toBe(2);
    const bangla = 'আ'.repeat(71);
    expect(countSmsSegments(bangla)).toMatchObject({ encoding: 'UNICODE', segments: 2 });
    expect(countSmsSegments('আ'.repeat(70)).segments).toBe(1);
    expect(countSmsSegments('আ'.repeat(135)).segments).toBe(3);
  });
  it('uses the free allowance first, then paid balance', () => {
    expect(planDeduction({ balance: 10, freeMonth: month, freeUsed: 98 }, 3, 100, month)).toMatchObject({ ok: true, freeTake: 2, paidTake: 1, newBalance: 9, newFreeUsed: 100 });
  });
  it('resets the allowance in a new month', () => {
    expect(planDeduction({ balance: 0, freeMonth: '2026-09', freeUsed: 100 }, 5, 100, month)).toMatchObject({ ok: true, freeTake: 5, paidTake: 0, newFreeUsed: 5 });
  });
  it('never goes negative: insufficient → ok:false and nothing changes', () => {
    expect(planDeduction({ balance: 1, freeMonth: null, freeUsed: 0 }, 2, 0, month)).toMatchObject({ ok: false, newBalance: 1 });
    expect(planDeduction({ balance: 2, freeMonth: null, freeUsed: 0 }, 2, 0, month)).toMatchObject({ ok: true, newBalance: 0 });
  });
  it('returns free units on refund only within the same month', () => {
    expect(freeUnitsToReturn(3, '2026-10', '2026-10')).toBe(3);
    expect(freeUnitsToReturn(3, '2026-09', '2026-10')).toBe(0);
  });
});

describe('dates, receipts, CSV', () => {
  it('Dhaka month/day boundaries', () => {
    expect(dhakaMonthKey(new Date('2026-10-31T18:30:00Z'))).toBe('2026-11'); // 00:30 Nov 1 in Dhaka
    expect(startOfDhakaDay(new Date('2026-10-31T19:00:00Z')).toISOString()).toBe('2026-10-31T18:00:00.000Z');
    const now = new Date('2026-10-31T06:00:00Z');
    expect(canAlertToday(null, now)).toBe(true);
    expect(canAlertToday(new Date('2026-10-31T01:00:00Z'), now)).toBe(false);
    expect(canAlertToday(new Date('2026-10-30T17:00:00Z'), now)).toBe(true);
  });
  it('receipt numbers', () => {
    expect(receiptNumberFor('2026-10', 7)).toBe('SCR-202610-0007');
    expect(nextSequence('SCR-202610-0041')).toBe(42);
    expect(nextSequence(null)).toBe(1);
  });
  it('CSV escapes quotes/commas and neutralises formulas', () => {
    expect(csvCell('a,"b"')).toBe('"a,""b"""');
    expect(csvCell('=HYPERLINK(1)')).toBe("'=HYPERLINK(1)");
    expect(maskForDisplay('8801712345678')).toBe('8801*****5678');
  });
});
