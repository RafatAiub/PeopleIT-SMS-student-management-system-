import { Request, Response, NextFunction } from 'express';
import * as eventService from './event.service';
import { successResponse } from '../../utils/response';

export async function listEvents(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await eventService.listEvents(req.tenantId!, req.user!.role, req.query as any);
    successResponse(res, result);
  } catch (error) {
    next(error);
  }
}

export async function listUpcomingEvents(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const events = await eventService.listUpcomingEvents(req.tenantId!, req.user!.role, Number(req.query.limit));
    successResponse(res, events);
  } catch (error) {
    next(error);
  }
}

export async function getEvent(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const event = await eventService.getEvent(req.tenantId!, req.user!.role, req.params.id);
    successResponse(res, event);
  } catch (error) {
    next(error);
  }
}

export async function createEvent(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const event = await eventService.createEvent(req.tenantId!, req.user!.sub, req.body);
    successResponse(res, event, 'Event created successfully', 201);
  } catch (error) {
    next(error);
  }
}

export async function updateEvent(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const event = await eventService.updateEvent(req.tenantId!, req.params.id, req.body);
    successResponse(res, event, 'Event updated successfully');
  } catch (error) {
    next(error);
  }
}

export async function deleteEvent(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await eventService.deleteEvent(req.tenantId!, req.params.id);
    successResponse(res, null, 'Event deleted successfully');
  } catch (error) {
    next(error);
  }
}
