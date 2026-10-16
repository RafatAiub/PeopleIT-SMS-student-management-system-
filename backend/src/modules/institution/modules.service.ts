import { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { logger } from '../../utils/logger';
import { NotFoundError, ValidationError } from '../../utils/AppError';
import { areFeaturesEnabled } from '../saas/entitlements.service';
import { isMissingSchemaError } from '../saas/schemaGuard';
import {
  MODULE_KEYS,
  MODULE_REGISTRY,
  ModuleUpdateError,
  mergeModuleUpdate,
  resolveModules,
  type ModuleKey,
  type ResolvedModule,
} from './modules.registry';

// =============================================================================
// Module switches service (T0).
//
//   getModules(institutionId)       → every registry module, resolved
//   isModuleEnabled(id, key)        → what requireModule() asks
//   updateModules(id, body, actor)  → ADMIN / SUPER_ADMIN writes
//
// A short in-process cache keeps requireModule() off the database on every
// request; a write clears that school's entry immediately. Other API
// processes may see a change up to CACHE_TTL_MS late, which is fine for a
// settings switch.
// =============================================================================

const CACHE_TTL_MS = 15_000;
const cache = new Map<string, { at: number; modules: ResolvedModule[] }>();

export function clearModuleCache(institutionId?: string): void {
  if (institutionId) cache.delete(institutionId);
  else cache.clear();
}

async function loadStored(institutionId: string): Promise<unknown> {
  try {
    const row = await prisma.institution.findUnique({ where: { id: institutionId }, select: { modules: true } });
    if (!row) throw new NotFoundError('Institution not found');
    return row.modules;
  } catch (error) {
    // Before the T0 migration the column doesn't exist: every module sits at
    // its default, which keeps the Islamic modules off and the rest on.
    if (isMissingSchemaError(error)) return null;
    throw error;
  }
}

async function entitlementLookup(institutionId: string): Promise<(key: ModuleKey) => boolean> {
  try {
    const map = await areFeaturesEnabled(institutionId, MODULE_KEYS);
    return (key) => map[key] !== false;
  } catch (error) {
    // Same policy as requireFeature(): a broken entitlement lookup must not
    // take a feature away from a school. The school's own switch still applies.
    logger.error('Module switches: entitlement lookup failed — treating modules as entitled', {
      institutionId,
      error: (error as Error).message,
    });
    return () => true;
  }
}

export async function getModules(institutionId: string): Promise<ResolvedModule[]> {
  const hit = cache.get(institutionId);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.modules;
  const [stored, entitled] = await Promise.all([loadStored(institutionId), entitlementLookup(institutionId)]);
  const modules = resolveModules(stored, entitled);
  cache.set(institutionId, { at: Date.now(), modules });
  return modules;
}

export async function isModuleEnabled(institutionId: string, key: ModuleKey): Promise<boolean> {
  const modules = await getModules(institutionId);
  return modules.find((m) => m.key === key)?.enabled ?? false;
}

/** Response shape for GET/PUT /institution/modules. */
export function toModulesResponse(modules: ResolvedModule[]) {
  return {
    modules,
    // Convenience map for gating code: { "islamic.donations": false, ... }
    enabled: Object.fromEntries(modules.map((m) => [m.key, m.enabled])) as Record<ModuleKey, boolean>,
  };
}

export interface ModuleActor {
  userId: string;
  role: string;
}

export async function updateModules(institutionId: string, body: Record<string, unknown>, actor: ModuleActor) {
  const [stored, entitled] = await Promise.all([loadStored(institutionId), entitlementLookup(institutionId)]);
  const isSuperAdmin = actor.role === 'SUPER_ADMIN';

  let merged: ReturnType<typeof mergeModuleUpdate>;
  try {
    merged = mergeModuleUpdate(stored, body, entitled, isSuperAdmin);
  } catch (error) {
    if (error instanceof ModuleUpdateError) throw new ValidationError(error.message, { keys: error.keys });
    throw error;
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.institution.update({
        where: { id: institutionId },
        data: { modules: merged.next as Prisma.InputJsonValue },
      });
      // Super admin switching on a module the plan leaves out: record it as a
      // per-school feature override (the existing entitlement mechanism), so
      // the plan check passes for this school only.
      for (const key of merged.needsOverride) {
        const label = MODULE_REGISTRY.find((m) => m.key === key)?.label ?? key;
        await tx.featureFlag.upsert({
          where: { key },
          create: { key, description: label, defaultEnabled: true },
          update: {},
        });
        await tx.institutionFeatureOverride.upsert({
          where: { institutionId_featureKey: { institutionId, featureKey: key } },
          create: { institutionId, featureKey: key, enabled: true },
          update: { enabled: true },
        });
      }
      await tx.auditLog.create({
        data: {
          institutionId,
          userId: actor.userId,
          action: 'MODULES_UPDATED',
          resource: 'institution.modules',
          resourceId: institutionId,
          metadata: {
            changed: merged.changed,
            switches: merged.next,
            planOverrides: merged.needsOverride,
          } as Prisma.InputJsonValue,
        },
      });
    });
  } catch (error) {
    if (isMissingSchemaError(error)) {
      throw new ValidationError('Module switches are not available yet — the database migration is pending.');
    }
    throw error;
  }

  clearModuleCache(institutionId);
  logger.info('Institution modules updated', { institutionId, changed: merged.changed, overrides: merged.needsOverride });
  return getModules(institutionId);
}
