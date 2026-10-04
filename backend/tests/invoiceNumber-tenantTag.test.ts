// Unit tests for the pure tenant-tag-derivation logic used by U6's
// tenant-scoped invoice number generator. The DB/Redis-backed counter paths
// are exercised elsewhere (integration tests against a real DB) — this file
// only covers the deterministic string logic, with prisma/redis mocked out
// so it never touches a real database.

jest.mock('../src/config/prisma', () => ({
  prisma: {
    institution: { findUnique: jest.fn() },
    invoice: { findFirst: jest.fn() },
  },
}));

jest.mock('../src/config/redis', () => ({
  redis: { incr: jest.fn(), expire: jest.fn(), get: jest.fn() },
}));

import { prisma } from '../src/config/prisma';
import { getInvoiceTenantTag, generateInvoiceNumberFromDbMax } from '../src/utils/invoiceNumber';

describe('getInvoiceTenantTag', () => {
  it('uppercases and strips non-alphanumerics from the institution slug', async () => {
    (prisma.institution.findUnique as jest.Mock).mockResolvedValueOnce({ slug: '123456' });
    const tag = await getInvoiceTenantTag('inst-1');
    expect(tag).toBe('123456');
  });

  it('truncates to 10 characters', async () => {
    (prisma.institution.findUnique as jest.Mock).mockResolvedValueOnce({ slug: '12345678901234' });
    const tag = await getInvoiceTenantTag('inst-1');
    expect(tag).toHaveLength(10);
  });

  it('falls back to a cleaned institutionId when the institution/slug is missing', async () => {
    (prisma.institution.findUnique as jest.Mock).mockResolvedValueOnce(null);
    const tag = await getInvoiceTenantTag('abc-def-123');
    expect(tag).toBe('ABCDEF123');
  });
});

describe('generateInvoiceNumberFromDbMax', () => {
  it('produces counter 000001 when no prior invoice exists for the tenant/year/prefix', async () => {
    (prisma.institution.findUnique as jest.Mock).mockResolvedValueOnce({ slug: '99' });
    (prisma.invoice.findFirst as jest.Mock).mockResolvedValueOnce(null);

    const result = await generateInvoiceNumberFromDbMax('inst-1', 2025);
    expect(result).toBe('INV-99-2025-000001');
  });

  it('increments off the DB max counter for this tenant+year prefix', async () => {
    (prisma.institution.findUnique as jest.Mock).mockResolvedValueOnce({ slug: '99' });
    (prisma.invoice.findFirst as jest.Mock).mockResolvedValueOnce({ invoiceNo: 'INV-99-2025-000042' });

    const result = await generateInvoiceNumberFromDbMax('inst-1', 2025);
    expect(result).toBe('INV-99-2025-000043');
  });
});
