import { Request, Response, NextFunction } from 'express';
import * as idCardService from './idcard.service';
import { successResponse, paginatedResponse } from '../../utils/response';

// =============================================================================
// ID Card Controller — thin layer, delegates to idcard.service.ts
// =============================================================================

// ── Templates ────────────────────────────────────────────────────────────────

export async function listTemplates(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const templates = await idCardService.listTemplates(req.tenantId!);
    successResponse(res, templates);
  } catch (error) {
    next(error);
  }
}

export async function createTemplate(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const template = await idCardService.createTemplate(req.tenantId!, req.body);
    successResponse(res, template, 'ID card template created successfully', 201);
  } catch (error) {
    next(error);
  }
}

export async function updateTemplate(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const template = await idCardService.updateTemplate(req.tenantId!, req.params.id, req.body);
    successResponse(res, template, 'ID card template updated successfully');
  } catch (error) {
    next(error);
  }
}

export async function deleteTemplate(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await idCardService.deleteTemplate(req.tenantId!, req.params.id);
    successResponse(res, null, 'ID card template deleted successfully');
  } catch (error) {
    next(error);
  }
}

// ── Generation / listing ─────────────────────────────────────────────────────

export async function generateCards(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const cards = await idCardService.generateCards(req.tenantId!, req.body);
    successResponse(res, cards, 'ID cards generated successfully', 201);
  } catch (error) {
    next(error);
  }
}

export async function listCards(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { cards, total } = await idCardService.listCards(req.tenantId!, req.query as never);
    paginatedResponse(res, cards, total, Number(req.query.page) || 1, Number(req.query.pageSize) || 20);
  } catch (error) {
    next(error);
  }
}

export async function getCard(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const card = await idCardService.getCardById(req.tenantId!, req.params.id);
    successResponse(res, card);
  } catch (error) {
    next(error);
  }
}

export async function getCardPdf(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { pdf, filename } = await idCardService.getCardPdf(req.tenantId!, req.params.id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(pdf);
  } catch (error) {
    next(error);
  }
}

export async function revokeCard(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const card = await idCardService.revokeCard(req.tenantId!, req.params.id);
    successResponse(res, card, 'ID card revoked successfully');
  } catch (error) {
    next(error);
  }
}

// ── Self-service ─────────────────────────────────────────────────────────────

export async function getMyCard(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const card = await idCardService.getMyCard(req.tenantId!, req.user!.sub, req.user!.role);
    successResponse(res, card);
  } catch (error) {
    next(error);
  }
}

export async function getMyCardPdf(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { pdf, filename } = await idCardService.getMyCardPdf(req.tenantId!, req.user!.sub, req.user!.role);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(pdf);
  } catch (error) {
    next(error);
  }
}

// ── Public verification ──────────────────────────────────────────────────────

export async function verifyCard(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const info = await idCardService.getVerifyInfo(req.params.token);
    successResponse(res, info);
  } catch (error) {
    next(error);
  }
}
