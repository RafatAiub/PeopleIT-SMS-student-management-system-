// DB-free unit tests for fee receipt numbers (Wave C). prisma/redis are
// mocked so nothing here touches a real database or Redis.

jest.mock('../src/config/prisma', () => ({
  prisma: {
    institution: { findUnique: jest.fn() },
    payment: { findFirst: jest.fn() },
  },
}));

jest.mock('../src/config/redis', () => ({
  redis: { incr: jest.fn(), incrby: jest.fn(), expire: jest.fn() },
}));

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import { Prisma } from '@prisma/client';
import { prisma } from '../src/config/prisma';
import { redis } from '../src/config/redis';
import {
  formatReceiptNumber,
  parseReceiptCounter,
  receiptPrefix,
  nextReceiptNumber,
  isReceiptNoCollision,
  withReceiptNumber,
} from '../src/modules/fees/receipts/receiptNumber';

const NOW = new Date('2026-09-27T10:00:00Z');

beforeEach(() => {
  jest.resetAllMocks();
  (prisma.institution.findUnique as jest.Mock).mockResolvedValue({ slug: 'green-valley' });
  (redis.expire as jest.Mock).mockResolvedValue(1);
});

describe('formatReceiptNumber', () => {
  it('formats RCP-<TAG>-<YEAR>-<6 digit counter>', () => {
    expect(formatReceiptNumber('GREENVALLE', 2026, 42)).toBe('RCP-GREENVALLE-2026-000042');
  });

  it('does not truncate counters beyond 6 digits', () => {
    expect(formatReceiptNumber('X', 2026, 1234567)).toBe('RCP-X-2026-1234567');
  });

  it('rejects zero, negative and fractional counters', () => {
    expect(() => formatReceiptNumber('X', 2026, 0)).toThrow();
    expect(() => formatReceiptNumber('X', 2026, -1)).toThrow();
    expect(() => formatReceiptNumber('X', 2026, 1.5)).toThrow();
  });
});

describe('parseReceiptCounter', () => {
  const prefix = receiptPrefix('ABC', 2026);
  it('reads the trailing counter for a matching prefix', () => {
    expect(parseReceiptCounter('RCP-ABC-2026-000017', prefix)).toBe(17);
  });
  it('returns 0 for other tenants/years, null or junk', () => {
    expect(parseReceiptCounter('RCP-XYZ-2026-000017', prefix)).toBe(0);
    expect(parseReceiptCounter('RCP-ABC-2025-000017', prefix)).toBe(0);
    expect(parseReceiptCounter(null, prefix)).toBe(0);
    expect(parseReceiptCounter('RCP-ABC-2026-oops', prefix)).toBe(0);
  });
});

describe('nextReceiptNumber', () => {
  it('uses the Redis counter when available', async () => {
    (redis.incr as jest.Mock).mockResolvedValue(8);
    await expect(nextReceiptNumber('inst-1', 0, NOW)).resolves.toBe('RCP-GREENVALLE-2026-000008');
    expect(prisma.payment.findFirst).not.toHaveBeenCalled();
  });

  it('on a fresh Redis key, jumps above the existing DB max', async () => {
    (redis.incr as jest.Mock).mockResolvedValue(1);
    (prisma.payment.findFirst as jest.Mock).mockResolvedValue({ receiptNo: 'RCP-GREENVALLE-2026-000040' });
    (redis.incrby as jest.Mock).mockResolvedValue(41);
    await expect(nextReceiptNumber('inst-1', 0, NOW)).resolves.toBe('RCP-GREENVALLE-2026-000041');
    expect(redis.incrby).toHaveBeenCalledWith(expect.stringContaining('inst-1:2026'), 40);
  });

  it('falls back to DB max + 1 when Redis fails', async () => {
    (redis.incr as jest.Mock).mockRejectedValue(new Error('ECONNREFUSED'));
    (prisma.payment.findFirst as jest.Mock).mockResolvedValue({ receiptNo: 'RCP-GREENVALLE-2026-000009' });
    await expect(nextReceiptNumber('inst-1', 0, NOW)).resolves.toBe('RCP-GREENVALLE-2026-000010');
  });

  it('skips Redis on retry attempts and offsets from the DB max', async () => {
    (prisma.payment.findFirst as jest.Mock).mockResolvedValue({ receiptNo: 'RCP-GREENVALLE-2026-000009' });
    await expect(nextReceiptNumber('inst-1', 2, NOW)).resolves.toBe('RCP-GREENVALLE-2026-000011');
    expect(redis.incr).not.toHaveBeenCalled();
  });
});

describe('receiptNo collision handling', () => {
  const collision = (target: string) =>
    new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
      code: 'P2002',
      clientVersion: 'test',
      meta: { target: [target] },
    });

  it('recognises only receiptNo unique violations', () => {
    expect(isReceiptNoCollision(collision('receiptNo'))).toBe(true);
    expect(isReceiptNoCollision(collision('gatewayValId'))).toBe(false);
    expect(isReceiptNoCollision(new Error('x'))).toBe(false);
  });

  it('withReceiptNumber retries with a new number after a collision', async () => {
    (redis.incr as jest.Mock).mockResolvedValue(5);
    (prisma.payment.findFirst as jest.Mock).mockResolvedValue({ receiptNo: 'RCP-GREENVALLE-2026-000005' });
    const seen: string[] = [];
    const create = jest.fn(async (no: string) => {
      seen.push(no);
      if (seen.length === 1) throw collision('receiptNo');
      return no;
    });
    const year = new Date().getFullYear();
    await withReceiptNumber('inst-1', create);
    expect(create).toHaveBeenCalledTimes(2);
    expect(seen[0]).toBe(`RCP-GREENVALLE-${year}-000005`);
    expect(seen[1]).not.toBe(seen[0]);
  });

  it('withReceiptNumber rethrows unrelated errors immediately', async () => {
    (redis.incr as jest.Mock).mockResolvedValue(3);
    const create = jest.fn(async () => {
      throw new Error('boom');
    });
    await expect(withReceiptNumber('inst-1', create)).rejects.toThrow('boom');
    expect(create).toHaveBeenCalledTimes(1);
  });
});
