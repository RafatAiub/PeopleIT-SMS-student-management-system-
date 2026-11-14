import { Request, Response, NextFunction } from 'express';
import { AuthRequirementError } from '../../utils/AppError';
import { logger } from '../../utils/logger';
import { isMissingSchemaError } from '../../utils/schemaMissing';
import { RESTRICTABLE_ROLES, type RestrictedFeature } from './dues.logic';
import { checkFeature, studentIdsForUser, type FeatureCheck } from './restriction.service';

// =============================================================================
// P4: backend enforcement of "restrict students who haven't paid".
//
//   router.get('/me', requireFeeClearance('RESULTS'), handler)
//
// Only STUDENT and GUARDIAN callers are ever checked — staff are never
// restricted. A blocked request gets HTTP 403 with code FEE_RESTRICTED (and
// the X-Fee-Restricted header, so blob downloads can be recognised too).
//
// Which students a request is about:
//   STUDENT  → their own student record
//   GUARDIAN → :studentId / ?studentId when it names a linked child (an
//              unlinked id is left for the route's own 404); otherwise all
//              linked children (blocked if any of them is restricted).
// =============================================================================

export const FEE_RESTRICTED_CODE = 'FEE_RESTRICTED';

export function sendFeeRestricted(res: Response, check: FeatureCheck): Response {
  const errors = {
    code: FEE_RESTRICTED_CODE,
    feature: check.feature,
    studentIds: check.students.map((s) => s.studentId),
    contact: check.contact,
  };
  res.setHeader('X-Fee-Restricted', check.feature);
  res.setHeader('Access-Control-Expose-Headers', 'X-Fee-Restricted');
  return res.status(403).json({ success: false, message: check.message, code: FEE_RESTRICTED_CODE, errors });
}

export interface ClearanceOptions {
  /** Restrict only these roles (default STUDENT + GUARDIAN). */
  roles?: Array<'STUDENT' | 'GUARDIAN'>;
}

export function requireFeeClearance(feature: RestrictedFeature, opts: ClearanceOptions = {}) {
  const roles = new Set<string>(opts.roles ?? ['STUDENT', 'GUARDIAN']);
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const user = req.user;
    if (!user || !RESTRICTABLE_ROLES.has(user.role) || !roles.has(user.role) || !req.tenantId) return next();
    try {
      let ids = await studentIdsForUser(req.tenantId, user.sub, user.role);
      if (user.role === 'GUARDIAN') {
        const param = typeof req.params.studentId === 'string' ? req.params.studentId : undefined;
        const query = typeof req.query.studentId === 'string' ? req.query.studentId : undefined;
        const target = param && param !== 'me' ? param : query;
        if (target) ids = ids.includes(target) ? [target] : [];
      }
      const check = await checkFeature(req.tenantId, ids, feature);
      if (check.blocked) {
        sendFeeRestricted(res, check);
        return;
      }
      next();
    } catch (error) {
      // Fail OPEN on a missing table (migration not applied yet) — never lock
      // every student out because of a deploy-order problem. Other errors too:
      // a broken dues check must not take results/ID cards down for everyone.
      logger.error('Fee clearance check failed — allowing request', {
        feature,
        missingSchema: isMissingSchemaError(error),
        error: error instanceof Error ? error.message : String(error),
      });
      next();
    }
  };
}

/**
 * Login / token refresh: returns the block (or null) for a STUDENT or
 * GUARDIAN account. A guardian is blocked only when EVERY linked child is
 * restricted, so a family with one paid-up child can still sign in.
 * Fails open (null) on any error.
 */
export async function portalLoginBlock(institutionId: string | null, userId: string, role: string): Promise<FeatureCheck | null> {
  if (!institutionId || !RESTRICTABLE_ROLES.has(role)) return null;
  try {
    const ids = await studentIdsForUser(institutionId, userId, role);
    if (!ids.length) return null;
    const check = await checkFeature(institutionId, ids, 'PORTAL_LOGIN');
    if (!check.blocked) return null;
    if (role === 'GUARDIAN' && check.students.length < ids.length) return null;
    return check;
  } catch (error) {
    logger.error('Portal login fee check failed — allowing sign-in', { error: error instanceof Error ? error.message : String(error) });
    return null;
  }
}

/**
 * Called by auth.service after the password is verified (and on token
 * refresh). Throws 403 FEE_RESTRICTED when the school blocks portal sign-in
 * for this student / guardian. Staff are never affected.
 */
export async function assertPortalLoginAllowed(user: { id: string; role: string; institutionId: string | null }): Promise<void> {
  const block = await portalLoginBlock(user.institutionId, user.id, user.role);
  if (!block) return;
  const phone = block.contact.phone ? ` (${block.contact.phone})` : '';
  throw new AuthRequirementError(
    FEE_RESTRICTED_CODE,
    `Portal access is paused because school fees are due. Please contact the school office${phone}.`,
    { feature: 'PORTAL_LOGIN', contact: block.contact },
  );
}
