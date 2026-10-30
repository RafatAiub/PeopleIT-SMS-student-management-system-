// P0 — SMS honesty: provider-reply parsing, BD number normalisation, SKIPPED
// when disabled. global fetch is mocked — no real SMS is ever sent.
process.env.SMS_ENABLED = 'true';
process.env.GREENWEB_API_TOKEN = 'p0-test-token-not-real';

import { env } from '../src/config/env';
import { parseGreenwebResponse, sendSms, maskPhone } from '../src/utils/sms.service';
import { smsResultToSendResult } from '../src/modules/notifications/channels/sms.channel';

const mockFetch = jest.fn();
const realFetch = global.fetch;

function reply(body: string, status = 200) {
  return { ok: status >= 200 && status < 300, status, text: async () => body };
}

beforeAll(() => {
  global.fetch = mockFetch as unknown as typeof fetch;
});
afterAll(() => {
  global.fetch = realFetch;
});
beforeEach(() => {
  mockFetch.mockReset();
  (env as { SMS_ENABLED: boolean }).SMS_ENABLED = true;
  (env as { GREENWEB_API_TOKEN?: string }).GREENWEB_API_TOKEN = 'p0-test-token-not-real';
});

describe('parseGreenwebResponse', () => {
  it('accepts Greenweb "Ok:" text replies', () => {
    expect(parseGreenwebResponse('Ok: SMS Sent Successfully To 8801712345678').ok).toBe(true);
    expect(parseGreenwebResponse('Ok: sent to 8801712345678\nOk: sent to 8801812345678').ok).toBe(true);
  });

  it('treats Greenweb error text as a failure', () => {
    expect(parseGreenwebResponse('Error: Insufficient Balance')).toEqual({ ok: false, detail: 'Error: Insufficient Balance' });
    expect(parseGreenwebResponse('Invalid Token').ok).toBe(false);
    expect(parseGreenwebResponse('Ok: sent\nError: invalid number').ok).toBe(false);
  });

  it('treats empty or unrecognised replies as failures (never assume sent)', () => {
    expect(parseGreenwebResponse('').ok).toBe(false);
    expect(parseGreenwebResponse('<html>gateway down</html>').ok).toBe(false);
  });

  it('parses the JSON shape', () => {
    expect(parseGreenwebResponse('[{"to":"8801712345678","status":"SENT","statusmsg":"ok"}]').ok).toBe(true);
    const bad = parseGreenwebResponse('[{"to":"8801712345678","status":"FAILED","statusmsg":"Invalid number"}]');
    expect(bad).toEqual({ ok: false, detail: 'Invalid number' });
  });
});

describe('sendSms', () => {
  it('normalises the number to 8801XXXXXXXXX and reports SENT on an Ok reply', async () => {
    mockFetch.mockResolvedValue(reply('Ok: SMS Sent Successfully To 8801712345678'));
    const r = await sendSms('+880 1712-345678', 'hello');
    expect(r).toMatchObject({ success: true, status: 'SENT', to: '8801712345678' });
    const url = new URL(mockFetch.mock.calls[0][0] as string);
    expect(url.searchParams.get('to')).toBe('8801712345678');
  });

  it('accepts the local 01XXXXXXXXX form too', async () => {
    mockFetch.mockResolvedValue(reply('Ok: SMS Sent Successfully'));
    const r = await sendSms('01812345678', 'hello');
    expect(r.to).toBe('8801812345678');
  });

  it('rejects an invalid number without calling the provider', async () => {
    const r = await sendSms('0000000000', 'hello');
    expect(r).toMatchObject({ success: false, status: 'FAILED' });
    expect(r.message).toMatch(/invalid BD mobile number/);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('reports a provider error reply as FAILED (HTTP 200 with "Error:")', async () => {
    mockFetch.mockResolvedValue(reply('Error: Insufficient Balance'));
    const r = await sendSms('01712345678', 'hello');
    expect(r).toMatchObject({ success: false, status: 'FAILED', message: 'Error: Insufficient Balance' });
  });

  it('reports an HTTP error as FAILED', async () => {
    mockFetch.mockResolvedValue(reply('oops', 500));
    const r = await sendSms('01712345678', 'hello');
    expect(r).toMatchObject({ success: false, status: 'FAILED' });
  });

  it('returns SKIPPED (not success) when SMS is disabled', async () => {
    (env as { SMS_ENABLED: boolean }).SMS_ENABLED = false;
    const r = await sendSms('01712345678', 'hello');
    expect(r).toMatchObject({ success: false, status: 'SKIPPED' });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('masks phone numbers for logs', () => {
    expect(maskPhone('8801712345678')).toBe('**********678');
  });
});

describe('sms channel → notification log outcome', () => {
  it('SENT → ok, SKIPPED → skipped, invalid number → skipped, provider error → retryable failure', () => {
    expect(smsResultToSendResult({ success: true, status: 'SENT', message: 'Ok' })).toEqual({ ok: true, providerRef: 'Ok' });
    expect(smsResultToSendResult({ success: false, status: 'SKIPPED', message: 'disabled' }).skipped).toMatch(/SKIPPED/);
    expect(
      smsResultToSendResult({ success: false, status: 'FAILED', message: 'invalid BD mobile number (***)' }).skipped,
    ).toMatch(/INVALID_NUMBER/);
    expect(smsResultToSendResult({ success: false, status: 'FAILED', message: 'Error: Insufficient Balance' })).toEqual({
      ok: false,
      error: 'Error: Insufficient Balance',
    });
  });
});
