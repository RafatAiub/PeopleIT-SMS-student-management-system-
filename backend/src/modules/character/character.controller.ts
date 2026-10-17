import { Request, Response, NextFunction } from 'express';
import { paginatedResponse, successResponse } from '../../utils/response';
import * as svc from './character.service';

// =============================================================================
// Character (T2) controllers — thin: parse, call the service, respond.
// =============================================================================

type Handler = (req: Request, res: Response) => Promise<unknown>;

const wrap = (fn: Handler) => async (req: Request, res: Response, next: NextFunction) => {
  try {
    await fn(req, res);
  } catch (error) {
    next(error);
  }
};

const ctxOf = (req: Request): svc.CharacterCtx => ({
  institutionId: req.tenantId as string, // requireTenant runs first
  userId: req.user!.sub,
  role: req.user!.role,
});
const q = (req: Request) => req.query as any;

// Settings
export const getSettings = wrap(async (req, res) => successResponse(res, await svc.getSettings(ctxOf(req).institutionId)));
export const updateSettings = wrap(async (req, res) => successResponse(res, await svc.updateSettings(ctxOf(req), req.body), 'Settings saved'));

// Traits
export const listTraits = wrap(async (req, res) => successResponse(res, await svc.listTraits(ctxOf(req))));
export const seedTraits = wrap(async (req, res) => successResponse(res, await svc.seedDefaultTraits(ctxOf(req)), 'Default traits added'));
export const createTrait = wrap(async (req, res) => successResponse(res, await svc.createTrait(ctxOf(req), req.body), 'Trait added', 201));
export const updateTrait = wrap(async (req, res) => successResponse(res, await svc.updateTrait(ctxOf(req), req.params.id, req.body), 'Trait saved'));
export const deleteTrait = wrap(async (req, res) => successResponse(res, await svc.deleteTrait(ctxOf(req), req.params.id), 'Trait deleted'));
export const reorderTraits = wrap(async (req, res) => successResponse(res, await svc.reorderTraits(ctxOf(req), req.body.ids), 'Order saved'));

// Periods
export const listPeriods = wrap(async (req, res) => successResponse(res, await svc.listPeriods(ctxOf(req), q(req))));
export const createPeriod = wrap(async (req, res) => successResponse(res, await svc.createPeriod(ctxOf(req), req.body), 'Period created', 201));
export const updatePeriod = wrap(async (req, res) => successResponse(res, await svc.updatePeriod(ctxOf(req), req.params.id, req.body), 'Period saved'));
export const deletePeriod = wrap(async (req, res) => successResponse(res, await svc.deletePeriod(ctxOf(req), req.params.id), 'Period deleted'));

// Grid
export const mySections = wrap(async (req, res) => successResponse(res, await svc.listMySections(ctxOf(req))));
export const getGrid = wrap(async (req, res) => successResponse(res, await svc.getGrid(ctxOf(req), q(req))));
export const saveGrid = wrap(async (req, res) => successResponse(res, await svc.saveGrid(ctxOf(req), req.body), 'Scores saved'));

// Badges
export const listBadges = wrap(async (req, res) => successResponse(res, await svc.listBadges(ctxOf(req))));
export const seedBadges = wrap(async (req, res) => successResponse(res, await svc.seedDefaultBadges(ctxOf(req)), 'Default badges added'));
export const createBadge = wrap(async (req, res) => successResponse(res, await svc.createBadge(ctxOf(req), req.body), 'Badge created', 201));
export const updateBadge = wrap(async (req, res) => successResponse(res, await svc.updateBadge(ctxOf(req), req.params.id, req.body), 'Badge saved'));
export const deleteBadge = wrap(async (req, res) => successResponse(res, await svc.deleteBadge(ctxOf(req), req.params.id), 'Badge deleted'));

// Awards + points
export const listAwards = wrap(async (req, res) => {
  const r = await svc.listAwards(ctxOf(req), q(req));
  paginatedResponse(res, r.items, r.total, Number(q(req).page ?? 1), Number(q(req).pageSize ?? 25));
});
export const awardBadge = wrap(async (req, res) => successResponse(res, await svc.awardBadge(ctxOf(req), req.body), 'Badge awarded', 201));
export const revokeAward = wrap(async (req, res) => successResponse(res, await svc.revokeAward(ctxOf(req), req.params.id, req.body.reason), 'Badge revoked'));
export const autoAward = wrap(async (req, res) => successResponse(res, await svc.runAutoAwards(ctxOf(req), req.body), 'Automatic badges checked'));
export const adjustPoints = wrap(async (req, res) => successResponse(res, await svc.adjustPoints(ctxOf(req), req.body), 'Points recorded', 201));
export const listPoints = wrap(async (req, res) => successResponse(res, await svc.listPoints(ctxOf(req), req.params.studentId)));

// Views
export const studentSummary = wrap(async (req, res) => successResponse(res, await svc.studentSummary(ctxOf(req), req.params.studentId)));
export const mine = wrap(async (req, res) => successResponse(res, await svc.mySummaries(ctxOf(req))));
export const leaderboard = wrap(async (req, res) => successResponse(res, await svc.leaderboard(ctxOf(req), q(req))));
export const overview = wrap(async (req, res) => successResponse(res, await svc.overview(ctxOf(req))));
