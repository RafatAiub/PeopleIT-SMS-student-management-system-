import { Request, Response, NextFunction } from 'express';
import * as leadService from './lead.service';
import { successResponse } from '../../utils/response';

export async function submitLead(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const lead = await leadService.submitLead(req.body);
    successResponse(res, lead, 'Thank you — our team will reach out shortly.', 201);
  } catch (error) {
    next(error);
  }
}

export async function listLeads(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const list = await leadService.listLeads(req.query.status as string | undefined);
    successResponse(res, list);
  } catch (error) {
    next(error);
  }
}

export async function getLead(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const lead = await leadService.getLead(req.params.id);
    successResponse(res, lead);
  } catch (error) {
    next(error);
  }
}

export async function updateLead(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const lead = await leadService.updateLead(req.params.id, req.body);
    successResponse(res, lead, 'Lead updated successfully');
  } catch (error) {
    next(error);
  }
}
