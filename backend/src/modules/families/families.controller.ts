import { Request, Response, NextFunction } from 'express';
import { env } from '../../config/env';
import { logger } from '../../utils/logger';
import { paginatedResponse, successResponse } from '../../utils/response';
import * as svc from './families.service';
import * as pay from './families.payments';

// =============================================================================
// Family profile (T3) controllers — thin: parse, call the service, respond.
// =============================================================================

type Handler = (req: Request, res: Response) => Promise<unknown>;
const wrap = (fn: Handler) => async (req: Request, res: Response, next: NextFunction) => {
  try {
    await fn(req, res);
  } catch (error) {
    next(error);
  }
};
const ctxOf = (req: Request): svc.FamilyCtx => ({ institutionId: req.tenantId as string, userId: req.user!.sub, role: req.user!.role });
const q = (req: Request) => req.query as any;

export const list = wrap(async (req, res) => {
  const r = await svc.listFamilies(ctxOf(req), q(req));
  paginatedResponse(res, r.items, r.total, Number(q(req).page ?? 1), Number(q(req).pageSize ?? 25));
});
export const search = wrap(async (req, res) => successResponse(res, await svc.searchFamilies(ctxOf(req), String(q(req).q))));
export const mine = wrap(async (req, res) => successResponse(res, await svc.myFamily(ctxOf(req))));
export const byStudent = wrap(async (req, res) => successResponse(res, await svc.familyIdForStudent(ctxOf(req), req.params.studentId)));
export const byGuardian = wrap(async (req, res) => successResponse(res, await svc.familyIdForGuardian(ctxOf(req), req.params.guardianId)));
export const get = wrap(async (req, res) => successResponse(res, await svc.getProfile(ctxOf(req), req.params.id)));

export const create = wrap(async (req, res) => successResponse(res, await svc.createFamily(ctxOf(req), req.body), 'Family created', 201));
export const update = wrap(async (req, res) => successResponse(res, await svc.updateFamily(ctxOf(req), req.params.id, req.body), 'Family saved'));
export const addMembers = wrap(async (req, res) => successResponse(res, await svc.addMembers(ctxOf(req), req.params.id, req.body), 'Members added'));
export const removeStudent = wrap(async (req, res) => successResponse(res, await svc.removeStudent(ctxOf(req), req.params.id, req.params.memberId), 'Student ungrouped'));
export const removeGuardian = wrap(async (req, res) => successResponse(res, await svc.removeGuardian(ctxOf(req), req.params.id, req.params.memberId), 'Guardian removed'));
export const merge = wrap(async (req, res) => successResponse(res, await svc.mergeFamilies(ctxOf(req), req.params.id, req.body.otherFamilyId), 'Families merged'));

export const addNote = wrap(async (req, res) => successResponse(res, await svc.addNote(ctxOf(req), req.params.id, req.body.body), 'Note added', 201));
export const deleteNote = wrap(async (req, res) => successResponse(res, await svc.deleteNote(ctxOf(req), req.params.id, req.params.noteId), 'Note deleted'));
export const siblingConcession = wrap(async (req, res) => successResponse(res, await svc.applySiblingConcession(ctxOf(req), req.params.id, req.body), 'Sibling concession applied'));

export const payOnline = wrap(async (req, res) => successResponse(res, await pay.initiateFamilyOnline(ctxOf(req), req.params.id, req.body), 'Payment started', 201));
export const payOffline = wrap(async (req, res) => successResponse(res, await pay.recordFamilyOffline(ctxOf(req), req.params.id, req.body), 'Payment recorded', 201));
export const getPayment = wrap(async (req, res) => successResponse(res, await pay.getFamilyPayment(ctxOf(req), req.params.id)));
export const demoConfirm = wrap(async (req, res) => successResponse(res, await pay.confirmFamilyDemo(ctxOf(req), req.params.id, req.body.outcome)));

/** Public gateway callback — never throws to the client; always redirects (or 200s an IPN). */
export async function gatewayCallback(req: Request, res: Response): Promise<void> {
  const gateway = pay.familyGatewayFromSlug(String(req.params.gateway ?? ''));
  const kind = req.params.kind as pay.FamilyCallbackKind;
  const payload = { ...(req.query as Record<string, unknown>), ...((req.body as Record<string, unknown>) ?? {}) };
  let redirectTo = `${env.FRONTEND_URL}/family/mine?payment=failed`;
  if (gateway) {
    try {
      redirectTo = await pay.handleFamilyGatewayCallback(gateway, kind, payload);
    } catch (error) {
      logger.error('Unhandled error while processing a family payment callback', { gateway, kind, error: error instanceof Error ? error.message : String(error) });
    }
  }
  if (kind === 'ipn') {
    res.status(200).json({ success: true });
    return;
  }
  res.redirect(303, redirectTo);
}
