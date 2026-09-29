import { redactSensitive } from '../src/utils/redact';

describe('redactSensitive', () => {
  it('redacts top-level sensitive keys', () => {
    const input = { email: 'a@b.com', password: 'hunter2', token: 'abc.def.ghi' };
    expect(redactSensitive(input)).toEqual({
      email: 'a@b.com',
      password: '[REDACTED]',
      token: '[REDACTED]',
    });
  });

  it('redacts nested objects', () => {
    const input = {
      user: { name: 'Jane', credentials: { oldPassword: 'x', newPassword: 'y' } },
    };
    expect(redactSensitive(input)).toEqual({
      user: { name: 'Jane', credentials: { oldPassword: '[REDACTED]', newPassword: '[REDACTED]' } },
    });
  });

  it('redacts sensitive keys inside arrays', () => {
    const input = { items: [{ pin: '1234', name: 'x' }, { otp: '000000' }] };
    expect(redactSensitive(input)).toEqual({
      items: [{ pin: '[REDACTED]', name: 'x' }, { otp: '[REDACTED]' }],
    });
  });

  it('matches variants: pass, secret, code, totp, backup', () => {
    const input = {
      pass: '1', secret: '2', backupCodes: '3', totpSecret: '4', verificationCode: '5',
    };
    const result = redactSensitive(input) as Record<string, unknown>;
    for (const key of Object.keys(input)) {
      expect(result[key]).toBe('[REDACTED]');
    }
  });

  it('leaves non-sensitive primitives and structures untouched', () => {
    const input = { firstName: 'Jane', age: 30, active: true, tags: ['a', 'b'] };
    expect(redactSensitive(input)).toEqual(input);
  });

  it('does not mutate the original object', () => {
    const input = { password: 'secretvalue' };
    const result = redactSensitive(input);
    expect(input.password).toBe('secretvalue');
    expect(result).not.toBe(input);
  });
});
