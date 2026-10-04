import { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { BadRequestError, NotFoundError } from '../../utils/AppError';
import { generateApiKey, normalizeScopes } from './apiKeys.logic';
import type { CreateApiKeyInput, ListApiKeysQuery } from './apiKeys.dto';

// =============================================================================
// API key management — tenant-scoped (institutionId = req.tenantId always).
// The full key is returned only from create(); afterwards only the prefix is
// ever readable.
// =============================================================================

export const MAX_ACTIVE_KEYS_PER_INSTITUTION = 20;

const publicSelect = {
  id: true,
  name: true,
  keyPrefix: true,
  scopes: true,
  lastUsedAt: true,
  revokedAt: true,
  createdAt: true,
  createdBy: { select: { id: true, firstName: true, lastName: true } },
} satisfies Prisma.ApiKeySelect;

export async function listApiKeys(institutionId: string, query: ListApiKeysQuery) {
  const where: Prisma.ApiKeyWhereInput = { institutionId, ...(query.includeRevoked ? {} : { revokedAt: null }) };
  const [items, total] = await Promise.all([
    prisma.apiKey.findMany({
      where,
      select: publicSelect,
      orderBy: { createdAt: 'desc' },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.apiKey.count({ where }),
  ]);
  return { items, meta: { total, page: query.page, pageSize: query.pageSize } };
}

export async function createApiKey(institutionId: string, userId: string, input: CreateApiKeyInput) {
  const active = await prisma.apiKey.count({ where: { institutionId, revokedAt: null } });
  if (active >= MAX_ACTIVE_KEYS_PER_INSTITUTION) {
    throw new BadRequestError(`An institution can have at most ${MAX_ACTIVE_KEYS_PER_INSTITUTION} active API keys. Revoke an unused key first.`);
  }
  const scopes = normalizeScopes(input.scopes);
  const generated = generateApiKey();
  const row = await prisma.apiKey.create({
    data: {
      institutionId,
      name: input.name,
      keyPrefix: generated.keyPrefix,
      keyHash: generated.keyHash,
      scopes,
      createdByUserId: userId,
    },
    select: publicSelect,
  });
  // `key` is the only time the secret leaves the server.
  return { ...row, key: generated.key };
}

export async function revokeApiKey(institutionId: string, id: string) {
  const existing = await prisma.apiKey.findFirst({ where: { id, institutionId }, select: { id: true, revokedAt: true } });
  if (!existing) throw new NotFoundError('API key not found');
  if (existing.revokedAt) {
    return prisma.apiKey.findFirstOrThrow({ where: { id, institutionId }, select: publicSelect });
  }
  await prisma.apiKey.updateMany({ where: { id, institutionId }, data: { revokedAt: new Date() } });
  return prisma.apiKey.findFirstOrThrow({ where: { id, institutionId }, select: publicSelect });
}
